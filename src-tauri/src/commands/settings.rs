//! User preferences. Only keys listed here can be written from the frontend, and
//! each one corresponds to behaviour that is actually implemented.

use std::collections::HashMap;

use tauri::State;

use super::AppState;
use crate::database::repo;
use crate::error::{AppError, AppResult};

const PREFS_KEY: &str = "preferences";

/// (key, allowed values). An empty slice means "boolean".
const ALLOWED: &[(&str, &[&str])] = &[
    ("motion", &["system", "reduced", "full"]),
    ("ambientBackground", &[]),
    ("visualizer", &[]),
    ("scanOnStartup", &[]),
    ("libraryView", &["list", "grid"]),
    ("albumView", &["list", "grid"]),
    ("coverStyle", &["artwork", "vinyl"]),
    ("albumSort", &["title", "artist", "addedAt"]),
    ("panelVisible", &[]),
];

fn valid_custom(key: &str, value: &str) -> Option<bool> {
    match key {
        "panelWidth" => Some(value.parse::<u32>().is_ok_and(|v| (280..=400).contains(&v))),
        "pinnedAlbums" => Some(
            serde_json::from_str::<Vec<i64>>(value)
                .is_ok_and(|ids| ids.len() <= 100 && ids.iter().all(|id| *id > 0)),
        ),
        "songSort" => Some(value.split_once(':').is_some_and(|(key, dir)| {
            [
                "default",
                "title",
                "artist",
                "album",
                "addedAt",
                "durationMs",
                "playCount",
            ]
            .contains(&key)
                && ["asc", "desc"].contains(&dir)
        })),
        _ => None,
    }
}

#[tauri::command]
pub fn settings_get(state: State<'_, AppState>) -> AppResult<HashMap<String, String>> {
    let raw = repo::get_setting(&state.db.conn(), PREFS_KEY)?;
    Ok(raw
        .and_then(|r| serde_json::from_str(&r).ok())
        .unwrap_or_default())
}

#[tauri::command]
pub fn settings_set(state: State<'_, AppState>, key: String, value: String) -> AppResult<()> {
    let valid = if let Some(valid) = valid_custom(&key, &value) {
        valid
    } else {
        let (_, allowed) = ALLOWED
            .iter()
            .find(|(k, _)| *k == key)
            .ok_or_else(|| AppError::Invalid(format!("Unknown setting \"{key}\".")))?;
        if allowed.is_empty() {
            value == "true" || value == "false"
        } else {
            allowed.contains(&value.as_str())
        }
    };
    if !valid {
        return Err(AppError::Invalid(format!("Invalid value for \"{key}\".")));
    }
    let conn = state.db.conn();
    let mut prefs: HashMap<String, String> = repo::get_setting(&conn, PREFS_KEY)?
        .and_then(|r| serde_json::from_str(&r).ok())
        .unwrap_or_default();
    prefs.insert(key, value);
    let json = serde_json::to_string(&prefs).map_err(|e| AppError::Invalid(e.to_string()))?;
    repo::set_setting(&conn, PREFS_KEY, &json)
}

pub fn scan_on_startup(state: &AppState) -> bool {
    repo::get_setting(&state.db.conn(), PREFS_KEY)
        .ok()
        .flatten()
        .and_then(|r| serde_json::from_str::<HashMap<String, String>>(&r).ok())
        .and_then(|p| p.get("scanOnStartup").cloned())
        .is_none_or(|v| v == "true")
}
