// ============================================================
// CLAIROS - ADMINISTRATION (backend)
//
// - Authentification : le mot de passe n'est jamais stocké en clair
//   (hash Argon2id). Une session admin est un jeton aléatoire gardé en
//   mémoire côté Rust : toutes les commandes sensibles le vérifient, le
//   verrouillage ne dépend donc pas seulement de l'interface React.
// - Galerie : ajout (avec refus des doublons), liste et suppression.
// - Réseau : Wi-Fi / Ethernet via NetworkManager (nmcli).
// - Mises à jour : mise à jour du système par apt (dépôt ClairOS + sécurité Debian).
// - Terminal admin : voir terminal.rs (shell root protégé par cette session).
// - Alimentation : arrêt / redémarrage.
//
// Emplacement du hash (par priorité) :
//   1. variable d'environnement CLAIROS_ADMIN_HASH
//   2. /etc/clairos/admin-password.hash  (défini à l'installation de l'ISO)
//   3. ~/.config/com.gab9sg.clairos/admin-password.hash  (mode développement)
//
// À l'installation de l'ISO, le mot de passe se définit avec :
//   echo "motdepasse" | clairos-desktop --set-admin-password
// ============================================================

use argon2::{
    password_hash::{
        rand_core::{OsRng, RngCore},
        PasswordHash, PasswordHasher, PasswordVerifier, SaltString,
    },
    Argon2,
};
use serde::Serialize;
use std::{
    fs,
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::{Duration, Instant, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

use super::{
    collect_images_recursively, images_directory, is_image_file, is_inside,
    unique_destination,
};

const SYSTEM_HASH_PATH: &str = "/etc/clairos/admin-password.hash";
const SYSTEM_VERSION_PATH: &str = "/etc/clairos/version";
const SYSTEM_UPDATE_URL_PATH: &str = "/etc/clairos/update-url";

const MIN_PASSWORD_CHARS: usize = 8;
const MAX_PASSWORD_CHARS: usize = 128;
const MAX_FAILED_ATTEMPTS: u32 = 5;
const LOCKOUT_SECONDS: u64 = 30;
const MAX_UPLOAD_BYTES: usize = 25 * 1024 * 1024;
const MAX_IMAGE_SIDE: u32 = 20_000;

// ------------------------------------------------------------
// ÉTAT DE LA SESSION ADMIN
// ------------------------------------------------------------

#[derive(Default)]
struct AuthInner {
    token: Option<String>,
    failures: u32,
    locked_until: Option<Instant>,
}

#[derive(Default)]
pub struct AdminState {
    inner: Mutex<AuthInner>,
}

fn lock_state(state: &AdminState) -> std::sync::MutexGuard<'_, AuthInner> {
    state
        .inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn new_token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{:02x}", byte)).collect()
}

fn issue_token(state: &AdminState) -> String {
    let token = new_token();
    let mut inner = lock_state(state);
    inner.token = Some(token.clone());
    inner.failures = 0;
    inner.locked_until = None;
    token
}

pub(crate) fn require_token(state: &AdminState, token: &str) -> Result<(), String> {
    let inner = lock_state(state);
    match &inner.token {
        Some(valid) if !token.is_empty() && valid == token => Ok(()),
        _ => Err("Session administrateur expirée. Veuillez vous reconnecter.".to_string()),
    }
}

// ------------------------------------------------------------
// MOT DE PASSE
// ------------------------------------------------------------

fn hash_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(value) = std::env::var_os("CLAIROS_ADMIN_HASH") {
        if !value.is_empty() {
            return Ok(PathBuf::from(value));
        }
    }

    let system = Path::new(SYSTEM_HASH_PATH);
    if system.is_file() {
        return Ok(system.to_path_buf());
    }

    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Répertoire de configuration indisponible : {}", e))?;
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Impossible de créer la configuration : {}", e))?;
    Ok(config_dir.join("admin-password.hash"))
}

fn is_configured_at(path: &Path) -> bool {
    path.is_file() && fs::metadata(path).map(|m| m.len() > 20).unwrap_or(false)
}

fn validate_new_password(password: &str) -> Result<(), String> {
    let count = password.chars().count();
    if count < MIN_PASSWORD_CHARS {
        return Err(format!(
            "Le mot de passe doit contenir au moins {} caractères.",
            MIN_PASSWORD_CHARS
        ));
    }
    if count > MAX_PASSWORD_CHARS {
        return Err(format!(
            "Le mot de passe ne peut pas dépasser {} caractères.",
            MAX_PASSWORD_CHARS
        ));
    }
    Ok(())
}

fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| format!("Impossible de sécuriser le mot de passe : {}", e))
}

