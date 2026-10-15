-- User edits survive later rescans without changing source files by default.
CREATE TABLE metadata_edits (
    track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
    value TEXT NOT NULL
);
