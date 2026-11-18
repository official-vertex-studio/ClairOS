use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use scraper::{ElementRef, Html, Selector};
use std::{
    collections::HashSet,
    fs,
    io::Cursor,
    path::{Path, PathBuf},
    process::Command,
    thread,
    time::{Duration, Instant},
};
use zbus::blocking::{Connection, Proxy};
use zbus::zvariant::OwnedObjectPath;


mod admin;
mod terminal;

// ============================================================
// CLAIROS - INFORMATIONS SYSTÈME
// ============================================================

#[tauri::command]
fn get_system_info() -> Result<Value, String> {
    let os_release = fs::read_to_string("/etc/os-release").unwrap_or_default();

    let base_name = os_release
        .lines()
        .find(|line| line.starts_with("PRETTY_NAME="))
        .map(|line| {
            line.trim_start_matches("PRETTY_NAME=")
                .trim_matches('"')
                .to_string()
        })
        .unwrap_or_else(|| "Linux".to_string());

    // Sur un ClairOS installé, /etc/clairos/version contient la version du système.
    let clairos_version = fs::read_to_string("/etc/clairos/version")
        .ok()
        .and_then(|text| {
            text.lines()
                .map(str::trim)
                .find(|line| !line.is_empty() && !line.starts_with('#'))
                .map(str::to_string)
        });

    let os_name = match clairos_version {
        Some(version) => format!("ClairOS {} · {}", version, base_name),
        None => base_name,
    };

    let kernel = fs::read_to_string("/proc/sys/kernel/osrelease")
        .unwrap_or_else(|_| "Inconnu".to_string())
        .trim()
        .to_string();

    let meminfo = fs::read_to_string("/proc/meminfo").unwrap_or_default();

    let mut memory_total = 0_u64;
    let mut memory_available = 0_u64;

    for line in meminfo.lines() {
        if line.starts_with("MemTotal:") {
            memory_total = line
                .split_whitespace()
                .nth(1)
                .and_then(|value| value.parse().ok())
                .unwrap_or(0);
        }

        if line.starts_with("MemAvailable:") {
            memory_available = line
                .split_whitespace()
                .nth(1)
                .and_then(|value| value.parse().ok())
                .unwrap_or(0);
        }
    }

    let memory_used = memory_total.saturating_sub(memory_available);

    let uptime = fs::read_to_string("/proc/uptime")
        .unwrap_or_default()
        .split_whitespace()
        .next()
        .and_then(|value| value.parse::<f64>().ok())
        .unwrap_or(0.0) as u64;

    let hours = uptime / 3600;
    let minutes = (uptime % 3600) / 60;

    Ok(json!({
        "name": "ClairOS by Gab9SG",
        "os": os_name,
        "kernel": kernel,
        "memory_total_mb": memory_total / 1024,
        "memory_used_mb": memory_used / 1024,
        "uptime_seconds": uptime,
        "uptime": format!("{} h {} min", hours, minutes)
    }))
}

// ============================================================
// CLAIROS - GÉOLOCALISATION GEOCLUE
// ============================================================

#[derive(Debug, Serialize)]
struct GeoLocation {
    latitude: f64,
    longitude: f64,
    accuracy: f64,
    source: &'static str,
    city: Option<String>,
}

fn get_geoclue_location_blocking() -> Result<GeoLocation, String> {
    let connection = Connection::system()
        .map_err(|error| format!("Connexion D-Bus impossible : {}", error))?;

    let manager = Proxy::new(
        &connection,
        "org.freedesktop.GeoClue2",
        "/org/freedesktop/GeoClue2/Manager",
        "org.freedesktop.GeoClue2.Manager",
    )
    .map_err(|error| format!("GeoClue indisponible : {}", error))?;

    let client_path: OwnedObjectPath = manager
        .call("GetClient", &())
        .map_err(|error| {
            format!(
                "Impossible de créer le client de localisation : {}",
                error
            )
        })?;

    let client = Proxy::new(
        &connection,
        "org.freedesktop.GeoClue2",
        client_path.as_str(),
        "org.freedesktop.GeoClue2.Client",
    )
    .map_err(|error| format!("Client GeoClue invalide : {}", error))?;

    client
        .set_property("DesktopId", "com.gab9sg.clairos")
        .map_err(|error| {
            format!("Impossible de configurer ClairOS : {}", error)
        })?;

    client
        .set_property("RequestedAccuracyLevel", 4_u32)
        .map_err(|error| {
            format!("Impossible de définir la précision : {}", error)
        })?;

    client
        .call::<_, _, ()>("Start", &())
        .map_err(|error| {
            format!("La demande de localisation a échoué : {}", error)
        })?;

    let start = Instant::now();
    let timeout = Duration::from_secs(10);

    let mut result: Option<GeoLocation> = None;

    while start.elapsed() < timeout {
        let location_path: Result<OwnedObjectPath, _> =
            client.get_property("Location");

        if let Ok(location_path) = location_path {
            if location_path.as_str() != "/" {
                let location_proxy = Proxy::new(
                    &connection,
                    "org.freedesktop.GeoClue2",
                    location_path.as_str(),
                    "org.freedesktop.GeoClue2.Location",
                );

                if let Ok(location_proxy) = location_proxy {
                    let latitude: Result<f64, _> =
                        location_proxy.get_property("Latitude");

                    let longitude: Result<f64, _> =
                        location_proxy.get_property("Longitude");

                    let accuracy: Result<f64, _> =
                        location_proxy.get_property("Accuracy");

                    if let (Ok(latitude), Ok(longitude), Ok(accuracy)) =
                        (latitude, longitude, accuracy)
                    {
                        if latitude.is_finite()
                            && longitude.is_finite()
                            && latitude.abs() <= 90.0
                            && longitude.abs() <= 180.0
                        {
                            result = Some(GeoLocation {
                                latitude,
                                longitude,
                                accuracy,
                                source: "geoclue",
                                city: None,
                            });

                            break;
                        }
                    }
                }
            }
        }

        thread::sleep(Duration::from_millis(500));
    }

    let _ = client.call::<_, _, ()>("Stop", &());
    let _ = manager.call::<_, _, ()>("DeleteClient", &client_path);

    result.ok_or_else(|| {
        "Aucune position n'a été obtenue. Vérifiez les autorisations de localisation."
            .to_string()
    })
}