fn verify_against_file(path: &Path, password: &str) -> Result<bool, String> {
    let encoded = fs::read_to_string(path)
        .map_err(|_| "Aucun mot de passe administrateur n'est configuré.".to_string())?;
    let parsed = PasswordHash::new(encoded.trim())
        .map_err(|_| "Le fichier d'authentification est invalide.".to_string())?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

// Écriture atomique : fichier temporaire puis renommage.
fn write_hash_file(path: &Path, hash: &str, mode: u32) -> std::io::Result<()> {
    let temporary = path.with_extension("tmp");
    let _ = fs::remove_file(&temporary);

    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(mode);
    }
    #[cfg(not(unix))]
    {
        let _ = mode;
    }

    let mut file = options.open(&temporary)?;
    file.write_all(hash.as_bytes())?;
    file.sync_all()?;
    drop(file);

    fs::rename(&temporary, path).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        error
    })
}

fn write_error(error: std::io::Error) -> String {
    if error.kind() == std::io::ErrorKind::PermissionDenied {
        "Le mot de passe a été défini à l'installation et ne peut pas être modifié depuis ce compte. \
         Utilisez la commande : sudo clairos-desktop --set-admin-password"
            .to_string()
    } else {
        format!("Impossible d'enregistrer le mot de passe : {}", error)
    }
}

fn hash_mode_for(path: &Path) -> u32 {
    // Le fichier système doit rester lisible par la session de l'utilisateur.
    if path == Path::new(SYSTEM_HASH_PATH) {
        0o644
    } else {
        0o600
    }
}

#[tauri::command]
pub fn is_admin_password_configured(app: AppHandle) -> Result<bool, String> {
    Ok(is_configured_at(&hash_file_path(&app)?))
}

#[tauri::command]
pub fn setup_admin_password(
    app: AppHandle,
    state: State<'_, AdminState>,
    password: String,
) -> Result<String, String> {
    validate_new_password(&password)?;

    let path = hash_file_path(&app)?;
    if is_configured_at(&path) {
        return Err("Un mot de passe administrateur est déjà configuré.".to_string());
    }

    let hash = hash_password(&password)?;
    write_hash_file(&path, &hash, hash_mode_for(&path)).map_err(write_error)?;
    Ok(issue_token(&state))
}

#[tauri::command]
pub fn admin_login(
    app: AppHandle,
    state: State<'_, AdminState>,
    password: String,
) -> Result<String, String> {
    {
        let inner = lock_state(&state);
        if let Some(until) = inner.locked_until {
            let now = Instant::now();
            if until > now {
                let remaining = (until - now).as_secs() + 1;
                return Err(format!(
                    "Trop de tentatives. Réessayez dans {} secondes.",
                    remaining
                ));
            }
        }
    }

    let path = hash_file_path(&app)?;
    let valid = verify_against_file(&path, &password)?;

    if valid {
        return Ok(issue_token(&state));
    }

    let mut inner = lock_state(&state);
    inner.failures += 1;
    if inner.failures >= MAX_FAILED_ATTEMPTS {
        inner.failures = 0;
        inner.locked_until = Some(Instant::now() + Duration::from_secs(LOCKOUT_SECONDS));
        return Err(format!(
            "Mot de passe incorrect. Accès bloqué pendant {} secondes.",
            LOCKOUT_SECONDS
        ));
    }
    let left = MAX_FAILED_ATTEMPTS - inner.failures;
    Err(format!(
        "Mot de passe incorrect. Il reste {} essai{} avant un blocage temporaire.",
        left,
        if left > 1 { "s" } else { "" }
    ))
}

#[tauri::command]
pub fn admin_logout(
    state: State<'_, AdminState>,
    terminal: State<'_, super::terminal::TerminalState>,
) {
    lock_state(&state).token = None;
    // Un terminal root ne doit jamais survivre à la session admin.
    super::terminal::close_session(&terminal);
}

#[tauri::command]
pub fn admin_change_password(
    app: AppHandle,
    state: State<'_, AdminState>,
    token: String,
    current: String,
    new_password: String,
) -> Result<(), String> {
    require_token(&state, &token)?;
    validate_new_password(&new_password)?;

    let path = hash_file_path(&app)?;
    if !verify_against_file(&path, &current)? {
        return Err("Le mot de passe actuel est incorrect.".to_string());
    }

    let hash = hash_password(&new_password)?;
    write_hash_file(&path, &hash, hash_mode_for(&path)).map_err(write_error)
}

