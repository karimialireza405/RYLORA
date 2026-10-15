/**
 * DEVELOPMENT-ONLY browser preview backend.
 *
 * Loaded only by `vite dev` when the page is opened in a normal browser instead of
 * the Tauri window, so layouts can be inspected at arbitrary viewport sizes. It
 * produces no audio and no spectrum data, and is excluded from production builds
 * (see ./index.ts). Every name below is fictional.
 */
import type { Backend, BackendEvents } from "./types";
import { setArtworkResolver } from "@/services/artwork";
import type {
  Album,
  AudioSettings,
  Artist,
  LibrarySnapshot,
  PlayerSnapshot,
  Playlist,
  PlaylistEntry,
  Preferences,
  QueueEntry,
  Track,
} from "@/types/domain";

type Handler = (payload: never) => void;

const CATALOGUE: Array<[artist: string, album: string, year: number, hue: number, titles: string[]]> = [
  ["Aurel Vane", "Night Tide", 2024, 232, ["Low Light", "Night Tide", "Salt & Static", "Undertow", "Harbour Lamps"]],
  ["Mira Solenne", "Glass Cathedral", 2023, 168, ["Vespers", "Clerestory", "Stained", "Nave"]],
  ["Kestrel Lines", "Low Orbit", 2025, 340, ["Perigee", "Telemetry", "Re-entry"]],
  ["Orin & The Hollow", "Paper Suns", 2022, 32, ["Kindling", "Paper Suns", "Ash Garden"]],
  ["سایه‌ها", "نوای شب", 2021, 18, ["ماه نو", "کوچه‌باغ"]],
  ["Lumen Ward", "Quiet Machines", 2020, 262, ["Idle Hands", "Servo", "Long Exposure", "Soft Reset", "Coil"]],
  ["Talia Reyes", "Coastline Studies", 2024, 196, ["Tidepool", "Breakwater", "Fog Index", "Marram"]],
  ["The Velvet Hours", "After the Rain", 2019, 300, ["Petrichor", "Neon Puddles", "Umbrella Sky", "Last Tram"]],
  ["Halden", "Northbound", 2022, 210, ["Fjord", "Permafrost", "Snowline", "Polar Night", "Thaw"]],
  ["Saffron Drift", "Spice Route", 2021, 44, ["Caravan", "Cardamom", "Desert Glass"]],
  ["Noor Atlas", "Meridian", 2025, 150, ["Equinox", "Longitude", "Solstice"]],
  ["Juno Marsh", "Small Hours", 2023, 280, ["3:14 AM", "Streetlight", "Insomnia Waltz", "Daybreak"]],
];

function hashOf(seed: string): string {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return (h >>> 0).toString(16).padStart(8, "0").repeat(4);
}

const artworkHues = new Map<string, number>();

