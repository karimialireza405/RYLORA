//! Backend → frontend event names. Mirrored in `src/services/events.ts`.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub const PLAYER_STATE: &str = "player://state";
pub const PLAYER_PROGRESS: &str = "player://progress";
pub const PLAYER_SPECTRUM: &str = "player://spectrum";
pub const PLAYER_ERROR: &str = "player://error";
pub const LIBRARY_SCAN_PROGRESS: &str = "library://scan-progress";
pub const LIBRARY_SCAN_FINISHED: &str = "library://scan-finished";
pub const LIBRARY_CHANGED: &str = "library://changed";

pub fn emit<T: Serialize + Clone>(app: &AppHandle, event: &str, payload: T) {
    if let Err(e) = app.emit(event, payload) {
        log::warn!("failed to emit {event}: {e}");
    }
}