// Utilisé par l'installateur de l'ISO : lit le mot de passe sur l'entrée
// standard et l'écrit dans /etc/clairos (nécessite les droits root).
// Retourne Some(code de sortie) si l'option a été demandée.
pub fn handle_cli() -> Option<i32> {
    let requested = std::env::args().any(|argument| argument == "--set-admin-password");
    if !requested {
        return None;
    }

    let mut input = String::new();
    if std::io::stdin().read_line(&mut input).is_err() {
        eprintln!("Impossible de lire le mot de passe sur l'entrée standard.");
        return Some(1);
    }
    let password = input.trim_end_matches(['\r', '\n']);

    if let Err(message) = validate_new_password(password) {
        eprintln!("{}", message);
        return Some(1);
    }

    let hash = match hash_password(password) {
        Ok(value) => value,
        Err(message) => {
            eprintln!("{}", message);
            return Some(1);
        }
    };

    let path = Path::new(SYSTEM_HASH_PATH);
    if let Some(parent) = path.parent() {
        if let Err(error) = fs::create_dir_all(parent) {
            eprintln!("Impossible de créer {} : {}", parent.display(), error);
            return Some(1);
        }
    }

    match write_hash_file(path, &hash, 0o644) {
        Ok(()) => {
            println!("Mot de passe administrateur enregistré dans {}.", SYSTEM_HASH_PATH);
            Some(0)
        }
        Err(error) => {
            eprintln!(
                "Impossible d'écrire {} (droits root nécessaires ?) : {}",
                SYSTEM_HASH_PATH, error
            );
            Some(1)
        }
    }
}

// ------------------------------------------------------------
// GALERIE : LISTE, AJOUT, SUPPRESSION
// ------------------------------------------------------------

#[derive(Serialize)]
pub struct AdminPhoto {
    name: String,
    path: String,
    folder: String,
    size: u64,
    modified: u64,
}

#[derive(Serialize)]
pub struct UploadResult {
    status: String,
    name: String,
    message: String,
}

fn modified_seconds(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

#[tauri::command]
pub async fn admin_list_photos(
    state: State<'_, AdminState>,
    token: String,
) -> Result<Vec<AdminPhoto>, String> {
    require_token(&state, &token)?;

    tauri::async_runtime::spawn_blocking(move || {
        let root = images_directory()?;
        let mut files = Vec::new();
        collect_images_recursively(&root, &mut files);

        let mut photos: Vec<AdminPhoto> = files
            .into_iter()
            .filter_map(|path| {
                let metadata = fs::metadata(&path).ok()?;
                let folder = path
                    .parent()
                    .and_then(|parent| parent.strip_prefix(&root).ok())
                    .map(|relative| relative.to_string_lossy().to_string())
                    .unwrap_or_default();
                Some(AdminPhoto {
                    name: path.file_name()?.to_string_lossy().to_string(),
                    path: path.to_string_lossy().to_string(),
                    folder,
                    size: metadata.len(),
                    modified: modified_seconds(&metadata),
                })
            })
            .collect();

        photos.sort_by(|a, b| b.modified.cmp(&a.modified).then_with(|| a.name.cmp(&b.name)));
        photos.truncate(2000);
        Ok(photos)
    })
    .await
    .map_err(|e| format!("Erreur pendant la lecture de la galerie : {}", e))?
}

fn detect_image_extension(data: &[u8]) -> Option<&'static str> {
    if data.len() >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
        return Some("jpg");
    }
    if data.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some("png");
    }
    if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        return Some("gif");
    }
    if data.len() >= 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        return Some("webp");
    }
    if data.len() > 26 && data.starts_with(b"BM") {
        return Some("bmp");
    }
    if data.starts_with(&[0x49, 0x49, 0x2A, 0x00]) || data.starts_with(&[0x4D, 0x4D, 0x00, 0x2A]) {
        return Some("tif");
    }
    if data.len() >= 12
        && &data[4..8] == b"ftyp"
        && (&data[8..12] == b"avif" || &data[8..12] == b"avis")
    {
        return Some("avif");
    }
    None
}

fn clean_file_stem(original: &str) -> String {
    let base = original.rsplit(['/', '\\']).next().unwrap_or("");
    let stem = Path::new(base)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("");

    let cleaned: String = stem
        .chars()
        .map(|character| {
            if character.is_alphanumeric() || matches!(character, ' ' | '.' | '-' | '_' | '(' | ')') {
                character
            } else {
                '_'
            }
        })
        .collect();

    let cleaned = cleaned.trim().trim_start_matches('.').trim().to_string();
    let cleaned: String = cleaned.chars().take(100).collect();
    if cleaned.is_empty() {
        "photo".to_string()
    } else {
        cleaned
    }
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let high = (bytes[index + 1] as char).to_digit(16);
            let low = (bytes[index + 2] as char).to_digit(16);
            if let (Some(high), Some(low)) = (high, low) {
                output.push((high * 16 + low) as u8);
                index += 3;
                continue;
            }
        }
        output.push(bytes[index]);
        index += 1;
    }

    String::from_utf8_lossy(&output).to_string()
}