// Position approximative à partir de l'adresse IP (précision : la ville).
// Sert de solution de secours quand GeoClue n'est pas disponible ou
// n'est pas autorisé : la météo n'a besoin que de la ville.
fn get_ip_location_blocking() -> Result<GeoLocation, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("ClairOS/1.0 (Meteo)")
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|error| format!("Client réseau indisponible : {}", error))?;

    let services = ["https://ipwho.is/", "https://ipapi.co/json/"];
    let mut last_error = String::from("Aucun service de localisation joignable.");

    for url in services {
        let response = match client.get(url).send() {
            Ok(value) if value.status().is_success() => value,
            Ok(value) => {
                last_error = format!("HTTP {}", value.status());
                continue;
            }
            Err(error) => {
                last_error = error.to_string();
                continue;
            }
        };

        let data: Value = match response
            .bytes()
            .map_err(|error| error.to_string())
            .and_then(|bytes| {
                serde_json::from_slice(&bytes).map_err(|error| error.to_string())
            }) {
            Ok(value) => value,
            Err(error) => {
                last_error = error;
                continue;
            }
        };

        let latitude = data.get("latitude").and_then(Value::as_f64);
        let longitude = data.get("longitude").and_then(Value::as_f64);

        if let (Some(latitude), Some(longitude)) = (latitude, longitude) {
            if latitude.abs() <= 90.0 && longitude.abs() <= 180.0 {
                return Ok(GeoLocation {
                    latitude,
                    longitude,
                    accuracy: 25_000.0,
                    source: "ip",
                    city: data
                        .get("city")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                        .filter(|name| !name.is_empty()),
                });
            }
        }

        last_error = "Réponse de localisation invalide.".to_string();
    }

    Err(last_error)
}

fn get_location_blocking() -> Result<GeoLocation, String> {
    match get_geoclue_location_blocking() {
        Ok(location) => Ok(location),
        Err(geoclue_error) => get_ip_location_blocking().map_err(|ip_error| {
            format!(
                "Position introuvable (GeoClue : {} ; Internet : {})",
                geoclue_error, ip_error
            )
        }),
    }
}

#[tauri::command]
async fn get_current_location() -> Result<GeoLocation, String> {
    tauri::async_runtime::spawn_blocking(get_location_blocking)
        .await
        .map_err(|error| {
            format!("Erreur pendant la géolocalisation : {}", error)
        })?
}

// ============================================================
// MARMITON - MODÈLES DE DONNÉES
// ============================================================

#[derive(Debug, Serialize)]
struct MarmitonRecipe {
    id: String,
    title: String,
    url: String,
    image: String,
    category: String,
}

#[derive(Debug, Serialize)]
struct MarmitonDetail {
    title: String,
    description: String,
    image: String,
    gallery_images: Vec<String>,
    ingredients: Vec<String>,
    steps: Vec<String>,
    total_time: String,
    servings: String,
    difficulty: String,
    video_url: String,
    video_embed_url: String,
    source_url: String,
}

// ============================================================
// MARMITON - CLIENT HTTP
// ============================================================

fn marmiton_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent(
            "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) \
             Gecko/20100101 Firefox/125.0",
        )
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(6))
        .pool_idle_timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|error| {
            format!("Impossible de créer le client Internet : {}", error)
        })
}

fn fetch_marmiton_page(url: &str) -> Result<String, String> {
    let client = marmiton_client()?;

    let response = client
        .get(url)
        .send()
        .map_err(|error| {
            format!("Impossible de contacter Marmiton : {}", error)
        })?;

    if !response.status().is_success() {
        return Err(format!(
            "Marmiton a répondu avec le statut HTTP {}",
            response.status()
        ));
    }

    response
        .text()
        .map_err(|error| {
            format!("Impossible de lire la page Marmiton : {}", error)
        })
}

// ============================================================
// MARMITON - OUTILS DE TEXTE ET URL
// ============================================================

fn clean_text(value: &str) -> String {
    value
        .replace("&nbsp;", " ")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&eacute;", "é")
        .replace("&egrave;", "è")
        .replace("&agrave;", "à")
        .replace("&ccedil;", "ç")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn normalize_search(value: &str) -> String {
    value
        .to_lowercase()
        .replace('é', "e")
        .replace('è', "e")
        .replace('ê', "e")
        .replace('ë', "e")
        .replace('à', "a")
        .replace('â', "a")
        .replace('ä', "a")
        .replace('î', "i")
        .replace('ï', "i")
        .replace('ô', "o")
        .replace('ö', "o")
        .replace('ù', "u")
        .replace('û', "u")
        .replace('ü', "u")
        .replace('ç', "c")
        .replace('-', " ")
        .replace('\'', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn recipe_matches(title: &str, query: &str) -> bool {
    let normalized_title = normalize_search(title);
    let normalized_query = normalize_search(query);

    let ignored = [
        "de", "du", "des", "la", "le", "les", "un", "une", "et", "a", "au",
        "aux",
    ];

    let terms: Vec<String> = normalized_query
        .split_whitespace()
        .filter(|word| !ignored.contains(word))
        .map(|word| {
            if word == "pastel" {
                "pasteis".to_string()
            } else {
                word.to_string()
            }
        })
        .collect();

    if terms.is_empty() {
        return normalized_title.contains(&normalized_query);
    }

    let matches = terms
        .iter()
        .filter(|term| normalized_title.contains(term.as_str()))
        .count();

    if terms.len() <= 2 {
        matches == terms.len()
    } else {
        matches * 2 >= terms.len()
    }
}

fn absolute_marmiton_url(value: &str) -> Option<String> {
    let value = value.trim();

    if value.starts_with("https://www.marmiton.org/")
        || value.starts_with("https://marmiton.org/")
    {
        return Some(value.to_string());
    }

    if value.starts_with("//www.marmiton.org/")
        || value.starts_with("//marmiton.org/")
    {
        return Some(format!("https:{}", value));
    }

    if value.starts_with("/recettes/") {
        return Some(format!("https://www.marmiton.org{}", value));
    }

    None
}

// ============================================================
// MARMITON - EXTRACTION DES IMAGES
// ============================================================

fn image_from_element(element: ElementRef<'_>) -> Option<String> {
    let selectors = ["img", "picture img", "source"];

    for selector_text in selectors {
        let selector = Selector::parse(selector_text).ok()?;

        for image in element.select(&selector) {
            let attributes = [
                "data-src",
                "data-lazy-src",
                "data-original",
                "src",
                "srcset",
            ];

            for attribute in attributes {
                if let Some(value) = image.value().attr(attribute) {
                    let candidate = value
                        .split(',')
                        .next()
                        .unwrap_or(value)
                        .split_whitespace()
                        .next()
                        .unwrap_or("")
                        .trim();

                    if candidate.starts_with("https://")
                        || candidate.starts_with("http://")
                        || candidate.starts_with("//")
                    {
                        return Some(if candidate.starts_with("//") {
                            format!("https:{}", candidate)
                        } else {
                            candidate.to_string()
                        });
                    }
                }
            }
        }
    }

    None
}

// ============================================================
// MARMITON - RECHERCHE INTERNET
// ============================================================

fn search_marmiton_blocking(
    query: String,
) -> Result<Vec<MarmitonRecipe>, String> {
    let query = query.trim().to_string();

    if query.len() < 2 {
        return Ok(Vec::new());
    }

    let encoded_query = urlencoding_fallback(&query);

    let search_url = format!(
        "https://www.marmiton.org/recettes/recherche.aspx?aqt={}",
        encoded_query
    );

    let html = fetch_marmiton_page(&search_url)?;
    let document = Html::parse_document(&html);

    let selector = Selector::parse("a[href*='/recettes/recette_']")
        .map_err(|error| error.to_string())?;

    let mut recipes = Vec::new();
    let mut seen = HashSet::new();

    for anchor in document.select(&selector) {
        let href = match anchor.value().attr("href") {
            Some(value) => value,
            None => continue,
        };

        let url = match absolute_marmiton_url(href) {
            Some(value) => value,
            None => continue,
        };

        if !seen.insert(url.clone()) {
            continue;
        }

        let title = clean_text(&anchor.text().collect::<Vec<_>>().join(" "));

        if title.len() < 3 {
            continue;
        }

        if !recipe_matches(&title, &query) {
            continue;
        }

        let mut image = image_from_element(anchor);

        if image.is_none() {
            if let Some(parent) = anchor.parent() {
                if let Some(parent_element) = ElementRef::wrap(parent) {
                    image = image_from_element(parent_element);

                    if image.is_none() {
                        if let Some(grandparent) = parent_element.parent() {
                            if let Some(grandparent_element) =
                                ElementRef::wrap(grandparent)
                            {
                                image = image_from_element(grandparent_element);
                            }
                        }
                    }
                }
            }
        }

        let image = image.unwrap_or_default();

        let id = url
            .rsplit('/')
            .next()
            .unwrap_or("recipe")
            .to_string();

        recipes.push(MarmitonRecipe {
            id,
            title,
            url,
            image,
            category: "Recette Marmiton".to_string(),
        });

        if recipes.len() >= 18 {
            break;
        }
    }

    Ok(recipes)
}

fn urlencoding_fallback(value: &str) -> String {
    let mut result = String::new();

    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric()
            || *byte == b'-'
            || *byte == b'_'
            || *byte == b'.'
        {
            result.push(*byte as char);
        } else if *byte == b' ' {
            result.push('+');
        } else {
            result.push_str(&format!("%{:02X}", byte));
        }
    }

    result
}

#[tauri::command]
async fn search_marmiton_recipes(
    query: String,
) -> Result<Vec<MarmitonRecipe>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        search_marmiton_blocking(query)
    })
    .await
    .map_err(|error| {
        format!("Erreur pendant la recherche : {}", error)
    })?
}

