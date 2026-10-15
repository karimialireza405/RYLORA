//! Ten-band graphic equalizer applied to the decoded stream.
//!
//! Filters are RBJ "Audio EQ Cookbook" biquads: a low shelf at 31 Hz, peaking
//! filters in between and a high shelf at 16 kHz. Settings are shared with the
//! audio thread through [`EqControl`]; the stream picks up changes without locks
//! on the hot path.

use std::f32::consts::PI;
use std::sync::atomic::{AtomicU64, Ordering};

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

pub const BAND_COUNT: usize = 10;
pub const BAND_FREQUENCIES: [f32; BAND_COUNT] = [31.0, 62.0, 125.0, 250.0, 500.0, 1_000.0, 2_000.0, 4_000.0, 8_000.0, 16_000.0];
pub const GAIN_LIMIT_DB: f32 = 12.0;
/// One octave between band centres; Q ≈ 1.41 gives each band a one-octave width.
const PEAK_Q: f32 = std::f32::consts::SQRT_2;
const SHELF_SLOPE: f32 = 1.0;
const MAX_CHANNELS: usize = 8;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EqSettings {
    pub enabled: bool,
    pub preamp_db: f32,
    pub gains_db: [f32; BAND_COUNT],
}

impl Default for EqSettings {
    fn default() -> Self {
        Self { enabled: false, preamp_db: 0.0, gains_db: [0.0; BAND_COUNT] }
    }
}

impl EqSettings {
    /// Clamp every value into range; non-finite input becomes 0 dB.
    pub fn sanitized(mut self) -> Self {
        let fix = |v: f32| if v.is_finite() { v.clamp(-GAIN_LIMIT_DB, GAIN_LIMIT_DB) } else { 0.0 };
        self.preamp_db = fix(self.preamp_db);
        for g in &mut self.gains_db {
            *g = fix(*g);
        }
        self
    }

    /// True when processing would not change the signal.
    pub fn is_transparent(&self) -> bool {
        !self.enabled || (self.preamp_db.abs() < 0.01 && self.gains_db.iter().all(|g| g.abs() < 0.01))
    }
}

/// Settings shared between the player thread (writer) and the audio thread (reader).
#[derive(Default)]
pub struct EqControl {
    settings: Mutex<EqSettings>,
    version: AtomicU64,
}

impl EqControl {
    pub fn set(&self, settings: EqSettings) {
        *self.settings.lock() = settings.sanitized();
        self.version.fetch_add(1, Ordering::Release);
    }

    pub fn get(&self) -> EqSettings {
        *self.settings.lock()
    }

    fn version(&self) -> u64 {
        self.version.load(Ordering::Acquire)
    }
}

#[derive(Debug, Clone, Copy, Default)]
struct Coefficients {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
}

#[derive(Debug, Clone, Copy)]
enum Kind {
    LowShelf,
    Peak,
    HighShelf,
}

