//! Incremental folder scanner. Runs on a background thread with its own database
//! connection; unchanged files (same size + mtime) are skipped without re-reading tags.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Instant, UNIX_EPOCH};

use rusqlite::Connection;
use serde::Serialize;
use walkdir::WalkDir;

use super::{is_supported, paths};
use crate::database::repo::{self, LibraryFolder, TrackRecord};
use crate::domain::models::TrackId;
use crate::error::AppResult;
use crate::metadata::{self, artwork};

const BATCH_SIZE: usize = 100;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub phase: ScanPhase,
    pub processed: usize,
    pub total: usize,
    pub current: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ScanPhase {
    Discovering,
    Indexing,
    Finishing,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSummary {
    pub discovered: usize,
    pub added_or_updated: usize,
    pub unchanged: usize,
    pub missing: usize,
    pub failed: Vec<String>,
    pub unavailable_folders: Vec<String>,
    pub cancelled: bool,
    pub elapsed_ms: u64,
}

pub struct FileInfo {
    path: PathBuf,
    key: String,
    size: i64,
    mtime: i64,
}

pub fn file_info(path: PathBuf) -> Option<FileInfo> {
    let meta = std::fs::metadata(&path).ok()?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    Some(FileInfo { key: paths::key(&path), path: paths::simplify(&path), size: meta.len() as i64, mtime })
}

fn discover(root: &Path, cancel: &AtomicBool) -> Vec<FileInfo> {
    WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .take_while(|_| !cancel.load(Ordering::Relaxed))
        .filter(|e| e.file_type().is_file() && is_supported(e.path()))
        .filter_map(|e| file_info(e.into_path()))
        .collect()
}

/// Read tags and artwork for one file and write it to the database.
pub fn index_file(conn: &Connection, folder_id: Option<i64>, file: &FileInfo, artwork_dir: &Path) -> Result<TrackId, String> {
    let tags = metadata::read_tags(&file.path)?;

    let sidecar = if tags.picture.is_none() { metadata::sidecar_picture(&file.path) } else { None };
    let artwork_hash = match tags.picture.as_ref().or(sidecar.as_ref()) {
        Some(bytes) => {
            let hash = artwork::hash_bytes(bytes);
            let cached = repo::artwork_known(conn, &hash).map_err(|e| e.to_string())?
                && artwork::artwork_path(artwork_dir, &hash, artwork::ArtworkSize::Small).exists();
            if cached {
                Some(hash)
            } else {
                match artwork::process(bytes, &hash, artwork_dir) {
                    Ok(processed) => {
                        repo::upsert_artwork(conn, &processed.hash, processed.accent.as_deref())
                            .map_err(|e| e.to_string())?;
                        Some(processed.hash)
                    }
                    Err(e) => {
                        log::warn!("unreadable artwork in {}: {e}", file.path.display());
                        None
                    }
                }
            }
        }
        None => None,
    };

    let err = |e: crate::error::AppError| e.to_string();
    let artist_id = repo::upsert_artist(conn, &tags.artist).map_err(err)?;
    let album_artist_id = if repo::name_key(&tags.album_artist) == repo::name_key(&tags.artist) {
        artist_id
    } else {
        repo::upsert_artist(conn, &tags.album_artist).map_err(err)?
    };
    let album_id =
        repo::upsert_album(conn, &tags.album, album_artist_id, tags.year, artwork_hash.as_deref()).map_err(err)?;
    let format = file.path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();

    repo::upsert_track(
        conn,
        &TrackRecord {
            path: file.path.to_string_lossy().into_owned(),
            path_key: file.key.clone(),
            folder_id,
            title: tags.title,
            artist_id,
            album_id,
            album_artist: tags.album_artist,
            track_number: tags.track_number,
            disc_number: tags.disc_number,
            year: tags.year,
            genre: tags.genre,
            duration_ms: tags.duration_ms,
            format,
            file_size: file.size,
            file_mtime: file.mtime,
            artwork: artwork_hash,
        },
    )
    .map_err(err)
}

pub fn scan(
    conn: &mut Connection,
    folders: &[LibraryFolder],
    artwork_dir: &Path,
    cancel: &AtomicBool,
    mut progress: impl FnMut(ScanProgress),
) -> AppResult<ScanSummary> {
    let started = Instant::now();
    let mut summary = ScanSummary::default();
    std::fs::create_dir_all(artwork_dir)?;

    progress(ScanProgress { phase: ScanPhase::Discovering, processed: 0, total: 0, current: None });

    // Discover everything first so progress has a meaningful total.
    let mut work: Vec<(i64, Vec<FileInfo>)> = Vec::new();
    for folder in folders {
        let root = Path::new(&folder.path);
        if !root.is_dir() {
            summary.unavailable_folders.push(folder.path.clone());
            // Keep the rows (and the user's playlists/favourites) but flag them.
            let ids: Vec<_> = repo::indexed_files(conn, folder.id)?.values().map(|f| f.id).collect();
            repo::set_missing(conn, &ids, true)?;
            summary.missing += ids.len();
            continue;
        }
        work.push((folder.id, discover(root, cancel)));
    }
    let total: usize = work.iter().map(|(_, files)| files.len()).sum();
    summary.discovered = total;

    let mut processed = 0;
    let mut last_emit = Instant::now();
    for (folder_id, files) in work {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        let indexed = repo::indexed_files(conn, folder_id)?;
        let mut seen: HashSet<&str> = HashSet::with_capacity(files.len());
        let mut restored = Vec::new();

        for chunk in files.chunks(BATCH_SIZE) {
            if cancel.load(Ordering::Relaxed) {
                summary.cancelled = true;
                break;
            }
            let tx = conn.transaction()?;
            for file in chunk {
                seen.insert(file.key.as_str());
                processed += 1;
                match indexed.get(&file.key) {
                    Some(prev) if prev.size == file.size && prev.mtime == file.mtime => {
                        if prev.missing {
                            restored.push(prev.id);
                        }
                        summary.unchanged += 1;
                    }
                    _ => match index_file(&tx, Some(folder_id), file, artwork_dir) {
                        Ok(_) => summary.added_or_updated += 1,
                        Err(e) => {
                            log::warn!("skipping {}: {e}", file.path.display());
                            summary.failed.push(file.path.to_string_lossy().into_owned());
                        }
                    },
                }
                if last_emit.elapsed().as_millis() >= 100 {
                    last_emit = Instant::now();
                    progress(ScanProgress {
                        phase: ScanPhase::Indexing,
                        processed,
                        total,
                        current: file.path.file_name().map(|n| n.to_string_lossy().into_owned()),
                    });
                }
            }
            tx.commit()?;
        }

        if summary.cancelled {
            break;
        }
        repo::set_missing(conn, &restored, false)?;
        let gone: Vec<_> = indexed
            .iter()
            .filter(|(key, f)| !f.missing && !seen.contains(key.as_str()))
            .map(|(_, f)| f.id)
            .collect();
        summary.missing += gone.len();
        repo::set_missing(conn, &gone, true)?;
    }

    progress(ScanProgress { phase: ScanPhase::Finishing, processed, total, current: None });
    repo::cleanup_orphans(conn)?;
    summary.cancelled |= cancel.load(Ordering::Relaxed);
    summary.elapsed_ms = started.elapsed().as_millis() as u64;
    Ok(summary)
}
