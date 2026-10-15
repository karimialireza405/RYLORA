use super::AppState;
use crate::database::repo::{self, MetadataEdit};
use crate::error::{AppError, AppResult};
use serde::Deserialize;
use tauri::State;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditRequest {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub artwork_path: Option<String>,
    pub write_to_file: bool,
}

fn text(value: String, label: &str) -> AppResult<String> {
    let value = value.trim().to_string();
    if value.is_empty() || value.len() > 2048 || value.contains('\0') {
        return Err(AppError::Invalid(format!(
            "{label} must be between 1 and 2048 characters."
        )));
    }
    Ok(value)
}

#[tauri::command]
pub async fn library_edit_track(
    state: State<'_, AppState>,
    track_id: i64,
    request: EditRequest,
) -> AppResult<()> {
    let db = state.db.clone();
    let library = state.library.clone();
    if library.is_scanning() {
        return Err(AppError::Unavailable(
            "Wait for the library scan to finish before editing.".into(),
        ));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let track = repo::track_by_id(&db.conn(), track_id)?
            .ok_or_else(|| AppError::NotFound("Song no longer in library.".into()))?;
        if request.year.is_some_and(|year| year == 0 || year > 9999) {
            return Err(AppError::Invalid("Enter a year between 1 and 9999.".into()));
        }
        let genre = request
            .genre
            .map(|g| g.trim().to_string())
            .filter(|g| !g.is_empty());
        if genre
            .as_ref()
            .is_some_and(|g| g.len() > 2048 || g.contains('\0'))
        {
            return Err(AppError::Invalid("Genre is too long.".into()));
        }
        let mut edit = MetadataEdit {
            title: text(request.title, "Title")?,
            artist: text(request.artist, "Artist")?,
            album: text(request.album, "Album")?,
            album_artist: text(request.album_artist, "Album artist")?,
            year: request.year,
            genre,
            artwork: track.artwork.clone(),
        };
        let mut picture = None;
        if let Some(path) = request.artwork_path {
            let meta = std::fs::metadata(&path)?;
            if !meta.is_file() || meta.len() > 20 * 1024 * 1024 {
                return Err(AppError::Invalid(
                    "Choose a cover image smaller than 20 MB.".into(),
                ));
            }
            let bytes = std::fs::read(path)?;
            let hash = crate::metadata::artwork::hash_bytes(&bytes);
            let art = crate::metadata::artwork::process(&bytes, &hash, library.artwork_dir())
                .map_err(AppError::Invalid)?;
            repo::upsert_artwork(&db.conn(), &hash, art.accent.as_deref())?;
            edit.artwork = Some(hash);
            picture = Some(bytes);
        }
        if request.write_to_file {
            crate::metadata::write::write_tags(
                std::path::Path::new(&track.path),
                &edit,
                picture.as_deref(),
            )
            .map_err(AppError::Invalid)?;
        }
        repo::save_metadata_edit(&mut db.conn(), track_id, &edit)?;
        library.notify_changed();
        Ok(())
    })
    .await
    .map_err(|e| AppError::Unavailable(e.to_string()))?
}
