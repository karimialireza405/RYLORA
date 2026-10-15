//! Real-time spectrum analysis of the samples actually being played.
//!
//! The audio thread pushes mono samples into a [`SampleRing`]; the player thread
//! periodically runs an FFT over the most recent window and maps magnitudes into
//! logarithmically spaced bands normalised to `0..=255`.

use std::f32::consts::PI;

pub const FFT_SIZE: usize = 2048;
pub const BAND_COUNT: usize = 64;
const MIN_FREQ: f32 = 35.0;
const MAX_FREQ: f32 = 16_000.0;
const FLOOR_DB: f32 = -72.0;
const CEIL_DB: f32 = -6.0;

/// Fixed-size ring of the most recent mono samples.
pub struct SampleRing {
    buf: Vec<f32>,
    write: usize,
    filled: bool,
    pub sample_rate: u32,
}

impl SampleRing {
    pub fn new() -> Self {
        Self { buf: vec![0.0; FFT_SIZE], write: 0, filled: false, sample_rate: 44_100 }
    }

    pub fn push_slice(&mut self, samples: &[f32]) {
        for &s in samples {
            self.buf[self.write] = s;
            self.write = (self.write + 1) % FFT_SIZE;
            if self.write == 0 {
                self.filled = true;
            }
        }
    }

    pub fn clear(&mut self) {
        self.buf.iter_mut().for_each(|s| *s = 0.0);
        self.write = 0;
        self.filled = false;
    }

    /// Copy the window in chronological order. Returns false until enough samples exist.
    pub fn snapshot(&self, out: &mut [f32; FFT_SIZE]) -> bool {
        if !self.filled && self.write < FFT_SIZE / 2 {
            return false;
        }
        let (head, tail) = self.buf.split_at(self.write);
        out[..tail.len()].copy_from_slice(tail);
        out[tail.len()..].copy_from_slice(head);
        true
    }
}

impl Default for SampleRing {
    fn default() -> Self {
        Self::new()
    }
}

pub struct SpectrumAnalyzer {
    window: Vec<f32>,
    re: Vec<f32>,
    im: Vec<f32>,
    samples: [f32; FFT_SIZE],
    smoothed: [f32; BAND_COUNT],
}

impl SpectrumAnalyzer {
    pub fn new() -> Self {
        let window = (0..FFT_SIZE)
            .map(|i| 0.5 - 0.5 * (2.0 * PI * i as f32 / (FFT_SIZE as f32 - 1.0)).cos())
            .collect();
        Self {
            window,
            re: vec![0.0; FFT_SIZE],
            im: vec![0.0; FFT_SIZE],
            samples: [0.0; FFT_SIZE],
            smoothed: [0.0; BAND_COUNT],
        }
    }

    /// Analyse the ring and return smoothed band levels. Fast attack, slower release
    /// keeps the visual readable without hiding transients.
    pub fn analyze(&mut self, ring: &SampleRing) -> [u8; BAND_COUNT] {
        let raw = if ring.snapshot(&mut self.samples) {
            self.bands(ring.sample_rate)
        } else {
            [0.0; BAND_COUNT]
        };
        self.apply_smoothing(&raw)
    }

    /// Let the bars fall to rest (used while paused).
    pub fn decay(&mut self) -> [u8; BAND_COUNT] {
        self.apply_smoothing(&[0.0; BAND_COUNT])
    }

    pub fn is_silent(&self) -> bool {
        self.smoothed.iter().all(|&v| v < 0.004)
    }

    fn apply_smoothing(&mut self, raw: &[f32; BAND_COUNT]) -> [u8; BAND_COUNT] {
        let mut out = [0u8; BAND_COUNT];
        for (i, &target) in raw.iter().enumerate() {
            let prev = self.smoothed[i];
            let k = if target > prev { 0.6 } else { 0.18 };
            let v = prev + (target - prev) * k;
            self.smoothed[i] = v;
            out[i] = (v.clamp(0.0, 1.0) * 255.0).round() as u8;
        }
        out
    }

