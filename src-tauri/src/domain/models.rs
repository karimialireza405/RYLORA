//! Core domain models shared by the application and infrastructure layers.
//!
//! These types are serialized across the Tauri IPC boundary, so field names are
//! camelCase on the wire and mirrored by `src/types/domain.ts` on the frontend.

use serde::{Deserialize, Serialize};

pub type TrackId = i64;
pub type AlbumId = i64;
pub type ArtistId = i64;
pub type PlaylistId = i64;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: TrackId,
    pub path: String,
    pub title: String,
    pub artist: String,
    pub artist_id: ArtistId,
    pub album: String,
    pub album_id: AlbumId,
    pub album_artist: String,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub duration_ms: u64,
    pub format: String,
    /// BLAKE3 hash of the embedded cover, used to address cached artwork.
    pub artwork: Option<String>,
    /// Accent colour (`#rrggbb`) extracted from the artwork.
    pub accent: Option<String>,
    pub favorite: bool,
    pub missing: bool,
    /// Unix epoch milliseconds when the track entered the library.
    pub added_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Album {
    pub id: AlbumId,
    pub title: String,
    pub artist: String,
    pub artist_id: ArtistId,
    pub year: Option<u32>,
    pub artwork: Option<String>,
    pub accent: Option<String>,
    pub track_count: u32,
    pub duration_ms: u64,
    pub added_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Artist {
    pub id: ArtistId,
    pub name: String,
    pub album_count: u32,
    pub track_count: u32,
    /// Artwork of one of the artist's albums, used as a portrait stand-in.
    pub artwork: Option<String>,
    pub accent: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: PlaylistId,
    pub name: String,
    pub track_count: u32,
    pub duration_ms: u64,
    /// Up to four distinct artwork hashes for a mosaic cover.
    pub artworks: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum RepeatMode {
    #[default]
    Off,
    All,
    One,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum PlaybackStatus {
    #[default]
    Idle,
    Loading,
    Playing,
    Paused,
}