// ============================================================
// MARMITON - LECTURE DES DONNÉES JSON-LD
// ============================================================

fn json_string(value: &Value) -> String {
    match value {
        Value::String(text) => clean_text(text),

        Value::Object(object) => {
            if let Some(url) = object.get("url") {
                return json_string(url);
            }

            if let Some(content_url) = object.get("contentUrl") {
                return json_string(content_url);
            }

            if let Some(text) = object.get("text") {
                return json_string(text);
            }

            String::new()
        }

        _ => String::new(),
    }
}

fn json_image_list(value: &Value) -> Vec<String> {
    let mut images = Vec::new();

    match value {
        Value::String(url) => {
            if !url.is_empty() {
                images.push(url.clone());
            }
        }

        Value::Array(items) => {
            for item in items {
                images.extend(json_image_list(item));
            }
        }

        Value::Object(_) => {
            let url = json_string(value);

            if !url.is_empty() {
                images.push(url);
            }
        }

        _ => {}
    }

    images
}

fn is_recipe_type(value: &Value) -> bool {
    match value {
        Value::String(text) => text == "Recipe",
        Value::Array(items) => items.iter().any(is_recipe_type),
        _ => false,
    }
}

fn find_recipe_json(value: &Value) -> Option<&Value> {
    match value {
        Value::Object(object) => {
            if object
                .get("@type")
                .map(is_recipe_type)
                .unwrap_or(false)
            {
                return Some(value);
            }

            for child in object.values() {
                if let Some(found) = find_recipe_json(child) {
                    return Some(found);
                }
            }
        }

        Value::Array(items) => {
            for item in items {
                if let Some(found) = find_recipe_json(item) {
                    return Some(found);
                }
            }
        }

        _ => {}
    }

    None
}

fn collect_recipe_steps(value: &Value, output: &mut Vec<String>) {
    match value {
        Value::String(text) => {
            for line in text.lines() {
                let cleaned = clean_text(line);

                let cleaned = cleaned
                    .trim_start_matches(|c: char| {
                        c.is_ascii_digit()
                            || c == '.'
                            || c == '-'
                            || c == '•'
                            || c == ')'
                    })
                    .trim()
                    .to_string();

                if cleaned.len() > 2 {
                    output.push(cleaned);
                }
            }
        }

        Value::Array(items) => {
            for item in items {
                collect_recipe_steps(item, output);
            }
        }

        Value::Object(object) => {
            if let Some(text) = object.get("text") {
                collect_recipe_steps(text, output);
            }

            if let Some(name) = object.get("name") {
                if object.get("text").is_none() {
                    collect_recipe_steps(name, output);
                }
            }

            for key in [
                "itemListElement",
                "steps",
                "recipeInstructions",
            ] {
                if let Some(nested) = object.get(key) {
                    collect_recipe_steps(nested, output);
                }
            }
        }

        _ => {}
    }
}

fn parse_minutes(value: &str) -> String {
    if !value.starts_with("PT") {
        return value.to_string();
    }

    let value = value.trim_start_matches("PT");

    let mut hours = 0_u64;
    let mut minutes = 0_u64;
    let mut number = String::new();

    for character in value.chars() {
        if character.is_ascii_digit() {
            number.push(character);
            continue;
        }

        let parsed = number.parse::<u64>().unwrap_or(0);
        number.clear();

        match character {
            'H' => hours = parsed,
            'M' => minutes = parsed,
            _ => {}
        }
    }

    if hours > 0 && minutes > 0 {
        format!("{} h {} min", hours, minutes)
    } else if hours > 0 {
        format!("{} h", hours)
    } else if minutes > 0 {
        format!("{} min", minutes)
    } else {
        "Non précisé".to_string()
    }
}

// ============================================================
// MARMITON - EXTRACTION DES VIDÉOS
// ============================================================

