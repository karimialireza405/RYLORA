//! Repository functions. Each takes a `&Connection` so callers choose the
//! connection (shared UI connection or a scanner-owned one) and transaction scope.

use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use crate::domain::models::{
    Album, AlbumId, Artist, ArtistId, Playlist, PlaylistId, Track, TrackId,
};
use crate::error::{AppError, AppResult};

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Case- and whitespace-insensitive key used for de-duplicating names.
pub fn name_key(name: &str) -> String {
    name.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

// ---------------------------------------------------------------- folders

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFolder {
    pub id: i64,
    pub path: String,
    pub path_key: String,
    pub track_count: u32,
    pub available: bool,
}

pub fn list_folders(conn: &Connection) -> AppResult<Vec<LibraryFolder>> {
    let mut stmt = conn.prepare(
        "SELECT f.id, f.path, f.path_key,
                (SELECT COUNT(*) FROM tracks t WHERE t.folder_id = f.id AND t.missing = 0)
         FROM library_folders f ORDER BY f.path COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], |r| {
        let path: String = r.get(1)?;
        let available = std::path::Path::new(&path).is_dir();
        Ok(LibraryFolder {
            id: r.get(0)?,
            path,
            path_key: r.get(2)?,
            track_count: r.get(3)?,
            available,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn add_folder(conn: &Connection, path: &str, path_key: &str) -> AppResult<i64> {
    // A folder nested in (or containing) an existing one would double-index files.
    for existing in list_folders(conn)? {
        let a = format!("{}\\", existing.path_key.trim_end_matches('\\'));
        let b = format!("{}\\", path_key.trim_end_matches('\\'));
        if a == b {
            return Err(AppError::Invalid(
                "This folder is already in your library.".into(),
            ));
        }
        if b.starts_with(&a) {
            return Err(AppError::Invalid(format!(
                "This folder is already covered by {}.",
                existing.path
            )));
        }
        if a.starts_with(&b) {
            return Err(AppError::Invalid(format!(
                "This folder contains {}, which is already in your library. Remove it first.",
                existing.path
            )));
        }
    }
    conn.execute(
        "INSERT INTO library_folders (path, path_key, added_at) VALUES (?1, ?2, ?3)",
        params![path, path_key, now_ms()],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn remove_folder(conn: &mut Connection, id: i64) -> AppResult<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM tracks WHERE folder_id = ?1", [id])?;
    tx.execute("DELETE FROM library_folders WHERE id = ?1", [id])?;
    cleanup_orphans(&tx)?;
    tx.commit()?;
    Ok(())
}

// ---------------------------------------------------------------- indexing

/// Previously indexed state of a file, used for incremental scans.
#[derive(Debug, Clone, Copy)]
pub struct IndexedFile {
    pub id: TrackId,
    pub size: i64,
    pub mtime: i64,
    pub missing: bool,
}

pub fn indexed_files(conn: &Connection, folder_id: i64) -> AppResult<HashMap<String, IndexedFile>> {
    let mut stmt = conn.prepare(
        "SELECT path_key, id, file_size, file_mtime, missing FROM tracks WHERE folder_id = ?1",
    )?;
    let rows = stmt.query_map([folder_id], |r| {
        Ok((
            r.get::<_, String>(0)?,
            IndexedFile {
                id: r.get(1)?,
                size: r.get(2)?,
                mtime: r.get(3)?,
                missing: r.get::<_, i64>(4)? != 0,
            },
        ))
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn upsert_artist(conn: &Connection, name: &str) -> AppResult<ArtistId> {
    let key = name_key(name);
    if let Some(id) = conn
        .query_row("SELECT id FROM artists WHERE name_key = ?1", [&key], |r| {
            r.get(0)
        })
        .optional()?
    {
        return Ok(id);
    }
    conn.execute(
        "INSERT INTO artists (name, name_key) VALUES (?1, ?2)",
        params![name, key],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn upsert_artwork(conn: &Connection, hash: &str, accent: Option<&str>) -> AppResult<()> {
    conn.execute(
        "INSERT INTO artwork (hash, accent) VALUES (?1, ?2) ON CONFLICT(hash) DO NOTHING",
        params![hash, accent],
    )?;
    Ok(())
}

pub fn artwork_known(conn: &Connection, hash: &str) -> AppResult<bool> {
    Ok(conn
        .query_row("SELECT 1 FROM artwork WHERE hash = ?1", [hash], |_| Ok(()))
        .optional()?
        .is_some())
}

pub fn upsert_album(
    conn: &Connection,
    title: &str,
    artist_id: ArtistId,
    year: Option<u32>,
    artwork: Option<&str>,
) -> AppResult<AlbumId> {
    let key = name_key(title);
    let existing: Option<(AlbumId, Option<String>, Option<u32>)> = conn
        .query_row(
            "SELECT id, artwork, year FROM albums WHERE title_key = ?1 AND artist_id = ?2",
            params![key, artist_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;
    match existing {
        Some((id, art, yr)) => {
            if (art.is_none() && artwork.is_some()) || (yr.is_none() && year.is_some()) {
                conn.execute(
                    "UPDATE albums SET artwork = COALESCE(artwork, ?2), year = COALESCE(year, ?3) WHERE id = ?1",
                    params![id, artwork, year],
                )?;
            }
            Ok(id)
        }
        None => {
            conn.execute(
                "INSERT INTO albums (title, title_key, artist_id, year, artwork) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![title, key, artist_id, year, artwork],
            )?;
            Ok(conn.last_insert_rowid())
        }
    }
}

/// Everything the scanner knows about one file.
#[derive(Debug, Clone)]
pub struct TrackRecord {
    pub path: String,
    pub path_key: String,
    pub folder_id: Option<i64>,
    pub title: String,
    pub artist_id: ArtistId,
    pub album_id: AlbumId,
    pub album_artist: String,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub duration_ms: u64,
    pub format: String,
    pub file_size: i64,
    pub file_mtime: i64,
    pub artwork: Option<String>,
}

/// Insert or update by canonical path key. Existing ids are preserved so favourites,
/// playlists and history survive re-tagging.
pub fn upsert_track(conn: &Connection, t: &TrackRecord) -> AppResult<TrackId> {
    conn.execute(
        "INSERT INTO tracks (path, path_key, folder_id, title, artist_id, album_id, album_artist,
                             track_number, disc_number, year, genre, duration_ms, format,
                             file_size, file_mtime, artwork, missing, added_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, 0, ?17)
         ON CONFLICT(path_key) DO UPDATE SET
            path = excluded.path, folder_id = COALESCE(excluded.folder_id, folder_id), title = excluded.title,
            artist_id = excluded.artist_id, album_id = excluded.album_id,
            album_artist = excluded.album_artist, track_number = excluded.track_number,
            disc_number = excluded.disc_number, year = excluded.year, genre = excluded.genre,
            duration_ms = excluded.duration_ms, format = excluded.format,
            file_size = excluded.file_size, file_mtime = excluded.file_mtime,
            artwork = excluded.artwork, missing = 0",
        params![
            t.path, t.path_key, t.folder_id, t.title, t.artist_id, t.album_id, t.album_artist,
            t.track_number, t.disc_number, t.year, t.genre, t.duration_ms as i64, t.format,
            t.file_size, t.file_mtime, t.artwork, now_ms()
        ],
    )?;
    let id = conn.query_row(
        "SELECT id FROM tracks WHERE path_key = ?1",
        [&t.path_key],
        |r| r.get(0),
    )?;
    let edit: Option<String> = conn
        .query_row(
            "SELECT value FROM metadata_edits WHERE track_id = ?1",
            [id],
            |r| r.get(0),
        )
        .optional()?;
    if let Some(json) = edit {
        let edit: MetadataEdit =
            serde_json::from_str(&json).map_err(|e| AppError::Invalid(e.to_string()))?;
        apply_metadata_edit(conn, id, &edit)?;
    }
    Ok(id)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataEdit {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub artwork: Option<String>,
}

pub fn apply_metadata_edit(conn: &Connection, id: TrackId, edit: &MetadataEdit) -> AppResult<()> {
    let artist = upsert_artist(conn, &edit.artist)?;
    let album_artist = upsert_artist(conn, &edit.album_artist)?;
    let album = upsert_album(
        conn,
        &edit.album,
        album_artist,
        edit.year,
        edit.artwork.as_deref(),
    )?;
    conn.execute("UPDATE tracks SET title=?2, artist_id=?3, album_id=?4, album_artist=?5, year=?6, genre=?7, artwork=?8 WHERE id=?1",
        params![id, edit.title, artist, album, edit.album_artist, edit.year, edit.genre, edit.artwork])?;
    Ok(())
}

pub fn save_metadata_edit(
    conn: &mut Connection,
    id: TrackId,
    edit: &MetadataEdit,
) -> AppResult<()> {
    let tx = conn.transaction()?;
    let json = serde_json::to_string(edit).map_err(|e| AppError::Invalid(e.to_string()))?;
    tx.execute("INSERT INTO metadata_edits(track_id,value) VALUES(?1,?2) ON CONFLICT(track_id) DO UPDATE SET value=excluded.value", params![id,json])?;
    apply_metadata_edit(&tx, id, edit)?;
    cleanup_orphans(&tx)?;
    tx.commit()?;
    Ok(())
}

pub fn set_missing(conn: &Connection, ids: &[TrackId], missing: bool) -> AppResult<()> {
    let mut stmt = conn.prepare("UPDATE tracks SET missing = ?2 WHERE id = ?1")?;
    for id in ids {
        stmt.execute(params![id, missing as i64])?;
    }
    Ok(())
}

pub fn set_duration_if_unknown(conn: &Connection, id: TrackId, duration_ms: u64) -> AppResult<()> {
    conn.execute(
        "UPDATE tracks SET duration_ms = ?2 WHERE id = ?1 AND duration_ms = 0",
        params![id, duration_ms as i64],
    )?;
    Ok(())
}

pub fn cleanup_orphans(conn: &Connection) -> AppResult<()> {
    conn.execute(
        "DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT album_id FROM tracks)",
        [],
    )?;
    conn.execute(
        "DELETE FROM artists WHERE id NOT IN (SELECT DISTINCT artist_id FROM tracks)
                               AND id NOT IN (SELECT DISTINCT artist_id FROM albums)",
        [],
    )?;
    Ok(())
}

// ---------------------------------------------------------------- reads

const TRACK_SELECT: &str = "
    SELECT t.id, t.path, t.title, ar.name, t.artist_id, al.title, t.album_id, t.album_artist,
           t.track_number, t.disc_number, t.year, t.genre, t.duration_ms, t.format,
           t.artwork, aw.accent, (f.track_id IS NOT NULL), t.missing, t.added_at
    FROM tracks t
    JOIN artists ar ON ar.id = t.artist_id
    JOIN albums al ON al.id = t.album_id
    LEFT JOIN artwork aw ON aw.hash = t.artwork
    LEFT JOIN favorites f ON f.track_id = t.id";

fn track_from_row(r: &Row<'_>) -> rusqlite::Result<Track> {
    Ok(Track {
        id: r.get(0)?,
        path: r.get(1)?,
        title: r.get(2)?,
        artist: r.get(3)?,
        artist_id: r.get(4)?,
        album: r.get(5)?,
        album_id: r.get(6)?,
        album_artist: r.get(7)?,
        track_number: r.get(8)?,
        disc_number: r.get(9)?,
        year: r.get(10)?,
        genre: r.get(11)?,
        duration_ms: r.get::<_, i64>(12)?.max(0) as u64,
        format: r.get(13)?,
        artwork: r.get(14)?,
        accent: r.get(15)?,
        favorite: r.get(16)?,
        missing: r.get::<_, i64>(17)? != 0,
        added_at: r.get(18)?,
    })
}

pub fn all_tracks(conn: &Connection) -> AppResult<Vec<Track>> {
    let sql = format!(
        "{TRACK_SELECT} ORDER BY ar.name_key, al.title_key, t.disc_number, t.track_number, t.title"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], track_from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn track_by_id(conn: &Connection, id: TrackId) -> AppResult<Option<Track>> {
    let sql = format!("{TRACK_SELECT} WHERE t.id = ?1");
    Ok(conn.query_row(&sql, [id], track_from_row).optional()?)
}

pub fn albums(conn: &Connection) -> AppResult<Vec<Album>> {
    let mut stmt = conn.prepare(
        "SELECT al.id, al.title, ar.name, al.artist_id, al.year, al.artwork, aw.accent,
                COUNT(t.id), COALESCE(SUM(t.duration_ms), 0), MIN(t.added_at)
         FROM albums al
         JOIN artists ar ON ar.id = al.artist_id
         JOIN tracks t ON t.album_id = al.id AND t.missing = 0
         LEFT JOIN artwork aw ON aw.hash = al.artwork
         GROUP BY al.id
         ORDER BY al.title_key",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Album {
            id: r.get(0)?,
            title: r.get(1)?,
            artist: r.get(2)?,
            artist_id: r.get(3)?,
            year: r.get(4)?,
            artwork: r.get(5)?,
            accent: r.get(6)?,
            track_count: r.get(7)?,
            duration_ms: r.get::<_, i64>(8)?.max(0) as u64,
            added_at: r.get(9)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn artists(conn: &Connection) -> AppResult<Vec<Artist>> {
    // An artist appears if they performed a track or are the album artist of one
    // (compilations credit "Various Artists" only at album level).
    let mut stmt = conn.prepare(
        "WITH credited AS (
             SELECT t.id AS track_id, t.artist_id AS artist_id FROM tracks t WHERE t.missing = 0
             UNION
             SELECT t.id, al.artist_id FROM tracks t JOIN albums al ON al.id = t.album_id WHERE t.missing = 0
         )
         SELECT ar.id, ar.name,
                (SELECT COUNT(*) FROM albums al WHERE al.artist_id = ar.id
                    AND EXISTS (SELECT 1 FROM tracks t2 WHERE t2.album_id = al.id AND t2.missing = 0)),
                COUNT(DISTINCT c.track_id),
                (SELECT al.artwork FROM albums al WHERE al.artist_id = ar.id AND al.artwork IS NOT NULL LIMIT 1),
                (SELECT aw.accent FROM albums al JOIN artwork aw ON aw.hash = al.artwork
                    WHERE al.artist_id = ar.id LIMIT 1)
         FROM artists ar
         JOIN credited c ON c.artist_id = ar.id
         GROUP BY ar.id
         ORDER BY ar.name_key",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Artist {
            id: r.get(0)?,
            name: r.get(1)?,
            album_count: r.get(2)?,
            track_count: r.get(3)?,
            artwork: r.get(4)?,
            accent: r.get(5)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

// ---------------------------------------------------------------- favourites & history

pub fn set_favorite(conn: &Connection, track_id: TrackId, favorite: bool) -> AppResult<()> {
    if favorite {
        conn.execute(
            "INSERT OR IGNORE INTO favorites (track_id, created_at) VALUES (?1, ?2)",
            params![track_id, now_ms()],
        )?;
    } else {
        conn.execute("DELETE FROM favorites WHERE track_id = ?1", [track_id])?;
    }
    Ok(())
}

pub fn record_play(conn: &Connection, track_id: TrackId) -> AppResult<()> {
    conn.execute(
        "INSERT INTO play_history (track_id, played_at) VALUES (?1, ?2)",
        params![track_id, now_ms()],
    )?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub track_id: TrackId,
    pub played_at: i64,
}

/// Most recent distinct plays, newest first.
pub fn recent_plays(conn: &Connection, limit: u32) -> AppResult<Vec<HistoryEntry>> {
    let mut stmt = conn.prepare(
        "SELECT h.track_id, MAX(h.played_at) AS last FROM play_history h
         JOIN tracks t ON t.id = h.track_id AND t.missing = 0
         GROUP BY h.track_id ORDER BY last DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit], |r| {
        Ok(HistoryEntry {
            track_id: r.get(0)?,
            played_at: r.get(1)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn play_counts(conn: &Connection) -> AppResult<HashMap<TrackId, u32>> {
    let mut stmt = conn.prepare("SELECT track_id, COUNT(*) FROM play_history GROUP BY track_id")?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

// ---------------------------------------------------------------- playlists

pub fn playlists(conn: &Connection) -> AppResult<Vec<Playlist>> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.created_at, p.updated_at,
                COUNT(pt.id), COALESCE(SUM(t.duration_ms), 0)
         FROM playlists p
         LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
         LEFT JOIN tracks t ON t.id = pt.track_id
         GROUP BY p.id ORDER BY p.updated_at DESC",
    )?;
    let mut list: Vec<Playlist> = stmt
        .query_map([], |r| {
            Ok(Playlist {
                id: r.get(0)?,
                name: r.get(1)?,
                created_at: r.get(2)?,
                updated_at: r.get(3)?,
                track_count: r.get(4)?,
                duration_ms: r.get::<_, i64>(5)?.max(0) as u64,
                artworks: Vec::new(),
            })
        })?
        .collect::<Result<_, _>>()?;
    let mut art = conn.prepare(
        "SELECT t.artwork FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id
         WHERE pt.playlist_id = ?1 AND t.artwork IS NOT NULL
         GROUP BY t.artwork ORDER BY MIN(pt.position) LIMIT 4",
    )?;
    for p in &mut list {
        p.artworks = art
            .query_map([p.id], |r| r.get(0))?
            .collect::<Result<_, _>>()?;
    }
    Ok(list)
}

fn ensure_playlist(conn: &Connection, id: PlaylistId) -> AppResult<()> {
    conn.query_row("SELECT 1 FROM playlists WHERE id = ?1", [id], |_| Ok(()))
        .optional()?
        .ok_or_else(|| AppError::NotFound("Playlist not found.".into()))
}

fn validate_playlist_name(name: &str) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::Invalid("Playlist name cannot be empty.".into()));
    }
    if name.chars().count() > 120 {
        return Err(AppError::Invalid(
            "Playlist name is too long (120 characters max).".into(),
        ));
    }
    Ok(name.to_string())
}

pub fn create_playlist(conn: &Connection, name: &str) -> AppResult<PlaylistId> {
    let name = validate_playlist_name(name)?;
    let now = now_ms();
    conn.execute(
        "INSERT INTO playlists (name, created_at, updated_at) VALUES (?1, ?2, ?2)",
        params![name, now],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn rename_playlist(conn: &Connection, id: PlaylistId, name: &str) -> AppResult<()> {
    let name = validate_playlist_name(name)?;
    ensure_playlist(conn, id)?;
    conn.execute(
        "UPDATE playlists SET name = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, name, now_ms()],
    )?;
    Ok(())
}

pub fn delete_playlist(conn: &Connection, id: PlaylistId) -> AppResult<()> {
    conn.execute("DELETE FROM playlists WHERE id = ?1", [id])?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistEntry {
    /// Row id of the playlist entry, stable across reorders.
    pub entry_id: i64,
    pub track_id: TrackId,
    pub added_at: i64,
}

pub fn playlist_entries(conn: &Connection, id: PlaylistId) -> AppResult<Vec<PlaylistEntry>> {
    ensure_playlist(conn, id)?;
    let mut stmt = conn.prepare(
        "SELECT id, track_id, added_at FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position",
    )?;
    let rows = stmt.query_map([id], |r| {
        Ok(PlaylistEntry {
            entry_id: r.get(0)?,
            track_id: r.get(1)?,
            added_at: r.get(2)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn add_to_playlist(
    conn: &mut Connection,
    id: PlaylistId,
    track_ids: &[TrackId],
) -> AppResult<()> {
    let tx = conn.transaction()?;
    ensure_playlist(&tx, id)?;
    let mut next: i64 = tx.query_row(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_tracks WHERE playlist_id = ?1",
        [id],
        |r| r.get(0),
    )?;
    let now = now_ms();
    {
        let mut stmt = tx.prepare(
            "INSERT INTO playlist_tracks (playlist_id, track_id, position, added_at) VALUES (?1, ?2, ?3, ?4)",
        )?;
        for track in track_ids {
            stmt.execute(params![id, track, next, now])?;
            next += 1;
        }
    }
    tx.execute(
        "UPDATE playlists SET updated_at = ?2 WHERE id = ?1",
        params![id, now],
    )?;
    tx.commit()?;
    Ok(())
}

pub fn remove_from_playlist(
    conn: &mut Connection,
    id: PlaylistId,
    entry_ids: &[i64],
) -> AppResult<()> {
    let tx = conn.transaction()?;
    {
        let mut stmt =
            tx.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND id = ?2")?;
        for entry in entry_ids {
            stmt.execute(params![id, entry])?;
        }
    }
    renumber_playlist(&tx, id)?;
    tx.execute(
        "UPDATE playlists SET updated_at = ?2 WHERE id = ?1",
        params![id, now_ms()],
    )?;
    tx.commit()?;
    Ok(())
}

/// Move an entry to `to_index` (0-based, in the current order).
pub fn move_in_playlist(
    conn: &mut Connection,
    id: PlaylistId,
    entry_id: i64,
    to_index: usize,
) -> AppResult<()> {
    let tx = conn.transaction()?;
    let mut order: Vec<i64> = {
        let mut stmt =
            tx.prepare("SELECT id FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position")?;
        let rows = stmt.query_map([id], |r| r.get(0))?;
        rows.collect::<Result<_, _>>()?
    };
    let from = order
        .iter()
        .position(|&e| e == entry_id)
        .ok_or_else(|| AppError::NotFound("Playlist entry not found.".into()))?;
    let entry = order.remove(from);
    order.insert(to_index.min(order.len()), entry);
    {
        let mut stmt = tx.prepare("UPDATE playlist_tracks SET position = ?2 WHERE id = ?1")?;
        for (pos, entry) in order.iter().enumerate() {
            stmt.execute(params![entry, pos as i64])?;
        }
    }
    tx.execute(
        "UPDATE playlists SET updated_at = ?2 WHERE id = ?1",
        params![id, now_ms()],
    )?;
    tx.commit()?;
    Ok(())
}

fn renumber_playlist(conn: &Connection, id: PlaylistId) -> AppResult<()> {
    conn.execute(
        "UPDATE playlist_tracks SET position = (
            SELECT COUNT(*) FROM playlist_tracks p2
            WHERE p2.playlist_id = playlist_tracks.playlist_id AND p2.position < playlist_tracks.position)
         WHERE playlist_id = ?1",
        [id],
    )?;
    Ok(())
}

// ---------------------------------------------------------------- settings

pub fn get_setting(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    Ok(conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| {
            r.get(0)
        })
        .optional()?)
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Db;

    fn seed(conn: &Connection, n: usize) -> (i64, Vec<TrackId>) {
        let folder = add_folder(conn, "C:\\Music", "c:\\music").unwrap();
        let artist = upsert_artist(conn, "Aurel  Vane").unwrap();
        let album = upsert_album(conn, "Night Tide", artist, Some(2024), None).unwrap();
        let ids = (0..n)
            .map(|i| {
                upsert_track(
                    conn,
                    &TrackRecord {
                        path: format!("C:\\Music\\{i}.flac"),
                        path_key: format!("c:\\music\\{i}.flac"),
                        folder_id: Some(folder),
                        title: format!("Track {i}"),
                        artist_id: artist,
                        album_id: album,
                        album_artist: "Aurel Vane".into(),
                        track_number: Some(i as u32 + 1),
                        disc_number: None,
                        year: Some(2024),
                        genre: None,
                        duration_ms: 1000,
                        format: "flac".into(),
                        file_size: 10,
                        file_mtime: 1,
                        artwork: None,
                    },
                )
                .unwrap()
            })
            .collect();
        (folder, ids)
    }

    #[test]
    fn artist_names_deduplicate_by_key() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn();
        let a = upsert_artist(&conn, "Aurel Vane").unwrap();
        let b = upsert_artist(&conn, " aurel   VANE ").unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn upsert_preserves_track_identity() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn();
        let (folder, ids) = seed(&conn, 1);
        set_favorite(&conn, ids[0], true).unwrap();
        let artist = upsert_artist(&conn, "Aurel Vane").unwrap();
        let album = upsert_album(&conn, "Night Tide", artist, None, None).unwrap();
        let again = upsert_track(
            &conn,
            &TrackRecord {
                path: "C:\\Music\\0.flac".into(),
                path_key: "c:\\music\\0.flac".into(),
                folder_id: Some(folder),
                title: "Renamed".into(),
                artist_id: artist,
                album_id: album,
                album_artist: "Aurel Vane".into(),
                track_number: None,
                disc_number: None,
                year: None,
                genre: None,
                duration_ms: 1,
                format: "flac".into(),
                file_size: 11,
                file_mtime: 2,
                artwork: None,
            },
        )
        .unwrap();
        assert_eq!(again, ids[0]);
        let t = track_by_id(&conn, again).unwrap().unwrap();
        assert_eq!(t.title, "Renamed");
        assert!(t.favorite, "favourite survives re-index");
    }

    #[test]
    fn nested_folders_are_rejected() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn();
        add_folder(&conn, "D:\\Music", "d:\\music").unwrap();
        assert!(add_folder(&conn, "D:\\Music\\Jazz", "d:\\music\\jazz").is_err());
        assert!(add_folder(&conn, "D:\\", "d:\\").is_err());
        assert!(add_folder(&conn, "D:\\Musicals", "d:\\musicals").is_ok());
    }

    #[test]
    fn metadata_edits_survive_reindex_without_losing_memberships() {
        let db = Db::open_in_memory().unwrap();
        let mut conn = db.conn();
        let (folder, ids) = seed(&conn, 1);
        let id = ids[0];
        set_favorite(&conn, id, true).unwrap();
        let edit = MetadataEdit {
            title: "نام تازه".into(),
            artist: "هنرمند".into(),
            album: "New album".into(),
            album_artist: "هنرمند".into(),
            year: Some(2026),
            genre: Some("Ambient".into()),
            artwork: None,
        };
        save_metadata_edit(&mut conn, id, &edit).unwrap();
        let artist = upsert_artist(&conn, "Original artist").unwrap();
        let album = upsert_album(&conn, "Original album", artist, None, None).unwrap();
        let again = upsert_track(
            &conn,
            &TrackRecord {
                path: "C:\\Music\\0.flac".into(),
                path_key: "c:\\music\\0.flac".into(),
                folder_id: Some(folder),
                title: "Original title".into(),
                artist_id: artist,
                album_id: album,
                album_artist: "Original artist".into(),
                track_number: Some(1),
                disc_number: None,
                year: None,
                genre: None,
                duration_ms: 2000,
                format: "flac".into(),
                file_size: 11,
                file_mtime: 2,
                artwork: None,
            },
        )
        .unwrap();
        let track = track_by_id(&conn, again).unwrap().unwrap();
        assert_eq!(again, id);
        assert_eq!(track.title, edit.title);
        assert_eq!(track.artist, edit.artist);
        assert_eq!(track.album, edit.album);
        assert_eq!(track.year, Some(2026));
        assert_eq!(track.duration_ms, 2000);
        assert!(track.favorite);
        assert_eq!(
            albums(&conn)
                .unwrap()
                .iter()
                .find(|a| a.id == track.album_id)
                .unwrap()
                .title,
            "New album"
        );
    }

    #[test]
    fn playlist_add_remove_reorder() {
        let db = Db::open_in_memory().unwrap();
        let mut conn = db.conn();
        let (_, ids) = seed(&conn, 4);
        let p = create_playlist(&conn, "  Late drive ").unwrap();
        add_to_playlist(&mut conn, p, &ids).unwrap();
        let entries = playlist_entries(&conn, p).unwrap();
        assert_eq!(entries.iter().map(|e| e.track_id).collect::<Vec<_>>(), ids);

        move_in_playlist(&mut conn, p, entries[3].entry_id, 0).unwrap();
        let order: Vec<_> = playlist_entries(&conn, p)
            .unwrap()
            .iter()
            .map(|e| e.track_id)
            .collect();
        assert_eq!(order, vec![ids[3], ids[0], ids[1], ids[2]]);

        remove_from_playlist(&mut conn, p, &[entries[0].entry_id]).unwrap();
        let order: Vec<_> = playlist_entries(&conn, p)
            .unwrap()
            .iter()
            .map(|e| e.track_id)
            .collect();
        assert_eq!(order, vec![ids[3], ids[1], ids[2]]);

        let list = playlists(&conn).unwrap();
        assert_eq!(list[0].name, "Late drive");
        assert_eq!(list[0].track_count, 3);
        assert_eq!(list[0].duration_ms, 3000);
    }

    #[test]
    fn playlist_names_are_validated() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn();
        assert!(create_playlist(&conn, "   ").is_err());
        assert!(rename_playlist(&conn, 999, "x").is_err());
    }

    #[test]
    fn removing_folder_cascades_and_cleans_orphans() {
        let db = Db::open_in_memory().unwrap();
        let mut conn = db.conn();
        let (folder, ids) = seed(&conn, 2);
        let p = create_playlist(&conn, "Mix").unwrap();
        add_to_playlist(&mut conn, p, &ids).unwrap();
        record_play(&conn, ids[0]).unwrap();
        remove_folder(&mut conn, folder).unwrap();
        assert!(all_tracks(&conn).unwrap().is_empty());
        assert!(albums(&conn).unwrap().is_empty());
        assert!(artists(&conn).unwrap().is_empty());
        assert_eq!(playlists(&conn).unwrap()[0].track_count, 0);
        assert!(recent_plays(&conn, 10).unwrap().is_empty());
    }

    #[test]
    fn compilation_album_artists_are_listed() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn();
        let folder = add_folder(&conn, "C:\\Music", "c:\\music").unwrap();
        let performer = upsert_artist(&conn, "Kestrel Lines").unwrap();
        let various = upsert_artist(&conn, "Various Artists").unwrap();
        let album = upsert_album(&conn, "Sampler", various, None, None).unwrap();
        upsert_track(
            &conn,
            &TrackRecord {
                path: "C:\\Music\\a.mp3".into(),
                path_key: "c:\\music\\a.mp3".into(),
                folder_id: Some(folder),
                title: "Aurora".into(),
                artist_id: performer,
                album_id: album,
                album_artist: "Various Artists".into(),
                track_number: Some(1),
                disc_number: None,
                year: None,
                genre: None,
                duration_ms: 1000,
                format: "mp3".into(),
                file_size: 1,
                file_mtime: 1,
                artwork: None,
            },
        )
        .unwrap();
        let list = artists(&conn).unwrap();
        let names: Vec<_> = list
            .iter()
            .map(|a| (a.name.as_str(), a.album_count, a.track_count))
            .collect();
        assert_eq!(
            names,
            vec![("Kestrel Lines", 0, 1), ("Various Artists", 1, 1)]
        );
    }

    #[test]
    fn missing_tracks_are_excluded_from_aggregates() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn();
        let (_, ids) = seed(&conn, 3);
        set_missing(&conn, &ids[..1], true).unwrap();
        assert_eq!(albums(&conn).unwrap()[0].track_count, 2);
        assert_eq!(
            all_tracks(&conn)
                .unwrap()
                .iter()
                .filter(|t| t.missing)
                .count(),
            1
        );
    }
}
