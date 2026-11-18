// ============================================================
// CLAIROS - TERMINAL ADMINISTRATEUR (« CMD »)
//
// Un vrai terminal (pseudo-terminal Linux) affiché dans l'administration.
//
// - Il n'est accessible qu'avec une session admin valide : chaque commande
//   vérifie le jeton gardé en mémoire côté Rust (comme le reste de
//   l'administration), pas seulement l'interface React.
// - Sur un ClairOS installé, le shell est un shell ROOT lancé par
//   `sudo -n /usr/lib/clairos/admin-shell`. La règle sudoers qui l'autorise
//   est fournie par le paquet clairos-system (groupe « clairos »).
// - En développement (cargo / tauri dev) ou avec CLAIROS_DEV_TERMINAL=1, un
//   shell utilisateur ordinaire est ouvert à la place.
// - Une seule session à la fois. Elle est fermée à la déconnexion admin,
//   au verrouillage automatique et à la fermeture de la page.
// ============================================================

use base64::Engine;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    io::{Read, Write},
    path::Path,
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    thread,
};
use tauri::{AppHandle, Emitter, Manager, State};

use super::admin::{require_token, AdminState};

const ROOT_SHELL_HELPER: &str = "/usr/lib/clairos/admin-shell";

const EVENT_OUTPUT: &str = "clairos-terminal-output";
const EVENT_EXIT: &str = "clairos-terminal-exit";

struct Session {
    id: u64,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct TerminalState {
    session: Mutex<Option<Session>>,
    counter: AtomicU64,
}

#[derive(Serialize, Clone)]
struct OutputEvent {
    id: u64,
    // Octets du terminal encodés en base64 (flux binaire, pas forcément UTF-8 complet).
    data: String,
}

#[derive(Serialize, Clone)]
struct ExitEvent {
    id: u64,
}

#[derive(Serialize)]
pub struct TerminalOpened {
    id: u64,
    // true : shell root ; false : shell utilisateur (mode développement).
    root: bool,
}

fn lock_session(state: &TerminalState) -> std::sync::MutexGuard<'_, Option<Session>> {
    state
        .session
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

// Ferme la session en cours (si elle existe). Appelée aussi à la déconnexion admin.
pub fn close_session(state: &TerminalState) {
    let taken = lock_session(state).take();
    if let Some(mut session) = taken {
        let _ = session.child.kill();
        let _ = session.child.wait();
    }
}

fn dev_terminal_allowed() -> bool {
    cfg!(debug_assertions) || std::env::var_os("CLAIROS_DEV_TERMINAL").is_some()
}

// Vérifie que l'utilisateur de la session a bien le droit d'ouvrir le shell root.
fn root_shell_permitted() -> Result<(), String> {
    let status = Command::new("sudo")
        .args(["-n", "-l", ROOT_SHELL_HELPER])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|error| format!("Impossible de vérifier les droits administrateur : {}", error))?;

    if status.success() {
        Ok(())
    } else {
        Err(
            "Les droits administrateur ne sont pas disponibles pour ce compte. \
             Le terminal administrateur nécessite le paquet clairos-system."
                .to_string(),
        )
    }
}

fn build_command() -> Result<(CommandBuilder, bool), String> {
    if Path::new(ROOT_SHELL_HELPER).is_file() {
        root_shell_permitted()?;
        let mut command = CommandBuilder::new("sudo");
        command.args(["-n", ROOT_SHELL_HELPER]);
        command.env("TERM", "xterm-256color");
        return Ok((command, true));
    }

    if dev_terminal_allowed() {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
        let mut command = CommandBuilder::new(shell);
        command.env("TERM", "xterm-256color");
        return Ok((command, false));
    }

    Err("Le terminal administrateur n'est pas disponible sur ce système.".to_string())
}

fn clamp_size(rows: u16, cols: u16) -> PtySize {
    PtySize {
        rows: rows.clamp(2, 500),
        cols: cols.clamp(10, 1000),
        pixel_width: 0,
        pixel_height: 0,
    }
}

#[tauri::command]
pub fn admin_term_open(
    app: AppHandle,
    admin: State<'_, AdminState>,
    terminal: State<'_, TerminalState>,
    token: String,
    rows: u16,
    cols: u16,
) -> Result<TerminalOpened, String> {
    require_token(&admin, &token)?;

    // Une seule session : l'ancienne est fermée proprement.
    close_session(&terminal);

    let (command, root) = build_command()?;

    let pair = native_pty_system()
        .openpty(clamp_size(rows, cols))
        .map_err(|error| format!("Impossible de créer le terminal : {}", error))?;

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| format!("Impossible de démarrer le shell : {}", error))?;
    // Le côté « esclave » doit être fermé chez nous, sinon la fin du shell n'est jamais détectée.
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| format!("Impossible de lire le terminal : {}", error))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| format!("Impossible d'écrire dans le terminal : {}", error))?;

    let id = terminal.counter.fetch_add(1, Ordering::SeqCst) + 1;

    *lock_session(&terminal) = Some(Session {
        id,
        master: pair.master,
        writer,
        child,
    });

    let app_for_thread = app.clone();
    thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let data = base64::engine::general_purpose::STANDARD.encode(&buffer[..count]);
                    if app_for_thread.emit(EVENT_OUTPUT, OutputEvent { id, data }).is_err() {
                        break;
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break,
            }
        }

        // Le shell est terminé : on libère la session si c'est encore la nôtre.
        let state = app_for_thread.state::<TerminalState>();
        let finished = {
            let mut guard = lock_session(&state);
            match guard.as_ref() {
                Some(session) if session.id == id => guard.take(),
                _ => None,
            }
        };
        if let Some(mut session) = finished {
            let _ = session.child.kill();
            let _ = session.child.wait();
        }
        let _ = app_for_thread.emit(EVENT_EXIT, ExitEvent { id });
    });

    Ok(TerminalOpened { id, root })
}

#[tauri::command]
pub fn admin_term_write(
    admin: State<'_, AdminState>,
    terminal: State<'_, TerminalState>,
    token: String,
    id: u64,
    data: String,
) -> Result<(), String> {
    require_token(&admin, &token)?;

    let mut guard = lock_session(&terminal);
    match guard.as_mut() {
        Some(session) if session.id == id => {
            session
                .writer
                .write_all(data.as_bytes())
                .and_then(|_| session.writer.flush())
                .map_err(|error| format!("Écriture impossible : {}", error))
        }
        _ => Err("Le terminal n'est plus ouvert.".to_string()),
    }
}

#[tauri::command]
pub fn admin_term_resize(
    admin: State<'_, AdminState>,
    terminal: State<'_, TerminalState>,
    token: String,
    id: u64,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    require_token(&admin, &token)?;

    let guard = lock_session(&terminal);
    match guard.as_ref() {
        Some(session) if session.id == id => session
            .master
            .resize(clamp_size(rows, cols))
            .map_err(|error| format!("Redimensionnement impossible : {}", error)),
        _ => Ok(()),
    }
}

#[tauri::command]
pub fn admin_term_close(
    admin: State<'_, AdminState>,
    terminal: State<'_, TerminalState>,
    token: String,
) -> Result<(), String> {
    require_token(&admin, &token)?;
    close_session(&terminal);
    Ok(())
}
