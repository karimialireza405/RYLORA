//! Loudness levelling: measurement and the playback gain derived from it.
//!
//! Each track's integrated loudness is taken from its ReplayGain tags when present,
//! otherwise measured once by decoding the file (EBU R128 / ITU-R BS.1770, the
//! method ReplayGain 2.0 uses). Playback then scales the track towards a target
//! level without pushing its peak above full scale.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use ebur128::{EbuR128, Mode};
use lofty::prelude::*;
use lofty::tag::ItemKey;
use rodio::Source;
use serde::{Deserialize, Serialize};

use super::engine::open_decoder;
use super::AudioError;

/// ReplayGain 2.0 tags express gain relative to this level.
pub const REPLAYGAIN_REFERENCE_LUFS: f64 = -18.0;
/// Bounds on the applied gain; anything outside is almost certainly a bad tag.
const MAX_CUT_DB: f64 = -30.0;
const MAX_BOOST_DB: f64 = 15.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LevelingMode {
    Off,
    /// Every track at the same loudness.
    #[default]
    Track,
    /// Albums keep their internal dynamics; whole albums are levelled.
    Album,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LevelingTarget {
    Quiet,
    #[default]
    Normal,
    Loud,
}

impl LevelingTarget {
    pub fn lufs(self) -> f64 {
        match self {
            Self::Quiet => -23.0,
            Self::Normal => -14.0,
            Self::Loud => -11.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LevelingSettings {
    pub mode: LevelingMode,
    pub target: LevelingTarget,
}

/// Integrated loudness and sample peak of a track (or album).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Loudness {
    pub lufs: f64,
    /// Linear sample peak, 1.0 = full scale.
    pub peak: f64,
}

/// Values found in a file's ReplayGain tags, converted to loudness.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct TaggedLoudness {
    pub track: Option<Loudness>,
    pub album: Option<Loudness>,
}

/// Gain in dB that brings `loudness` to `target_lufs`, limited so the peak stays at
/// or below full scale (the ReplayGain clipping-prevention rule).
pub fn gain_db(loudness: Loudness, target_lufs: f64) -> f64 {
    let mut gain = target_lufs - loudness.lufs;
    if loudness.peak > 0.0 {
        gain = gain.min(-20.0 * loudness.peak.log10());
    }
    gain.clamp(MAX_CUT_DB, MAX_BOOST_DB)
}

pub fn db_to_linear(db: f64) -> f32 {
    10f64.powf(db / 20.0) as f32
}

/// Loudness of tracks played together, from their individual measurements:
/// the duration-weighted mean of their energy, and the highest peak.
///
/// This approximates measuring the album as one programme (it cannot repeat the
/// relative gating across track boundaries) and is typically within a few tenths of a dB.
pub fn combined(tracks: &[(Loudness, u64)]) -> Option<Loudness> {
    let total: f64 = tracks.iter().map(|(_, ms)| *ms as f64).sum();
    if total <= 0.0 {
        return None;
    }
    let energy: f64 = tracks.iter().map(|(l, ms)| 10f64.powf(l.lufs / 10.0) * *ms as f64).sum::<f64>() / total;
    let peak = tracks.iter().map(|(l, _)| l.peak).fold(0.0, f64::max);
    Some(Loudness { lufs: 10.0 * energy.log10(), peak })
}

fn parse_gain(text: &str) -> Option<f64> {
    let value = text.trim().trim_end_matches(|c: char| c.is_ascii_alphabetic() || c.is_whitespace());
    value.trim().replace(',', ".").parse::<f64>().ok().filter(|g| g.is_finite() && (-60.0..=60.0).contains(g))
}

fn parse_peak(text: Option<&str>) -> f64 {
    text.and_then(|t| t.trim().replace(',', ".").parse::<f64>().ok())
        .filter(|p| p.is_finite() && *p > 0.0 && *p < 100.0)
        .unwrap_or(0.0)
}

/// ReplayGain values from the file's tags, if it carries any.
pub fn read_tags(path: &Path) -> TaggedLoudness {
    let Ok(tagged) = lofty::read_from_path(path) else { return TaggedLoudness::default() };
    let mut result = TaggedLoudness::default();
    for tag in tagged.tags() {
        let pick = |gain: ItemKey, peak: ItemKey| {
            let gain = tag.get_string(gain).and_then(parse_gain)?;
            Some(Loudness { lufs: REPLAYGAIN_REFERENCE_LUFS - gain, peak: parse_peak(tag.get_string(peak)) })
        };
        result.track = result.track.or_else(|| pick(ItemKey::ReplayGainTrackGain, ItemKey::ReplayGainTrackPeak));
        result.album = result.album.or_else(|| pick(ItemKey::ReplayGainAlbumGain, ItemKey::ReplayGainAlbumPeak));
    }
    result
}

/// Below -50 dBFS a frame counts as silence when finding where the audio starts and ends.
const SILENCE: f32 = 0.003_162;

/// Where a file's audible content begins and ends, in seconds from its start.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Audible {
    pub start: f64,
    pub end: f64,
}

/// What decoding a whole file reveals.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Measurement {
    /// `None` for digital silence, which has no meaningful loudness.
    pub loudness: Option<Loudness>,
    /// `None` when nothing in the file rises above the silence threshold.
    pub audible: Option<Audible>,
}

