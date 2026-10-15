//! rodio + symphonia implementation of [`AudioBackend`].
//!
//! One `rodio::Player` is created per track and dropped (which stops it) when the
//! next track loads, so there is never more than one source audible.

use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player, Source};

use super::spectrum::{SampleRing, SpectrumAnalyzer, BAND_COUNT};
use super::tap::TapSource;
use super::{AudioBackend, AudioError, LoadedTrack};

const SEEK_TIMEOUT: Duration = Duration::from_millis(1500);

pub struct RodioBackend {
    sink: Option<MixerDeviceSink>,
    device_failed: Arc<AtomicBool>,
    player: Option<Arc<Player>>,
    ring: Arc<Mutex<SampleRing>>,
    analyzer: SpectrumAnalyzer,
    gain: f32,
}

impl RodioBackend {
    pub fn new() -> Self {
        Self {
            sink: None,
            device_failed: Arc::new(AtomicBool::new(false)),
            player: None,
            ring: Arc::new(Mutex::new(SampleRing::new())),
            analyzer: SpectrumAnalyzer::new(),
            gain: 1.0,
        }
    }

    /// Open (or re-open after a device error) the default output device.
    fn ensure_sink(&mut self) -> Result<(), AudioError> {
        if self.device_failed.swap(false, Ordering::SeqCst) {
            log::warn!("audio device reported an error; reopening output");
            self.player = None;
            self.sink = None;
        }
        if self.sink.is_some() {
            return Ok(());
        }
        let failed = self.device_failed.clone();
        let mut sink = DeviceSinkBuilder::from_default_device()
            .map_err(|e| AudioError::Device(e.to_string()))?
            .with_error_callback(move |err| {
                log::error!("audio stream error: {err}");
                failed.store(true, Ordering::SeqCst);
            })
            .open_sink_or_fallback()
            .map_err(|e| AudioError::Device(e.to_string()))?;
        sink.log_on_drop(false);
        log::info!(
            "audio output opened: {} Hz, {} channels",
            sink.config().sample_rate(),
            sink.config().channel_count()
        );
        self.sink = Some(sink);
        Ok(())
    }
}

impl Default for RodioBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioBackend for RodioBackend {
    fn load(&mut self, path: &Path, paused: bool) -> Result<LoadedTrack, AudioError> {
        // Stop the previous track before anything else so a failed load never leaves it playing.
        self.player = None;
        self.ensure_sink()?;

        let file = File::open(path)?;
        let byte_len = file.metadata().map(|m| m.len()).ok();
        let mut builder = Decoder::builder().with_data(BufReader::new(file)).with_seekable(true);
        if let Some(len) = byte_len {
            builder = builder.with_byte_len(len);
        }
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            builder = builder.with_hint(ext);
        }
        let decoder = builder.build().map_err(|e| AudioError::Decode(e.to_string()))?;
        let duration = decoder.total_duration();

        let sink = self.sink.as_ref().ok_or_else(|| AudioError::Device("output not open".into()))?;
        let player = Player::connect_new(sink.mixer());
        player.set_volume(self.gain);
        if paused {
            player.pause();
        }
        player.append(TapSource::new(decoder, self.ring.clone()));
        self.player = Some(Arc::new(player));
        Ok(LoadedTrack { duration })
    }

    fn play(&mut self) {
        if let Some(p) = &self.player {
            p.play();
        }
    }

    fn pause(&mut self) {
        if let Some(p) = &self.player {
            p.pause();
        }
    }

    fn stop(&mut self) {
        self.player = None;
        self.ring.lock().clear();
    }

    fn seek(&mut self, position: Duration) -> Result<(), AudioError> {
        let Some(player) = self.player.clone() else { return Ok(()) };
        // `try_seek` blocks until the audio callback applies it. If the device has
        // stalled that would never happen, so wait on a helper thread with a timeout.
        let (tx, rx) = crossbeam_channel::bounded(1);
        std::thread::spawn(move || {
            let _ = tx.send(player.try_seek(position).map_err(|e| e.to_string()));
        });
        match rx.recv_timeout(SEEK_TIMEOUT) {
            Ok(Ok(())) => {
                self.ring.lock().clear();
                Ok(())
            }
            Ok(Err(e)) => Err(AudioError::Seek(e)),
            Err(_) => Err(AudioError::Seek("audio output is not responding".into())),
        }
    }

    fn set_gain(&mut self, gain: f32) {
        self.gain = gain.clamp(0.0, 1.0);
        if let Some(p) = &self.player {
            p.set_volume(self.gain);
        }
    }

    fn position(&self) -> Duration {
        self.player.as_ref().map(|p| p.get_pos()).unwrap_or_default()
    }

    fn is_loaded(&self) -> bool {
        self.player.is_some()
    }

    fn is_finished(&self) -> bool {
        self.player.as_ref().is_some_and(|p| p.empty())
    }

    fn spectrum(&mut self, playing: bool) -> Option<[u8; BAND_COUNT]> {
        if playing && self.player.is_some() {
            let ring = self.ring.lock();
            Some(self.analyzer.analyze(&ring))
        } else if self.analyzer.is_silent() {
            None
        } else {
            Some(self.analyzer.decay())
        }
    }
}
