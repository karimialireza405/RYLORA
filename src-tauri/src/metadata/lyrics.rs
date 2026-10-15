//! Lyrics: time-synced when available, otherwise plain text.
//!
//! Sources, best first: a `.lrc` file next to the song with the same name, an ID3
//! synchronised-lyrics frame (SYLT), LRC-formatted text stored in the lyrics tag, and
//! finally plain lyrics from either place. Nothing is fetched online.

use std::path::{Path, PathBuf};

use lofty::prelude::*;
use lofty::tag::ItemKey;
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LyricLine {
    /// When the line starts, for synced lyrics.
    pub time_ms: Option<u64>,
    pub text: String,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LyricsSource {
    /// A `.lrc` file beside the song.
    File,
    /// The song's own tags.
    Tags,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Lyrics {
    pub synced: bool,
    pub source: LyricsSource,
    pub lines: Vec<LyricLine>,
}

impl Lyrics {
    fn synced(source: LyricsSource, lines: Vec<LyricLine>) -> Self {
        Self { synced: true, source, lines }
    }

    fn plain(source: LyricsSource, text: &str) -> Option<Self> {
        let text = text.lines().map(str::trim_end).collect::<Vec<_>>().join("\n");
        let text = text.trim();
        (!text.is_empty()).then(|| Self {
            synced: false,
            source,
            lines: text.lines().map(|l| LyricLine { time_ms: None, text: l.to_string() }).collect(),
        })
    }
}

pub fn read(path: &Path) -> Option<Lyrics> {
    let sidecar = sidecar_text(path);
    if let Some(lines) = sidecar.as_deref().and_then(parse_lrc) {
        return Some(Lyrics::synced(LyricsSource::File, lines));
    }
    if let Some(lines) = sylt(path) {
        return Some(Lyrics::synced(LyricsSource::Tags, lines));
    }
    let embedded = embedded_text(path);
    if let Some(lines) = embedded.as_deref().and_then(parse_lrc) {
        return Some(Lyrics::synced(LyricsSource::Tags, lines));
    }
    if let Some(lyrics) = sidecar.as_deref().and_then(|t| Lyrics::plain(LyricsSource::File, strip_lrc_tags(t).as_str())) {
        return Some(lyrics);
    }
    embedded.as_deref().and_then(|t| Lyrics::plain(LyricsSource::Tags, t))
}

/// Unsynchronised lyrics text from the tags (ID3 USLT, Vorbis LYRICS, MP4 ©lyr).
fn embedded_text(path: &Path) -> Option<String> {
    let tagged = match lofty::read_from_path(path) {
        Ok(tagged) => tagged,
        Err(e) => {
            log::debug!("no tags for lyrics in {}: {e}", path.display());
            return None;
        }
    };
    tagged
        .tags()
        .iter()
        .find_map(|tag| tag.get_string(ItemKey::UnsyncLyrics).or_else(|| tag.get_string(ItemKey::Lyrics)))
        .map(str::to_string)
}

/// `Song.lrc` beside `Song.mp3`, matched case-insensitively.
fn sidecar_path(path: &Path) -> Option<PathBuf> {
    let stem = path.file_stem()?.to_str()?.to_lowercase();
    std::fs::read_dir(path.parent()?).ok()?.flatten().map(|e| e.path()).find(|p| {
        p.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("lrc"))
            && p.file_stem().and_then(|s| s.to_str()).is_some_and(|s| s.to_lowercase() == stem)
    })
}

fn sidecar_text(path: &Path) -> Option<String> {
    let file = sidecar_path(path)?;
    // Lyrics files are small; anything huge is not one.
    if std::fs::metadata(&file).ok()?.len() > 1024 * 1024 {
        return None;
    }
    Some(decode(&std::fs::read(file).ok()?))
}

/// LRC files come in UTF-8 (with or without BOM), UTF-16, or — commonly for Persian
/// and Arabic lyrics — the Windows-1256 code page.
fn decode(bytes: &[u8]) -> String {
    if let Some((encoding, bom)) = encoding_rs::Encoding::for_bom(bytes) {
        return encoding.decode_without_bom_handling(&bytes[bom..]).0.into_owned();
    }
    match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        Err(_) => encoding_rs::WINDOWS_1256.decode(bytes).0.into_owned(),
    }
}

