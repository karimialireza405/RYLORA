import type { Album, Artist, Playlist, Track } from "@/types/domain";

export type TrackSortKey = "title" | "artist" | "album" | "addedAt" | "durationMs" | "default" | "playCount";
export type SortDirection = "asc" | "desc";

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** Album order: disc, then track number, then title. */
export function compareAlbumOrder(a: Track, b: Track): number {
  return (
    (a.discNumber ?? 1) - (b.discNumber ?? 1) ||
    (a.trackNumber ?? Number.MAX_SAFE_INTEGER) - (b.trackNumber ?? Number.MAX_SAFE_INTEGER) ||
    collator.compare(a.title, b.title)
  );
}

/** Stable sort that groups ties by artist → album → track order. */
export function sortTracks(tracks: readonly Track[], key: TrackSortKey, dir: SortDirection = "asc", playCounts: Record<string,number> = {}): Track[] {
  const sign = dir === "asc" ? 1 : -1;
  const fallback = (a: Track, b: Track) =>
    collator.compare(a.albumArtist, b.albumArtist) || collator.compare(a.album, b.album) || compareAlbumOrder(a, b);
  const primary: Record<TrackSortKey, (a: Track, b: Track) => number> = {
    default: () => 0,
    playCount: (a,b) => (playCounts[a.id] ?? 0)-(playCounts[b.id] ?? 0),
    title: (a, b) => collator.compare(a.title, b.title),
    artist: (a, b) => collator.compare(a.artist, b.artist),
    album: (a, b) => collator.compare(a.album, b.album),
    addedAt: (a, b) => a.addedAt - b.addedAt,
    durationMs: (a, b) => a.durationMs - b.durationMs,
  };
  return [...tracks].sort((a, b) => sign * primary[key](a, b) || fallback(a, b));
}

/** Lower-case, accent-insensitive form used for matching. */
export function normalize(text: string): string {
  return text.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function score(haystack: string, needle: string): number {
  if (!needle) return 0;
  const h = normalize(haystack);
  if (h === needle) return 100;
  if (h.startsWith(needle)) return 80;
  if (h.split(/[\s\-–—_&,.()]+/).some((w) => w.startsWith(needle))) return 60;
  if (h.includes(needle)) return 30;
  return 0;
}

/** Every whitespace-separated term must match one of the fields. */
function multiScore(fields: string[], query: string): number {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return 0;
  let total = 0;
  for (const term of terms) {
    const best = Math.max(...fields.map((f, i) => score(f, term) * (i === 0 ? 1 : 0.6)));
    if (best === 0) return 0;
    total += best;
  }
  return total / terms.length;
}

export interface SearchResults {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
  top: { kind: "track"; item: Track } | { kind: "album"; item: Album } | { kind: "artist"; item: Artist } | null;
}

function ranked<T>(items: readonly T[], fields: (item: T) => string[], query: string, limit: number) {
  return items
    .map((item) => ({ item, s: multiScore(fields(item), query) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit);
}

export function searchLibrary(
  query: string,
  data: { tracks: readonly Track[]; albums: readonly Album[]; artists: readonly Artist[]; playlists: readonly Playlist[] },
  limit = 50,
): SearchResults {
  const q = query.trim();
  if (!q) return { tracks: [], albums: [], artists: [], playlists: [], top: null };
  const tracks = ranked(data.tracks.filter((t) => !t.missing), (t) => [t.title, t.artist, t.album], q, limit);
  const albums = ranked(data.albums, (a) => [a.title, a.artist], q, limit);
  const artists = ranked(data.artists, (a) => [a.name], q, limit);
  const playlists = ranked(data.playlists, (p) => [p.name], q, limit);

  const candidates = [
    artists[0] && { kind: "artist" as const, item: artists[0].item, s: artists[0].s + 5 },
    albums[0] && { kind: "album" as const, item: albums[0].item, s: albums[0].s + 2 },
    tracks[0] && { kind: "track" as const, item: tracks[0].item, s: tracks[0].s },
  ].filter((c): c is NonNullable<typeof c> => !!c);
  const best = candidates.sort((a, b) => b.s - a.s)[0];

  return {
    tracks: tracks.map((r) => r.item),
    albums: albums.map((r) => r.item),
    artists: artists.map((r) => r.item),
    playlists: playlists.map((r) => r.item),
    top: best ? ({ kind: best.kind, item: best.item } as SearchResults["top"]) : null,
  };
}

/** Deterministic daily pick so "From your library" changes once a day, not every render. */
export function dailyPick<T>(items: readonly T[], count: number, date = new Date()): T[] {
  let seed = date.getFullYear() * 1000 + date.getMonth() * 40 + date.getDate();
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, count);
}
