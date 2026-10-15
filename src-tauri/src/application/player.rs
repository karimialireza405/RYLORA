//! Playback coordination. A single player thread owns the queue and the audio
//! backend; everything else talks to it through [`PlayerHandle`]. This keeps
//! playback independent of the UI and makes state transitions strictly sequential,
//! which rules out races such as two tracks starting after rapid skips.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use crossbeam_channel::{never, select, tick, unbounded, Receiver, Sender};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::audio::rodio_backend::RodioBackend;
use crate::audio::AudioBackend;
use crate::database::{repo, Db};
use crate::domain::models::{PlaybackStatus, RepeatMode, Track, TrackId};
use crate::domain::queue::{Advance, PlayQueue, QueueEntry};
use crate::domain::rng::SplitMix64;
use crate::events;

const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);
const SPECTRUM_INTERVAL: Duration = Duration::from_millis(33);
const SESSION_SAVE_INTERVAL: Duration = Duration::from_secs(5);
/// "Previous" restarts the current track when we are further in than this.
const RESTART_THRESHOLD_MS: u64 = 3_000;
const SESSION_KEY: &str = "session";

/// OS media integration (media keys, system flyout). Implemented per platform in
/// `crate::system`; the player pushes every state change to it.
pub trait MediaSession: Send {
    fn update(&mut self, snapshot: &PlayerSnapshot, artwork: Option<PathBuf>);
}

pub struct MediaSessionBox(pub Box<dyn MediaSession>);

impl std::fmt::Debug for MediaSessionBox {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("MediaSession")
    }
}

