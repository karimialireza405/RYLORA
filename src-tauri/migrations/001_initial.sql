-- RYLORA initial schema.

CREATE TABLE library_folders (
    id        INTEGER PRIMARY KEY,
    path      TEXT    NOT NULL,
    path_key  TEXT    NOT NULL UNIQUE,
    added_at  INTEGER NOT NULL
);

CREATE TABLE artists (
    id        INTEGER PRIMARY KEY,
    name      TEXT NOT NULL,
    name_key  TEXT NOT NULL UNIQUE
);

CREATE TABLE artwork (
    hash    TEXT PRIMARY KEY,
    accent  TEXT
);

CREATE TABLE albums (
    id         INTEGER PRIMARY KEY,
    title      TEXT    NOT NULL,
    title_key  TEXT    NOT NULL,
    artist_id  INTEGER NOT NULL REFERENCES artists(id),
    year       INTEGER,
    artwork    TEXT REFERENCES artwork(hash),
    UNIQUE (title_key, artist_id)
);

CREATE TABLE tracks (
    id            INTEGER PRIMARY KEY,
    path          TEXT    NOT NULL,
    path_key      TEXT    NOT NULL UNIQUE,
    folder_id     INTEGER REFERENCES library_folders(id) ON DELETE CASCADE, -- NULL for individually opened files
    title         TEXT    NOT NULL,
    artist_id     INTEGER NOT NULL REFERENCES artists(id),
    album_id      INTEGER NOT NULL REFERENCES albums(id),
    album_artist  TEXT    NOT NULL,
    track_number  INTEGER,
    disc_number   INTEGER,
    year          INTEGER,
    genre         TEXT,
    duration_ms   INTEGER NOT NULL DEFAULT 0,
    format        TEXT    NOT NULL,
    file_size     INTEGER NOT NULL,
    file_mtime    INTEGER NOT NULL,
    artwork       TEXT REFERENCES artwork(hash),
    missing       INTEGER NOT NULL DEFAULT 0,
    added_at      INTEGER NOT NULL
);
CREATE INDEX tracks_album  ON tracks(album_id);
CREATE INDEX tracks_artist ON tracks(artist_id);
CREATE INDEX tracks_folder ON tracks(folder_id);
CREATE INDEX tracks_added  ON tracks(added_at DESC);

CREATE TABLE favorites (
    track_id    INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL
);

CREATE TABLE playlists (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE TABLE playlist_tracks (
    id           INTEGER PRIMARY KEY,
    playlist_id  INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id     INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL,
    added_at     INTEGER NOT NULL
);
CREATE INDEX playlist_tracks_order ON playlist_tracks(playlist_id, position);

CREATE TABLE play_history (
    id         INTEGER PRIMARY KEY,
    track_id   INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    played_at  INTEGER NOT NULL
);
CREATE INDEX play_history_time ON play_history(played_at DESC);

CREATE TABLE settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);
