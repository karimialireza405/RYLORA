//! Audio output abstraction.
//!
//! The application layer talks to an [`AudioBackend`]; the concrete engine
//! (currently rodio + symphonia, see `rodio_backend`) can be replaced without
//! touching queue logic, IPC or the UI. Backends are driven from a single player
//! thread, so they do not need to be `Send`.

pub mod rodio_backend;
pub mod spectrum;
pub mod tap;

use std::path::Path;
use std::time::Duration;

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

pub struct LoadedTrack {
    /// Duration reported by the decoder, when the container provides one.
    pub duration: Option<Duration>,
}

pub trait AudioBackend {
    /// Load a file, replacing anything currently playing. Starts paused when `paused` is true.
    fn load(&mut self, path: &Path, paused: bool) -> Result<LoadedTrack, AudioError>;
    fn play(&mut self);
    fn pause(&mut self);
    /// Unload the current source entirely.
    fn stop(&mut self);
    fn seek(&mut self, position: Duration) -> Result<(), AudioError>;
    /// Linear amplitude factor, `0.0..=1.0`.
    fn set_gain(&mut self, gain: f32);
    fn position(&self) -> Duration;
    fn is_loaded(&self) -> bool;
    /// True once a loaded source has played to its end.
    fn is_finished(&self) -> bool;
    /// Spectrum of what is currently audible, or decaying bars when nothing is.
    /// Returns `None` once the bars have settled and nothing is playing.
    fn spectrum(&mut self, playing: bool) -> Option<[u8; BAND_COUNT]>;
}