/** Deterministic abstract cover for preview mode. */
export function previewArtwork(hash: string): string {
  const hue = artworkHues.get(hash) ?? 220;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='hsl(${hue} 55% 22%)'/><stop offset='1' stop-color='hsl(${(hue + 40) % 360} 60% 10%)'/></linearGradient>
      <radialGradient id='r' cx='0.7' cy='0.3' r='0.6'><stop offset='0' stop-color='hsl(${hue} 80% 65%)' stop-opacity='0.9'/>
      <stop offset='1' stop-color='hsl(${hue} 80% 65%)' stop-opacity='0'/></radialGradient></defs>
    <rect width='200' height='200' fill='url(#g)'/><rect width='200' height='200' fill='url(#r)'/>
    <circle cx='60' cy='140' r='46' fill='none' stroke='hsl(${(hue + 180) % 360} 70% 70%)' stroke-opacity='0.35' stroke-width='3'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildLibrary(): LibrarySnapshot {
  const tracks: Track[] = [];
  const albums: Album[] = [];
  const artists: Artist[] = [];
  let trackId = 1;
  const day = 86_400_000;
  const now = Date.now();
  CATALOGUE.forEach(([artist, title, year, hue, titles], i) => {
    const artwork = i === 3 ? null : hashOf(title);
    if (artwork) artworkHues.set(artwork, hue);
    const accent = artwork ? `hsl(${hue} 75% 70%)` : null;
    const addedAt = now - i * 3.3 * day;
    const albumTracks = titles.map((t, n) => ({
      id: trackId++,
      path: `C:\\Music\\${artist}\\${title}\\${n + 1}.flac`,
      title: t,
      artist,
      artistId: i + 1,
      album: title,
      albumId: i + 1,
      albumArtist: artist,
      trackNumber: n + 1,
      discNumber: null,
      year,
      genre: "Electronic",
      durationMs: 150_000 + ((i * 37 + n * 53) % 140) * 1000,
      format: "flac",
      artwork,
      accent,
      favorite: (i + n) % 5 === 0,
      missing: false,
      addedAt,
    }));
    tracks.push(...albumTracks);
    albums.push({
      id: i + 1,
      title,
      artist,
      artistId: i + 1,
      year,
      artwork,
      accent,
      trackCount: titles.length,
      durationMs: albumTracks.reduce((s, t) => s + t.durationMs, 0),
      addedAt,
    });
    artists.push({ id: i + 1, name: artist, albumCount: 1, trackCount: titles.length, artwork, accent });
  });
  return { tracks, albums, artists, playCounts: { 1: 12, 2: 9, 6: 7, 14: 5 }, scanning: false };
}

export function createPreviewBackend(): Backend {
  setArtworkResolver((hash) => previewArtwork(hash));
  const handlers = new Map<string, Set<Handler>>();
  const emit = <E extends keyof BackendEvents>(event: E, payload: BackendEvents[E]) =>
    handlers.get(event)?.forEach((h) => h(payload as never));

  const library = buildLibrary();
  const byId = new Map(library.tracks.map((t) => [t.id, t]));
  let uid = 0;
  let prefs: Preferences = {};
  const playlists: Array<Playlist & { entries: PlaylistEntry[] }> = [];
  let entryId = 0;
  const history = [2, 6, 14, 9, 1, 20].map((trackId, i) => ({ trackId, playedAt: Date.now() - i * 3_600_000 }));

  const state: PlayerSnapshot = {
    status: "paused",
    current: byId.get(2) ?? null,
    currentUid: null,
    queue: [],
    cursor: null,
    positionMs: 64_000,
    durationMs: byId.get(2)?.durationMs ?? 0,
    volume: 0.8,
    muted: false,
    shuffle: false,
    repeat: "off",
  };
  const setQueue = (ids: number[], start: number) => {
    state.queue = ids.map((trackId): QueueEntry => ({ uid: ++uid, trackId }));
    state.cursor = state.queue.length ? Math.min(start, state.queue.length - 1) : null;
    syncCurrent();
  };
  const syncCurrent = () => {
    const entry = state.cursor !== null ? state.queue[state.cursor] : undefined;
    state.current = entry ? (byId.get(entry.trackId) ?? null) : null;
    state.currentUid = entry?.uid ?? null;
    state.durationMs = state.current?.durationMs ?? 0;
  };
  setQueue(library.tracks.slice(0, 12).map((t) => t.id), 1);

  const audio: AudioSettings = {
    equalizer: { enabled: false, preampDb: 0, gainsDb: Array(10).fill(0) },
    outputDevice: null,
    devices: [
      { id: "preview-speakers", name: "Speakers (Realtek Audio)", isDefault: true },
      { id: "preview-headphones", name: "Headphones (USB Audio)", isDefault: false },
    ],
    leveling: { mode: "track", target: "normal" },
    crossfade: { enabled: false, seconds: 6, keepAlbumsGapless: true },
    loudness: { measured: 0, total: 0 },
  };

  const changed = () => emit("player://state", { ...state, queue: [...state.queue] });
  const step = (delta: number) => {
    if (state.cursor === null) return;
    const next = state.cursor + delta;
    if (next < 0 || next >= state.queue.length) return;
    state.cursor = next;
    state.positionMs = 0;
    syncCurrent();
    changed();
  };

  window.setInterval(() => {
    if (state.status !== "playing") return;
    state.positionMs += 250;
    if (state.positionMs >= state.durationMs) {
      state.positionMs = 0;
      step(1);
    }
    emit("player://progress", { positionMs: state.positionMs, durationMs: state.durationMs });
  }, 250);

  const ok = async () => {};
  const playlistSummary = (p: (typeof playlists)[number]): Playlist => {
    const tracks = p.entries.map((e) => byId.get(e.trackId)).filter((t): t is Track => !!t);
    return {
      ...p,
      trackCount: tracks.length,
      durationMs: tracks.reduce((s, t) => s + t.durationMs, 0),
      artworks: [...new Set(tracks.map((t) => t.artwork).filter((a): a is string => !!a))].slice(0, 4),
    };
  };
  const findPlaylist = (id: number) => {
    const p = playlists.find((x) => x.id === id);
    if (!p) throw { kind: "notFound", message: "Playlist not found." };
    return p;
  };
  const addEntries = (p: (typeof playlists)[number], ids: number[]) => {
    p.entries.push(...ids.map((trackId) => ({ entryId: ++entryId, trackId, addedAt: Date.now() })));
    p.updatedAt = Date.now();
  };
  const created = Date.now();
  playlists.push({ id: 1, name: "Late Night Drive", trackCount: 0, durationMs: 0, artworks: [], createdAt: created, updatedAt: created, entries: [] });
  addEntries(playlists[0]!, [1, 7, 13, 21, 30, 36]);
  playlists.push({ id: 2, name: "Focus", trackCount: 0, durationMs: 0, artworks: [], createdAt: created, updatedAt: created - 1, entries: [] });
  addEntries(playlists[1]!, [6, 9, 24, 27]);

  return {
    kind: "preview",
    on: async (event, handler) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler as Handler);
      handlers.set(event, set);
      return () => set.delete(handler as Handler);
    },
    player: {
      state: async () => ({ ...state }),
      playTracks: async (ids, start) => {
        setQueue(ids, start);
        state.positionMs = 0;
        state.status = "playing";
        changed();
      },
      toggle: async () => {
        state.status = state.status === "playing" ? "paused" : "playing";
        changed();
      },
      play: async () => {
        state.status = "playing";
        changed();
      },
      pause: async () => {
        state.status = "paused";
        changed();
      },
      next: async () => step(1),
      previous: async () => step(-1),
      seek: async (ms) => {
        state.positionMs = ms;
        emit("player://progress", { positionMs: ms, durationMs: state.durationMs });
      },
      setVolume: async (v) => {
        state.volume = v;
        state.muted = false;
        changed();
      },
      setMuted: async (m) => {
        state.muted = m;
        changed();
      },
      setShuffle: async (s) => {
        state.shuffle = s;
        changed();
      },
      setRepeat: async (r) => {
        state.repeat = r;
        changed();
      },
      playNext: async (ids) => {
        const at = (state.cursor ?? -1) + 1;
        state.queue.splice(at, 0, ...ids.map((trackId) => ({ uid: ++uid, trackId })));
        changed();
      },
      enqueue: async (ids) => {
        state.queue.push(...ids.map((trackId) => ({ uid: ++uid, trackId })));
        changed();
      },
      removeFromQueue: async (u) => {
        const i = state.queue.findIndex((e) => e.uid === u);
        if (i < 0) return;
        state.queue.splice(i, 1);
        if (state.cursor !== null && i < state.cursor) state.cursor--;
        syncCurrent();
        changed();
      },
      moveInQueue: async (u, to) => {
        const i = state.queue.findIndex((e) => e.uid === u);
        const [entry] = state.queue.splice(i, 1);
        if (!entry) return;
        state.queue.splice(to, 0, entry);
        state.cursor = state.queue.findIndex((e) => e.uid === state.currentUid);
        changed();
      },
      jumpTo: async (u) => {
        state.cursor = state.queue.findIndex((e) => e.uid === u);
        state.positionMs = 0;
        state.status = "playing";
        syncCurrent();
        changed();
      },
      clearQueue: async () => {
        state.queue = state.cursor !== null ? state.queue.slice(state.cursor, state.cursor + 1) : [];
        state.cursor = state.queue.length ? 0 : null;
        changed();
      },
      setVisualizer: ok,
      lyrics: async () => null,
    },
    audio: {
      settings: async () => ({
        ...audio,
        equalizer: { ...audio.equalizer, gainsDb: [...audio.equalizer.gainsDb] },
        loudness: { measured: library.tracks.length, total: library.tracks.length },
      }),
      setEqualizer: async (settings) => {
        audio.equalizer = settings;
      },
      setOutputDevice: async (id) => {
        audio.outputDevice = id;
      },
      setLeveling: async (settings) => {
        audio.leveling = settings;
      },
      setCrossfade: async (settings) => {
        audio.crossfade = settings;
      },
    },
    library: {
      snapshot: async () => library,
      folders: async () => [{ id: 1, path: "C:\\Users\\you\\Music", pathKey: "c:\\users\\you\\music", trackCount: library.tracks.length, available: true }],
      addFolder: ok,
      removeFolder: ok,
      rescan: ok,
      cancelScan: ok,
      importFiles: async () => ({ trackIds: [], rejected: [] }),
      editTrack: async (id, request) => {
        if(request.writeToFile) throw new Error("File tag editing is available in the desktop app.");
        const t=byId.get(id);
        if(!t) throw new Error("Song not found.");
        Object.assign(t,{title:request.title,artist:request.artist,album:request.album,albumArtist:request.albumArtist,year:request.year,genre:request.genre});
        emit("library://changed",null);
      },
      setFavorite: async (ids, favorite) => {
        ids.forEach((id) => {
          const t = byId.get(id);
          if (t) t.favorite = favorite;
        });
        emit("library://changed", null);
      },
      recentPlays: async (limit) => history.slice(0, limit),
    },
    playlists: {
      list: async () => playlists.map(playlistSummary).sort((a, b) => b.updatedAt - a.updatedAt),
      create: async (name, ids) => {
        const id = (playlists.at(-1)?.id ?? 0) + 1;
        const now = Date.now();
        const p = { id, name: name.trim(), trackCount: 0, durationMs: 0, artworks: [], createdAt: now, updatedAt: now, entries: [] };
        playlists.push(p);
        addEntries(p, ids);
        emit("library://changed", null);
        return id;
      },
      rename: async (id, name) => {
        findPlaylist(id).name = name.trim();
        emit("library://changed", null);
      },
      remove: async (id) => {
        playlists.splice(playlists.findIndex((p) => p.id === id), 1);
        emit("library://changed", null);
      },
      entries: async (id) => [...findPlaylist(id).entries],
      add: async (id, ids) => {
        addEntries(findPlaylist(id), ids);
        emit("library://changed", null);
      },
      removeEntries: async (id, entryIds) => {
        const p = findPlaylist(id);
        p.entries = p.entries.filter((e) => !entryIds.includes(e.entryId));
        emit("library://changed", null);
      },
      move: async (id, eid, to) => {
        const p = findPlaylist(id);
        const i = p.entries.findIndex((e) => e.entryId === eid);
        const [entry] = p.entries.splice(i, 1);
        if (entry) p.entries.splice(to, 0, entry);
        emit("library://changed", null);
      },
    },
    settings: {
      get: async () => prefs,
      set: async (key, value) => {
        prefs = { ...prefs, [key]: value };
      },
    },
    system: {
      pickFolder: async () => { throw new Error("Open the RYLORA desktop app to add your music. This browser view is a design preview."); },
      pickAudioFiles: async () => { throw new Error("Open the RYLORA desktop app to add your music. This browser view is a design preview."); },
      pickArtwork: async () => { throw new Error("Choose cover images in the desktop app."); },
      confirm: async (message) => window.confirm(message),
      window: {
        minimize: ok,
        toggleMaximize: ok,
        isMaximized: async () => false,
        close: ok,
        setFullscreen: async (on) => {
          if (on) await document.documentElement.requestFullscreen?.();
          else if (document.fullscreenElement) await document.exitFullscreen();
        },
        isFullscreen: async () => !!document.fullscreenElement,
        onResized: async () => () => {},
        onFileDrop: async () => () => {},
      },
    },
  };
}