fn save_uploaded_photo(file_name: String, data: Vec<u8>) -> Result<UploadResult, String> {
    if data.is_empty() {
        return Err("Le fichier est vide.".to_string());
    }
    if data.len() > MAX_UPLOAD_BYTES {
        return Err("Cette image dépasse la limite de 25 Mo.".to_string());
    }

    let extension = detect_image_extension(&data).ok_or_else(|| {
        "Ce fichier n'est pas une image reconnue (JPG, PNG, WebP, GIF, BMP, TIFF ou AVIF).".to_string()
    })?;

    // Vérifie que l'image est lisible et de taille raisonnable
    // (l'AVIF n'est pas décodé par la bibliothèque image de ClairOS).
    if extension != "avif" {
        let reader = image::ImageReader::new(Cursor::new(&data))
            .with_guessed_format()
            .map_err(|_| "Image illisible.".to_string())?;
        let (width, height) = reader
            .into_dimensions()
            .map_err(|_| "Cette image est corrompue ou illisible.".to_string())?;
        if width == 0 || height == 0 || width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE {
            return Err("Les dimensions de cette image ne sont pas acceptées.".to_string());
        }
    }

    let stem = clean_file_stem(&file_name);
    let final_name = format!("{}.{}", stem, extension);
    let root = images_directory()?;

    // Refus des doublons : même taille puis contenu identique.
    let mut existing = Vec::new();
    collect_images_recursively(&root, &mut existing);
    for path in existing {
        let same_size = fs::metadata(&path)
            .map(|metadata| metadata.len() == data.len() as u64)
            .unwrap_or(false);
        if !same_size {
            continue;
        }
        if let Ok(mut file) = fs::File::open(&path) {
            let mut content = Vec::with_capacity(data.len());
            if file.read_to_end(&mut content).is_ok() && content == data {
                let existing_name = path
                    .file_name()
                    .map(|name| name.to_string_lossy().to_string())
                    .unwrap_or_default();
                return Ok(UploadResult {
                    status: "duplicate".to_string(),
                    name: final_name,
                    message: format!("Déjà dans la galerie (« {} »).", existing_name),
                });
            }
        }
    }

    let destination = unique_destination(&root, &final_name);
    let temporary = root.join(format!(".upload-{}.part", new_token()));

    fs::write(&temporary, &data)
        .map_err(|e| format!("Impossible d'enregistrer la photo : {}", e))?;
    if let Err(error) = fs::rename(&temporary, &destination) {
        let _ = fs::remove_file(&temporary);
        return Err(format!("Impossible d'enregistrer la photo : {}", error));
    }

    let saved_name = destination
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or(final_name);

    Ok(UploadResult {
        status: "added".to_string(),
        name: saved_name,
        message: "Ajoutée à la galerie.".to_string(),
    })
}

// Le fichier est envoyé en binaire brut (sans base64) ; le jeton et le nom
// du fichier voyagent dans les en-têtes de la requête.
#[tauri::command]
pub async fn admin_upload_photo(
    state: State<'_, AdminState>,
    request: tauri::ipc::Request<'_>,
) -> Result<UploadResult, String> {
    let token = request
        .headers()
        .get("x-admin-token")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    require_token(&state, &token)?;

    let file_name = request
        .headers()
        .get("x-file-name")
        .and_then(|value| value.to_str().ok())
        .map(percent_decode)
        .unwrap_or_default();

    let data = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.clone(),
        _ => return Err("Le fichier n'a pas été reçu correctement.".to_string()),
    };

    tauri::async_runtime::spawn_blocking(move || save_uploaded_photo(file_name, data))
        .await
        .map_err(|e| format!("Erreur pendant l'ajout de la photo : {}", e))?
}

#[tauri::command]
pub async fn admin_delete_photo(
    state: State<'_, AdminState>,
    token: String,
    path: String,
) -> Result<(), String> {
    require_token(&state, &token)?;

    tauri::async_runtime::spawn_blocking(move || {
        let root = images_directory()?;
        let target = PathBuf::from(path)
            .canonicalize()
            .map_err(|_| "Cette photo n'existe plus.".to_string())?;

        if !is_inside(&target, &root) || !target.is_file() || !is_image_file(&target) {
            return Err("Suppression refusée pour ce fichier.".to_string());
        }

        fs::remove_file(&target).map_err(|e| format!("Impossible de supprimer la photo : {}", e))
    })
    .await
    .map_err(|e| format!("Erreur pendant la suppression : {}", e))?
}

