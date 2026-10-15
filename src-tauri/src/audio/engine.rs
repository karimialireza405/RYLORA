//! The continuous playback stream.
//!
//! One [`PlaybackSource`] lives for as long as an output device is open. Tracks are
//! decoded and converted to the device format, so switching between them needs no
//! re-negotiation. The next track is prepared ahead of time and swapped in on the
//! exact sample where the current one ends (gapless). The same stream runs the
//! equalizer and feeds the spectrum analyser with what is actually heard.
//!
//! The player thread talks to the stream only through [`EngineShared`]: it posts a
//! replacement or a "next" track; the audio thread applies them and reports
//! transitions and end-of-queue through atomics.

use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use rodio::source::{SeekError, UniformSourceIterator};
use rodio::{ChannelCount, Decoder, Sample, SampleRate, Source};

use super::eq::{soft_clip, EqControl, Equalizer};
use super::spectrum::SampleRing;
use super::AudioError;

pub type TrackSource = UniformSourceIterator<SteadySpan<Decoder<BufReader<File>>>>;

/// Open a file for decoding. Seeking and the byte length are what let symphonia read
/// MP4 files whose index sits at the end; gapless mode trims encoder delay/padding
/// (LAME, iTunSMPB) so albums join without a gap.
pub fn open_decoder(path: &Path) -> Result<Decoder<BufReader<File>>, AudioError> {
    let file = File::open(path)?;
    let byte_len = file.metadata().map(|m| m.len()).ok();
    let mut builder = Decoder::builder().with_data(BufReader::new(file)).with_seekable(true).with_gapless(true);
    if let Some(len) = byte_len {
        builder = builder.with_byte_len(len);
    }
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        builder = builder.with_hint(ext);
    }
    builder.build().map_err(|e| AudioError::Decode(e.to_string()))
}

/// Convert a decoded file to the output format.
pub fn to_output_format(decoder: Decoder<BufReader<File>>, channels: ChannelCount, sample_rate: SampleRate) -> TrackSource {
    UniformSourceIterator::new(SteadySpan(decoder), channels, sample_rate)
}

/// Presents a decoder as one continuous span.
///
/// `UniformSourceIterator` re-initialises at every span boundary and treats an empty
/// first sample as the end of the source. Vorbis legitimately reports a zero-length
/// span (its first audio packet only primes the overlap), which made OGG files end
/// immediately once sample-rate conversion was involved. A file keeps one format, so
/// reporting no span boundaries is safe; chained Ogg streams that change sample rate
/// mid-file are not supported.
pub struct SteadySpan<S>(pub S);

impl<S: Source> Iterator for SteadySpan<S> {
    type Item = Sample;

    #[inline]
    fn next(&mut self) -> Option<Sample> {
        self.0.next()
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.0.size_hint()
    }
}

impl<S: Source> Source for SteadySpan<S> {
    fn current_span_len(&self) -> Option<usize> {
        None
    }

    fn channels(&self) -> ChannelCount {
        self.0.channels()
    }

    fn sample_rate(&self) -> SampleRate {
        self.0.sample_rate()
    }

    fn total_duration(&self) -> Option<Duration> {
        self.0.total_duration()
    }

    fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
        self.0.try_seek(pos)
    }
}

/// A decoded track, already converted to the output format.
pub struct Prepared {
    pub source: TrackSource,
    /// Identifies the queue entry this track belongs to.
    pub token: u64,
    /// Linear loudness-levelling gain.
    pub gain: f32,
    /// Length in output frames, when the container reports it.
    pub frames: Option<u64>,
    /// Frame where the audible content ends (trailing silence follows), when measured.
    pub audible_end: Option<u64>,
    /// Frames already skipped at the start (leading silence before a crossfade).
    pub start_frame: u64,
    /// Blend into this track from the previous one instead of joining gaplessly.
    pub crossfade: bool,
}

impl Prepared {
    /// Where a crossfade out of this track should end.
    fn fade_end(&self) -> Option<u64> {
        self.audible_end.or(self.frames)
    }
}

enum Pending {
    Replace(Box<Prepared>),
    Clear,
}

