import { create } from "zustand";

import { backend } from "@/services/backend";
import type {
  Album,
  AlbumId,
  Artist,
  ArtistId,
  HistoryEntry,
  LibraryFolder,
  Playlist,
  ScanProgress,
  ScanSummary,
  Track,
  TrackId,
} from "@/types/domain";
import { notifyError } from "./toasts";

interface LibraryState {
  loaded: boolean;
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
  folders: LibraryFolder[];
  recentPlays: HistoryEntry[];
  playCounts: Record<string, number>;
  trackById: Map<TrackId, Track>;
  albumById: Map<AlbumId, Album>;
  artistById: Map<ArtistId, Artist>;
  scanning: boolean;
  importing: boolean;
  scanProgress: ScanProgress | null;
  lastScanSummary: ScanSummary | null;
}

export const useLibrary = create<LibraryState>(() => ({
  loaded: false,
  tracks: [],
  albums: [],
  artists: [],
  playlists: [],
  folders: [],
  recentPlays: [],
  playCounts: {},
  trackById: new Map(),
  albumById: new Map(),
  artistById: new Map(),
  scanning: false,
  importing: false,
  scanProgress: null,
  lastScanSummary: null,
}));

let inflight: Promise<void> | null = null;
let queued = false;

/** Reload everything from the backend. Concurrent calls coalesce into one extra pass. */
export function refreshLibrary(): Promise<void> {
  if (inflight) {
    queued = true;
    return inflight;
  }
  inflight = (async () => {
    try {
      do {
        queued = false;
        const api = backend();
        const [snapshot, playlists, folders, recentPlays] = await Promise.all([
          api.library.snapshot(),
          api.playlists.list(),
          api.library.folders(),
          api.library.recentPlays(40),
        ]);
        useLibrary.setState({
          loaded: true,
          tracks: snapshot.tracks,
          albums: snapshot.albums,
          artists: snapshot.artists,
          playCounts: snapshot.playCounts,
          scanning: snapshot.scanning,
          playlists,
          folders,
          recentPlays,
          trackById: new Map(snapshot.tracks.map((t) => [t.id, t])),
          albumById: new Map(snapshot.albums.map((a) => [a.id, a])),
          artistById: new Map(snapshot.artists.map((a) => [a.id, a])),
        });
      } while (queued);
    } catch (e) {
      notifyError("Couldn't load your library", e);
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Optimistic favourite toggle; the backend confirms via `library://changed`. */
export async function setFavorite(ids: TrackId[], favorite: boolean): Promise<void> {
  useLibrary.setState((s) => {
    const tracks = s.tracks.map((t) => (ids.includes(t.id) ? { ...t, favorite } : t));
    return { tracks, trackById: new Map(tracks.map((t) => [t.id, t])) };
  });
  try {
    await backend().library.setFavorite(ids, favorite);
  } catch (e) {
    notifyError("Couldn't update favorites", e);
    void refreshLibrary();
  }
}

export function tracksByIds(ids: readonly TrackId[]): Track[] {
  const map = useLibrary.getState().trackById;
  return ids.map((id) => map.get(id)).filter((t): t is Track => !!t);
}