fn find_video_urls(value: &Value) -> (String, String) {
    match value {
        Value::Object(object) => {
            let is_video = object
                .get("@type")
                .map(|value| {
                    value == "VideoObject"
                        || value
                            .as_array()
                            .map(|items| {
                                items.iter().any(|item| item == "VideoObject")
                            })
                            .unwrap_or(false)
                })
                .unwrap_or(false);

            if is_video {
                let video_url = object
                    .get("contentUrl")
                    .map(json_string)
                    .unwrap_or_default();

                let embed_url = object
                    .get("embedUrl")
                    .map(json_string)
                    .unwrap_or_default();

                return (video_url, embed_url);
            }

            for child in object.values() {
                let result = find_video_urls(child);

                if !result.0.is_empty() || !result.1.is_empty() {
                    return result;
                }
            }
        }

        Value::Array(items) => {
            for item in items {
                let result = find_video_urls(item);

                if !result.0.is_empty() || !result.1.is_empty() {
                    return result;
                }
            }
        }

        _ => {}
    }

    (String::new(), String::new())
}

// ============================================================
// MARMITON - DÉTAIL COMPLET D'UNE RECETTE
// ============================================================

fn parse_marmiton_detail(
    html: &str,
    source_url: &str,
) -> Result<MarmitonDetail, String> {
    let document = Html::parse_document(html);

    let script_selector = Selector::parse("script[type='application/ld+json']")
        .map_err(|error| error.to_string())?;

    let mut recipe_data: Option<Value> = None;

    for script in document.select(&script_selector) {
        let text = script.text().collect::<String>();

        if let Ok(value) = serde_json::from_str::<Value>(&text) {
            if let Some(recipe) = find_recipe_json(&value) {
                recipe_data = Some(recipe.clone());
                break;
            }
        }
    }

    let recipe = recipe_data.ok_or_else(|| {
        "Les informations de cette recette ne sont pas disponibles sur Marmiton."
            .to_string()
    })?;

    let title = recipe
        .get("name")
        .map(json_string)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Recette Marmiton".to_string());

    let description = recipe
        .get("description")
        .map(json_string)
        .unwrap_or_default();

    let mut images = recipe
        .get("image")
        .map(json_image_list)
        .unwrap_or_default();

    let image_selector = Selector::parse("article img, main img")
        .map_err(|error| error.to_string())?;

    for image in document.select(&image_selector) {
        for attribute in [
            "data-src",
            "data-lazy-src",
            "data-original",
            "src",
        ] {
            if let Some(value) = image.value().attr(attribute) {
                let value = value.trim();

                if value.starts_with("https://")
                    || value.starts_with("http://")
                    || value.starts_with("//")
                {
                    let url = if value.starts_with("//") {
                        format!("https:{}", value)
                    } else {
                        value.to_string()
                    };

                    images.push(url);
                    break;
                }
            }
        }
    }

    let mut unique_images = HashSet::new();

    images.retain(|image| unique_images.insert(image.clone()));

    let main_image = images.first().cloned().unwrap_or_default();

    let gallery_images = images
        .iter()
        .skip(1)
        .take(12)
        .cloned()
        .collect::<Vec<_>>();

    let ingredients = recipe
        .get("recipeIngredient")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(json_string)
                .filter(|value| !value.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut steps = Vec::new();

    if let Some(instructions) = recipe.get("recipeInstructions") {
        collect_recipe_steps(instructions, &mut steps);
    }

    if steps.is_empty() {
        let fallback_selectors = [
            "[class*='recipe-step']",
            "[class*='preparation'] li",
            "[class*='instruction'] li",
            "[itemprop='recipeInstructions']",
        ];

        for selector_text in fallback_selectors {
            if let Ok(selector) = Selector::parse(selector_text) {
                for element in document.select(&selector) {
                    let text = clean_text(
                        &element.text().collect::<Vec<_>>().join(" "),
                    );

                    if text.len() > 8 {
                        steps.push(text);
                    }
                }
            }

            if !steps.is_empty() {
                break;
            }
        }
    }

    let mut unique_steps = HashSet::new();
    steps.retain(|step| unique_steps.insert(step.clone()));

    let total_time = recipe
        .get("totalTime")
        .map(json_string)
        .map(|value| parse_minutes(&value))
        .unwrap_or_else(|| "Non précisé".to_string());

    let servings = recipe
        .get("recipeYield")
        .map(json_string)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Non précisé".to_string());

    let difficulty = recipe
        .get("difficulty")
        .map(json_string)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Non précisée".to_string());

    let (video_url, video_embed_url) = find_video_urls(&recipe);

    Ok(MarmitonDetail {
        title,
        description,
        image: main_image,
        gallery_images,
        ingredients,
        steps,
        total_time,
        servings,
        difficulty,
        video_url,
        video_embed_url,
        source_url: source_url.to_string(),
    })
}

fn get_marmiton_recipe_blocking(
    url: String,
) -> Result<MarmitonDetail, String> {
    let url = absolute_marmiton_url(&url)
        .ok_or_else(|| "Adresse Marmiton invalide.".to_string())?;

    let html = fetch_marmiton_page(&url)?;

    parse_marmiton_detail(&html, &url)
}

#[tauri::command]
async fn get_marmiton_recipe(
    url: String,
) -> Result<MarmitonDetail, String> {
    tauri::async_runtime::spawn_blocking(move || {
        get_marmiton_recipe_blocking(url)
    })
    .await
    .map_err(|error| {
        format!("Erreur pendant le chargement de la recette : {}", error)
    })?
}

// ============================================================
// THEMEALDB - MODÈLE DE RECETTE
// ============================================================

#[derive(Debug, Serialize)]
struct MealDbRecipe {
    id: String,
    title: String,
    category: String,
    description: String,
    duration: u32,
    servings: String,
    difficulty: String,
    image: String,
    ingredients: Vec<String>,
    steps: Vec<String>,
    source: String,
    video_url: String,
    area: String,
}

// ============================================================
// THEMEALDB - CLIENT HTTP
// ============================================================

fn mealdb_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("ClairOS/1.0")
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(8))
        .pool_idle_timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| {
            format!("Impossible de créer le client TheMealDB : {}", error)
        })
}

// ============================================================
// THEMEALDB - OUTILS DE LECTURE
// ============================================================

fn mealdb_string(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(clean_text)
        .unwrap_or_default()
}