// ------------------------------------------------------------
// VERSION ET MISES À JOUR DU SYSTÈME (apt, comme Ubuntu)
//
// Le système est mis à jour par apt depuis le dépôt ClairOS (et les
// dépôts Debian pour les correctifs de sécurité). Les opérations qui
// demandent les droits root passent par un assistant restreint :
//   /usr/lib/clairos/clairos-update check|upgrade
// appelé avec `sudo -n` (règle sudoers fournie par clairos-system).
//
// - « check »   : apt-get update puis simulation de la mise à niveau.
// - « upgrade » : lance la mise à niveau dans un service systemd séparé,
//                 qui continue même si l'application est relancée.
//   L'avancement est lu dans /var/lib/clairos/update-status et
//   /var/log/clairos/update.log (lisibles sans droits particuliers).
// ------------------------------------------------------------

const UPDATE_HELPER: &str = "/usr/lib/clairos/clairos-update";
const UPDATE_STATUS_PATH: &str = "/var/lib/clairos/update-status";
const UPDATE_LOG_PATH: &str = "/var/log/clairos/update.log";
const UPGRADE_UNIT: &str = "clairos-os-upgrade.service";
const MAIN_PACKAGE: &str = "clairos-system";

#[derive(Serialize)]
pub struct VersionInfo {
    app_version: String,
    os_version: Option<String>,
    update_source: Option<String>,
}

#[derive(Serialize)]
pub struct UpgradablePackage {
    name: String,
    from: Option<String>,
    to: String,
}

#[derive(Serialize)]
pub struct UpdateCheck {
    // "not_configured" | "up_to_date" | "available"
    status: String,
    current: String,
    latest: Option<String>,
    packages: Vec<UpgradablePackage>,
    removals: Vec<String>,
    reboot_required: bool,
}

#[derive(Serialize)]
pub struct UpgradeProgress {
    // "idle" | "running" | "done" | "failed"
    state: String,
    reboot_required: bool,
    message: String,
    log: Vec<String>,
}

fn read_first_line(path: &str) -> Option<String> {
    fs::read_to_string(path)
        .ok()?
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with('#'))
        .map(str::to_string)
}

fn os_version() -> Option<String> {
    read_first_line(SYSTEM_VERSION_PATH)
}

fn update_url() -> Option<String> {
    let from_env = std::env::var("CLAIROS_UPDATE_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    from_env
        .or_else(|| read_first_line(SYSTEM_UPDATE_URL_PATH))
        .filter(|url| url.starts_with("https://"))
}

#[tauri::command]
pub fn get_version_info() -> VersionInfo {
    VersionInfo {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        os_version: os_version(),
        update_source: update_url().map(|url| {
            url.trim_start_matches("https://")
                .split('/')
                .next()
                .unwrap_or("")
                .to_string()
        }),
    }
}

fn helper_available() -> bool {
    Path::new(UPDATE_HELPER).is_file()
}

fn run_update_helper(argument: &str) -> Result<String, String> {
    let output = Command::new("sudo")
        .args(["-n", UPDATE_HELPER, argument])
        .output()
        .map_err(|error| format!("Impossible de lancer l'outil de mise à jour : {}", error))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "L'outil de mise à jour a échoué.".to_string()
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

// Lecture de la sortie de « clairos-update check » (lignes séparées par des tabulations) :
//   ERROR<TAB>network|apt     PKG<TAB>nom<TAB>ancienne<TAB>nouvelle
//   REMV<TAB>nom              REBOOT<TAB>0|1
fn parse_check_output(text: &str) -> Result<(Vec<UpgradablePackage>, Vec<String>, bool), String> {
    let mut packages = Vec::new();
    let mut removals = Vec::new();
    let mut reboot = false;

    for line in text.lines() {
        let fields: Vec<&str> = line.split('\t').collect();
        match fields.as_slice() {
            ["ERROR", "network", ..] => {
                return Err(
                    "Impossible de joindre le serveur de mises à jour. Vérifiez la connexion Internet."
                        .to_string(),
                )
            }
            ["ERROR", "busy", ..] => {
                return Err("Une mise à jour est déjà en cours. Réessayez dans quelques minutes.".to_string())
            }
            ["ERROR", ..] => {
                return Err("Le serveur de mises à jour a répondu avec une erreur.".to_string())
            }
            ["PKG", name, from, to] => packages.push(UpgradablePackage {
                name: (*name).to_string(),
                from: if from.is_empty() { None } else { Some((*from).to_string()) },
                to: (*to).to_string(),
            }),
            ["REMV", name] => removals.push((*name).to_string()),
            ["REBOOT", value] => reboot = *value == "1",
            _ => {}
        }
    }

    Ok((packages, removals, reboot))
}

fn check_updates_blocking() -> Result<UpdateCheck, String> {
    let current = os_version().unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string());

    if !helper_available() {
        return Ok(UpdateCheck {
            status: "not_configured".to_string(),
            current,
            latest: None,
            packages: Vec::new(),
            removals: Vec::new(),
            reboot_required: false,
        });
    }

    let output = run_update_helper("check")?;
    let (packages, removals, reboot_required) = parse_check_output(&output)?;

    let latest = packages
        .iter()
        .find(|package| package.name == MAIN_PACKAGE)
        .map(|package| package.to.clone());

    Ok(UpdateCheck {
        status: if packages.is_empty() { "up_to_date" } else { "available" }.to_string(),
        current,
        latest,
        packages,
        removals,
        reboot_required,
    })
}

// La vérification est en lecture seule : elle ne demande pas de session
// admin, afin de pouvoir alimenter plus tard une notification sur le bureau.
#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateCheck, String> {
    tauri::async_runtime::spawn_blocking(check_updates_blocking)
        .await
        .map_err(|e| format!("Erreur pendant la vérification : {}", e))?
}

