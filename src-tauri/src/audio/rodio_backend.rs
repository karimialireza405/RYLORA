//! rodio + symphonia implementation of [`AudioBackend`].
//!
//! Each open output device gets one long-lived `rodio::Player` carrying a single
//! [`PlaybackSource`]. Tracks are swapped inside that stream (see `engine`), which
//! is what makes playback gapless and lets the equalizer and analyser see one
//! continuous signal.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use rodio::cpal::traits::{DeviceTrait, HostTrait};

use rodio::{cpal, DeviceSinkBuilder, MixerDeviceSink, Player, Source};

use super::engine::{open_decoder, to_output_format, EngineShared, PlaybackSource, Prepared, TrackUpdate};
use super::eq::EqSettings;
use super::loudness::Audible;
use super::spectrum::{SpectrumAnalyzer, BAND_COUNT};
use super::{AudioBackend, AudioError, LoadedTrack, OutputDevice, TrackRequest, Transition};

const SEEK_TIMEOUT: Duration = Duration::from_millis(1500);
/// How often to check whether the system default output changed (when following it).
const DEFAULT_DEVICE_POLL: Duration = Duration::from_secs(3);
/// Leading silence shorter than this is kept; longer is skipped (up to the maximum)
/// when crossfading into a track.
const MIN_LEAD_IN: f64 = 0.05;
const MAX_LEAD_IN: f64 = 10.0;

struct Output {
    _sink: MixerDeviceSink,
    player: Arc<Player>,
    channels: rodio::ChannelCount,
    sample_rate: rodio::SampleRate,
    /// Id of the device actually opened.
    device_id: Option<String>,
}

#[derive(Clone)]
struct Queued {
    path: PathBuf,
    token: u64,
    gain: f32,
    audible: Option<Audible>,
    duration: Option<Duration>,
    crossfade: bool,
}

impl Queued {
    fn new(track: TrackRequest<'_>, duration: Option<Duration>, crossfade: bool) -> Self {
        Self { path: track.path.to_path_buf(), token: track.token, gain: track.gain, audible: track.audible, duration, crossfade }
    }

    fn request(&self) -> TrackRequest<'_> {
        TrackRequest { path: &self.path, token: self.token, gain: self.gain, audible: self.audible }
    }
}

pub struct RodioBackend {
    output: Option<Output>,
    device_failed: Arc<AtomicBool>,
    shared: Arc<EngineShared>,
    analyzer: SpectrumAnalyzer,
    gain: f32,
    paused: bool,
    /// `None` follows the Windows default device.
    device_preference: Option<String>,
    last_default_poll: Instant,
    current: Option<Queued>,
    next: Option<Queued>,
    seen_transitions: u64,
}

impl RodioBackend {
    pub fn new() -> Self {
        Self {
            output: None,
            device_failed: Arc::new(AtomicBool::new(false)),
            shared: EngineShared::new(),
            analyzer: SpectrumAnalyzer::new(),
            gain: 1.0,
            paused: true,
            device_preference: None,
            last_default_poll: Instant::now(),
            current: None,
            next: None,
            seen_transitions: 0,
        }
    }

    fn host() -> cpal::Host {
        cpal::default_host()
    }

    fn device_id(device: &cpal::Device) -> Option<String> {
        device.id().ok().map(|id| id.to_string())
    }

    /// The preferred device if it is present, otherwise the system default.
    fn resolve_device(&self) -> Result<cpal::Device, AudioError> {
        let host = Self::host();
        if let Some(id) = &self.device_preference {
            if let Some(device) = id.parse().ok().and_then(|id| host.device_by_id(&id)) {
                return Ok(device);
            }
            log::warn!("preferred output device {id} is not available; using the system default");
        }
        host.default_output_device().ok_or_else(|| AudioError::Device("no output device found".into()))
    }

    fn open_output(&mut self) -> Result<(), AudioError> {
        let device = self.resolve_device()?;
        let device_id = Self::device_id(&device);
        let name = device.to_string();
        let failed = self.device_failed.clone();
        let mut sink = DeviceSinkBuilder::from_device(device)
            .map_err(|e| AudioError::Device(e.to_string()))?
            .with_error_callback(move |err| {
                log::error!("audio stream error: {err}");
                failed.store(true, Ordering::SeqCst);
            })
            .open_sink_or_fallback()
            .map_err(|e| AudioError::Device(e.to_string()))?;
        sink.log_on_drop(false);
        let channels = sink.config().channel_count();
        let sample_rate = sink.config().sample_rate();
        log::info!("audio output opened: {name} ({sample_rate} Hz, {channels} channels)");

        let player = Player::connect_new(sink.mixer());
        player.set_volume(self.gain);
        if self.paused {
            player.pause();
        }
        player.append(PlaybackSource::new(self.shared.clone(), channels, sample_rate));
        self.seen_transitions = self.shared.transitions();
        self.output = Some(Output { _sink: sink, player: Arc::new(player), channels, sample_rate, device_id });
        self.last_default_poll = Instant::now();
        Ok(())
    }