fn mealdb_parse_recipe(meal: &Value) -> Option<MealDbRecipe> {
    let id = mealdb_string(meal, "idMeal");
    let title = mealdb_string(meal, "strMeal");

    if id.is_empty() || title.is_empty() {
        return None;
    }

    let category = mealdb_string(meal, "strCategory");
    let area = mealdb_string(meal, "strArea");

    let description = match (category.is_empty(), area.is_empty()) {
        (false, false) => format!("{} • Cuisine {}", category, area),
        (false, true) => category.clone(),
        (true, false) => format!("Cuisine {}", area),
        (true, true) => "Recette internationale".to_string(),
    };

    let image = mealdb_string(meal, "strMealThumb");

    let mut ingredients = Vec::new();

    for index in 1..=20 {
        let ingredient_key = format!("strIngredient{}", index);
        let measure_key = format!("strMeasure{}", index);

        let ingredient = mealdb_string(meal, &ingredient_key);
        let measure = mealdb_string(meal, &measure_key);

        if ingredient.is_empty() {
            continue;
        }

        let line = if measure.is_empty() {
            ingredient
        } else {
            format!("{} — {}", measure, ingredient)
        };

        ingredients.push(line);
    }

    let instructions = mealdb_string(meal, "strInstructions");

    let normalized = instructions
        .replace("\r\n", "\n")
        .replace('\r', "\n");

    let mut steps = Vec::new();

    for line in normalized.lines() {
        let line = clean_text(line);

        if line.len() > 2 {
            steps.push(line);
        }
    }

    let source = mealdb_string(meal, "strSource");

    let source = if source.starts_with("https://") {
        source
    } else {
        format!("https://www.themealdb.com/meal/{}", id)
    };

    Some(MealDbRecipe {
        id,
        title,
        category,
        description,
        duration: 0,
        servings: "Non précisé".to_string(),
        difficulty: "Non précisée".to_string(),
        image,
        ingredients,
        steps,
        source,
        video_url: mealdb_string(meal, "strYoutube"),
        area,
    })
}

// ============================================================
// THEMEALDB - RECHERCHE DE RECETTES
// ============================================================

fn search_themealdb_blocking(
    query: String,
) -> Result<Vec<MealDbRecipe>, String> {
    let query = query.trim().to_string();

    if query.len() < 2 {
        return Ok(Vec::new());
    }

    let client = mealdb_client()?;

    let response = client
        .get("https://www.themealdb.com/api/json/v1/1/search.php")
        .query(&[("s", query.as_str())])
        .send()
        .map_err(|error| {
            format!("Impossible de contacter TheMealDB : {}", error)
        })?;

    if !response.status().is_success() {
        return Err(format!(
            "TheMealDB a répondu avec le statut HTTP {}",
            response.status()
        ));
    }

    let response_text = response
        .text()
        .map_err(|error| {
            format!("Impossible de lire la réponse TheMealDB : {}", error)
        })?;

    let data: Value = serde_json::from_str(&response_text)
        .map_err(|error| {
            format!("Réponse TheMealDB invalide : {}", error)
        })?;

    let mut recipes = Vec::new();

    if let Some(meals) = data.get("meals").and_then(Value::as_array) {
        for meal in meals {
            if let Some(recipe) = mealdb_parse_recipe(meal) {
                recipes.push(recipe);
            }
        }
    }

    Ok(recipes)
}

#[tauri::command]
async fn search_themealdb_recipes(
    query: String,
) -> Result<Vec<MealDbRecipe>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        search_themealdb_blocking(query)
    })
    .await
    .map_err(|error| {
        format!("Erreur pendant la recherche TheMealDB : {}", error)
    })?
}

// ============================================================
// CLAIROS - OUVERTURE D'UN LIEN INTERNET
// ============================================================

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let url = url.trim();

    if !url.starts_with("https://") {
        return Err("Seules les adresses HTTPS sont autorisées.".to_string());
    }

    Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map_err(|error| {
            format!("Impossible d'ouvrir le navigateur : {}", error)
        })?;

    Ok(())
}

// ============================================================
// CLAIROS - ACTUALITÉS FRANCE ET PORTUGAL
// ============================================================

#[derive(Debug, Serialize)]
struct NewsArticle {
    title: String,
    link: String,
    description: String,
    published: String,
    image: String,
    source: String,
}

#[derive(Debug, Deserialize)]
struct RssFeed {
    channel: RssChannel,
}

#[derive(Debug, Deserialize)]
struct RssChannel {
    #[serde(default)]
    item: Vec<RssItem>,
}

#[derive(Debug, Deserialize)]
struct RssItem {
    title: Option<String>,
    link: Option<String>,
    description: Option<String>,

    #[serde(rename = "pubDate")]
    pub_date: Option<String>,

    enclosure: Option<RssEnclosure>,
}

#[derive(Debug, Deserialize)]
struct RssEnclosure {
    #[serde(rename = "@url")]
    url: Option<String>,
}

fn news_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("ClairOS/1.0 (Actualites)")
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(8))
        .pool_idle_timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|error| {
            format!("Impossible de créer le client actualités : {}", error)
        })
}

fn news_clean_html(value: &str) -> (String, String) {
    let document = Html::parse_fragment(value);

    let image_selector = Selector::parse("img").ok();

    let image = image_selector
        .and_then(|selector| {
            document.select(&selector).find_map(|element| {
                element
                    .value()
                    .attr("src")
                    .or_else(|| element.value().attr("data-src"))
                    .map(str::to_string)
            })
        })
        .unwrap_or_default();

    let text = document
        .root_element()
        .text()
        .collect::<Vec<_>>()
        .join(" ");

    (clean_text(&text), image)
}

fn valid_news_link(country: &str, link: &str) -> bool {
    if !link.starts_with("https://") {
        return false;
    }

    let host = link
        .trim_start_matches("https://")
        .split('/')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .to_lowercase();

    match country {
        "fr" => matches!(host.as_str(),
            "franceinfo.fr" | "www.franceinfo.fr" | "rfi.fr" | "www.rfi.fr"
                | "france24.com" | "www.france24.com"
                | "lemonde.fr" | "www.lemonde.fr"
        ),
        "pt" => matches!(host.as_str(),
            "rtp.pt" | "www.rtp.pt" | "observador.pt" | "www.observador.pt"
        ),
        _ => false,
    }
}

fn fetch_news_feed(
    client: &reqwest::blocking::Client,
    country: &str,
    feed_url: &str,
    source: &str,
) -> Result<Vec<NewsArticle>, String> {
    let response = client
        .get(feed_url)
        .header(
            reqwest::header::ACCEPT,
            "application/rss+xml, application/xml, text/xml, */*",
        )
        .send()
        .map_err(|error| format!("{} : {}", source, error))?;

    if !response.status().is_success() {
        return Err(format!("{} : HTTP {}", source, response.status()));
    }

    let xml = response.text()
        .map_err(|error| format!("{} : lecture impossible ({})", source, error))?;
    let feed: RssFeed = quick_xml::de::from_str(&xml)
        .map_err(|error| format!("{} : RSS invalide ({})", source, error))?;

    let mut articles = Vec::new();
    for item in feed.channel.item {
        let title_raw = item.title.unwrap_or_default();
        let link = item.link.unwrap_or_default();

        if title_raw.trim().is_empty() || !valid_news_link(country, &link) {
            continue;
        }

        let (description, description_image) =
            news_clean_html(item.description.as_deref().unwrap_or(""));
        let image = item
            .enclosure
            .and_then(|enclosure| enclosure.url)
            .filter(|url| url.starts_with("https://") || url.starts_with("http://"))
            .unwrap_or(description_image);

        articles.push(NewsArticle {
            title: news_clean_html(&title_raw).0,
            link,
            description,
            published: item.pub_date.unwrap_or_default(),
            image,
            source: source.to_string(),
        });
    }
    Ok(articles)
}