const RING_BATCH: usize = 512;
const POSITION_STRIDE: u64 = 256;
const EQ_REFRESH_STRIDE: u32 = 1024;
/// Time constant for gain changes on a playing track (no clicks, no audible ramp).
const GAIN_SMOOTHING_SECS: f32 = 0.05;
const UNKNOWN_FRAMES: u64 = u64::MAX;

pub struct EngineShared {
    pending: Mutex<Option<Pending>>,
    has_pending: AtomicBool,
    next: Mutex<Option<Prepared>>,
    /// Mirrors of the prepared track's crossfade flag and length, so the audio thread
    /// can decide when to start a crossfade without taking the lock on every frame.
    next_crossfade: AtomicBool,
    next_frames: AtomicU64,
    crossfade_ms: AtomicU32,
    track_updates: Mutex<Vec<TrackUpdate>>,
    has_gain_updates: AtomicBool,
    current_token: AtomicU64,
    transitions: AtomicU64,
    finished: AtomicBool,
    position_frames: AtomicU64,
    pub eq: EqControl,
    pub ring: Mutex<SampleRing>,
}

impl Default for EngineShared {
    fn default() -> Self {
        Self {
            pending: Mutex::default(),
            has_pending: AtomicBool::default(),
            next: Mutex::default(),
            next_crossfade: AtomicBool::default(),
            next_frames: AtomicU64::new(UNKNOWN_FRAMES),
            crossfade_ms: AtomicU32::default(),
            track_updates: Mutex::default(),
            has_gain_updates: AtomicBool::default(),
            current_token: AtomicU64::default(),
            transitions: AtomicU64::default(),
            finished: AtomicBool::default(),
            position_frames: AtomicU64::default(),
            eq: EqControl::default(),
            ring: Mutex::default(),
        }
    }
}

impl EngineShared {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    /// Replace whatever is playing (applied on the audio thread's next sample).
    pub fn replace(&self, prepared: Prepared) {
        self.finished.store(false, Ordering::SeqCst);
        self.position_frames.store(0, Ordering::SeqCst);
        *self.pending.lock() = Some(Pending::Replace(Box::new(prepared)));
        self.has_pending.store(true, Ordering::Release);
    }

    pub fn clear(&self) {
        self.finished.store(false, Ordering::SeqCst);
        self.position_frames.store(0, Ordering::SeqCst);
        self.set_next(None);
        *self.pending.lock() = Some(Pending::Clear);
        self.has_pending.store(true, Ordering::Release);
    }

    pub fn set_next(&self, next: Option<Prepared>) {
        let mut slot = self.next.lock();
        self.next_crossfade.store(next.as_ref().is_some_and(|p| p.crossfade), Ordering::SeqCst);
        let length = next.as_ref().and_then(|p| p.fade_end().map(|end| end.saturating_sub(p.start_frame)));
        self.next_frames.store(length.unwrap_or(UNKNOWN_FRAMES), Ordering::SeqCst);
        *slot = next;
    }

    /// Crossfade length; zero joins tracks gaplessly.
    pub fn set_crossfade(&self, duration: Duration) {
        self.crossfade_ms.store(duration.as_millis().min(u32::MAX as u128) as u32, Ordering::SeqCst);
    }

    /// New levelling gain (and, once measured, audible end) for the track with `token`,
    /// whether playing or prepared.
    pub fn update_track(&self, update: TrackUpdate) {
        if let Some(next) = self.next.lock().as_mut().filter(|n| n.token == update.token) {
            next.gain = update.gain;
            next.audible_end = update.audible_end.or(next.audible_end);
        }
        self.track_updates.lock().push(update);
        self.has_gain_updates.store(true, Ordering::Release);
    }

    pub fn finished(&self) -> bool {
        self.finished.load(Ordering::SeqCst)
    }

    pub fn transitions(&self) -> u64 {
        self.transitions.load(Ordering::SeqCst)
    }

    pub fn current_token(&self) -> u64 {
        self.current_token.load(Ordering::SeqCst)
    }

    pub fn position_frames(&self) -> u64 {
        self.position_frames.load(Ordering::Relaxed)
    }

    pub fn set_position_frames(&self, frames: u64) {
        self.position_frames.store(frames, Ordering::Relaxed);
    }