    fn ensure_output(&mut self) -> Result<&Output, AudioError> {
        if self.output.is_none() {
            self.open_output()?;
        }
        Ok(self.output.as_ref().expect("output just opened"))
    }

    /// Decode and convert a file for the open output.
    fn prepare(&mut self, track: TrackRequest<'_>, crossfade: bool) -> Result<(Prepared, Option<Duration>), AudioError> {
        let path = track.path;
        let (channels, sample_rate) = {
            let out = self.ensure_output()?;
            (out.channels, out.sample_rate)
        };
        let decoder = open_decoder(path)?;
        let duration = decoder.total_duration();
        let rate = sample_rate.get() as f64;
        let frames = duration.map(|d| (d.as_secs_f64() * rate).round() as u64);
        let mut source = to_output_format(decoder, channels, sample_rate);
        let audible_end = track.audible.map(|a| (a.end * rate).round() as u64);
        // Blending in starts where the sound starts, not with the file's leading silence.
        let mut start_frame = 0;
        if let Some(lead) = track.audible.map(|a| a.start.min(MAX_LEAD_IN)).filter(|&s| crossfade && s >= MIN_LEAD_IN) {
            match source.try_seek(Duration::from_secs_f64(lead)) {
                Ok(()) => start_frame = (lead * rate).round() as u64,
                Err(e) => log::debug!("could not skip the lead-in of {}: {e}", path.display()),
            }
        }
        let prepared = Prepared { source, token: track.token, gain: track.gain, frames, audible_end, start_frame, crossfade };
        Ok((prepared, duration))
    }

    /// Reopen the output (device switch or failure) and continue where we were.
    fn reopen(&mut self) -> Result<(), AudioError> {
        let resume_at = self.position();
        let current = self.current.clone();
        let next = self.next.take();
        self.output = None;
        self.open_output()?;
        if let Some(cur) = current {
            match self.prepare(cur.request(), false) {
                Ok((prepared, _)) => {
                    self.shared.replace(prepared);
                    if resume_at > Duration::ZERO {
                        self.seek(resume_at)?;
                    }
                }
                Err(e) => {
                    log::warn!("could not resume after reopening output: {e}");
                    self.current = None;
                }
            }
        }
        if let Some(n) = next {
            self.set_next(Some(n.request()), n.crossfade);
        }
        Ok(())
    }

    fn default_device_changed(&mut self) -> bool {
        if self.device_preference.is_some() || self.last_default_poll.elapsed() < DEFAULT_DEVICE_POLL {
            return false;
        }
        self.last_default_poll = Instant::now();
        let Some(open) = self.output.as_ref() else { return false };
        let default = Self::host().default_output_device().and_then(|d| Self::device_id(&d));
        default.is_some() && default != open.device_id
    }
}

impl Default for RodioBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioBackend for RodioBackend {
    fn load(&mut self, track: TrackRequest<'_>, paused: bool) -> Result<LoadedTrack, AudioError> {
        // Stop the previous track first so a failed load never leaves it playing.
        self.shared.clear();
        self.current = None;
        self.next = None;
        self.paused = paused;
        let (prepared, duration) = self.prepare(track, false)?;
        self.shared.replace(prepared);
        self.current = Some(Queued::new(track, duration, false));
        if let Some(out) = &self.output {
            if paused {
                out.player.pause();
            } else {
                out.player.play();
            }
        }
        Ok(LoadedTrack { duration })
    }

    fn set_next(&mut self, next: Option<TrackRequest<'_>>, crossfade: bool) {
        if let (Some(queued), Some(track)) = (self.next.as_ref(), next) {
            // Same track, joined the same way: at most its gain changed. (A different join or
            // audible range changes where the prepared source starts, so it is prepared again.)
            if queued.path == track.path && queued.token == track.token && queued.crossfade == crossfade && queued.audible == track.audible {
                if queued.gain != track.gain {
                    self.update_track(track.token, track.gain, track.audible);
                }
                return;
            }
        }
        if next.is_none() && self.next.is_none() {
            return;
        }
        let prepared = next.and_then(|track| match self.prepare(track, crossfade) {
            Ok((prepared, duration)) => Some((prepared, Queued::new(track, duration, crossfade))),
            Err(e) => {
                // The natural end-of-track path will report it when it is actually reached.
                log::warn!("could not prepare next track {}: {e}", track.path.display());
                None
            }
        });
        match prepared {
            Some((p, queued)) => {
                self.shared.set_next(Some(p));
                self.next = Some(queued);
            }
            None => {
                self.shared.set_next(None);
                self.next = None;
            }
        }
    }

