-- Loudness levelling. One row per track, valid while the file is unchanged.
CREATE TABLE track_loudness (
    track_id    INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
    file_size   INTEGER NOT NULL,
    file_mtime  INTEGER NOT NULL,
    source      TEXT    NOT NULL,  -- 'tags' | 'analysis' | 'failed'
    lufs        REAL,              -- integrated loudness; NULL for silence or failures
    peak        REAL,              -- linear sample peak, 1.0 = full scale
    album_lufs  REAL,              -- only when the file carries album ReplayGain tags
    album_peak  REAL,
    audible_start_ms INTEGER,      -- where sound starts and ends (above -50 dBFS);
    audible_end_ms   INTEGER,      -- crossfades skip the silence outside
    measured_at INTEGER NOT NULL
);