    fn take_next(&self) -> Option<Prepared> {
        let mut slot = self.next.lock();
        self.next_crossfade.store(false, Ordering::SeqCst);
        self.next_frames.store(UNKNOWN_FRAMES, Ordering::SeqCst);
        slot.take()
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TrackUpdate {
    pub token: u64,
    pub gain: f32,
    pub audible_end: Option<u64>,
}

/// A track being played.
struct Voice {
    source: TrackSource,
    token: u64,
    gain: f32,
    target_gain: f32,
    fade_end: Option<u64>,
}

impl Voice {
    fn new(prepared: Prepared) -> Self {
        Self {
            fade_end: prepared.fade_end(),
            source: prepared.source,
            token: prepared.token,
            gain: prepared.gain,
            target_gain: prepared.gain,
        }
    }
}

/// The outgoing track during a crossfade.
struct Tail {
    voice: Voice,
    position: u64,
    length: u64,
    ended: bool,
}

pub struct PlaybackSource {
    shared: Arc<EngineShared>,
    current: Option<Voice>,
    tail: Option<Tail>,
    channels: ChannelCount,
    sample_rate: SampleRate,
    eq: Equalizer,
    /// Channel index of the next sample written to the device.
    out_channel: u16,
    /// A new track must start on a frame boundary.
    align: bool,
    frames: u64,
    /// Equal-power crossfade coefficients for the current frame.
    fade_in: f32,
    fade_out: f32,
    gain_smoothing: f32,
    eq_countdown: u32,
    mono: Vec<f32>,
    frame_acc: f32,
}

impl PlaybackSource {
    pub fn new(shared: Arc<EngineShared>, channels: ChannelCount, sample_rate: SampleRate) -> Self {
        {
            let mut ring = shared.ring.lock();
            ring.clear();
            ring.sample_rate = sample_rate.get();
        }
        let mut eq = Equalizer::new(sample_rate.get(), channels.get());
        eq.refresh(&shared.eq);
        Self {
            shared,
            current: None,
            tail: None,
            channels,
            sample_rate,
            eq,
            out_channel: 0,
            align: false,
            frames: 0,
            fade_in: 1.0,
            fade_out: 0.0,
            gain_smoothing: 1.0 - (-1.0 / (GAIN_SMOOTHING_SECS * sample_rate.get() as f32)).exp(),
            eq_countdown: 0,
            mono: Vec::with_capacity(RING_BATCH),
            frame_acc: 0.0,
        }
    }

    fn start(&mut self, prepared: Prepared) {
        self.shared.current_token.store(prepared.token, Ordering::SeqCst);
        self.frames = prepared.start_frame;
        self.current = Some(Voice::new(prepared));
        self.shared.finished.store(false, Ordering::SeqCst);
        self.shared.set_position_frames(self.frames);
        self.align = self.out_channel != 0;
    }

    fn drop_tail(&mut self) {
        self.tail = None;
        self.fade_in = 1.0;
        self.fade_out = 0.0;
    }

    fn apply_pending(&mut self) {
        if !self.shared.has_pending.swap(false, Ordering::Acquire) {
            return;
        }
        let pending = self.shared.pending.lock().take();
        match pending {
            Some(Pending::Replace(p)) => {
                self.eq.reset();
                self.drop_tail();
                self.start(*p);
            }
            Some(Pending::Clear) => {
                self.drop_tail();
                self.current = None;
                self.shared.current_token.store(0, Ordering::SeqCst);
            }
            None => {}
        }
        self.mono.clear();
        self.shared.ring.lock().clear();
    }

    fn apply_gain_updates(&mut self) {
        if !self.shared.has_gain_updates.swap(false, Ordering::Acquire) {
            return;
        }
        let updates = std::mem::take(&mut *self.shared.track_updates.lock());
        for update in updates {
            let tail = self.tail.as_mut().map(|t| &mut t.voice);
            for voice in self.current.iter_mut().chain(tail).filter(|v| v.token == update.token) {
                voice.target_gain = update.gain;
                voice.fade_end = update.audible_end.or(voice.fade_end);
            }
        }
    }

    /// Crossfade length from the current track into the prepared one, in frames.
    /// `total` is where the current track's audible content ends.
    fn crossfade_frames(&self, total: u64) -> u64 {
        let ms = self.shared.crossfade_ms.load(Ordering::Relaxed) as u64;
        if ms == 0 || !self.shared.next_crossfade.load(Ordering::Relaxed) {
            return 0;
        }
        let wanted = ms * self.sample_rate.get() as u64 / 1000;
        // Never let the fade take more than half of either track.
        let next = self.shared.next_frames.load(Ordering::Relaxed);
        wanted.min(total / 2).min(next / 2)
    }

    /// Per-frame bookkeeping, run before the first sample of every frame.
    fn begin_frame(&mut self) {
        let k = self.gain_smoothing;
        if let Some(v) = self.current.as_mut() {
            v.gain += (v.target_gain - v.gain) * k;
        }
        if let Some(tail) = self.tail.as_mut() {
            tail.voice.gain += (tail.voice.target_gain - tail.voice.gain) * k;
            tail.position += 1;
            if tail.ended || tail.position >= tail.length {
                self.drop_tail();
            } else {
                let t = tail.position as f32 / tail.length as f32 * std::f32::consts::FRAC_PI_2;
                self.fade_in = t.sin();
                self.fade_out = t.cos();
            }
            return;
        }
        // The fade ends where the outgoing track's sound ends, skipping trailing silence.
        let Some(end) = self.current.as_ref().and_then(|v| v.fade_end) else { return };
        let fade = self.crossfade_frames(end);
        let remaining = end.saturating_sub(self.frames);
        if fade == 0 || remaining > fade {
            return;
        }
        if !self.shared.next.lock().as_ref().is_some_and(|n| n.crossfade) {
            return;
        }
        let Some(next) = self.shared.take_next() else { return };
        let outgoing = self.current.take().expect("checked above");
        // The outgoing track fades to silence exactly where its sound ends.
        let length = remaining.max(self.sample_rate.get() as u64 / 20);
        self.tail = Some(Tail { voice: outgoing, position: 0, length, ended: false });
        self.fade_in = 0.0;
        self.fade_out = 1.0;
        self.start(next);
        self.shared.transitions.fetch_add(1, Ordering::SeqCst);
    }

    /// The outgoing track's contribution to the current sample.
    #[inline]
    fn tail_sample(&mut self) -> f32 {
        let Some(tail) = self.tail.as_mut() else { return 0.0 };
        if tail.ended {
            return 0.0;
        }
        match tail.voice.source.next() {
            Some(s) => s * tail.voice.gain * self.fade_out,
            None => {
                tail.ended = true;
                0.0
            }
        }
    }

    /// Emit silence while keeping the interleaving aligned.
    #[inline]
    fn silence(&mut self) -> Sample {
        self.advance_channel();
        0.0
    }

    #[inline]
    fn advance_channel(&mut self) -> bool {
        self.out_channel += 1;
        if self.out_channel >= self.channels.get() {
            self.out_channel = 0;
            true
        } else {
            false
        }
    }

    #[inline]
    fn emit(&mut self, sample: Sample) -> Sample {
        let channel = self.out_channel as usize;
        let out = self.eq.process(sample, channel);
        self.frame_acc += out;
        if self.advance_channel() {
            self.mono.push(self.frame_acc / self.channels.get() as f32);
            self.frame_acc = 0.0;
            self.frames += 1;
            if self.frames % POSITION_STRIDE == 0 {
                self.shared.set_position_frames(self.frames);
            }
            if self.mono.len() >= RING_BATCH {
                if let Some(mut ring) = self.shared.ring.try_lock() {
                    ring.push_slice(&self.mono);
                }
                self.mono.clear();
            }
        }
        out
    }
}

impl Iterator for PlaybackSource {
    type Item = Sample;

    #[inline]
    fn next(&mut self) -> Option<Sample> {
        if self.shared.has_pending.load(Ordering::Relaxed) {
            self.apply_pending();
        }
        if self.shared.has_gain_updates.load(Ordering::Relaxed) {
            self.apply_gain_updates();
        }
        if self.eq_countdown == 0 {
            self.eq.refresh(&self.shared.eq);
            self.eq_countdown = EQ_REFRESH_STRIDE;
        }
        self.eq_countdown -= 1;

        if self.align {
            if self.out_channel != 0 {
                return Some(self.silence());
            }
            self.align = false;
        }
        if self.out_channel == 0 {
            self.begin_frame();
        }
        loop {
            let Some(current) = self.current.as_mut() else {
                if self.tail.is_some() {
                    let s = self.tail_sample();
                    return Some(self.emit(s));
                }
                return Some(self.silence());
            };
            if let Some(sample) = current.source.next() {
                let mut sample = sample * current.gain;
                if self.tail.is_some() {
                    sample = soft_clip(sample * self.fade_in + self.tail_sample());
                }
                return Some(self.emit(sample));
            }
            // Current track ended: continue with the prepared next track on this very sample.
            self.current = None;
            self.shared.set_position_frames(self.frames);
            match self.shared.take_next() {
                Some(prepared) => {
                    self.start(prepared);
                    self.shared.transitions.fetch_add(1, Ordering::SeqCst);
                    if self.align {
                        return Some(self.silence());
                    }
                }
                None => {
                    self.shared.finished.store(true, Ordering::SeqCst);
                    if self.tail.is_some() {
                        let s = self.tail_sample();
                        return Some(self.emit(s));
                    }
                    return Some(self.silence());
                }
            }
        }
    }
}

impl Source for PlaybackSource {
    fn current_span_len(&self) -> Option<usize> {
        None
    }

    fn channels(&self) -> ChannelCount {
        self.channels
    }

    fn sample_rate(&self) -> SampleRate {
        self.sample_rate
    }

    fn total_duration(&self) -> Option<Duration> {
        None
    }

    fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
        // A track posted while paused must be in place before it can be sought.
        self.apply_pending();
        let Some(current) = self.current.as_mut() else { return Ok(()) };
        current.source.try_seek(pos)?;
        current.gain = current.target_gain;
        self.drop_tail();
        self.frames = (pos.as_secs_f64() * self.sample_rate.get() as f64) as u64;
        self.shared.set_position_frames(self.frames);
        self.shared.finished.store(false, Ordering::SeqCst);
        self.eq.reset();
        self.mono.clear();
        self.shared.ring.lock().clear();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::num::NonZero;

    use crate::audio::eq::EqSettings;

    fn wav(path: &std::path::Path, channels: u16, rate: u32, frames: usize, value: i16) {
        let data_len = (frames * channels as usize * 2) as u32;
        let mut b = Vec::new();
        b.extend_from_slice(b"RIFF");
        b.extend_from_slice(&(36 + data_len).to_le_bytes());
        b.extend_from_slice(b"WAVEfmt ");
        b.extend_from_slice(&16u32.to_le_bytes());
        b.extend_from_slice(&1u16.to_le_bytes());
        b.extend_from_slice(&channels.to_le_bytes());
        b.extend_from_slice(&rate.to_le_bytes());
        b.extend_from_slice(&(rate * channels as u32 * 2).to_le_bytes());
        b.extend_from_slice(&(channels * 2).to_le_bytes());
        b.extend_from_slice(&16u16.to_le_bytes());
        b.extend_from_slice(b"data");
        b.extend_from_slice(&data_len.to_le_bytes());
        for _ in 0..frames * channels as usize {
            b.extend_from_slice(&value.to_le_bytes());
        }
        std::fs::write(path, b).unwrap();
    }

    fn prepared(path: &std::path::Path, token: u64, channels: u16, rate: u32) -> Prepared {
        let file = BufReader::new(File::open(path).unwrap());
        let decoder = Decoder::builder().with_data(file).with_hint("wav").with_seekable(true).build().unwrap();
        let source = to_output_format(decoder, NonZero::new(channels).unwrap(), NonZero::new(rate).unwrap());
        let frames = source.total_duration().map(|d| (d.as_secs_f64() * rate as f64).round() as u64);
        Prepared { source, token, gain: 1.0, frames, audible_end: None, start_frame: 0, crossfade: false }
    }

    fn engine(channels: u16, rate: u32) -> (Arc<EngineShared>, PlaybackSource) {
        let shared = EngineShared::new();
        let source = PlaybackSource::new(shared.clone(), NonZero::new(channels).unwrap(), NonZero::new(rate).unwrap());
        (shared, source)
    }

    #[test]
    fn idle_stream_is_silent_and_never_ends() {
        let (shared, mut src) = engine(2, 48_000);
        assert!((0..1000).all(|_| src.next() == Some(0.0)));
        assert!(!shared.finished());
    }

    #[test]
    fn next_track_starts_on_the_very_next_frame() {
        let dir = tempfile::tempdir().unwrap();
        let (a, b) = (dir.path().join("a.wav"), dir.path().join("b.wav"));
        wav(&a, 2, 48_000, 300, 8_000);
        wav(&b, 2, 48_000, 200, -8_000);
        let (shared, mut src) = engine(2, 48_000);
        shared.replace(prepared(&a, 1, 2, 48_000));
        shared.set_next(Some(prepared(&b, 2, 2, 48_000)));

        let out: Vec<f32> = (0..1200).map(|_| src.next().unwrap()).collect();
        // 300 stereo frames of A (600 samples), immediately 200 frames of B, then silence.
        assert!(out[..600].iter().all(|&s| s > 0.2), "A is continuous");
        assert!(out[600..1000].iter().all(|&s| s < -0.2), "B follows with no gap");
        assert!(out[1000..].iter().all(|&s| s == 0.0));
        assert_eq!(shared.transitions(), 1);
        assert_eq!(shared.current_token(), 2);
        assert!(shared.finished());
    }

    #[test]
    fn mismatched_formats_are_converted_to_the_output_format() {
        let dir = tempfile::tempdir().unwrap();
        let (a, b) = (dir.path().join("mono.wav"), dir.path().join("stereo.wav"));
        wav(&a, 1, 22_050, 2_205, 8_000); // 0.1 s mono
        wav(&b, 2, 44_100, 4_410, 8_000); // 0.1 s stereo
        let (shared, mut src) = engine(2, 48_000);
        shared.replace(prepared(&a, 1, 2, 48_000));
        shared.set_next(Some(prepared(&b, 2, 2, 48_000)));
        // Count audible samples; the call that reports the end returns one silent sample.
        let mut n = 0;
        while n < 100_000 {
            src.next();
            if shared.finished() {
                break;
            }
            n += 1;
        }
        // ~0.2 s of stereo at 48 kHz = ~19 200 samples; both tracks played, nothing lost.
        assert!((18_800..19_600).contains(&n), "{n} samples");
        assert_eq!(n % 2, 0, "stream stays frame-aligned");
    }

    #[test]
    fn replace_takes_effect_immediately_and_position_restarts() {
        let dir = tempfile::tempdir().unwrap();
        let (a, b) = (dir.path().join("a.wav"), dir.path().join("b.wav"));
        wav(&a, 2, 48_000, 48_000, 8_000);
        wav(&b, 2, 48_000, 48_000, -8_000);
        let (shared, mut src) = engine(2, 48_000);
        shared.replace(prepared(&a, 1, 2, 48_000));
        for _ in 0..2_001 {
            src.next();
        }
        shared.replace(prepared(&b, 2, 2, 48_000));
        let first = src.next().unwrap();
        let second = src.next().unwrap();
        // The odd sample count leaves one right-channel pad before B starts.
        assert_eq!(first, 0.0);
        assert!(second < -0.2);
        assert_eq!(shared.current_token(), 2);
        assert_eq!(shared.transitions(), 0, "a replacement is not a natural transition");
    }

    #[test]
    fn seek_moves_position_and_clear_returns_to_silence() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.wav");
        wav(&a, 2, 48_000, 96_000, 8_000);
        let (shared, mut src) = engine(2, 48_000);
        shared.replace(prepared(&a, 7, 2, 48_000));
        src.try_seek(Duration::from_millis(1_500)).unwrap();
        assert_eq!(shared.position_frames(), 72_000);
        assert!(src.next().unwrap() > 0.2);
        shared.clear();
        assert_eq!(src.next(), Some(0.0));
        assert_eq!(shared.current_token(), 0);
    }

    #[test]
    fn equalizer_changes_reach_the_stream() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.wav");
        wav(&a, 1, 48_000, 48_000, 8_000);
        let (shared, mut src) = engine(1, 48_000);
        shared.replace(prepared(&a, 1, 1, 48_000));
        let plain = src.next().unwrap();
        shared.eq.set(EqSettings { enabled: true, preamp_db: -6.0, ..Default::default() });
        let mut quieter = plain;
        for _ in 0..(EQ_REFRESH_STRIDE as usize + 10) {
            quieter = src.next().unwrap();
        }
        assert!((quieter / plain - 0.501).abs() < 0.01, "{plain} -> {quieter}");
    }