/// Decode the whole file and measure it. Returns `Ok(None)` when `cancel` is set.
pub fn measure(path: &Path, cancel: &AtomicBool) -> Result<Option<Measurement>, AudioError> {
    measure_source(open_decoder(path)?, cancel)
}

fn meter_error(e: ebur128::Error) -> AudioError {
    AudioError::Decode(format!("loudness meter: {e:?}"))
}

fn measure_source<S: Source>(mut source: S, cancel: &AtomicBool) -> Result<Option<Measurement>, AudioError> {
    let channels = source.channels().get() as usize;
    let rate = source.sample_rate().get();
    let mut meter = EbuR128::new(channels as u32, rate, Mode::I | Mode::SAMPLE_PEAK).map_err(meter_error)?;
    let chunk = 8_192 * channels;
    let mut buffer = Vec::with_capacity(chunk);
    let mut read = 0usize;
    let (mut first, mut last) = (None, None);
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Ok(None);
        }
        buffer.clear();
        buffer.extend(source.by_ref().take(chunk));
        let whole = buffer.len() - buffer.len() % channels;
        if whole > 0 {
            meter.add_frames_f32(&buffer[..whole]).map_err(meter_error)?;
            if let Some(i) = buffer[..whole].iter().position(|s| s.abs() > SILENCE) {
                first = first.or(Some((read + i) / channels));
                let j = buffer[..whole].iter().rposition(|s| s.abs() > SILENCE).unwrap_or(i);
                last = Some((read + j) / channels + 1);
            }
            read += whole;
        }
        if buffer.len() < chunk {
            break;
        }
    }
    let lufs = meter.loudness_global().map_err(meter_error)?;
    let loudness = lufs.is_finite().then(|| Loudness {
        lufs,
        peak: (0..channels as u32).filter_map(|c| meter.sample_peak(c).ok()).fold(0.0, f64::max),
    });
    let seconds = |frames: usize| frames as f64 / rate as f64;
    let audible = first.zip(last).map(|(a, b)| Audible { start: seconds(a), end: seconds(b) });
    Ok(Some(Measurement { loudness, audible }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rodio::buffer::SamplesBuffer;
    use std::num::NonZero;

    fn sine(amplitude: f32, seconds: f32, channels: u16) -> SamplesBuffer {
        let rate = 48_000u32;
        let frames = (rate as f32 * seconds) as usize;
        let mut data = Vec::with_capacity(frames * channels as usize);
        for i in 0..frames {
            let s = amplitude * (2.0 * std::f32::consts::PI * 997.0 * i as f32 / rate as f32).sin();
            data.extend(std::iter::repeat_n(s, channels as usize));
        }
        SamplesBuffer::new(NonZero::new(channels).unwrap(), NonZero::new(rate).unwrap(), data)
    }

    #[test]
    fn measures_a_reference_tone() {
        // A full-scale 997 Hz sine in one channel reads -3.01 LUFS (BS.1770 reference).
        let l = measure_source(sine(1.0, 5.0, 1), &AtomicBool::new(false)).unwrap().unwrap().loudness.unwrap();
        assert!((l.lufs + 3.01).abs() < 0.1, "{}", l.lufs);
        assert!((l.peak - 1.0).abs() < 0.01);
        // Half the amplitude is 6 dB quieter; stereo adds 3 dB.
        let half = measure_source(sine(0.5, 5.0, 2), &AtomicBool::new(false)).unwrap().unwrap().loudness.unwrap();
        assert!((half.lufs - (l.lufs - 6.02 + 3.01)).abs() < 0.1, "{}", half.lufs);
    }

    #[test]
    fn silence_has_no_loudness_and_cancel_stops() {
        assert_eq!(measure_source(sine(0.0, 2.0, 2), &AtomicBool::new(false)).unwrap(), Some(Measurement::default()));
        assert_eq!(measure_source(sine(0.5, 2.0, 2), &AtomicBool::new(true)).unwrap(), None);
    }

    #[test]
    fn finds_where_the_audio_starts_and_ends() {
        // 1.5 s of silence, 2 s of tone, 3 s of silence.
        let rate = 48_000usize;
        let mut data = vec![0.0f32; rate * 3 / 2 * 2];
        data.extend((0..rate * 2).flat_map(|i| {
            let s = 0.3 * (2.0 * std::f32::consts::PI * 440.0 * i as f32 / rate as f32).sin();
            [s, s]
        }));
        data.extend(vec![0.0f32; rate * 3 * 2]);
        let source = SamplesBuffer::new(NonZero::new(2).unwrap(), NonZero::new(rate as u32).unwrap(), data);
        let audible = measure_source(source, &AtomicBool::new(false)).unwrap().unwrap().audible.unwrap();
        assert!((audible.start - 1.5).abs() < 0.001, "{}", audible.start);
        assert!((audible.end - 3.5).abs() < 0.001, "{}", audible.end);
    }

    #[test]
    fn gain_reaches_target_but_never_clips() {
        let loud = Loudness { lufs: -8.0, peak: 1.0 };
        assert!((gain_db(loud, -14.0) + 6.0).abs() < 1e-9);
        // A quiet track would need +10 dB but only has 4 dB of headroom.
        let quiet = Loudness { lufs: -24.0, peak: 10f64.powf(-4.0 / 20.0) };
        assert!((gain_db(quiet, -14.0) - 4.0).abs() < 1e-9);
        // Unknown peak: no protection possible, gain bounded.
        assert_eq!(gain_db(Loudness { lufs: -60.0, peak: 0.0 }, -14.0), MAX_BOOST_DB);
        assert!((db_to_linear(-6.0206) - 0.5).abs() < 1e-4);
    }

    #[test]
    fn combined_loudness_weights_by_duration() {
        let a = Loudness { lufs: -10.0, peak: 0.9 };
        let b = Loudness { lufs: -20.0, peak: 0.5 };
        let same = combined(&[(a, 1000), (a, 3000)]).unwrap();
        assert!((same.lufs + 10.0).abs() < 1e-9);
        let mixed = combined(&[(a, 1000), (b, 1000)]).unwrap();
        // Mean energy of 0.1 and 0.01 = 0.055 -> -12.6 LUFS: the loud track dominates.
        assert!((mixed.lufs + 12.596).abs() < 0.01, "{}", mixed.lufs);
        assert_eq!(mixed.peak, 0.9);
        assert_eq!(combined(&[]), None);
    }

    #[test]
    fn parses_replaygain_text() {
        assert_eq!(parse_gain("-6.52 dB"), Some(-6.52));
        assert_eq!(parse_gain("+1.5 dB"), Some(1.5));
        assert_eq!(parse_gain("3,25 dB"), Some(3.25));
        assert_eq!(parse_gain("loud"), None);
        assert_eq!(parse_peak(Some("0.988")), 0.988);
        assert_eq!(parse_peak(Some("x")), 0.0);
    }

    #[test]
    fn reads_tags_written_by_replaygain_taggers() {
        use lofty::config::WriteOptions;
        use lofty::tag::{Accessor, Tag, TagType};
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("t.flac");
        // Minimal FLAC with STREAMINFO only; lofty can attach comments to it.
        let mut flac = b"fLaC".to_vec();
        flac.push(0x80); // last block, STREAMINFO
        flac.extend_from_slice(&[0, 0, 34]);
        let mut info = [0u8; 34];
        info[0..2].copy_from_slice(&4096u16.to_be_bytes());
        info[2..4].copy_from_slice(&4096u16.to_be_bytes());
        // 44100 Hz, 2 channels, 16 bits, 0 samples
        let packed: u64 = (44_100u64 << 44) | (1u64 << 41) | (15u64 << 36);
        info[10..18].copy_from_slice(&packed.to_be_bytes());
        flac.extend_from_slice(&info);
        std::fs::write(&path, flac).unwrap();
        let mut tag = Tag::new(TagType::VorbisComments);
        tag.set_title("t".into());
        tag.insert_text(ItemKey::ReplayGainTrackGain, "-7.25 dB".into());
        tag.insert_text(ItemKey::ReplayGainTrackPeak, "0.95".into());
        tag.save_to_path(&path, WriteOptions::default()).unwrap();
        let read = read_tags(&path);
        let track = read.track.unwrap();
        assert!((track.lufs - (-18.0 + 7.25)).abs() < 1e-9);
        assert_eq!(track.peak, 0.95);
        assert_eq!(read.album, None);
    }
}
