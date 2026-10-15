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
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use rodio::source::{SeekError, UniformSourceIterator};
use rodio::{ChannelCount, Decoder, Sample, SampleRate, Source};

use super::eq::{EqControl, Equalizer};
use super::spectrum::SampleRing;

pub type TrackSource = UniformSourceIterator<SteadySpan<Decoder<BufReader<File>>>>;

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
}

enum Pending {
    Replace(Box<Prepared>),
    Clear,
}

const RING_BATCH: usize = 512;
const POSITION_STRIDE: u64 = 256;
const EQ_REFRESH_STRIDE: u32 = 1024;

#[derive(Default)]
pub struct EngineShared {
    pending: Mutex<Option<Pending>>,
    has_pending: AtomicBool,
    next: Mutex<Option<Prepared>>,
    current_token: AtomicU64,
    transitions: AtomicU64,
    finished: AtomicBool,
    position_frames: AtomicU64,
    pub eq: EqControl,
    pub ring: Mutex<SampleRing>,
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
        *self.next.lock() = None;
        *self.pending.lock() = Some(Pending::Clear);
        self.has_pending.store(true, Ordering::Release);
    }

    pub fn set_next(&self, next: Option<Prepared>) {
        *self.next.lock() = next;
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
}

pub struct PlaybackSource {
    shared: Arc<EngineShared>,
    current: Option<TrackSource>,
    channels: ChannelCount,
    sample_rate: SampleRate,
    eq: Equalizer,
    /// Channel index of the next sample written to the device.
    out_channel: u16,
    /// A new track must start on a frame boundary.
    align: bool,
    frames: u64,
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
            channels,
            sample_rate,
            eq,
            out_channel: 0,
            align: false,
            frames: 0,
            eq_countdown: 0,
            mono: Vec::with_capacity(RING_BATCH),
            frame_acc: 0.0,
        }
    }

    fn start(&mut self, prepared: Prepared) {
        self.current = Some(prepared.source);
        self.shared.current_token.store(prepared.token, Ordering::SeqCst);
        self.shared.finished.store(false, Ordering::SeqCst);
        self.frames = 0;
        self.shared.set_position_frames(0);
        self.align = self.out_channel != 0;
    }

    fn apply_pending(&mut self) {
        if !self.shared.has_pending.swap(false, Ordering::Acquire) {
            return;
        }
        let pending = self.shared.pending.lock().take();
        match pending {
            Some(Pending::Replace(p)) => {
                self.eq.reset();
                self.start(*p);
            }
            Some(Pending::Clear) => {
                self.current = None;
                self.shared.current_token.store(0, Ordering::SeqCst);
            }
            None => {}
        }
        self.mono.clear();
        self.shared.ring.lock().clear();
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
        if self.eq_countdown == 0 {
            self.eq.refresh(&self.shared.eq);
            self.eq_countdown = EQ_REFRESH_STRIDE;
        }
        self.eq_countdown -= 1;

        loop {
            if self.align {
                if self.out_channel != 0 {
                    return Some(self.silence());
                }
                self.align = false;
            }
            let Some(current) = self.current.as_mut() else {
                return Some(self.silence());
            };
            if let Some(sample) = current.next() {
                return Some(self.emit(sample));
            }
            // Current track ended: continue with the prepared next track on this very sample.
            self.current = None;
            self.shared.set_position_frames(self.frames);
            let next = self.shared.next.lock().take();
            match next {
                Some(prepared) => {
                    self.start(prepared);
                    self.shared.transitions.fetch_add(1, Ordering::SeqCst);
                }
                None => {
                    self.shared.finished.store(true, Ordering::SeqCst);
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
        current.try_seek(pos)?;
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
        Prepared {
            source: to_output_format(decoder, NonZero::new(channels).unwrap(), NonZero::new(rate).unwrap()),
            token,
        }
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
}