#[derive(Debug)]
pub enum PlayerCommand {
    PlayTracks { ids: Vec<TrackId>, start: usize },
    TogglePlay,
    Play,
    Pause,
    Next,
    Previous,
    Seek(u64),
    SetVolume(f32),
    SetMuted(bool),
    SetShuffle(bool),
    SetRepeat(RepeatMode),
    PlayNext(Vec<TrackId>),
    Enqueue(Vec<TrackId>),
    RemoveFromQueue(u64),
    MoveInQueue { uid: u64, to: usize },
    JumpTo(u64),
    ClearQueue,
    SetVisualizer(bool),
    LibraryChanged,
    AttachMediaSession(MediaSessionBox),
    Snapshot(Sender<PlayerSnapshot>),
    Shutdown(Sender<()>),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSnapshot {
    pub status: PlaybackStatus,
    pub current: Option<Track>,
    pub current_uid: Option<u64>,
    pub queue: Vec<QueueEntry>,
    pub cursor: Option<usize>,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub volume: f32,
    pub muted: bool,
    pub shuffle: bool,
    pub repeat: RepeatMode,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub position_ms: u64,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerErrorEvent {
    pub message: String,
    pub track_id: Option<TrackId>,
}

/// Persisted between launches so the user can continue where they left off.
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Session {
    queue: Vec<TrackId>,
    cursor: Option<usize>,
    position_ms: u64,
    volume: Option<f32>,
    muted: bool,
    shuffle: bool,
    repeat: RepeatMode,
}

#[derive(Clone)]
pub struct PlayerHandle {
    tx: Sender<PlayerCommand>,
}

impl PlayerHandle {
    pub fn send(&self, cmd: PlayerCommand) {
        if self.tx.send(cmd).is_err() {
            log::error!("player thread is not running");
        }
    }

    pub fn snapshot(&self) -> Option<PlayerSnapshot> {
        let (tx, rx) = crossbeam_channel::bounded(1);
        self.send(PlayerCommand::Snapshot(tx));
        rx.recv_timeout(Duration::from_secs(2)).ok()
    }

    /// Persist the session and stop audio; used on application exit.
    pub fn shutdown(&self) {
        let (tx, rx) = crossbeam_channel::bounded(1);
        self.send(PlayerCommand::Shutdown(tx));
        let _ = rx.recv_timeout(Duration::from_secs(2));
    }
}

pub fn spawn(app: AppHandle, db: Db, artwork_dir: PathBuf) -> PlayerHandle {
    let (tx, rx) = unbounded();
    std::thread::Builder::new()
        .name("rylora-player".into())
        .spawn(move || {
            let mut player = Player::new(app, db, artwork_dir, RodioBackend::new());
            player.restore_session();
            player.run(rx);
        })
        .expect("failed to spawn player thread");
    PlayerHandle { tx }
}

struct Player<B: AudioBackend> {
    app: AppHandle,
    db: Db,
    artwork_dir: PathBuf,
    media: Option<Box<dyn MediaSession>>,
    backend: B,
    queue: PlayQueue,
    rng: SplitMix64,
    tracks: HashMap<TrackId, Track>,
    status: PlaybackStatus,
    /// Position to apply when a restored track is first played.
    pending_seek_ms: u64,
    duration_ms: u64,
    volume: f32,
    muted: bool,
    visualizer: bool,
    session_dirty: bool,
    last_session_save: Instant,
}

impl<B: AudioBackend> Player<B> {
    fn new(app: AppHandle, db: Db, artwork_dir: PathBuf, backend: B) -> Self {
        Self {
            app,
            db,
            artwork_dir,
            media: None,
            backend,
            queue: PlayQueue::new(),
            rng: SplitMix64::from_time(),
            tracks: HashMap::new(),
            status: PlaybackStatus::Idle,
            pending_seek_ms: 0,
            duration_ms: 0,
            volume: 0.8,
            muted: false,
            visualizer: false,
            session_dirty: false,
            last_session_save: Instant::now(),
        }
    }

    fn run(&mut self, rx: Receiver<PlayerCommand>) {
        let progress_tick = tick(PROGRESS_INTERVAL);
        let spectrum_tick = tick(SPECTRUM_INTERVAL);
        loop {
            let spectrum = if self.visualizer { spectrum_tick.clone() } else { never() };
            select! {
                recv(rx) -> msg => match msg {
                    Ok(PlayerCommand::Shutdown(done)) => {
                        self.save_session();
                        self.backend.stop();
                        self.media = None;
                        let _ = done.send(());
                        return;
                    }
                    Ok(cmd) => self.handle(cmd),
                    Err(_) => return,
                },
                recv(progress_tick) -> _ => self.on_tick(),
                recv(spectrum) -> _ => {
                    if let Some(bands) = self.backend.spectrum(self.status == PlaybackStatus::Playing) {
                        events::emit(&self.app, events::PLAYER_SPECTRUM, bands.to_vec());
                    }
                },
            }
        }
    }

    fn handle(&mut self, cmd: PlayerCommand) {
        match cmd {
            PlayerCommand::PlayTracks { ids, start } => {
                if ids.is_empty() {
                    return;
                }
                self.queue.replace(&ids, start, &mut self.rng);
                self.start_current(true, 0);
            }
            PlayerCommand::TogglePlay => match self.status {
                PlaybackStatus::Playing | PlaybackStatus::Loading => self.pause(),
                _ => self.play(),
            },
            PlayerCommand::Play => self.play(),
            PlayerCommand::Pause => self.pause(),
            PlayerCommand::Next => self.next(Advance::UserSkip),
            PlayerCommand::Previous => self.previous(),
            PlayerCommand::Seek(ms) => self.seek(ms),
            PlayerCommand::SetVolume(v) => {
                self.volume = v.clamp(0.0, 1.0);
                if self.volume > 0.0 {
                    self.muted = false;
                }
                self.apply_gain();
                self.changed();
            }
            PlayerCommand::SetMuted(m) => {
                self.muted = m;
                self.apply_gain();
                self.changed();
            }
            PlayerCommand::SetShuffle(on) => {
                self.queue.set_shuffle(on, &mut self.rng);
                self.changed();
            }
            PlayerCommand::SetRepeat(mode) => {
                self.queue.set_repeat(mode);
                self.changed();
            }
            PlayerCommand::PlayNext(ids) => {
                let was_empty = self.queue.current().is_none();
                self.queue.play_next(&ids);
                if was_empty {
                    self.queue.jump_to(self.queue.entries()[0].uid);
                    self.start_current(true, 0);
                } else {
                    self.changed();
                }
            }
            PlayerCommand::Enqueue(ids) => {
                let was_empty = self.queue.current().is_none();
                let first_new = self.queue.entries().len();
                self.queue.append(&ids);
                if was_empty {
                    if let Some(e) = self.queue.entries().get(first_new).copied() {
                        self.queue.jump_to(e.uid);
                        self.start_current(true, 0);
                        return;
                    }
                }
                self.changed();
            }
            PlayerCommand::RemoveFromQueue(uid) => {
                if self.queue.remove(uid) {
                    // The playing entry was removed: continue with what followed it.
                    if self.queue.current().is_some() {
                        let autoplay = self.status == PlaybackStatus::Playing;
                        self.start_current(autoplay, 0);
                    } else {
                        self.stop_playback();
                    }
                } else {
                    self.changed();
                }
            }
            PlayerCommand::MoveInQueue { uid, to } => {
                self.queue.move_entry(uid, to);
                self.changed();
            }
            PlayerCommand::JumpTo(uid) => {
                if self.queue.jump_to(uid).is_some() {
                    self.start_current(true, 0);
                }
            }
            PlayerCommand::ClearQueue => {
                self.queue.clear_upcoming();
                self.changed();
            }
            PlayerCommand::SetVisualizer(on) => self.visualizer = on,
            PlayerCommand::LibraryChanged => self.on_library_changed(),
            PlayerCommand::AttachMediaSession(session) => {
                self.media = Some(session.0);
                self.changed();
            }
            PlayerCommand::Snapshot(reply) => {
                let _ = reply.send(self.snapshot());
            }
            PlayerCommand::Shutdown(_) => unreachable!("handled in run loop"),
        }
    }

    // ------------------------------------------------------------ transport

    fn play(&mut self) {
        if self.queue.current().is_none() {
            return;
        }
        if self.backend.is_loaded() && !self.backend.is_finished() {
            self.backend.play();
            self.status = PlaybackStatus::Playing;
            self.changed();
        } else {
            // Nothing loaded (fresh session restore or after the queue ended).
            let resume = std::mem::take(&mut self.pending_seek_ms);
            self.start_current(true, resume);
        }
    }

    fn pause(&mut self) {
        if self.status == PlaybackStatus::Playing {
            self.backend.pause();
            self.status = PlaybackStatus::Paused;
            self.changed();
        }
    }

    fn stop_playback(&mut self) {
        self.backend.stop();
        self.status = if self.queue.current().is_some() { PlaybackStatus::Paused } else { PlaybackStatus::Idle };
        self.pending_seek_ms = 0;
        self.changed();
    }

    fn next(&mut self, reason: Advance) {
        match self.queue.advance(reason) {
            Some(_) => {
                let autoplay = reason == Advance::TrackEnded || self.status != PlaybackStatus::Paused;
                self.start_current(autoplay, 0);
            }
            None if reason == Advance::TrackEnded => {
                // End of the queue: rest on the last track, ready to replay.
                self.backend.stop();
                self.status = PlaybackStatus::Paused;
                self.pending_seek_ms = 0;
                self.changed();
                self.emit_progress(0);
            }
            None => {}
        }
    }

    fn previous(&mut self) {
        if self.position_ms() > RESTART_THRESHOLD_MS || self.queue.retreat().is_none() {
            self.seek(0);
            return;
        }
        let autoplay = self.status != PlaybackStatus::Paused;
        self.start_current(autoplay, 0);
    }

    fn seek(&mut self, ms: u64) {
        let target = if self.duration_ms > 0 { ms.min(self.duration_ms.saturating_sub(250)) } else { ms };
        if !self.backend.is_loaded() {
            self.pending_seek_ms = target;
            self.emit_progress(target);
            return;
        }
        if let Err(e) = self.backend.seek(Duration::from_millis(target)) {
            self.report_error(e.to_string(), self.queue.current().map(|c| c.track_id));
        }
        self.emit_progress(self.position_ms());
        self.session_dirty = true;
    }

    fn apply_gain(&mut self) {
        // Perceptual curve: slider position maps to amplitude quadratically (~ -12 dB at 50%).
        let gain = if self.muted { 0.0 } else { self.volume * self.volume };
        self.backend.set_gain(gain);
    }

    /// Load and (optionally) start the queue's current entry. Unplayable tracks are
    /// reported and skipped, bounded so a queue of broken files cannot loop forever.
    fn start_current(&mut self, autoplay: bool, start_ms: u64) {
        let mut attempts = self.queue.entries().len().max(1);
        while let Some(entry) = self.queue.current() {
            match self.load_entry(entry, autoplay, start_ms) {
                Ok(()) => {
                    self.changed();
                    return;
                }
                Err(message) => {
                    self.report_error(message, Some(entry.track_id));
                    attempts -= 1;
                    if attempts == 0 || self.queue.advance(Advance::UserSkip).is_none() {
                        break;
                    }
                }
            }
        }
        self.backend.stop();
        self.status = if self.queue.current().is_some() { PlaybackStatus::Paused } else { PlaybackStatus::Idle };
        self.changed();
    }

    fn load_entry(&mut self, entry: QueueEntry, autoplay: bool, start_ms: u64) -> Result<(), String> {
        let track = self.track(entry.track_id).ok_or_else(|| "This track is no longer in your library.".to_string())?;
        if track.missing {
            return Err(format!("\"{}\" could not be found on disk.", track.title));
        }
        self.status = PlaybackStatus::Loading;
        self.apply_gain();
        let loaded = self
            .backend
            .load(Path::new(&track.path), !autoplay)
            .map_err(|e| format!("Can't play \"{}\": {e}", track.title))?;

        self.duration_ms = loaded.duration.map(|d| d.as_millis() as u64).unwrap_or(track.duration_ms);
        if track.duration_ms == 0 && self.duration_ms > 0 {
            let _ = repo::set_duration_if_unknown(&self.db.conn(), track.id, self.duration_ms);
        }
        self.pending_seek_ms = 0;
        if start_ms > 0 {
            if let Err(e) = self.backend.seek(Duration::from_millis(start_ms)) {
                log::warn!("could not restore position: {e}");
            }
        }
        self.status = if autoplay { PlaybackStatus::Playing } else { PlaybackStatus::Paused };
        if autoplay {
            if let Err(e) = repo::record_play(&self.db.conn(), track.id) {
                log::warn!("could not record play: {e}");
            }
        }
        Ok(())
    }

    fn on_tick(&mut self) {
        if self.status == PlaybackStatus::Playing {
            if self.backend.is_finished() {
                self.next(Advance::TrackEnded);
            } else {
                self.emit_progress(self.position_ms());
            }
        }
        // Persist promptly after changes, and periodically while playing so the
        // resume position survives a crash.
        let since = self.last_session_save.elapsed();
        let playing = self.status == PlaybackStatus::Playing;
        if (self.session_dirty && since >= SESSION_SAVE_INTERVAL) || (playing && since >= SESSION_SAVE_INTERVAL * 2) {
            self.save_session();
        }
    }

    fn on_library_changed(&mut self) {
        self.tracks.clear();
        // Drop queue entries whose tracks were removed from the library entirely.
        let queued: Vec<TrackId> = self.queue.entries().iter().map(|e| e.track_id).collect();
        let gone: Vec<TrackId> = queued.into_iter().filter(|&id| self.track(id).is_none()).collect();
        let mut current_removed = false;
        for id in gone {
            current_removed |= self.queue.remove_track(id);
        }
        if current_removed {
            self.stop_playback();
        } else {
            self.changed();
        }
    }

    // ------------------------------------------------------------ state

    fn track(&mut self, id: TrackId) -> Option<Track> {
        if let Some(t) = self.tracks.get(&id) {
            return Some(t.clone());
        }
        let track = repo::track_by_id(&self.db.conn(), id).ok().flatten()?;
        self.tracks.insert(id, track.clone());
        Some(track)
    }

    fn position_ms(&self) -> u64 {
        if self.backend.is_loaded() {
            self.backend.position().as_millis() as u64
        } else {
            self.pending_seek_ms
        }
    }

    fn snapshot(&mut self) -> PlayerSnapshot {
        let current_entry = self.queue.current();
        let current = current_entry.and_then(|e| self.track(e.track_id));
        PlayerSnapshot {
            status: self.status,
            duration_ms: if self.duration_ms > 0 {
                self.duration_ms
            } else {
                current.as_ref().map_or(0, |t| t.duration_ms)
            },
            current,
            current_uid: current_entry.map(|e| e.uid),
            queue: self.queue.entries().to_vec(),
            cursor: self.queue.cursor(),
            position_ms: self.position_ms(),
            volume: self.volume,
            muted: self.muted,
            shuffle: self.queue.shuffled(),
            repeat: self.queue.repeat(),
        }
    }

    fn changed(&mut self) {
        self.session_dirty = true;
        let snapshot = self.snapshot();
        if let Some(media) = self.media.as_mut() {
            let artwork = snapshot.current.as_ref().and_then(|t| t.artwork.as_deref()).map(|hash| {
                crate::metadata::artwork::artwork_path(&self.artwork_dir, hash, crate::metadata::artwork::ArtworkSize::Large)
            });
            media.update(&snapshot, artwork);
        }
        events::emit(&self.app, events::PLAYER_STATE, snapshot);
    }

    fn emit_progress(&self, position_ms: u64) {
        events::emit(
            &self.app,
            events::PLAYER_PROGRESS,
            Progress { position_ms, duration_ms: self.duration_ms },
        );
    }

    fn report_error(&self, message: String, track_id: Option<TrackId>) {
        log::warn!("playback error: {message}");
        events::emit(&self.app, events::PLAYER_ERROR, PlayerErrorEvent { message, track_id });
    }

    fn save_session(&mut self) {
        let session = Session {
            queue: self.queue.entries().iter().map(|e| e.track_id).collect(),
            cursor: self.queue.cursor(),
            position_ms: self.position_ms(),
            volume: Some(self.volume),
            muted: self.muted,
            // Shuffle order is persisted as the play order itself; restore unshuffled.
            shuffle: false,
            repeat: self.queue.repeat(),
        };
        match serde_json::to_string(&session) {
            Ok(json) => {
                if let Err(e) = repo::set_setting(&self.db.conn(), SESSION_KEY, &json) {
                    log::warn!("could not save session: {e}");
                }
            }
            Err(e) => log::warn!("could not serialise session: {e}"),
        }
        self.session_dirty = false;
        self.last_session_save = Instant::now();
    }

    fn restore_session(&mut self) {
        let Ok(Some(json)) = repo::get_setting(&self.db.conn(), SESSION_KEY) else { return };
        let session: Session = match serde_json::from_str(&json) {
            Ok(s) => s,
            Err(e) => {
                log::warn!("discarding unreadable session: {e}");
                return;
            }
        };
        // Drop tracks that left the library, keeping the cursor on the same track.
        let mut ids = Vec::with_capacity(session.queue.len());
        let mut cursor = None;
        for (i, id) in session.queue.into_iter().enumerate() {
            if self.track(id).is_some() {
                if session.cursor == Some(i) {
                    cursor = Some(ids.len());
                }
                ids.push(id);
            }
        }
        self.queue.restore(&ids, cursor);
        self.queue.set_repeat(session.repeat);
        self.volume = session.volume.unwrap_or(0.8).clamp(0.0, 1.0);
        self.muted = session.muted;
        self.apply_gain();
        if let Some(entry) = self.queue.current() {
            self.pending_seek_ms = session.position_ms;
            self.duration_ms = self.track(entry.track_id).map_or(0, |t| t.duration_ms);
            self.status = PlaybackStatus::Paused;
        }
        self.session_dirty = false;
    }
}