fn fetch_news_blocking(country: String) -> Result<Vec<NewsArticle>, String> {
    let feeds: Vec<(&str, &str)> = match country.as_str() {
        "fr" => vec![
            ("https://www.franceinfo.fr/titres.rss", "Franceinfo"),
            ("https://www.rfi.fr/fr/rss", "RFI"),
            ("https://www.france24.com/fr/rss", "France 24"),
            ("https://www.lemonde.fr/rss/une.xml", "Le Monde"),
        ],
        "pt" => vec![
            ("https://www.rtp.pt/noticias/rss", "RTP Notícias"),
            ("https://www.rtp.pt/noticias/rss/pais", "RTP País"),
            ("https://www.rtp.pt/noticias/rss/mundo", "RTP Mundo"),
            ("https://www.rtp.pt/noticias/rss/economia", "RTP Economia"),
            ("https://observador.pt/feed/", "Observador"),
        ],
        _ => return Err("Pays non pris en charge.".to_string()),
    };

    let client = news_client()?;
    let country_ref = country.as_str();
    let mut failures = Vec::new();
    let mut articles = Vec::new();
    let mut seen = HashSet::new();

    // Les sources sont interrogées en parallèle : le délai total est celui
    // de la source la plus lente, et non la somme des délais de chaque flux.
    thread::scope(|scope| {
        let handles: Vec<_> = feeds
            .iter()
            .map(|(feed_url, source)| {
                let client = client.clone();
                let feed_url = *feed_url;
                let source = *source;
                scope.spawn(move || {
                    fetch_news_feed(&client, country_ref, feed_url, source)
                })
            })
            .collect();

        for handle in handles {
            match handle.join() {
                Ok(Ok(feed_articles)) => {
                    for article in feed_articles {
                        if seen.insert(article.link.clone()) {
                            articles.push(article);
                        }
                    }
                }
                Ok(Err(error)) => failures.push(error),
                Err(_) => failures.push("Une source d'actualités a interrompu son traitement.".to_string()),
            }
        }
    });

    if articles.is_empty() {
        return Err(if failures.is_empty() {
            "Les flux d'actualités n'ont renvoyé aucun article valide.".to_string()
        } else {
            format!("Aucun flux n'a répondu correctement : {}", failures.join(" ; "))
        });
    }

    articles.truncate(60);
    Ok(articles)
}

#[tauri::command]
async fn get_news(country: String) -> Result<Vec<NewsArticle>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        fetch_news_blocking(country)
    })
    .await
    .map_err(|error| {
        format!("Erreur pendant le chargement des actualités : {}", error)
    })?
}


#[derive(Debug, Serialize)]
struct NewsArticleDetail {
    title: String,
    link: String,
    description: String,
    published: String,
    image: String,
    source: String,
    paragraphs: Vec<String>,
}

fn meta_content(document: &Html, selector_text: &str) -> String {
    Selector::parse(selector_text)
        .ok()
        .and_then(|selector| document.select(&selector).next())
        .and_then(|element| element.value().attr("content"))
        .unwrap_or("")
        .trim()
        .to_string()
}

fn fetch_news_article_blocking(
    country: String,
    url: String,
) -> Result<NewsArticleDetail, String> {
    if !valid_news_link(&country, &url) {
        return Err("Adresse d'article non autorisée pour cette rubrique.".to_string());
    }

    let source = match country.as_str() {
        "fr" if url.contains("rfi.fr") => "RFI",
        "fr" if url.contains("france24.com") => "France 24",
        "fr" if url.contains("lemonde.fr") => "Le Monde",
        "fr" => "Franceinfo",
        "pt" if url.contains("observador.pt") => "Observador",
        "pt" => "RTP Notícias",
        _ => return Err("Pays non pris en charge.".to_string()),
    };

    let client = news_client()?;
    let response = client
        .get(&url)
        .header(
            reqwest::header::ACCEPT,
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .send()
        .map_err(|error| format!("Impossible de récupérer l'article : {}", error))?;

    if !response.status().is_success() {
        return Err(format!(
            "{} a répondu avec le statut HTTP {}.",
            source,
            response.status()
        ));
    }

    // Refuse les redirections qui sortiraient du domaine média attendu.
    let final_url = response.url().as_str().to_string();
    if !valid_news_link(&country, &final_url) {
        return Err("La page a redirigé vers une adresse externe non autorisée.".to_string());
    }

    let html = response
        .text()
        .map_err(|error| format!("Impossible de lire la page : {}", error))?;
    let document = Html::parse_document(&html);

    let title = {
        let og = meta_content(&document, "meta[property='og:title']");
        if !og.is_empty() {
            news_clean_html(&og).0
        } else {
            Selector::parse("h1")
                .ok()
                .and_then(|selector| document.select(&selector).next())
                .map(|element| clean_text(&element.text().collect::<Vec<_>>().join(" ")))
                .unwrap_or_default()
        }
    };

    let description = {
        let og = meta_content(&document, "meta[property='og:description']");
        if !og.is_empty() {
            news_clean_html(&og).0
        } else {
            meta_content(&document, "meta[name='description']")
        }
    };

    let image = {
        let og = meta_content(&document, "meta[property='og:image']");
        if og.starts_with("https://") || og.starts_with("http://") {
            og
        } else {
            String::new()
        }
    };

    let published = {
        let date = meta_content(&document, "meta[property='article:published_time']");
        if !date.is_empty() {
            date
        } else {
            meta_content(&document, "meta[name='date']")
        }
    };

    let container = Selector::parse("article")
        .ok()
        .and_then(|selector| document.select(&selector).next())
        .or_else(|| {
            Selector::parse("main")
                .ok()
                .and_then(|selector| document.select(&selector).next())
        });

    let paragraph_selector = Selector::parse("p")
        .map_err(|error| format!("Sélecteur de texte invalide : {}", error))?;

    let mut paragraphs = Vec::new();
    let mut seen = HashSet::new();

    if let Some(container) = container {
        for paragraph in container.select(&paragraph_selector) {
            let text = clean_text(&paragraph.text().collect::<Vec<_>>().join(" "));
            if text.chars().count() < 45 || !seen.insert(text.clone()) {
                continue;
            }
            paragraphs.push(text);
            if paragraphs.len() >= 60 {
                break;
            }
        }
    }

    // Certains médias placent le contenu hors d'un élément <article>.
    if paragraphs.is_empty() {
        if let Ok(body_selector) = Selector::parse("body") {
            if let Some(body) = document.select(&body_selector).next() {
                for paragraph in body.select(&paragraph_selector) {
                    let text = clean_text(&paragraph.text().collect::<Vec<_>>().join(" "));
                    if text.chars().count() < 60 || !seen.insert(text.clone()) {
                        continue;
                    }
                    paragraphs.push(text);
                    if paragraphs.len() >= 60 {
                        break;
                    }
                }
            }
        }
    }

    if paragraphs.is_empty() && !description.is_empty() {
        paragraphs.push(description.clone());
    }

    if title.is_empty() && paragraphs.is_empty() {
        return Err(
            "Le média ne fournit pas de contenu lisible pour cet article. Utilisez le bouton de lecture externe."
                .to_string(),
        );
    }

    Ok(NewsArticleDetail {
        title,
        link: final_url,
        description,
        published,
        image,
        source: source.to_string(),
        paragraphs,
    })
}

#[tauri::command]
async fn get_news_article(
    country: String,
    url: String,
) -> Result<NewsArticleDetail, String> {
    tauri::async_runtime::spawn_blocking(move || {
        fetch_news_article_blocking(country, url)
    })
    .await
    .map_err(|error| format!("Erreur pendant le chargement de l'article : {}", error))?
}

// ============================================================
// CLAIROS - PHOTOS : BIBLIOTHÈQUE ET SUPPORTS AMOVIBLES
// ============================================================

#[derive(Debug, Serialize)]
struct PhotoEntry {
    name: String,
    path: String,
    is_directory: bool,
}

#[derive(Debug, Serialize)]
struct StorageDevice {
    name: String,
    path: String,
}

fn images_directory() -> Result<PathBuf, String> {
    let home = std::env::var("HOME")
        .map_err(|_| "Impossible de trouver le dossier personnel.".to_string())?;

    let directory = PathBuf::from(home).join("Images");

    fs::create_dir_all(&directory)
        .map_err(|e| format!("Impossible de créer le dossier Images : {}", e))?;

    directory
        .canonicalize()
        .map_err(|e| format!("Impossible d'accéder au dossier Images : {}", e))
}

fn is_image_file(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase()
            .as_str(),
        "jpg"
            | "jpeg"
            | "png"
            | "webp"
            | "gif"
            | "bmp"
            | "tif"
            | "tiff"
            | "avif"
    )
}

