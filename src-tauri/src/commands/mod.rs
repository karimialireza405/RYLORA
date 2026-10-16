//! Tauri command handlers. Thin adapters: validate input at the IPC boundary,
//! then delegate to application services or repositories.

pub mod library;
pub mod metadata;
pub mod player;
pub mod playlists;
pub mod settings;
pub mod updates;
pub mod windows;

use crate::application::library::LibraryService;
use crate::application::player::PlayerHandle;
use crate::database::Db;
use crate::domain::models::TrackId;
use crate::error::{AppError, AppResult};

pub struct AppState {
    pub db: Db,
    pub player: PlayerHandle,
    pub library: LibraryService,
}

/// Upper bound on ids accepted in one call; protects against runaway payloads.
const MAX_IDS: usize = 200_000;

pub(crate) fn validate_ids(ids: &[TrackId]) -> AppResult<()> {
    if ids.len() > MAX_IDS {
        return Err(AppError::Invalid(format!("Too many tracks in one request ({}).", ids.len())));
    }
    if ids.iter().any(|&id| id <= 0) {
        return Err(AppError::Invalid("Invalid track id.".into()));
    }
    Ok(())
}
