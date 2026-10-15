//! Tag edits are prepared on a private sibling copy; errors leave the original intact.
use crate::database::repo::MetadataEdit;
use lofty::{
    config::WriteOptions,
    picture::Picture,
    prelude::*,
    tag::{ItemKey, Tag},
};
use std::path::Path;

pub fn write_tags(path: &Path, edit: &MetadataEdit, picture: Option<&[u8]>) -> Result<(), String> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("audio");
    let tmp = path.with_file_name(format!(
        ".rylora-edit-{}-{}.{}",
        std::process::id(),
        crate::database::repo::now_ms(),
        ext
    ));
    // Reserve the path exclusively. Never overwrite another edit's copy.
    let mut copy = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&tmp)
        .map_err(|e| e.to_string())?;
    let result = (|| {
        let mut source = std::fs::File::open(path).map_err(|e| e.to_string())?;
        std::io::copy(&mut source, &mut copy).map_err(|e| e.to_string())?;
        copy.sync_all().map_err(|e| e.to_string())?;
        drop(copy);
        drop(source);
        let mut file = lofty::read_from_path(&tmp).map_err(|e| e.to_string())?;
        let kind = file.primary_tag_type();
        if file.primary_tag().is_none() {
            file.insert_tag(Tag::new(kind));
        }
        let tag = file
            .primary_tag_mut()
            .ok_or("This audio format does not support tag writing.")?;
        tag.set_title(edit.title.clone());
        tag.set_artist(edit.artist.clone());
        tag.set_album(edit.album.clone());
        tag.insert_text(ItemKey::AlbumArtist, edit.album_artist.clone());
        tag.remove_date();
        if let Some(year) = edit.year {
            tag.insert_text(ItemKey::RecordingDate, year.to_string());
        }
        if let Some(genre) = &edit.genre {
            tag.set_genre(genre.clone());
        } else {
            tag.remove_genre();
        }
        if let Some(bytes) = picture {
            let mut cover = Picture::from_reader(&mut std::io::Cursor::new(bytes))
                .map_err(|e| e.to_string())?;
            cover.set_pic_type(lofty::picture::PictureType::CoverFront);
            tag.remove_picture_type(lofty::picture::PictureType::CoverFront);
            tag.push_picture(cover);
        }
        file.save_to_path(&tmp, WriteOptions::default())
            .map_err(|e| e.to_string())?;
        // Verify the edited copy can still be parsed before replacing the original.
        lofty::read_from_path(&tmp).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, path).map_err(|e| {
            format!("Couldn't replace the file. Pause playback and check write permissions: {e}")
        })?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    fn edit() -> MetadataEdit {
        MetadataEdit {
            title: "نام آهنگ".into(),
            artist: "Artist".into(),
            album: "Album".into(),
            album_artist: "Artist".into(),
            year: Some(2026),
            genre: Some("Ambient".into()),
            artwork: None,
        }
    }
    #[test]
    fn failed_edit_preserves_original_and_cleans_copy() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("broken.flac");
        std::fs::write(&path, b"not audio").unwrap();
        assert!(write_tags(&path, &edit(), None).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"not audio");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }
    #[test]
    fn edits_wav_tags_preserving_audio_properties() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("track.wav");
        let data_size = 8820u32;
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data_size).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&44100u32.to_le_bytes());
        bytes.extend_from_slice(&88200u32.to_le_bytes());
        bytes.extend_from_slice(&2u16.to_le_bytes());
        bytes.extend_from_slice(&16u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data_size.to_le_bytes());
        bytes.resize(44 + data_size as usize, 0);
        std::fs::write(&path, bytes).unwrap();
        let before = crate::metadata::read_tags(&path).unwrap().duration_ms;
        write_tags(&path, &edit(), None).unwrap();
        let after = crate::metadata::read_tags(&path).unwrap();
        assert_eq!(after.title, "نام آهنگ");
        assert_eq!(after.year, Some(2026));
        assert_eq!(after.duration_ms, before);
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }
}
