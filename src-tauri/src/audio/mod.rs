//! Audio output abstraction.
//!
//! The application layer talks to an [`AudioBackend`]; the concrete engine
//! (currently rodio + symphonia, see `rodio_backend` and `engine`) can be replaced
//! without touching queue logic, IPC or the UI. Backends are driven from a single
//! player thread, so they do not need to be `Send`.

pub mod engine;
pub mod eq;
pub mod loudness;
pub mod rodio_backend;
pub mod spectrum;

use std::path::Path;
use std::time::Duration;

use serde::Serialize;

use eq::EqSettings;
use loudness::Audible;
use spectrum::BAND_COUNT;

#[derive(Debug, thiserror::Error)]
pub enum AudioError {
    #[error("No audio output device is available: {0}")]
    Device(String),
    #[error("Could not open file: {0}")]
    Io(#[from] std::io::Error),
    #[error("Unsupported or corrupt audio: {0}")]
    Decode(String),
    #[error("Seek failed: {0}")]
    Seek(String),
}

/// A track to play, as the backend needs it.
#[derive(Debug, Clone, Copy)]
pub struct TrackRequest<'a> {
    pub path: &'a Path,
    /// Identifies the queue entry; reported back on transitions.
    pub token: u64,
    /// Linear loudness-levelling gain.
    pub gain: f32,
    /// Where the sound starts and ends, once measured; crossfades skip the silence outside.
    pub audible: Option<Audible>,
}

pub struct LoadedTrack {
    /// Duration reported by the decoder, when the container provides one.
    pub duration: Option<Duration>,
}

/// The prepared next track took over (gaplessly or by crossfading into it).
#[derive(Debug, Clone, Copy)]
pub struct Transition {
    /// Token the track was prepared with (the queue entry uid).
    pub token: u64,
    pub duration: Option<Duration>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OutputDevice {
    /// Stable identifier, persisted as the user's choice.
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

pub trait AudioBackend {
    /// Load a file, replacing anything currently playing. Starts paused when `paused` is true.
    fn load(&mut self, track: TrackRequest<'_>, paused: bool) -> Result<LoadedTrack, AudioError>;
    /// Prepare (or clear) the track that follows the current one. It joins without a gap,
    /// or blends in over the crossfade length when `crossfade` is true.
    fn set_next(&mut self, next: Option<TrackRequest<'_>>, crossfade: bool);
    /// Report a switch to the prepared track since the last call.
    fn take_transition(&mut self) -> Option<Transition>;
    /// Update the levelling gain and audible range of the playing or prepared track
    /// with `token` (e.g. once its measurement arrives).
    fn update_track(&mut self, token: u64, gain: f32, audible: Option<Audible>);
    /// Crossfade length used when the next track asks for one.
    fn set_crossfade(&mut self, duration: Duration);
    fn play(&mut self);
    fn pause(&mut self);
    /// Unload the current source entirely.
    fn stop(&mut self);
    fn seek(&mut self, position: Duration) -> Result<(), AudioError>;
    /// Linear amplitude factor, `0.0..=1.0`.
    fn set_gain(&mut self, gain: f32);
    fn position(&self) -> Duration;
    fn is_loaded(&self) -> bool;
    /// True once the current track has played to its end with nothing prepared after it.
    fn is_finished(&self) -> bool;
    fn set_equalizer(&mut self, settings: EqSettings);
    fn equalizer(&self) -> EqSettings;
    fn output_devices(&self) -> Vec<OutputDevice>;
    /// `None` follows the system default device.
    fn set_output_device(&mut self, id: Option<String>) -> Result<(), AudioError>;
    /// Periodic housekeeping: recover from device errors and follow default-device
    /// changes. Returns true when the output was reopened.
    fn maintain(&mut self) -> Result<bool, AudioError>;
    /// Spectrum of what is currently audible, or decaying bars when nothing is.
    /// Returns `None` once the bars have settled and nothing is playing.
    fn spectrum(&mut self, playing: bool) -> Option<[u8; BAND_COUNT]>;
}