impl Coefficients {
    fn new(kind: Kind, freq: f32, gain_db: f32, sample_rate: f32) -> Self {
        let a = 10f32.powf(gain_db / 40.0);
        let w0 = 2.0 * PI * (freq / sample_rate).min(0.49);
        let (sin, cos) = w0.sin_cos();
        let (b0, b1, b2, a0, a1, a2) = match kind {
            Kind::Peak => {
                let alpha = sin / (2.0 * PEAK_Q);
                (1.0 + alpha * a, -2.0 * cos, 1.0 - alpha * a, 1.0 + alpha / a, -2.0 * cos, 1.0 - alpha / a)
            }
            Kind::LowShelf | Kind::HighShelf => {
                let alpha = sin / 2.0 * ((a + 1.0 / a) * (1.0 / SHELF_SLOPE - 1.0) + 2.0).sqrt();
                let sq = 2.0 * a.sqrt() * alpha;
                if matches!(kind, Kind::LowShelf) {
                    (
                        a * ((a + 1.0) - (a - 1.0) * cos + sq),
                        2.0 * a * ((a - 1.0) - (a + 1.0) * cos),
                        a * ((a + 1.0) - (a - 1.0) * cos - sq),
                        (a + 1.0) + (a - 1.0) * cos + sq,
                        -2.0 * ((a - 1.0) + (a + 1.0) * cos),
                        (a + 1.0) + (a - 1.0) * cos - sq,
                    )
                } else {
                    (
                        a * ((a + 1.0) + (a - 1.0) * cos + sq),
                        -2.0 * a * ((a - 1.0) + (a + 1.0) * cos),
                        a * ((a + 1.0) + (a - 1.0) * cos - sq),
                        (a + 1.0) - (a - 1.0) * cos + sq,
                        2.0 * ((a - 1.0) - (a + 1.0) * cos),
                        (a + 1.0) - (a - 1.0) * cos - sq,
                    )
                }
            }
        };
        Self { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
    }
}

/// Transposed direct form II state for one filter on one channel.
#[derive(Debug, Clone, Copy, Default)]
struct State {
    z1: f32,
    z2: f32,
}

/// Per-stream filter bank. Owned by the audio thread.
pub struct Equalizer {
    sample_rate: f32,
    channels: usize,
    seen_version: u64,
    active: bool,
    preamp: f32,
    /// Only bands with non-zero gain are processed.
    bands: Vec<Coefficients>,
    state: Vec<[State; MAX_CHANNELS]>,
}

impl Equalizer {
    pub fn new(sample_rate: u32, channels: u16) -> Self {
        Self {
            sample_rate: sample_rate as f32,
            channels: (channels as usize).clamp(1, MAX_CHANNELS),
            seen_version: u64::MAX,
            active: false,
            preamp: 1.0,
            bands: Vec::with_capacity(BAND_COUNT),
            state: Vec::with_capacity(BAND_COUNT),
        }
    }

    /// Pick up new settings if they changed. Cheap when nothing changed.
    pub fn refresh(&mut self, control: &EqControl) {
        let version = control.version();
        if version == self.seen_version {
            return;
        }
        self.seen_version = version;
        self.configure(&control.get());
    }

    pub fn configure(&mut self, settings: &EqSettings) {
        self.active = !settings.is_transparent();
        self.preamp = 10f32.powf(settings.preamp_db / 20.0);
        let old_len = self.bands.len();
        self.bands.clear();
        for (i, (&freq, &gain)) in BAND_FREQUENCIES.iter().zip(&settings.gains_db).enumerate() {
            if gain.abs() < 0.01 {
                continue;
            }
            let kind = match i {
                0 => Kind::LowShelf,
                i if i == BAND_COUNT - 1 => Kind::HighShelf,
                _ => Kind::Peak,
            };
            self.bands.push(Coefficients::new(kind, freq, gain, self.sample_rate));
        }
        // Keep filter memory when only gains move (avoids clicks while dragging a slider).
        if self.bands.len() != old_len {
            self.state = vec![[State::default(); MAX_CHANNELS]; self.bands.len()];
        }
    }

    pub fn reset(&mut self) {
        for s in &mut self.state {
            *s = [State::default(); MAX_CHANNELS];
        }
    }