    fn with(mut p: Prepared, gain: f32, crossfade: bool) -> Prepared {
        p.gain = gain;
        p.crossfade = crossfade;
        p
    }

    #[test]
    fn levelling_gain_scales_and_changes_without_clicks() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.wav");
        wav(&a, 1, 48_000, 48_000, 8_000);
        let (shared, mut src) = engine(1, 48_000);
        shared.replace(with(prepared(&a, 1, 1, 48_000), 0.5, false));
        let first = src.next().unwrap();
        assert!((first - 0.122).abs() < 0.002, "{first}");
        shared.update_track(TrackUpdate { token: 1, gain: 1.0, audible_end: None });
        let out: Vec<f32> = (0..24_000).map(|_| src.next().unwrap()).collect();
        let biggest_step = out.windows(2).map(|w| (w[1] - w[0]).abs()).fold(0.0, f32::max);
        assert!(biggest_step < 0.001, "ramped, not stepped: {biggest_step}");
        assert!((out[23_999] - 0.244).abs() < 0.002, "reached the new gain: {}", out[23_999]);
        shared.update_track(TrackUpdate { token: 99, gain: 0.1, audible_end: None });
        assert!((src.next().unwrap() - 0.244).abs() < 0.002, "other tokens are ignored");
    }

    /// Plays everything out and returns the samples until the queue finishes.
    fn drain(shared: &EngineShared, src: &mut PlaybackSource, max: usize) -> Vec<f32> {
        let mut out = Vec::new();
        while out.len() < max {
            let s = src.next().unwrap();
            if shared.finished() {
                break;
            }
            out.push(s);
        }
        out
    }

    #[test]
    fn crossfade_overlaps_the_tracks_with_equal_power() {
        let dir = tempfile::tempdir().unwrap();
        let (a, b) = (dir.path().join("a.wav"), dir.path().join("b.wav"));
        wav(&a, 1, 48_000, 96_000, 8_000); // 2 s at 0.244
        wav(&b, 1, 48_000, 144_000, 16_000); // 3 s at 0.488
        let (shared, mut src) = engine(1, 48_000);
        shared.set_crossfade(Duration::from_secs(1));
        shared.replace(prepared(&a, 1, 1, 48_000));
        shared.set_next(Some(with(prepared(&b, 2, 1, 48_000), 1.0, true)));

        let out = drain(&shared, &mut src, 400_000);
        // 2 s + 3 s with 1 s shared.
        assert_eq!(out.len(), 4 * 48_000, "{}", out.len());
        assert!(out[..47_999].iter().all(|&s| (s - 0.244).abs() < 0.001), "A alone before the fade");
        let mid = out[72_000];
        let expected = (0.244 + 0.488) * std::f32::consts::FRAC_1_SQRT_2;
        assert!((mid - expected).abs() < 0.003, "{mid} vs {expected}");
        // Smooth throughout, and never above the equal-power envelope sqrt(a^2 + b^2).
        let fade = &out[47_990..96_010];
        assert!(fade.windows(2).all(|w| (w[1] - w[0]).abs() < 1e-4), "no steps in the fade");
        let envelope = (0.244f32.powi(2) + 0.488f32.powi(2)).sqrt();
        assert!(fade.iter().all(|&s| s <= envelope + 0.001));
        assert!(out[96_100..].iter().all(|&s| (s - 0.488).abs() < 0.001), "B alone after the fade");
        assert_eq!(shared.transitions(), 1);
        assert_eq!(shared.current_token(), 2);
    }

    #[test]
    fn crossfade_reports_the_switch_when_it_starts() {
        let dir = tempfile::tempdir().unwrap();
        let (a, b) = (dir.path().join("a.wav"), dir.path().join("b.wav"));
        wav(&a, 2, 48_000, 96_000, 8_000);
        wav(&b, 2, 48_000, 96_000, 8_000);
        let (shared, mut src) = engine(2, 48_000);
        shared.set_crossfade(Duration::from_secs(1));
        shared.replace(prepared(&a, 1, 2, 48_000));
        shared.set_next(Some(with(prepared(&b, 2, 2, 48_000), 1.0, true)));
        for _ in 0..(2 * 48_000 - 2) {
            src.next();
        }
        assert_eq!(shared.transitions(), 0);
        for _ in 0..4 {
            src.next();
        }
        assert_eq!(shared.transitions(), 1, "B is now the current track");
        assert_eq!(shared.current_token(), 2);
        assert!(shared.position_frames() < 10, "position restarts for the incoming track");
        // Seeking during the fade drops the outgoing track at once.
        src.try_seek(Duration::from_millis(100)).unwrap();
        let s = src.next().unwrap();
        assert!((s - 0.244).abs() < 0.001, "only B is heard: {s}");
    }

    #[test]
    fn crossfade_is_skipped_when_not_requested_and_capped_for_short_tracks() {
        let dir = tempfile::tempdir().unwrap();
        let (a, b) = (dir.path().join("a.wav"), dir.path().join("b.wav"));
        wav(&a, 1, 48_000, 48_000, 8_000); // 1 s
        wav(&b, 1, 48_000, 19_200, 8_000); // 0.4 s
        // Album-style join: gapless even though a crossfade length is set.
        let (shared, mut src) = engine(1, 48_000);
        shared.set_crossfade(Duration::from_secs(5));
        shared.replace(prepared(&a, 1, 1, 48_000));
        shared.set_next(Some(prepared(&b, 2, 1, 48_000)));
        assert_eq!(drain(&shared, &mut src, 200_000).len(), 48_000 + 19_200);
        // Requested: the fade is limited to half of the shorter track (0.2 s).
        let (shared, mut src) = engine(1, 48_000);
        shared.set_crossfade(Duration::from_secs(5));
        shared.replace(prepared(&a, 1, 1, 48_000));
        shared.set_next(Some(with(prepared(&b, 2, 1, 48_000), 1.0, true)));
        assert_eq!(drain(&shared, &mut src, 200_000).len(), 48_000 + 19_200 - 9_600);
    }

    #[test]
    fn crossfade_skips_silence_at_both_ends() {
        let dir = tempfile::tempdir().unwrap();
        let (a, b) = (dir.path().join("a.wav"), dir.path().join("b.wav"));
        wav(&a, 1, 48_000, 96_000, 8_000); // 2 s; pretend its last 0.5 s are silent
        wav(&b, 1, 48_000, 96_000, 16_000); // 2 s; pretend its first 0.25 s are silent
        let (shared, mut src) = engine(1, 48_000);
        shared.set_crossfade(Duration::from_millis(500));
        let mut first = prepared(&a, 1, 1, 48_000);
        first.audible_end = Some(72_000);
        shared.replace(first);
        let mut second = with(prepared(&b, 2, 1, 48_000), 1.0, true);
        second.source.try_seek(Duration::from_millis(250)).unwrap();
        second.start_frame = 12_000;
        shared.set_next(Some(second));

        let out = drain(&shared, &mut src, 400_000);
        // A until 1.0 s, fade 1.0–1.5 s ending where A's sound ends, then the rest of B
        // from 0.75 s (0.25 s skipped + 0.5 s faded).
        assert_eq!(out.len(), 72_000 + 96_000 - 12_000 - 24_000, "{}", out.len());
        assert!(out[..47_999].iter().all(|&s| (s - 0.244).abs() < 0.001));
        assert!(out[72_100..].iter().all(|&s| (s - 0.488).abs() < 0.001), "A's trailing silence is skipped");
        assert_eq!(shared.position_frames(), 96_000, "B's clock includes the skipped lead-in");
    }
}
