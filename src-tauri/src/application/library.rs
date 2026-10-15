//! Library coordination: folder management and background scans.

use std::path::PathBuf;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::AppHandle;
use parking_lot::Mutex;

use super::player::{PlayerCommand, PlayerHandle};
use crate::database::{repo, Db};
use crate::error::{AppError, AppResult};
use crate::events;
use crate::domain::models::TrackId;
use crate::library::{is_supported, paths, scanner};
use crate::metadata::clean;

/// Records which tag-cleaning rules the stored library values were produced with.
const TAG_CLEANING_APPLIED: &str = "tag_cleaning_applied";

/// Whether tags are cleaned, and the marker stored once a full pass has applied that choice.
fn tag_cleaning(conn: &rusqlite::Connection) -> AppResult<(bool, String)> {
    let enabled = repo::preference(conn, "cleanTags")?.is_none_or(|v| v == "true");
    Ok((enabled, format!("{}:{enabled}", clean::VERSION)))
}

#[derive(Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub track_ids: Vec<TrackId>,
    pub rejected: Vec<String>,
}

#[derive(Clone)]
pub struct LibraryService {
    app: AppHandle,
    db: Db,
    player: PlayerHandle,
    artwork_dir: PathBuf,
    scanning: Arc<AtomicBool>,
    cancel: Arc<AtomicBool>,
    rescan_requested: Arc<AtomicBool>,
    scan_gate: Arc<Mutex<()>>,
}

impl LibraryService {
    pub fn new(app: AppHandle, db: Db, player: PlayerHandle, artwork_dir: PathBuf) -> Self {
        Self {
            app,
            db,
            player,
            artwork_dir,
            scanning: Arc::new(AtomicBool::new(false)),
            cancel: Arc::new(AtomicBool::new(false)),
            rescan_requested: Arc::new(AtomicBool::new(false)),
            scan_gate: Arc::new(Mutex::new(())),
        }
    }

    pub fn artwork_dir(&self) -> &PathBuf {
        &self.artwork_dir
    }

    /// True when stored titles were produced by other cleanup rules or setting than the
    /// current ones, so the next scan must re-read every file.
    pub fn tags_outdated(&self) -> bool {
        let conn = self.db.conn();
        tag_cleaning(&conn)
            .and_then(|(_, wanted)| Ok(repo::get_setting(&conn, TAG_CLEANING_APPLIED)?.as_deref() != Some(wanted.as_str())))
            .unwrap_or(false)
    }

    pub fn is_scanning(&self) -> bool {
        self.scanning.load(Ordering::SeqCst)
    }

    pub fn add_folder(&self, path: &str) -> AppResult<()> {
        let raw = PathBuf::from(path);
        if !raw.is_dir() {
            return Err(AppError::Invalid("That folder doesn't exist or can't be opened.".into()));
        }
        let canonical = paths::canonical(&raw);
        repo::add_folder(&self.db.conn(), &canonical.to_string_lossy(), &paths::key(&canonical))?;
        self.scan();
        Ok(())
    }

    pub fn remove_folder(&self, id: i64) -> AppResult<()> {
        if self.is_scanning() {
            return Err(AppError::Unavailable("Wait for the current scan to finish before removing a folder.".into()));
        }
        repo::remove_folder(&mut self.db.conn(), id)?;
        self.notify_changed();
        Ok(())
    }

    /// Index individually opened files (outside any library folder) and return their ids
    /// in the order given. Unsupported or unreadable files are reported, not fatal.
    pub fn import_files(&self, paths: &[String]) -> AppResult<ImportResult> {
        let mut conn = self.db.open_secondary()?;
        let (clean_tags, _) = tag_cleaning(&conn)?;
        let tx = conn.transaction()?;
        let mut result = ImportResult::default();
        let mut seen = HashSet::new();
        for raw in paths {
            let path = paths::canonical(&PathBuf::from(raw));
            if !seen.insert(paths::key(&path)) {
                continue;
            }
            let file = (path.is_file() && is_supported(&path)).then(|| scanner::file_info(path)).flatten();
            let Some(file) = file else {
                result.rejected.push(raw.clone());
                continue;
            };
            match scanner::index_file(&tx, None, &file, &self.artwork_dir, clean_tags) {
                Ok(id) => result.track_ids.push(id),
                Err(e) => {
                    log::warn!("could not import {raw}: {e}");
                    result.rejected.push(raw.clone());
                }
            }
        }
        tx.commit()?;
        if !result.track_ids.is_empty() {
            self.notify_changed();
        }
        Ok(result)
    }

    pub fn cancel_scan(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    /// Start a background scan. If one is already running, another pass is queued
    /// so folders added mid-scan are always picked up.
    pub fn scan(&self) {
        let _gate = self.scan_gate.lock();
        if self.scanning.swap(true, Ordering::SeqCst) {
            self.rescan_requested.store(true, Ordering::SeqCst);
            return;
        }
        self.cancel.store(false, Ordering::SeqCst);
        let this = self.clone();
        std::thread::Builder::new()
            .name("rylora-scanner".into())
            .spawn(move || {
                loop {
                    {
                        let _gate = this.scan_gate.lock();
                        this.rescan_requested.store(false, Ordering::SeqCst);
                    }
                    let summary = this.run_scan();
                    let _gate = this.scan_gate.lock();
                    let finished = !this.rescan_requested.load(Ordering::SeqCst) || this.cancel.load(Ordering::SeqCst);
                    if finished {
                        // Publish the final state before completion so a frontend refresh
                        // cannot observe the old scanning flag and get stuck forever.
                        this.scanning.store(false, Ordering::SeqCst);
                    }
                    events::emit(&this.app, events::LIBRARY_SCAN_FINISHED, summary);
                    this.notify_changed();
                    if finished {
                        break;
                    }
                }
            })
            .expect("failed to spawn scanner thread");
    }

    fn run_scan(&self) -> scanner::ScanSummary {
        let result = (|| -> AppResult<scanner::ScanSummary> {
            let mut conn = self.db.open_secondary()?;
            let folders = repo::list_folders(&conn)?;
            let (clean_tags, wanted) = tag_cleaning(&conn)?;
            let reindex = repo::get_setting(&conn, TAG_CLEANING_APPLIED)?.as_deref() != Some(wanted.as_str());
            let app = self.app.clone();
            let options = scanner::ScanOptions { clean_tags, reindex };
            let summary = scanner::scan(&mut conn, &folders, &self.artwork_dir, options, &self.cancel, move |p| {
                events::emit(&app, events::LIBRARY_SCAN_PROGRESS, p);
            })?;
            if reindex && !summary.cancelled {
                repo::set_setting(&conn, TAG_CLEANING_APPLIED, &wanted)?;
            }
            Ok(summary)
        })();
        match result {
            Ok(summary) => {
                log::info!(
                    "scan finished in {} ms: {} found, {} indexed, {} unchanged, {} missing, {} failed",
                    summary.elapsed_ms,
                    summary.discovered,
                    summary.added_or_updated,
                    summary.unchanged,
                    summary.missing,
                    summary.failed.len()
                );
                summary
            }
            Err(e) => {
                log::error!("scan failed: {e}");
                scanner::ScanSummary {
                    failed: vec![e.to_string()],
                    ..Default::default()
                }
            }
        }
    }

    pub fn notify_changed(&self) {
        self.player.send(PlayerCommand::LibraryChanged);
        events::emit(&self.app, events::LIBRARY_CHANGED, ());
    }
}
