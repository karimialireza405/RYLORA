use serde::Serialize;
use tauri::State;

use super::{validate_ids, AppState};
use crate::application::library::ImportResult;
use crate::database::repo::{self, HistoryEntry, LibraryFolder};
use crate::domain::models::{Album, Artist, Track, TrackId};
use crate::error::{AppError, AppResult};
use crate::metadata::lyrics::{self, Lyrics};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshot {
    pub tracks: Vec<Track>,
    pub albums: Vec<Album>,
    pub artists: Vec<Artist>,
    pub play_counts: std::collections::HashMap<TrackId, u32>,
    pub scanning: bool,
}

#[tauri::command]
pub fn library_snapshot(state: State<'_, AppState>) -> AppResult<LibrarySnapshot> {
    let conn = state.db.conn();
    Ok(LibrarySnapshot {
        tracks: repo::all_tracks(&conn)?,
        albums: repo::albums(&conn)?,
        artists: repo::artists(&conn)?,
        play_counts: repo::play_counts(&conn)?,
        scanning: state.library.is_scanning(),
    })
}

#[tauri::command]
pub fn library_folders(state: State<'_, AppState>) -> AppResult<Vec<LibraryFolder>> {
    repo::list_folders(&state.db.conn())
}

#[tauri::command]
pub fn library_add_folder(state: State<'_, AppState>, path: String) -> AppResult<()> {
    if path.trim().is_empty() {
        return Err(AppError::Invalid("No folder selected.".into()));
    }
    state.library.add_folder(&path)
}

#[tauri::command]
pub fn library_remove_folder(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    state.library.remove_folder(id)
}

#[tauri::command]
pub fn library_rescan(state: State<'_, AppState>) {
    state.library.scan();
}

#[tauri::command]
pub fn library_cancel_scan(state: State<'_, AppState>) {
    state.library.cancel_scan();
}

#[tauri::command]
pub async fn library_import_files(state: State<'_, AppState>, paths: Vec<String>) -> AppResult<ImportResult> {
    if paths.len() > 5_000 {
        return Err(AppError::Invalid("Too many files at once; add their folder to the library instead.".into()));
    }
    let library = state.library.clone();
    tauri::async_runtime::spawn_blocking(move || library.import_files(&paths))
        .await
        .map_err(|e| AppError::Unavailable(e.to_string()))?
}

#[tauri::command]
pub fn library_set_favorite(state: State<'_, AppState>, track_ids: Vec<TrackId>, favorite: bool) -> AppResult<()> {
    validate_ids(&track_ids)?;
    {
        let conn = state.db.conn();
        for id in &track_ids {
            repo::set_favorite(&conn, *id, favorite)?;
        }
    }
    state.library.notify_changed();
    Ok(())
}

#[tauri::command]
pub fn library_recent_plays(state: State<'_, AppState>, limit: u32) -> AppResult<Vec<HistoryEntry>> {
    repo::recent_plays(&state.db.conn(), limit.min(500))
}

#[tauri::command]
pub async fn track_lyrics(state: State<'_, AppState>, track_id: TrackId) -> AppResult<Option<Lyrics>> {
    let track = repo::track_by_id(&state.db.conn(), track_id)?.ok_or_else(|| AppError::NotFound("Track not found.".into()))?;
    tauri::async_runtime::spawn_blocking(move || lyrics::read(std::path::Path::new(&track.path)))
        .await
        .map_err(|e| AppError::Unavailable(e.to_string()))
}