    /// Process one sample of the given interleaved channel.
    #[inline]
    pub fn process(&mut self, sample: f32, channel: usize) -> f32 {
        if !self.active {
            return sample;
        }
        let ch = channel % self.channels;
        let mut x = sample * self.preamp;
        for (c, state) in self.bands.iter().zip(self.state.iter_mut()) {
            let s = &mut state[ch];
            let y = c.b0 * x + s.z1;
            s.z1 = c.b1 * x - c.a1 * y + s.z2;
            s.z2 = c.b2 * x - c.a2 * y;
            x = y;
        }
        // Boosts can exceed full scale; clip softly rather than wrapping or hard-clipping.
        if x.abs() > 0.9 {
            x.signum() * (0.9 + 0.1 * ((x.abs() - 0.9) / 0.1).tanh())
        } else {
            x
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 48_000;

    /// Peak amplitude of a sine at `freq` after the equalizer has settled.
    fn response(settings: &EqSettings, freq: f32) -> f32 {
        let mut eq = Equalizer::new(RATE, 1);
        eq.configure(settings);
        let n = RATE as usize / 2;
        let mut peak = 0f32;
        for i in 0..n {
            let x = 0.1 * (2.0 * PI * freq * i as f32 / RATE as f32).sin();
            let y = eq.process(x, 0);
            if i > n / 2 {
                peak = peak.max(y.abs());
            }
        }
        peak / 0.1
    }

    fn db(ratio: f32) -> f32 {
        20.0 * ratio.log10()
    }

    #[test]
    fn disabled_or_flat_is_bit_transparent() {
        let mut eq = Equalizer::new(RATE, 2);
        eq.configure(&EqSettings { enabled: true, ..Default::default() });
        assert_eq!(eq.process(0.37, 0), 0.37);
        let mut boosted = EqSettings { enabled: false, ..Default::default() };
        boosted.gains_db[5] = 9.0;
        eq.configure(&boosted);
        assert_eq!(eq.process(-0.5, 1), -0.5);
    }

    #[test]
    fn peaking_band_boosts_its_centre_and_spares_distant_frequencies() {
        let mut s = EqSettings { enabled: true, ..Default::default() };
        s.gains_db[5] = 6.0; // 1 kHz
        assert!((db(response(&s, 1_000.0)) - 6.0).abs() < 0.3, "{}", db(response(&s, 1_000.0)));
        assert!(db(response(&s, 100.0)).abs() < 0.5);
        assert!(db(response(&s, 12_000.0)).abs() < 0.5);
    }

    #[test]
    fn shelves_and_cuts_follow_their_sign() {
        let mut s = EqSettings { enabled: true, ..Default::default() };
        s.gains_db[0] = 8.0;
        s.gains_db[9] = -8.0;
        // Shelves reach half their gain at the corner and full gain well past it.
        assert!(db(response(&s, 12.0)) > 7.0);
        assert!((db(response(&s, 31.0)) - 4.0).abs() < 0.3);
        assert!(db(response(&s, 19_000.0)) < -6.5);
        assert!(db(response(&s, 1_000.0)).abs() < 0.1);
    }

    #[test]
    fn preamp_scales_the_signal() {
        let s = EqSettings { enabled: true, preamp_db: -6.0, ..Default::default() };
        assert!((db(response(&s, 440.0)) + 6.0).abs() < 0.1);
    }

    #[test]
    fn output_never_exceeds_full_scale() {
        let mut s = EqSettings { enabled: true, preamp_db: 12.0, ..Default::default() };
        s.gains_db = [12.0; BAND_COUNT];
        let mut eq = Equalizer::new(RATE, 1);
        eq.configure(&s);
        for i in 0..RATE {
            let y = eq.process((2.0 * PI * 100.0 * i as f32 / RATE as f32).sin(), 0);
            assert!(y.is_finite() && y.abs() <= 1.0, "sample {i}: {y}");
        }
    }

    #[test]
    fn settings_are_sanitized() {
        let mut s = EqSettings { enabled: true, preamp_db: f32::NAN, ..Default::default() };
        s.gains_db[2] = 40.0;
        s.gains_db[3] = -40.0;
        let s = s.sanitized();
        assert_eq!(s.preamp_db, 0.0);
        assert_eq!(s.gains_db[2], GAIN_LIMIT_DB);
        assert_eq!(s.gains_db[3], -GAIN_LIMIT_DB);
    }

    #[test]
    fn control_versions_changes_for_the_audio_thread() {
        let control = EqControl::default();
        let mut eq = Equalizer::new(RATE, 1);
        eq.refresh(&control);
        assert!(!eq.active);
        let mut s = EqSettings { enabled: true, ..Default::default() };
        s.gains_db[4] = 3.0;
        control.set(s);
        eq.refresh(&control);
        assert!(eq.active && eq.bands.len() == 1);
    }
}