#[tauri::command]
pub async fn admin_os_upgrade_start(
    state: State<'_, AdminState>,
    token: String,
) -> Result<(), String> {
    require_token(&state, &token)?;

    if !helper_available() {
        return Err(
            "Les mises à jour du système ne sont disponibles que sur un ClairOS installé."
                .to_string(),
        );
    }

    tauri::async_runtime::spawn_blocking(|| run_update_helper("upgrade").map(|_| ()))
        .await
        .map_err(|e| format!("Erreur pendant la mise à jour : {}", e))?
}

fn read_status_file() -> (String, bool, String) {
    let mut state = "idle".to_string();
    let mut reboot = false;
    let mut message = String::new();

    if let Ok(text) = fs::read_to_string(UPDATE_STATUS_PATH) {
        for line in text.lines() {
            if let Some((key, value)) = line.split_once('=') {
                match key.trim() {
                    "state" => state = value.trim().to_string(),
                    "reboot" => reboot = value.trim() == "1",
                    "message" => message = value.trim().chars().take(300).collect(),
                    _ => {}
                }
            }
        }
    }
    (state, reboot, message)
}

fn read_log_tail(max_lines: usize) -> Vec<String> {
    let mut file = match fs::File::open(UPDATE_LOG_PATH) {
        Ok(file) => file,
        Err(_) => return Vec::new(),
    };

    // On ne relit que la fin du fichier (64 Ko au maximum).
    use std::io::Seek;
    const WINDOW: u64 = 64 * 1024;
    if let Ok(length) = file.metadata().map(|metadata| metadata.len()) {
        if length > WINDOW {
            let _ = file.seek(std::io::SeekFrom::Start(length - WINDOW));
        }
    }

    let mut bytes = Vec::new();
    if file.read_to_end(&mut bytes).is_err() {
        return Vec::new();
    }

    let text = String::from_utf8_lossy(&bytes);
    let lines: Vec<String> = text
        .lines()
        .map(|line| line.chars().take(400).collect::<String>())
        .collect();
    let skip = lines.len().saturating_sub(max_lines);
    lines.into_iter().skip(skip).collect()
}

