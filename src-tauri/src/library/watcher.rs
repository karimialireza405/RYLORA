//! Watches library folders so songs added, changed, moved or deleted outside RYLORA
//! show up without a manual rescan.
//!
//! The operating system reports changes; they are collected until the folder has
//! been quiet for a moment (copying an album produces hundreds of events), then one
//! incremental scan runs. That scan skips unchanged files by size and modification
//! time, so it costs little more than listing the folders.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use crossbeam_channel::{Receiver, RecvTimeoutError, Sender};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;

use super::is_supported;

/// Wait this long after the last change before scanning…
const QUIET: Duration = Duration::from_secs(2);
/// …but never longer than this while changes keep arriving.
const MAX_WAIT: Duration = Duration::from_secs(15);

/// Whether a change at `path` can affect the library: a supported audio file, or
/// something without an extension (a folder being added, moved or deleted).
pub fn relevant(path: &Path) -> bool {
    is_supported(path) || path.extension().is_none()
}

pub struct LibraryWatcher {
    tx: Sender<()>,
    state: Mutex<WatchState>,
}

#[derive(Default)]
struct WatchState {
    watcher: Option<RecommendedWatcher>,
    folders: Vec<PathBuf>,
}

impl LibraryWatcher {
    /// Returns the watcher and the receiver of debounced "something changed" signals.
    pub fn new() -> (Self, Receiver<()>) {
        let (raw_tx, raw_rx) = crossbeam_channel::unbounded();
        let (tx, rx) = crossbeam_channel::unbounded();
        std::thread::Builder::new()
            .name("rylora-watch".into())
            .spawn(move || debounce(raw_rx, tx))
            .expect("failed to spawn watch thread");
        (Self { tx: raw_tx, state: Mutex::default() }, rx)
    }

    /// Watch exactly `folders` (an empty list stops watching). Folders that cannot be
    /// watched (e.g. an unplugged drive) are skipped and retried on the next call.
    pub fn watch(&self, folders: Vec<PathBuf>) {
        let mut state = self.state.lock();
        let available: Vec<PathBuf> = folders.into_iter().filter(|f| f.is_dir()).collect();
        if state.watcher.is_some() && state.folders == available {
            return;
        }
        state.watcher = None;
        state.folders.clear();
        if available.is_empty() {
            return;
        }
        let tx = self.tx.clone();
        let handler = move |result: notify::Result<notify::Event>| match result {
            Ok(event) => {
                let interesting = !matches!(event.kind, EventKind::Access(_)) && event.paths.iter().any(|p| relevant(p));
                if interesting {
                    let _ = tx.send(());
                }
            }
            // The OS dropped events (e.g. its buffer overflowed): rescan to be safe.
            Err(e) => {
                log::warn!("folder watch error: {e}");
                let _ = tx.send(());
            }
        };
        let mut watcher = match notify::recommended_watcher(handler) {
            Ok(w) => w,
            Err(e) => {
                log::warn!("cannot watch library folders: {e}");
                return;
            }
        };
        let mut watched = Vec::new();
        for folder in available {
            match watcher.watch(&folder, RecursiveMode::Recursive) {
                Ok(()) => watched.push(folder),
                Err(e) => log::warn!("cannot watch {}: {e}", folder.display()),
            }
        }
        log::info!("watching {} library folder(s) for changes", watched.len());
        state.folders = watched;
        state.watcher = Some(watcher);
    }
}

/// Collapse bursts of change signals into one, sent once things have been quiet.
fn debounce(raw: Receiver<()>, out: Sender<()>) {
    while raw.recv().is_ok() {
        let started = Instant::now();
        loop {
            let left = MAX_WAIT.saturating_sub(started.elapsed());
            if left.is_zero() {
                break;
            }
            match raw.recv_timeout(QUIET.min(left)) {
                Ok(()) => continue,
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
        if out.send(()).is_err() {
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_music_and_folders_matter() {
        assert!(relevant(Path::new(r"C:\Music\a.MP3")));
        assert!(relevant(Path::new(r"C:\Music\New Album")));
        assert!(!relevant(Path::new(r"C:\Music\a.mp3.crdownload")));
        assert!(!relevant(Path::new(r"C:\Music\notes.txt")));
    }

    #[test]
    fn a_burst_of_changes_becomes_one_signal() {
        let (raw_tx, raw_rx) = crossbeam_channel::unbounded();
        let (tx, rx) = crossbeam_channel::unbounded();
        std::thread::spawn(move || debounce(raw_rx, tx));
        for _ in 0..50 {
            raw_tx.send(()).unwrap();
        }
        assert!(rx.recv_timeout(QUIET + Duration::from_secs(1)).is_ok());
        assert!(rx.recv_timeout(Duration::from_millis(300)).is_err(), "only one signal");
    }

    #[test]
    fn notices_a_song_copied_into_a_watched_folder() {
        let dir = tempfile::tempdir().unwrap();
        let (watcher, rx) = LibraryWatcher::new();
        watcher.watch(vec![dir.path().to_path_buf()]);
        std::fs::write(dir.path().join("notes.txt"), b"x").unwrap();
        assert!(rx.recv_timeout(QUIET + Duration::from_millis(800)).is_err(), "unrelated files are ignored");
        std::fs::create_dir(dir.path().join("Album")).unwrap();
        std::fs::write(dir.path().join("Album").join("01.flac"), b"x").unwrap();
        assert!(rx.recv_timeout(QUIET + Duration::from_secs(3)).is_ok());
        watcher.watch(Vec::new());
        std::fs::write(dir.path().join("02.flac"), b"x").unwrap();
        assert!(rx.recv_timeout(QUIET + Duration::from_millis(800)).is_err(), "stopped watching");
    }
}
