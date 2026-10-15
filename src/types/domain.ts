/**
 * Domain types mirrored from `src-tauri/src/domain/models.rs` and the command
 * payloads in `src-tauri/src/commands`. Keep these in sync with the Rust structs
 * (serde camelCase).
 */

export type TrackId = number;
export type AlbumId = number;
export type ArtistId = number;
export type PlaylistId = number;

export interface Track {
  id: TrackId;
  path: string;
  title: string;
  artist: string;
  artistId: ArtistId;
  album: string;
  albumId: AlbumId;
  albumArtist: string;
  trackNumber: number | null;
  discNumber: number | null;
  year: number | null;
  genre: string | null;
  durationMs: number;
  format: string;
  artwork: string | null;
  accent: string | null;
  favorite: boolean;
  missing: boolean;
  addedAt: number;
}

export interface Album {
  id: AlbumId;
  title: string;
  artist: string;
  artistId: ArtistId;
  year: number | null;
  artwork: string | null;
  accent: string | null;
  trackCount: number;
  durationMs: number;
  addedAt: number;
}

export interface Artist {
  id: ArtistId;
  name: string;
  albumCount: number;
  trackCount: number;
  artwork: string | null;
  accent: string | null;
}

export interface Playlist {
  id: PlaylistId;
  name: string;
  trackCount: number;
  durationMs: number;
  artworks: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PlaylistEntry {
  entryId: number;
  trackId: TrackId;
  addedAt: number;
}

export interface LibraryFolder {
  id: number;
  path: string;
  pathKey: string;
  trackCount: number;
  available: boolean;
}

export interface LibrarySnapshot {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  playCounts: Record<string, number>;
  scanning: boolean;
}

export interface HistoryEntry {
  trackId: TrackId;
  playedAt: number;
}

export interface ImportResult {
  trackIds: TrackId[];
  rejected: string[];
}

export interface TrackEditRequest {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  year: number | null;
  genre: string | null;
  artworkPath: string | null;
  writeToFile: boolean;
}

export type RepeatMode = "off" | "all" | "one";
export type PlaybackStatus = "idle" | "loading" | "playing" | "paused";

export interface QueueEntry {
  uid: number;
  trackId: TrackId;
}

export interface PlayerSnapshot {
  status: PlaybackStatus;
  current: Track | null;
  currentUid: number | null;
  queue: QueueEntry[];
  cursor: number | null;
  positionMs: number;
  durationMs: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
}

export interface Progress {
  positionMs: number;
  durationMs: number;
}

export interface PlayerErrorEvent {
  message: string;
  trackId: TrackId | null;
}

export type ScanPhase = "discovering" | "indexing" | "finishing";

export interface ScanProgress {
  phase: ScanPhase;
  processed: number;
  total: number;
  current: string | null;
}

export interface ScanSummary {
  discovered: number;
  addedOrUpdated: number;
  unchanged: number;
  missing: number;
  failed: string[];
  unavailableFolders: string[];
  cancelled: boolean;
  elapsedMs: number;
}

export interface AppError {
  kind: "database" | "io" | "audio" | "notFound" | "invalid" | "unavailable";
  message: string;
}

export type Preferences = Partial<{
  motion: "system" | "reduced" | "full";
  ambientBackground: "true" | "false";
  visualizer: "true" | "false";
  scanOnStartup: "true" | "false";
  libraryView: "list" | "grid";
  albumView: "list" | "grid";
  coverStyle: "artwork" | "vinyl";
  albumSort: "title" | "artist" | "addedAt";
  songSort: string;
  pinnedAlbums: string;
  panelWidth: string;
  panelVisible: "true" | "false";
  cleanTags: "true" | "false";
  language: "fa" | "en";
}>;