/// Parse `[mm:ss.xx]`-style timestamps (`mm:ss`, `mm:ss.x`, `mm:ss:xx` also accepted).
fn parse_time(tag: &str) -> Option<u64> {
    let (minutes, rest) = tag.split_once(':')?;
    let minutes: u64 = minutes.trim().parse().ok()?;
    let (seconds, fraction) = match rest.split_once(['.', ':']) {
        Some((s, f)) => (s, f),
        None => (rest, ""),
    };
    let seconds: u64 = seconds.trim().parse().ok()?;
    if seconds >= 60 || !fraction.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let frac_ms = match fraction.len() {
        0 => 0,
        1 => fraction.parse::<u64>().ok()? * 100,
        2 => fraction.parse::<u64>().ok()? * 10,
        _ => fraction[..3].parse::<u64>().ok()?,
    };
    Some((minutes * 60 + seconds) * 1000 + frac_ms)
}

/// Remove enhanced-LRC word timings (`<mm:ss.xx>`), keeping the words.
fn strip_word_times(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find('<') {
        match rest[start..].find('>') {
            Some(end) if parse_time(&rest[start + 1..start + end]).is_some() => {
                out.push_str(&rest[..start]);
                rest = &rest[start + end + 1..];
            }
            _ => {
                out.push_str(&rest[..=start]);
                rest = &rest[start + 1..];
            }
        }
    }
    out.push_str(rest);
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Synced lines from LRC text, or `None` when it is not (mostly) time-tagged.
pub fn parse_lrc(text: &str) -> Option<Vec<LyricLine>> {
    let mut lines = Vec::new();
    let mut offset_ms: i64 = 0;
    let mut untimed = 0usize;
    for raw in text.lines() {
        let mut rest = raw.trim();
        if rest.is_empty() {
            continue;
        }
        let mut times = Vec::new();
        while let Some(stripped) = rest.strip_prefix('[') {
            let Some(end) = stripped.find(']') else { break };
            let tag = &stripped[..end];
            if let Some(t) = parse_time(tag) {
                times.push(t);
            } else if let Some(value) = tag.strip_prefix("offset:") {
                offset_ms = value.trim().parse().unwrap_or(0);
            }
            rest = stripped[end + 1..].trim_start();
        }
        if times.is_empty() {
            // ID tags such as [ar:...] leave nothing behind; real text without a time does.
            if !rest.is_empty() {
                untimed += 1;
            }
            continue;
        }
        let words = strip_word_times(rest);
        for t in times {
            // A positive offset shows lyrics earlier.
            let time = (t as i64 - offset_ms).max(0) as u64;
            lines.push(LyricLine { time_ms: Some(time), text: words.clone() });
        }
    }
    if lines.len() < 2 || untimed > lines.len() {
        return None;
    }
    lines.sort_by_key(|l| l.time_ms);
    // Drop a trailing run of empty lines (end markers) but keep gaps between verses.
    while lines.last().is_some_and(|l| l.text.is_empty()) {
        lines.pop();
    }
    (lines.len() >= 2).then_some(lines)
}

/// Plain text of an LRC file whose timestamps could not be used.
fn strip_lrc_tags(text: &str) -> String {
    text.lines()
        .filter_map(|line| {
            let mut rest = line.trim();
            while let Some(stripped) = rest.strip_prefix('[') {
                let end = stripped.find(']')?;
                rest = stripped[end + 1..].trim_start();
            }
            Some(strip_word_times(rest))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// ID3v2 SYLT frame (MP3 only), when it holds lyrics timed in milliseconds.
fn sylt(path: &Path) -> Option<Vec<LyricLine>> {
    use lofty::config::ParseOptions;
    use lofty::file::AudioFile;
    use lofty::id3::v2::{Frame, FrameFlags, SyncTextContentType, SynchronizedTextFrame, TimestampFormat};
    use lofty::mpeg::MpegFile;

    if !path.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("mp3")) {
        return None;
    }
    let mut file = std::fs::File::open(path).ok()?;
    let mpeg = MpegFile::read_from(&mut file, ParseOptions::new()).ok()?;
    let tag = mpeg.id3v2()?;
    tag.into_iter().find_map(|frame| {
        if frame.id_str() != "SYLT" {
            return None;
        }
        let Frame::Binary(binary) = frame else { return None };
        let sylt = SynchronizedTextFrame::parse(&binary.data, FrameFlags::default()).ok()?;
        if sylt.timestamp_format != TimestampFormat::MS || sylt.content_type != SyncTextContentType::Lyrics {
            return None;
        }
        let mut lines: Vec<LyricLine> = sylt
            .content
            .into_iter()
            .map(|(t, text)| LyricLine { time_ms: Some(t as u64), text: text.trim().to_string() })
            .collect();
        lines.sort_by_key(|l| l.time_ms);
        (lines.len() >= 2).then_some(lines)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn times(lines: &[LyricLine]) -> Vec<(u64, &str)> {
        lines.iter().map(|l| (l.time_ms.unwrap(), l.text.as_str())).collect()
    }

    #[test]
    fn parses_lrc_with_metadata_repeats_and_offset() {
        let text = "[ar:Someone]\n[ti:Song]\n[offset:+200]\n[00:12.30]First line\n[00:15.5][01:02.00]Chorus\n[00:20]\n[00:21.123]Last <00:21.50>word\n";
        let lines = parse_lrc(text).unwrap();
        assert_eq!(
            times(&lines),
            vec![(12_100, "First line"), (15_300, "Chorus"), (19_800, ""), (20_923, "Last word"), (61_800, "Chorus")]
        );
    }

    #[test]
    fn plain_text_is_not_mistaken_for_lrc() {
        assert!(parse_lrc("Verse one\nVerse two\n[Chorus]\nla la").is_none());
        assert!(parse_lrc("[00:01.00]only one line").is_none());
        assert!(parse_time("1:75").is_none());
        assert_eq!(parse_time("03:04:05"), Some(184_050));
    }

    #[test]
    fn sidecar_lrc_wins_and_persian_code_page_is_decoded() {
        let dir = tempfile::tempdir().unwrap();
        let song = dir.path().join("Song.wav");
        std::fs::write(&song, b"not audio").unwrap();
        // "سلام" in Windows-1256, as many Persian LRC files are saved.
        let (persian, _, _) = encoding_rs::WINDOWS_1256.encode("[00:01.00]سلام\n[00:03.00]جهان");
        std::fs::write(dir.path().join("song.LRC"), &persian).unwrap();
        // The song itself has no readable tags; the lyrics file alone is enough.
        let lyrics = read(&song).unwrap();
        assert!(lyrics.synced);
        assert_eq!(lyrics.source, LyricsSource::File);
        assert_eq!(times(&lyrics.lines), vec![(1_000, "سلام"), (3_000, "جهان")]);
    }

    #[test]
    fn utf8_bom_and_plain_sidecar() {
        assert_eq!(decode(b"\xEF\xBB\xBF[00:01]a"), "[00:01]a");
        let plain = strip_lrc_tags("[ar:x]\nHello\n[00:xx]World");
        assert_eq!(Lyrics::plain(LyricsSource::File, &plain).unwrap().lines.len(), 2);
    }

    #[test]
    fn reads_id3_synchronised_lyrics() {
        use lofty::config::WriteOptions;
        use lofty::id3::v2::{SyncTextContentType, SynchronizedTextFrame, TimestampFormat};
        use lofty::TextEncoding;
        let frame = SynchronizedTextFrame::new(
            TextEncoding::UTF8,
            *b"eng",
            TimestampFormat::MS,
            SyncTextContentType::Lyrics,
            None,
            vec![(1_500, "One".into()), (4_250, "Two".into())],
        );
        let body = frame.as_bytes(WriteOptions::default()).unwrap();
        let syncsafe = |n: usize| [(n >> 21) as u8 & 0x7f, (n >> 14) as u8 & 0x7f, (n >> 7) as u8 & 0x7f, n as u8 & 0x7f];
        let mut bytes = b"ID3  ".to_vec();
        bytes.extend(syncsafe(body.len() + 10));
        bytes.extend(b"SYLT");
        bytes.extend(syncsafe(body.len()));
        bytes.extend([0, 0]);
        bytes.extend(&body);
        // A few silent MPEG-1 Layer III frames (128 kbit/s, 44.1 kHz, 417 bytes each).
        for _ in 0..8 {
            bytes.extend([0xFF, 0xFB, 0x90, 0x00]);
            bytes.extend([0u8; 413]);
        }
        let dir = tempfile::tempdir().unwrap();
        let song = dir.path().join("synced.mp3");
        std::fs::write(&song, bytes).unwrap();
        let lyrics = read(&song).unwrap();
        assert!(lyrics.synced);
        assert_eq!(lyrics.source, LyricsSource::Tags);
        assert_eq!(times(&lyrics.lines), vec![(1_500, "One"), (4_250, "Two")]);
    }
}