    fn take_transition(&mut self) -> Option<Transition> {
        let count = self.shared.transitions();
        if count == self.seen_transitions {
            return None;
        }
        self.seen_transitions = count;
        let token = self.shared.current_token();
        // The prepared track is now the current one.
        if self.next.as_ref().is_some_and(|n| n.token == token) {
            self.current = self.next.take();
        }
        Some(Transition { token, duration: self.current.as_ref().and_then(|c| c.duration) })
    }

    fn update_track(&mut self, token: u64, gain: f32, audible: Option<Audible>) {
        for queued in self.current.iter_mut().chain(self.next.iter_mut()).filter(|q| q.token == token) {
            queued.gain = gain;
            queued.audible = audible.or(queued.audible);
        }
        let rate = self.output.as_ref().map_or(48_000, |o| o.sample_rate.get()) as f64;
        let audible_end = audible.map(|a| (a.end * rate).round() as u64);
        self.shared.update_track(TrackUpdate { token, gain, audible_end });
    }

    fn set_crossfade(&mut self, duration: Duration) {
        self.shared.set_crossfade(duration);
    }

    fn play(&mut self) {
        self.paused = false;
        if let Some(out) = &self.output {
            out.player.play();
        }
    }

    fn pause(&mut self) {
        self.paused = true;
        if let Some(out) = &self.output {
            out.player.pause();
        }
    }

    fn stop(&mut self) {
        self.shared.clear();
        self.current = None;
        self.next = None;
        self.pause();
        self.shared.ring.lock().clear();
    }

    fn seek(&mut self, position: Duration) -> Result<(), AudioError> {
        let Some(player) = self.output.as_ref().map(|o| o.player.clone()) else { return Ok(()) };
        // `try_seek` blocks until the audio callback applies it. If the device has
        // stalled that would never happen, so wait on a helper thread with a timeout.
        let (tx, rx) = crossbeam_channel::bounded(1);
        std::thread::spawn(move || {
            let _ = tx.send(player.try_seek(position).map_err(|e| e.to_string()));
        });
        match rx.recv_timeout(SEEK_TIMEOUT) {
            Ok(Ok(())) => Ok(()),
            Ok(Err(e)) => Err(AudioError::Seek(e)),
            Err(_) => Err(AudioError::Seek("audio output is not responding".into())),
        }
    }

    fn set_gain(&mut self, gain: f32) {
        self.gain = gain.clamp(0.0, 1.0);
        if let Some(out) = &self.output {
            out.player.set_volume(self.gain);
        }
    }

    fn position(&self) -> Duration {
        match &self.output {
            Some(out) if self.current.is_some() => {
                Duration::from_secs_f64(self.shared.position_frames() as f64 / out.sample_rate.get() as f64)
            }
            _ => Duration::ZERO,
        }
    }

    fn is_loaded(&self) -> bool {
        self.current.is_some()
    }

    fn is_finished(&self) -> bool {
        self.current.is_some() && self.shared.finished()
    }

    fn set_equalizer(&mut self, settings: EqSettings) {
        self.shared.eq.set(settings);
    }

    fn equalizer(&self) -> EqSettings {
        self.shared.eq.get()
    }

    fn output_devices(&self) -> Vec<OutputDevice> {
        let host = Self::host();
        let default_id = host.default_output_device().and_then(|d| Self::device_id(&d));
        let mut list: Vec<OutputDevice> = host
            .output_devices()
            .map(|devices| {
                devices
                    .filter_map(|d| {
                        let id = Self::device_id(&d)?;
                        Some(OutputDevice { is_default: Some(&id) == default_id.as_ref(), name: d.to_string(), id })
                    })
                    .collect()
            })
            .unwrap_or_default();
        list.sort_by(|a, b| b.is_default.cmp(&a.is_default).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
        list
    }

    fn set_output_device(&mut self, id: Option<String>) -> Result<(), AudioError> {
        self.device_preference = id;
        if self.output.is_none() {
            return Ok(());
        }
        let wanted = self.resolve_device().ok().and_then(|d| Self::device_id(&d));
        if wanted.is_some() && wanted == self.output.as_ref().and_then(|o| o.device_id.clone()) {
            return Ok(());
        }
        self.reopen()
    }

    fn maintain(&mut self) -> Result<bool, AudioError> {
        let failed = self.device_failed.swap(false, Ordering::SeqCst);
        if failed {
            log::warn!("audio device reported an error; reopening output");
        }
        if failed || self.default_device_changed() {
            if !failed {
                log::info!("system default output changed; following it");
            }
            self.reopen()?;
            return Ok(true);
        }
        Ok(false)
    }

    fn spectrum(&mut self, playing: bool) -> Option<[u8; BAND_COUNT]> {
        if playing && self.current.is_some() {
            let ring = self.shared.ring.lock();
            Some(self.analyzer.analyze(&ring))
        } else if self.analyzer.is_silent() {
            None
        } else {
            Some(self.analyzer.decay())
        }
    }
}