fn is_inside(path: &Path, parent: &Path) -> bool {
    path.starts_with(parent)
}

#[tauri::command]
fn get_photo_entries(folder: Option<String>) -> Result<Vec<PhotoEntry>, String> {
    let root = images_directory()?;

    let directory = match folder {
        Some(path) => {
            let candidate = PathBuf::from(path)
                .canonicalize()
                .map_err(|_| "Ce dossier n'est pas accessible.".to_string())?;

            if !is_inside(&candidate, &root) {
                return Err("Accès à ce dossier refusé.".to_string());
            }

            candidate
        }
        None => root.clone(),
    };

    if !directory.is_dir() {
        return Err("Cet emplacement n'est pas un dossier.".to_string());
    }

    let mut entries = Vec::new();

    for entry in fs::read_dir(&directory)
        .map_err(|e| format!("Impossible de lire le dossier : {}", e))?
    {
        let entry = match entry {
            Ok(value) => value,
            Err(_) => continue,
        };

        let path = entry.path();

        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };

        if file_type.is_symlink() {
            continue;
        }

        let is_directory = file_type.is_dir();

        if !is_directory && !is_image_file(&path) {
            continue;
        }

        entries.push(PhotoEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            is_directory,
        });
    }

    entries.sort_by(|a, b| {
        b.is_directory
            .cmp(&a.is_directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

// ------------------------------------------------------------
// PHOTOS - LECTURE DE L'IMAGE ORIGINALE
// ------------------------------------------------------------

fn read_photo_blocking(path: String) -> Result<String, String> {
    let root = images_directory()?;

    let photo_path = PathBuf::from(path)
        .canonicalize()
        .map_err(|_| "Cette photo n'est pas accessible.".to_string())?;

    if !is_inside(&photo_path, &root) || !photo_path.is_file() {
        return Err("Accès à cette photo refusé.".to_string());
    }

    if !is_image_file(&photo_path) {
        return Err("Ce fichier n'est pas une image reconnue.".to_string());
    }

    let metadata = fs::metadata(&photo_path)
        .map_err(|e| format!("Impossible de lire les informations : {}", e))?;

    if metadata.len() > 25 * 1024 * 1024 {
        return Err("Cette image dépasse la limite de 25 Mo.".to_string());
    }

    let bytes = fs::read(&photo_path)
        .map_err(|e| format!("Impossible de lire cette image : {}", e))?;

    let extension = photo_path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mime = match extension.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "tif" | "tiff" => "image/tiff",
        "avif" => "image/avif",
        _ => return Err("Format d'image non pris en charge.".to_string()),
    };

    use base64::Engine;

    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);

    Ok(format!("data:{};base64,{}", mime, encoded))
}

#[tauri::command]
async fn read_photo(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_photo_blocking(path)
    })
    .await
    .map_err(|error| {
        format!("Erreur pendant la lecture de la photo : {}", error)
    })?
}

// ------------------------------------------------------------
// PHOTOS - GÉNÉRATION DES MINIATURES OPTIMISÉES
// ------------------------------------------------------------

// Chemin du fichier de cache d'une miniature (clé : chemin + taille + date).
fn thumbnail_cache_file(path: &Path, metadata: &fs::Metadata) -> Option<PathBuf> {
    use std::hash::{Hash, Hasher};

    let base = std::env::var_os("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".cache"))
        })?;
    let directory = base.join("clairos").join("thumbs");
    fs::create_dir_all(&directory).ok()?;

    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0);

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut hasher);
    metadata.len().hash(&mut hasher);
    modified.hash(&mut hasher);

    Some(directory.join(format!("{:016x}.jpg", hasher.finish())))
}