fn upgrade_unit_active() -> bool {
    Command::new("systemctl")
        .args(["is-active", "--quiet", UPGRADE_UNIT])
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

#[tauri::command]
pub fn admin_os_upgrade_progress(
    state: State<'_, AdminState>,
    token: String,
) -> Result<UpgradeProgress, String> {
    require_token(&state, &token)?;

    let (mut status, reboot_required, mut message) = read_status_file();

    // « running » sans service actif : la mise à jour a été interrompue
    // (coupure de courant, redémarrage...).
    if status == "running" && !upgrade_unit_active() {
        status = "failed".to_string();
        message = "La mise à jour a été interrompue. Relancez la vérification.".to_string();
    }

    Ok(UpgradeProgress {
        state: status,
        reboot_required,
        message,
        log: read_log_tail(60),
    })
}

// ------------------------------------------------------------
// RÉSEAU (NetworkManager / nmcli)
// ------------------------------------------------------------

#[derive(Serialize)]
pub struct NetDevice {
    name: String,
    kind: String,
    state: String,
    connection: String,
    ip: String,
}

#[derive(Serialize)]
pub struct NetworkStatus {
    available: bool,
    connectivity: String,
    wifi_enabled: bool,
    devices: Vec<NetDevice>,
}

#[derive(Serialize)]
pub struct WifiNetwork {
    ssid: String,
    signal: u8,
    security: String,
    in_use: bool,
}

fn run_nmcli(arguments: &[&str]) -> Result<String, String> {
    let output = Command::new("nmcli").args(arguments).output().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            "NetworkManager (nmcli) n'est pas installé sur ce système.".to_string()
        } else {
            format!("Impossible d'exécuter nmcli : {}", error)
        }
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let message = if !stderr.is_empty() { stderr } else { stdout };
        return Err(if message.is_empty() {
            "La commande réseau a échoué.".to_string()
        } else {
            message
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

// Découpe une ligne du mode « terse » de nmcli (séparateur ':' échappé en '\:').
fn split_terse(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut escaped = false;

    for character in line.chars() {
        if escaped {
            current.push(character);
            escaped = false;
        } else if character == '\\' {
            escaped = true;
        } else if character == ':' {
            fields.push(std::mem::take(&mut current));
        } else {
            current.push(character);
        }
    }
    fields.push(current);
    fields
}

fn network_status_blocking() -> Result<NetworkStatus, String> {
    let listing = match run_nmcli(&["-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device", "status"]) {
        Ok(value) => value,
        Err(message) => {
            // nmcli absent : on indique simplement que la gestion réseau est indisponible.
            return if message.contains("pas installé") {
                Ok(NetworkStatus {
                    available: false,
                    connectivity: "unknown".to_string(),
                    wifi_enabled: false,
                    devices: Vec::new(),
                })
            } else {
                Err(message)
            };
        }
    };

    let mut devices = Vec::new();
    for line in listing.lines() {
        let fields = split_terse(line);
        if fields.len() < 4 {
            continue;
        }
        let kind = fields[1].clone();
        if !matches!(kind.as_str(), "wifi" | "ethernet") {
            continue;
        }
        let state = fields[2].clone();
        let name = fields[0].clone();

        let ip = if state.starts_with("connected") {
            run_nmcli(&["-t", "-g", "IP4.ADDRESS", "device", "show", &name])
                .ok()
                .and_then(|text| text.lines().next().map(str::to_string))
                .map(|address| address.split('/').next().unwrap_or("").to_string())
                .unwrap_or_default()
        } else {
            String::new()
        };

        devices.push(NetDevice {
            name,
            kind,
            state,
            connection: fields[3].clone(),
            ip,
        });
    }

    let connectivity = run_nmcli(&["-t", "-g", "CONNECTIVITY", "general"])
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    let wifi_enabled = run_nmcli(&["radio", "wifi"])
        .map(|value| value.trim() == "enabled")
        .unwrap_or(false);

    Ok(NetworkStatus {
        available: true,
        connectivity,
        wifi_enabled,
        devices,
    })
}

#[tauri::command]
pub async fn admin_network_status(
    state: State<'_, AdminState>,
    token: String,
) -> Result<NetworkStatus, String> {
    require_token(&state, &token)?;
    tauri::async_runtime::spawn_blocking(network_status_blocking)
        .await
        .map_err(|e| format!("Erreur réseau : {}", e))?
}

fn wifi_scan_blocking(rescan: bool) -> Result<Vec<WifiNetwork>, String> {
    let fields = "IN-USE,SSID,SIGNAL,SECURITY";
    let first = if rescan { "yes" } else { "no" };

    let listing = run_nmcli(&["-t", "-f", fields, "device", "wifi", "list", "--rescan", first])
        .or_else(|_| run_nmcli(&["-t", "-f", fields, "device", "wifi", "list", "--rescan", "no"]))?;

    let mut networks: Vec<WifiNetwork> = Vec::new();
    for line in listing.lines() {
        let parts = split_terse(line);
        if parts.len() < 4 || parts[1].trim().is_empty() {
            continue;
        }
        let candidate = WifiNetwork {
            ssid: parts[1].clone(),
            signal: parts[2].parse::<u8>().unwrap_or(0).min(100),
            security: parts[3].clone(),
            in_use: parts[0].trim() == "*",
        };

        match networks.iter_mut().find(|existing| existing.ssid == candidate.ssid) {
            Some(existing) => {
                if candidate.in_use || (!existing.in_use && candidate.signal > existing.signal) {
                    *existing = candidate;
                }
            }
            None => networks.push(candidate),
        }
    }

    networks.sort_by(|a, b| b.in_use.cmp(&a.in_use).then_with(|| b.signal.cmp(&a.signal)));
    Ok(networks)
}

#[tauri::command]
pub async fn admin_wifi_scan(
    state: State<'_, AdminState>,
    token: String,
    rescan: bool,
) -> Result<Vec<WifiNetwork>, String> {
    require_token(&state, &token)?;
    tauri::async_runtime::spawn_blocking(move || wifi_scan_blocking(rescan))
        .await
        .map_err(|e| format!("Erreur réseau : {}", e))?
}

fn valid_ssid(ssid: &str) -> bool {
    !ssid.is_empty()
        && ssid.len() <= 32
        && !ssid.starts_with('-')
        && !ssid.chars().any(|character| character.is_control())
}

#[tauri::command]
pub async fn admin_wifi_connect(
    state: State<'_, AdminState>,
    token: String,
    ssid: String,
    password: Option<String>,
) -> Result<(), String> {
    require_token(&state, &token)?;

    if !valid_ssid(&ssid) {
        return Err("Nom de réseau Wi-Fi invalide.".to_string());
    }
    let password = password.filter(|value| !value.is_empty());
    if let Some(value) = &password {
        if value.len() > 128 || value.chars().any(|character| character == '\0') {
            return Err("Mot de passe Wi-Fi invalide.".to_string());
        }
    }

    tauri::async_runtime::spawn_blocking(move || {
        let mut arguments = vec!["-w", "25", "device", "wifi", "connect", ssid.as_str()];
        if let Some(value) = password.as_deref() {
            arguments.push("password");
            arguments.push(value);
        }
        run_nmcli(&arguments).map(|_| ())
    })
    .await
    .map_err(|e| format!("Erreur réseau : {}", e))?
}

#[tauri::command]
pub async fn admin_wifi_disconnect(
    state: State<'_, AdminState>,
    token: String,
) -> Result<(), String> {
    require_token(&state, &token)?;

    tauri::async_runtime::spawn_blocking(|| {
        let listing = run_nmcli(&["-t", "-f", "DEVICE,TYPE,STATE", "device", "status"])?;
        let device = listing
            .lines()
            .map(split_terse)
            .find(|fields| {
                fields.len() >= 3 && fields[1] == "wifi" && fields[2].starts_with("connected")
            })
            .map(|fields| fields[0].clone())
            .ok_or_else(|| "Aucune connexion Wi-Fi active.".to_string())?;

        run_nmcli(&["device", "disconnect", &device]).map(|_| ())
    })
    .await
    .map_err(|e| format!("Erreur réseau : {}", e))?
}

#[tauri::command]
pub async fn admin_wifi_set_enabled(
    state: State<'_, AdminState>,
    token: String,
    enabled: bool,
) -> Result<(), String> {
    require_token(&state, &token)?;

    tauri::async_runtime::spawn_blocking(move || {
        run_nmcli(&["radio", "wifi", if enabled { "on" } else { "off" }]).map(|_| ())
    })
    .await
    .map_err(|e| format!("Erreur réseau : {}", e))?
}

// ------------------------------------------------------------
// ALIMENTATION
// ------------------------------------------------------------

// Arrêt et redémarrage sont accessibles depuis le bureau sans mot de
// passe : c'est ce dont l'utilisatrice a besoin au quotidien.
// En mode développement (cargo / tauri dev) ils sont désactivés pour ne
// pas éteindre par erreur l'ordinateur du développeur.
#[tauri::command]
pub async fn system_power(action: String) -> Result<(), String> {
    let verb = match action.as_str() {
        "poweroff" => "poweroff",
        "reboot" => "reboot",
        _ => return Err("Action non autorisée.".to_string()),
    };

    if cfg!(debug_assertions) && std::env::var("CLAIROS_ALLOW_POWER").is_err() {
        return Err(
            "Mode développement : l'arrêt et le redémarrage sont désactivés \
             (ils fonctionnent dans la version installée de ClairOS)."
                .to_string(),
        );
    }

    tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new("systemctl")
            .arg(verb)
            .output()
            .map_err(|e| format!("Impossible de lancer l'opération : {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
            Err(if message.is_empty() {
                "Le système a refusé l'opération.".to_string()
            } else {
                message
            })
        }
    })
    .await
    .map_err(|e| format!("Erreur pendant l'opération : {}", e))?
}

#[tauri::command]
pub fn admin_quit_app(
    app: AppHandle,
    state: State<'_, AdminState>,
    token: String,
) -> Result<(), String> {
    require_token(&state, &token)?;
    app.exit(0);
    Ok(())
}
