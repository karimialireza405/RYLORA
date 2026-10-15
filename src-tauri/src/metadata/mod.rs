//! Tag reading via lofty, with graceful fallbacks for missing or malformed metadata.

pub mod artwork;
pub mod clean;
pub mod lyrics;
pub mod write;

use std::path::Path;

use lofty::picture::PictureType;
use lofty::prelude::*;
use lofty::tag::ItemKey;

#[derive(Debug, Clone, Default)]
pub struct TrackTags {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub duration_ms: u64,
    pub picture: Option<Vec<u8>>,
}

pub const UNKNOWN_ARTIST: &str = "Unknown Artist";
pub const UNKNOWN_ALBUM: &str = "Unknown Album";

/// Local artwork for files without embedded pictures. A track-specific image
/// wins over the album's cover/folder/front image; oversized files are ignored.
pub fn sidecar_picture(audio: &Path) -> Option<Vec<u8>> {
    let parent = audio.parent()?;
    let stem = audio.file_stem()?.to_str()?;
    for name in [stem, "cover", "Cover", "folder", "Folder", "front", "Front"] {
        for ext in ["jpg", "jpeg", "png", "webp"] {
            let candidate = parent.join(format!("{name}.{ext}"));
            let Ok(meta) = candidate.metadata() else { continue };
            if !meta.is_file() || meta.len() == 0 || meta.len() > 20 * 1024 * 1024 {
                continue;
            }
            if let Ok(bytes) = std::fs::read(candidate) {
                if image::load_from_memory(&bytes).is_ok() { return Some(bytes); }
            }
        }
    }
    None
}

fn clean(value: Option<std::borrow::Cow<'_, str>>) -> Option<String> {
    value
        .map(|v| v.trim_matches(char::from(0)).trim().to_string())
        .filter(|v| !v.is_empty())
}

/// Title fallback when a file carries no tags: the file stem, with a leading
/// track number ("03 - Name", "03. Name") stripped.
pub fn title_from_path(path: &Path) -> String {
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Untitled");
    let trimmed = stem.trim_start_matches(|c: char| c.is_ascii_digit());
    let trimmed = trimmed.trim_start_matches([' ', '-', '.', '_']);
    if trimmed.is_empty() { stem.to_string() } else { trimmed.to_string() }
}

/// Read tags and properties. Returns `Err` only when the file cannot be parsed as audio at all.
/// With `clean_tags`, download-site adverts and broken encodings are repaired (see [`clean`]).
pub fn read_tags(path: &Path, clean_tags: bool) -> Result<TrackTags, String> {
    let tagged = lofty::read_from_path(path).map_err(|e| e.to_string())?;
    let duration_ms = tagged.properties().duration().as_millis() as u64;
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());

    let mut tags = TrackTags { duration_ms, ..Default::default() };
    if let Some(tag) = tag {
        tags.title = clean(tag.title()).unwrap_or_default();
        tags.artist = clean(tag.artist()).unwrap_or_default();
        tags.album = clean(tag.album()).unwrap_or_default();
        tags.album_artist = tag.get_string(ItemKey::AlbumArtist).map(|s| s.trim().to_string()).unwrap_or_default();
        tags.track_number = tag.track().filter(|&n| n > 0);
        tags.disc_number = tag.disk().filter(|&n| n > 0);
        tags.year = tag.date().map(|d| d.year as u32).filter(|&y| y > 0);
        tags.genre = clean(tag.genre());
        let pictures = tag.pictures();
        tags.picture = pictures
            .iter()
            .find(|p| p.pic_type() == PictureType::CoverFront)
            .or_else(|| pictures.first())
            .map(|p| p.data().to_vec())
            .filter(|d| !d.is_empty());
    }

    let mut album_was_advert = false;
    if clean_tags {
        album_was_advert = !tags.album.is_empty();
        tags.title = clean::tag_value(&tags.title);
        tags.artist = clean::tag_value(&tags.artist);
        tags.album = clean::tag_value(&tags.album);
        tags.album_artist = clean::tag_value(&tags.album_artist);
        tags.genre = tags.genre.map(|g| clean::tag_value(&g)).filter(|g| !g.is_empty());
        album_was_advert &= tags.album.is_empty();
    }

    if tags.title.is_empty() {
        let stem = title_from_path(path);
        tags.title = if !clean_tags {
            stem
        } else {
            // A site-named file ("6727a6efb8a1f.mp3") says less than its album, which for
            // downloaded singles is the song's name.
            let cleaned = clean::tag_value(&stem);
            if (cleaned.is_empty() || clean::looks_like_id(&cleaned)) && !tags.album.is_empty() {
                tags.album.clone()
            } else if cleaned.is_empty() {
                stem
            } else {
                cleaned
            }
        };
    }
    if tags.artist.is_empty() {
        tags.artist = if tags.album_artist.is_empty() { UNKNOWN_ARTIST.into() } else { tags.album_artist.clone() };
    }
    if tags.album_artist.is_empty() {
        tags.album_artist = tags.artist.clone();
    }
    if tags.album.is_empty() {
        // An album tag that held only an advert belongs to a single.
        tags.album = if album_was_advert { tags.title.clone() } else { UNKNOWN_ALBUM.into() };
    }
    Ok(tags)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn sidecar_prefers_track_art_then_album_art_and_ignores_bad_images() {
        let dir = tempfile::tempdir().unwrap();
        let audio = dir.path().join("Song.wav");
        let cover = dir.path().join("cover.png");
        image::RgbImage::from_pixel(2, 2, image::Rgb([20, 80, 100])).save(&cover).unwrap();
        let album_bytes = std::fs::read(&cover).unwrap();
        assert_eq!(sidecar_picture(&audio).unwrap(), album_bytes);
        let track_art = dir.path().join("Song.png");
        image::RgbImage::from_pixel(2, 2, image::Rgb([100, 30, 80])).save(&track_art).unwrap();
        let track_bytes = std::fs::read(&track_art).unwrap();
        assert_eq!(sidecar_picture(&audio).unwrap(), track_bytes);
        std::fs::write(&track_art, b"not an image").unwrap();
        assert_eq!(sidecar_picture(&audio).unwrap(), album_bytes);
    }

    #[test]
    fn sidecar_without_art_is_optional() {
        let dir = tempfile::tempdir().unwrap();
        assert!(sidecar_picture(&dir.path().join("Song.wav")).is_none());
    }

    #[test]
    fn title_fallback_strips_track_numbers() {
        assert_eq!(title_from_path(&PathBuf::from("C:/m/03 - Night Tide.flac")), "Night Tide");
        assert_eq!(title_from_path(&PathBuf::from("C:/m/12.Glass.mp3")), "Glass");
        assert_eq!(title_from_path(&PathBuf::from("C:/m/1999.mp3")), "1999");
        assert_eq!(title_from_path(&PathBuf::from("C:/m/Interlude.wav")), "Interlude");
    }
}