fn read_photo_thumbnail_blocking(path: String) -> Result<String, String> {
    let root = images_directory()?;

    let photo_path = PathBuf::from(path)
        .canonicalize()
        .map_err(|_| "Cette photo n'est pas accessible.".to_string())?;

    if !is_inside(&photo_path, &root) || !photo_path.is_file() {
        return Err("Accès à cette photo refusé.".to_string());
    }

    if !is_image_file(&photo_path) {
        return Err("Ce fichier n'est pas une image reconnue.".to_string());
    }

    let metadata = fs::metadata(&photo_path)
        .map_err(|e| format!("Impossible de lire les informations : {}", e))?;

    if metadata.len() > 25 * 1024 * 1024 {
        return Err("Cette image dépasse la limite de 25 Mo.".to_string());
    }

    // Cache disque : une miniature déjà calculée est relue instantanément.
    let cache_file = thumbnail_cache_file(&photo_path, &metadata);
    if let Some(file) = &cache_file {
        if let Ok(cached) = fs::read(file) {
            use base64::Engine;
            return Ok(format!(
                "data:image/jpeg;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(cached)
            ));
        }
    }

    let bytes = fs::read(&photo_path)
        .map_err(|e| format!("Impossible de lire cette image : {}", e))?;

    // Décodage de l'image hors du thread principal.
    let decoded = image::load_from_memory(&bytes)
        .map_err(|error| {
            format!(
                "Impossible de créer la miniature de cette image : {}",
                error
            )
        })?;

    // Réduction de la photo à une taille adaptée à la galerie.
    let thumbnail = decoded.thumbnail(420, 320);

    // Encodage JPEG pour limiter fortement le poids envoyé à React.
    let mut cursor = Cursor::new(Vec::new());

    thumbnail
        .write_to(&mut cursor, image::ImageFormat::Jpeg)
        .map_err(|error| {
            format!("Impossible d'enregistrer la miniature : {}", error)
        })?;

    use base64::Engine;

    let jpeg = cursor.into_inner();
    if let Some(file) = &cache_file {
        let _ = fs::write(file, &jpeg);
    }

    let encoded = base64::engine::general_purpose::STANDARD.encode(jpeg);

    Ok(format!("data:image/jpeg;base64,{}", encoded))
}

#[tauri::command]
async fn read_photo_thumbnail(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_photo_thumbnail_blocking(path)
    })
    .await
    .map_err(|error| {
        format!("Erreur pendant la création de la miniature : {}", error)
    })?
}

// ------------------------------------------------------------
// PHOTOS - DÉTECTION DES SUPPORTS AMOVIBLES
// ------------------------------------------------------------

fn mounted_media_directories() -> Vec<PathBuf> {
    let username = std::env::var("USER").unwrap_or_default();

    let allowed_roots = [
        PathBuf::from(format!("/media/{}", username)),
        PathBuf::from(format!("/run/media/{}", username)),
    ];

    let mounts = fs::read_to_string("/proc/self/mounts").unwrap_or_default();

    let mut devices = Vec::new();

    for line in mounts.lines() {
        let fields: Vec<&str> = line.split_whitespace().collect();

        if fields.len() < 2 {
            continue;
        }

        let mount = fields[1]
            .replace("\\040", " ")
            .replace("\\011", "\t")
            .replace("\\134", "\\");

        let path = PathBuf::from(mount);

        if !allowed_roots.iter().any(|root| path.starts_with(root)) {
            continue;
        }

        if path.is_dir() {
            if let Ok(canonical) = path.canonicalize() {
                if !devices.contains(&canonical) {
                    devices.push(canonical);
                }
            }
        }
    }

    devices
}

#[tauri::command]
fn get_storage_devices() -> Result<Vec<StorageDevice>, String> {
    let mut devices = Vec::new();

    for path in mounted_media_directories() {
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("Support amovible")
            .to_string();

        devices.push(StorageDevice {
            name,
            path: path.to_string_lossy().to_string(),
        });
    }

    Ok(devices)
}

// ------------------------------------------------------------
// PHOTOS - IMPORTATION DEPUIS USB / CARTE SD
// ------------------------------------------------------------

fn collect_images_recursively(
    directory: &Path,
    output: &mut Vec<PathBuf>,
) {
    let entries = match fs::read_dir(directory) {
        Ok(value) => value,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();

        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };

        if file_type.is_symlink() {
            continue;
        }

        if file_type.is_dir() {
            collect_images_recursively(&path, output);
        } else if file_type.is_file() && is_image_file(&path) {
            output.push(path);
        }
    }
}

fn unique_destination(directory: &Path, filename: &str) -> PathBuf {
    let original = Path::new(filename);

    let stem = original
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("photo");

    let extension = original
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("jpg");

    let mut destination = directory.join(filename);
    let mut counter = 1;

    while destination.exists() {
        destination = directory.join(format!(
            "{}_{}.{}",
            stem, counter, extension
        ));

        counter += 1;
    }

    destination
}

fn import_photos_from_device_blocking(
    device_path: String,
) -> Result<usize, String> {
    let device = PathBuf::from(&device_path)
        .canonicalize()
        .map_err(|_| "Le support amovible n'est pas accessible.".to_string())?;

    let mounted_devices = mounted_media_directories();

    if !mounted_devices
        .iter()
        .any(|mount| device == *mount || device.starts_with(mount))
    {
        return Err(
            "Ce support n'est pas un périphérique amovible autorisé.".to_string(),
        );
    }

    if !device.is_dir() {
        return Err("Le support sélectionné n'est pas un dossier.".to_string());
    }

    let destination = images_directory()?;

    let mut photos = Vec::new();
    collect_images_recursively(&device, &mut photos);

    let mut imported = 0;

    for photo in photos {
        let filename = match photo.file_name().and_then(|value| value.to_str()) {
            Some(value) => value,
            None => continue,
        };

        let target = unique_destination(&destination, filename);

        if fs::copy(&photo, &target).is_ok() {
            imported += 1;
        }
    }

    Ok(imported)
}

#[tauri::command]
async fn import_photos_from_device(
    device_path: String,
) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        import_photos_from_device_blocking(device_path)
    })
    .await
    .map_err(|error| {
        format!("Erreur pendant l'importation des photos : {}", error)
    })?
}

// ============================================================
// CLAIROS - INITIALISATION TAURI
// ============================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Option réservée à l'installateur : définit le mot de passe admin système.
    if let Some(code) = admin::handle_cli() {
        std::process::exit(code);
    }

    tauri::Builder::default()
        .manage(admin::AdminState::default())
        .manage(terminal::TerminalState::default())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_photo_entries,
            read_photo,
            read_photo_thumbnail,
            get_storage_devices,
            import_photos_from_device,
            get_system_info,
            admin::is_admin_password_configured,
            admin::setup_admin_password,
            admin::admin_login,
            admin::admin_logout,
            admin::admin_change_password,
            admin::admin_list_photos,
            admin::admin_upload_photo,
            admin::admin_delete_photo,
            admin::get_version_info,
            admin::check_for_updates,
            admin::admin_os_upgrade_start,
            admin::admin_os_upgrade_progress,
            terminal::admin_term_open,
            terminal::admin_term_write,
            terminal::admin_term_resize,
            terminal::admin_term_close,
            admin::admin_network_status,
            admin::admin_wifi_scan,
            admin::admin_wifi_connect,
            admin::admin_wifi_disconnect,
            admin::admin_wifi_set_enabled,
            admin::system_power,
            admin::admin_quit_app,
            get_current_location,
            search_marmiton_recipes,
            get_marmiton_recipe,
            search_themealdb_recipes,
            get_news,
            get_news_article,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("Erreur pendant le démarrage de ClairOS");
}
