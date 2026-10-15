//! Background loudness measurement for levelling.
//!
//! One low-key worker thread works through the library, taking ReplayGain tags when a
//! file has them and otherwise decoding it once to measure it. Tracks the player is
//! about to need are measured first. Results are stored per file version, so a
//! rescan only re-measures files that actually changed.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use crossbeam_channel::{unbounded, Receiver, Sender};
use serde::Serialize;
use tauri::AppHandle;

use super::player::{PlayerCommand, PlayerHandle};
use crate::audio::loudness;
use crate::database::repo::{self, LoudnessJob, LoudnessRecord};
use crate::database::Db;
use crate::domain::models::TrackId;
use crate::events;

#[derive(Debug, Clone, Copy, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LoudnessProgress {
    pub measured: u32,
    pub total: u32,
}

enum Message {
    /// The library changed; look for new or modified files.
    Wake,
    Prioritize(TrackId),
    SetEnabled(bool),
    Stop,
}

pub struct LoudnessWorker {
    tx: Sender<Message>,
    cancel: Arc<AtomicBool>,
}

impl LoudnessWorker {
    pub fn spawn(app: AppHandle, db: Db, player: PlayerHandle) -> Self {
        let (tx, rx) = unbounded();
        let cancel = Arc::new(AtomicBool::new(false));
        let worker_cancel = cancel.clone();
        std::thread::Builder::new()
            .name("rylora-loudness".into())
            .spawn(move || run(app, db, player, rx, worker_cancel))
            .expect("failed to spawn loudness thread");
        Self { tx, cancel }
    }

    pub fn wake(&self) {
        let _ = self.tx.send(Message::Wake);
    }

    pub fn prioritize(&self, id: TrackId) {
        let _ = self.tx.send(Message::Prioritize(id));
    }

    pub fn set_enabled(&self, enabled: bool) {
        if !enabled {
            // Abandon a measurement in progress rather than finishing it.
            self.cancel.store(true, Ordering::SeqCst);
        }
        let _ = self.tx.send(Message::SetEnabled(enabled));
    }

    pub fn stop(&self) {
        self.cancel.store(true, Ordering::SeqCst);
        let _ = self.tx.send(Message::Stop);
    }
}

fn run(app: AppHandle, db: Db, player: PlayerHandle, rx: Receiver<Message>, cancel: Arc<AtomicBool>) {
    let conn = match db.open_secondary() {
        Ok(conn) => conn,
        Err(e) => {
            log::error!("loudness worker has no database connection: {e}");
            return;
        }
    };
    match repo::forget_failed_loudness(&conn) {
        Ok(0) => {}
        Ok(n) => log::info!("retrying loudness measurement of {n} files that failed before"),
        Err(e) => log::warn!("could not reset failed loudness measurements: {e}"),
    }
    let mut enabled = false;
    let mut priority: VecDeque<TrackId> = VecDeque::new();
    let mut idle = true;
    loop {
        // Apply every message that arrived; block only when there is nothing to do.
        let mut message = if enabled && !idle { rx.try_recv().ok() } else { rx.recv().ok().or(Some(Message::Stop)) };
        while let Some(m) = message.take() {
            match m {
                Message::Wake => idle = false,
                Message::Prioritize(id) => {
                    if !priority.contains(&id) {
                        priority.push_front(id);
                        priority.truncate(8);
                    }
                    idle = false;
                }
                Message::SetEnabled(on) => {
                    enabled = on;
                    idle = false;
                    cancel.store(false, Ordering::SeqCst);
                }
                Message::Stop => return,
            }
            message = rx.try_recv().ok();
        }
        if !enabled {
            priority.clear();
            continue;
        }

        let job = next_job(&conn, &mut priority);
        let Some(job) = job else {
            idle = true;
            emit_progress(&app, &conn);
            continue;
        };
        let started = std::time::Instant::now();
        let Some(record) = measure(&job, &cancel) else {
            // Cancelled: the track stays queued for later.
            continue;
        };
        if let Err(e) = repo::save_loudness(&conn, &job, &record) {
            log::warn!("could not store loudness of {}: {e}", job.path);
            std::thread::sleep(Duration::from_secs(5));
            continue;
        }
        log::debug!(
            "loudness of {} from {}: {:?} in {} ms",
            job.path,
            record.source,
            record.track.map(|l| l.lufs),
            started.elapsed().as_millis()
        );
        player.send(PlayerCommand::LoudnessMeasured(job.track_id));
        emit_progress(&app, &conn);
    }
}

fn next_job(conn: &rusqlite::Connection, priority: &mut VecDeque<TrackId>) -> Option<LoudnessJob> {
    while let Some(id) = priority.pop_front() {
        match repo::loudness_job(conn, id) {
            Ok(Some(job)) => return Some(job),
            Ok(None) => {}
            Err(e) => log::warn!("loudness lookup failed: {e}"),
        }
    }
    match repo::loudness_jobs(conn, 1) {
        Ok(mut jobs) => jobs.pop(),
        Err(e) => {
            log::warn!("loudness lookup failed: {e}");
            None
        }
    }
}

/// Decode the file once: it gives the loudness and where the audio starts and ends
/// (used to skip silence when crossfading). ReplayGain tags, when present, take
/// precedence for loudness, as the user's tagger decided. `None` when cancelled.
fn measure(job: &LoudnessJob, cancel: &AtomicBool) -> Option<LoudnessRecord> {
    let path = std::path::Path::new(&job.path);
    let tags = loudness::read_tags(path);
    let measured = loudness::measure(path, cancel);
    if cancel.load(Ordering::SeqCst) {
        return None;
    }
    let (track, audible, analysed) = match measured {
        Ok(Some(m)) => (m.loudness, m.audible, true),
        Ok(None) => return None,
        Err(e) => {
            log::warn!("could not measure loudness of {}: {e}", job.path);
            (None, None, false)
        }
    };
    let source = match (tags.track, analysed) {
        (Some(_), _) => "tags",
        (None, true) => "analysis",
        (None, false) => "failed",
    };
    Some(LoudnessRecord { source, track: tags.track.or(track), album: tags.album, audible })
}

fn emit_progress(app: &AppHandle, conn: &rusqlite::Connection) {
    match repo::loudness_progress(conn) {
        Ok((measured, total)) => events::emit(app, events::AUDIO_LOUDNESS, LoudnessProgress { measured, total }),
        Err(e) => log::warn!("loudness progress unavailable: {e}"),
    }
}
