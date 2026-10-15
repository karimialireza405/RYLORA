//! Updates: check for a newer signed release, download it and install it.
//!
//! Nothing is checked unless the user asks (Settings) or turned on automatic checks.
//! Every download is verified against the public key built into the app before it is
//! run, so a tampered or substituted installer is refused.
//!
//! The update address is set when RYLORA is built (`RYLORA_UPDATE_ENDPOINT`); builds
//! without one say so instead of pretending to check.

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

use super::AppState;
use crate::error::{AppError, AppResult};
use crate::events;

/// Where this build looks for `latest.json`, if anywhere.
pub const UPDATE_ENDPOINT: Option<&str> = option_env!("RYLORA_UPDATE_ENDPOINT");

/// The update found by the last check, kept for installing.
#[derive(Default)]
pub struct PendingUpdate(pub Mutex<Option<Update>>);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    /// Whether this build knows where to look for updates.
    pub configured: bool,
    pub current_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
    /// RFC 3339, when the release states it.
    pub date: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
}

fn updater(app: &AppHandle) -> AppResult<tauri_plugin_updater::Updater> {
    let endpoint = UPDATE_ENDPOINT.ok_or_else(|| AppError::Unavailable("This build of RYLORA has no update address.".into()))?;
    let url = endpoint.parse().map_err(|e| AppError::Invalid(format!("Invalid update address: {e}")))?;
    let handle = app.clone();
    app.updater_builder()
        .endpoints(vec![url])
        .map_err(|e| AppError::Invalid(e.to_string()))?
        .timeout(std::time::Duration::from_secs(30))
        .on_before_exit(move || {
            // The installer closes RYLORA: save the session first, as a normal exit would.
            if let Some(state) = handle.try_state::<AppState>() {
                state.library.cancel_scan();
                state.player.shutdown();
            }
            handle.cleanup_before_exit();
        })
        .build()
        .map_err(|e| AppError::Unavailable(e.to_string()))
}

#[tauri::command]
pub fn updates_status(app: AppHandle) -> UpdateStatus {
    UpdateStatus { configured: UPDATE_ENDPOINT.is_some(), current_version: app.package_info().version.to_string() }
}

#[tauri::command]
pub async fn updates_check(app: AppHandle, pending: State<'_, PendingUpdate>) -> AppResult<Option<UpdateInfo>> {
    let update = updater(&app)?.check().await.map_err(|e| AppError::Unavailable(format!("Couldn't check for updates: {e}")))?;
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        notes: u.body.clone().filter(|b| !b.trim().is_empty()),
        date: u.date.and_then(|d| d.format(&time::format_description::well_known::Rfc3339).ok()),
    });
    log::info!("update check: {}", info.as_ref().map_or("up to date".to_string(), |i| format!("{} available", i.version)));
    *pending.0.lock() = update;
    Ok(info)
}

/// Download the update found by the last check, verify it and run its installer.
/// RYLORA closes while the installer runs and starts again afterwards.
#[tauri::command]
pub async fn updates_install(app: AppHandle, pending: State<'_, PendingUpdate>) -> AppResult<()> {
    let update = pending.0.lock().take().ok_or_else(|| AppError::Invalid("Check for updates first.".into()))?;
    let bytes = download(&app, &update).await?;
    update.install(bytes).map_err(|e| AppError::Unavailable(format!("Couldn't install the update: {e}")))?;
    app.restart();
}

/// Download and verify the signature (the plugin rejects anything not signed with
/// the key built into this app).
async fn download(app: &AppHandle, update: &Update) -> AppResult<Vec<u8>> {
    let mut downloaded = 0u64;
    let mut last_emit = 0u64;
    let handle = app.clone();
    let bytes = update
        .download(
            |chunk, total| {
                downloaded += chunk as u64;
                if downloaded - last_emit >= 256 * 1024 || total == Some(downloaded) {
                    last_emit = downloaded;
                    events::emit(&handle, events::UPDATES_PROGRESS, UpdateProgress { downloaded, total });
                }
            },
            || {},
        )
        .await
        .map_err(|e| AppError::Unavailable(format!("Couldn't download the update: {e}")))?;
    // `download` verifies the signature; check again explicitly so this never depends on it.
    update.verify(&bytes).map_err(|e| AppError::Invalid(format!("The update failed verification: {e}")))?;
    Ok(bytes)
}

/// Download and verify without installing (diagnostics and the end-to-end check).
#[tauri::command]
pub async fn updates_verify_download(app: AppHandle, pending: State<'_, PendingUpdate>) -> AppResult<u64> {
    let update = pending.0.lock().clone().ok_or_else(|| AppError::Invalid("Check for updates first.".into()))?;
    Ok(download(&app, &update).await?.len() as u64)
}
