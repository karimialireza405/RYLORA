use tauri::{AppHandle, State};

use super::{validate_ids, AppState};
use crate::database::repo::{self, PlaylistEntry};
use crate::domain::models::{Playlist, PlaylistId, TrackId};
use crate::error::AppResult;
use crate::events;

fn changed(app: &AppHandle) {
    events::emit(app, events::LIBRARY_CHANGED, ());
}

#[tauri::command]
pub fn playlists_list(state: State<'_, AppState>) -> AppResult<Vec<Playlist>> {
    repo::playlists(&state.db.conn())
}

#[tauri::command]
pub fn playlist_create(app: AppHandle, state: State<'_, AppState>, name: String, track_ids: Vec<TrackId>) -> AppResult<PlaylistId> {
    validate_ids(&track_ids)?;
    let id = {
        let mut conn = state.db.conn();
        let id = repo::create_playlist(&conn, &name)?;
        if !track_ids.is_empty() {
            repo::add_to_playlist(&mut conn, id, &track_ids)?;
        }
        id
    };
    changed(&app);
    Ok(id)
}

#[tauri::command]
pub fn playlist_rename(app: AppHandle, state: State<'_, AppState>, id: PlaylistId, name: String) -> AppResult<()> {
    repo::rename_playlist(&state.db.conn(), id, &name)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub fn playlist_delete(app: AppHandle, state: State<'_, AppState>, id: PlaylistId) -> AppResult<()> {
    repo::delete_playlist(&state.db.conn(), id)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub fn playlist_entries(state: State<'_, AppState>, id: PlaylistId) -> AppResult<Vec<PlaylistEntry>> {
    repo::playlist_entries(&state.db.conn(), id)
}

#[tauri::command]
pub fn playlist_add(app: AppHandle, state: State<'_, AppState>, id: PlaylistId, track_ids: Vec<TrackId>) -> AppResult<()> {
    validate_ids(&track_ids)?;
    repo::add_to_playlist(&mut state.db.conn(), id, &track_ids)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub fn playlist_remove(app: AppHandle, state: State<'_, AppState>, id: PlaylistId, entry_ids: Vec<i64>) -> AppResult<()> {
    repo::remove_from_playlist(&mut state.db.conn(), id, &entry_ids)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub fn playlist_move(app: AppHandle, state: State<'_, AppState>, id: PlaylistId, entry_id: i64, to: usize) -> AppResult<()> {
    repo::move_in_playlist(&mut state.db.conn(), id, entry_id, to)?;
    changed(&app);
    Ok(())
}