    fn bands(&mut self, sample_rate: u32) -> [f32; BAND_COUNT] {
        for i in 0..FFT_SIZE {
            self.re[i] = self.samples[i] * self.window[i];
            self.im[i] = 0.0;
        }
        fft_in_place(&mut self.re, &mut self.im);

        let bin_hz = sample_rate as f32 / FFT_SIZE as f32;
        let nyquist_bin = FFT_SIZE / 2;
        let ratio = (MAX_FREQ / MIN_FREQ).ln();
        let mut bands = [0.0f32; BAND_COUNT];
        for (b, band) in bands.iter_mut().enumerate() {
            let lo = MIN_FREQ * (ratio * b as f32 / BAND_COUNT as f32).exp();
            let hi = MIN_FREQ * (ratio * (b + 1) as f32 / BAND_COUNT as f32).exp();
            let lo_bin = ((lo / bin_hz).floor() as usize).clamp(1, nyquist_bin - 1);
            let hi_bin = ((hi / bin_hz).ceil() as usize).clamp(lo_bin + 1, nyquist_bin);
            let peak = (lo_bin..hi_bin)
                .map(|k| (self.re[k] * self.re[k] + self.im[k] * self.im[k]).sqrt())
                .fold(0.0f32, f32::max);
            // Normalise by the window's coherent gain (sum of Hann = N/2), then to dB.
            let amplitude = peak / (FFT_SIZE as f32 / 4.0);
            let db = 20.0 * amplitude.max(1e-9).log10();
            *band = ((db - FLOOR_DB) / (CEIL_DB - FLOOR_DB)).clamp(0.0, 1.0);
        }
        bands
    }
}

impl Default for SpectrumAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

/// Iterative radix-2 Cooley–Tukey FFT. `re.len()` must be a power of two.
pub fn fft_in_place(re: &mut [f32], im: &mut [f32]) {
    let n = re.len();
    debug_assert!(n.is_power_of_two() && im.len() == n);
    let mut j = 0;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j |= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let mut len = 2;
    while len <= n {
        let angle = -2.0 * PI / len as f32;
        let (w_im, w_re) = angle.sin_cos();
        for start in (0..n).step_by(len) {
            let (mut cur_re, mut cur_im) = (1.0f32, 0.0f32);
            for k in 0..len / 2 {
                let a = start + k;
                let b = a + len / 2;
                let t_re = re[b] * cur_re - im[b] * cur_im;
                let t_im = re[b] * cur_im + im[b] * cur_re;
                re[b] = re[a] - t_re;
                im[b] = im[a] - t_im;
                re[a] += t_re;
                im[a] += t_im;
                let next_re = cur_re * w_re - cur_im * w_im;
                cur_im = cur_re * w_im + cur_im * w_re;
                cur_re = next_re;
            }
        }
        len <<= 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fft_finds_pure_tone_bin() {
        let n = 1024;
        let mut re: Vec<f32> = (0..n).map(|i| (2.0 * PI * 64.0 * i as f32 / n as f32).sin()).collect();
        let mut im = vec![0.0; n];
        fft_in_place(&mut re, &mut im);
        let mags: Vec<f32> = (0..n / 2).map(|k| (re[k] * re[k] + im[k] * im[k]).sqrt()).collect();
        let peak = mags.iter().enumerate().max_by(|a, b| a.1.total_cmp(b.1)).unwrap().0;
        assert_eq!(peak, 64);
    }

    #[test]
    fn tone_lights_the_matching_band_only() {
        let rate = 48_000.0;
        let tone = 1_000.0;
        let mut ring = SampleRing::new();
        ring.sample_rate = rate as u32;
        let samples: Vec<f32> =
            (0..FFT_SIZE).map(|i| 0.5 * (2.0 * PI * tone * i as f32 / rate).sin()).collect();
        ring.push_slice(&samples);
        let mut analyzer = SpectrumAnalyzer::new();
        let mut bands = [0u8; BAND_COUNT];
        for _ in 0..8 {
            bands = analyzer.analyze(&ring);
        }
        let loudest = bands.iter().enumerate().max_by_key(|b| *b.1).unwrap().0;
        let ratio = (MAX_FREQ / MIN_FREQ).ln();
        let expected = ((tone / MIN_FREQ).ln() / ratio * BAND_COUNT as f32) as usize;
        assert!(loudest.abs_diff(expected) <= 1, "loudest {loudest}, expected ~{expected}");
        assert!(bands[2] < 40, "low bands should stay quiet: {}", bands[2]);
    }

    #[test]
    fn silence_produces_zero_bands() {
        let mut ring = SampleRing::new();
        ring.push_slice(&[0.0; FFT_SIZE]);
        let mut analyzer = SpectrumAnalyzer::new();
        assert!(analyzer.analyze(&ring).iter().all(|&b| b == 0));
        assert!(analyzer.is_silent());
    }
}
