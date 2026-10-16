import type {
  AudioSettings,
  CrossfadeSettings,
  EqSettings,
  LevelingSettings,
  Lyrics,
  UpdateInfo,
  UpdateProgress,
  UpdateStatus,
  LoudnessProgress,
  HistoryEntry,
  ImportResult,
  LibraryFolder,
  LibrarySnapshot,
  PlayerErrorEvent,
  PlayerSnapshot,
  Playlist,
  PlaylistEntry,
  PlaylistId,
  Preferences,
  Progress,
  RepeatMode,
  ScanProgress,
  ScanSummary,
  TrackId,
  TrackEditRequest,
} from "@/types/domain";

/** Every backend event the UI listens to, with its payload type. */
export interface BackendEvents {
  "player://state": PlayerSnapshot;
  "player://progress": Progress;
  "player://spectrum": number[];
  "player://error": PlayerErrorEvent;
  "library://scan-progress": ScanProgress;
  "library://scan-finished": ScanSummary;
  "library://changed": null;
  "audio://loudness": LoudnessProgress;
  "updates://progress": UpdateProgress;
}

export type Unlisten = () => void;

/**
 * The only way the UI talks to the backend. The production implementation wraps
 * Tauri IPC; a development-only preview implementation exists for plain-browser
 * layout work (see ./preview.ts).
 */
export interface Backend {
  readonly kind: "tauri" | "preview";
  on<E extends keyof BackendEvents>(event: E, handler: (payload: BackendEvents[E]) => void): Promise<Unlisten>;

  player: {
    state(): Promise<PlayerSnapshot>;
    playTracks(trackIds: TrackId[], start: number): Promise<void>;
    toggle(): Promise<void>;
    play(): Promise<void>;
    pause(): Promise<void>;
    next(): Promise<void>;
    previous(): Promise<void>;
    seek(positionMs: number): Promise<void>;
    setVolume(volume: number): Promise<void>;
    setMuted(muted: boolean): Promise<void>;
    setShuffle(shuffle: boolean): Promise<void>;
    setRepeat(repeat: RepeatMode): Promise<void>;
    playNext(trackIds: TrackId[]): Promise<void>;
    enqueue(trackIds: TrackId[]): Promise<void>;
    removeFromQueue(uid: number): Promise<void>;
    moveInQueue(uid: number, to: number): Promise<void>;
    jumpTo(uid: number): Promise<void>;
    clearQueue(): Promise<void>;
    setVisualizer(enabled: boolean): Promise<void>;
    lyrics(trackId: TrackId): Promise<Lyrics | null>;
  };

  audio: {
    settings(): Promise<AudioSettings>;
    setEqualizer(settings: EqSettings): Promise<void>;
    /** null follows the system default output. */
    setOutputDevice(id: string | null): Promise<void>;
    setLeveling(settings: LevelingSettings): Promise<void>;
    setCrossfade(settings: CrossfadeSettings): Promise<void>;
  };

  library: {
    snapshot(): Promise<LibrarySnapshot>;
    folders(): Promise<LibraryFolder[]>;
    addFolder(path: string): Promise<void>;
    removeFolder(id: number): Promise<void>;
    rescan(): Promise<void>;
    cancelScan(): Promise<void>;
    importFiles(paths: string[]): Promise<ImportResult>;
    editTrack(trackId: TrackId, request: TrackEditRequest): Promise<void>;
    setFavorite(trackIds: TrackId[], favorite: boolean): Promise<void>;
    recentPlays(limit: number): Promise<HistoryEntry[]>;
  };

  playlists: {
    list(): Promise<Playlist[]>;
    create(name: string, trackIds: TrackId[]): Promise<PlaylistId>;
    rename(id: PlaylistId, name: string): Promise<void>;
    remove(id: PlaylistId): Promise<void>;
    entries(id: PlaylistId): Promise<PlaylistEntry[]>;
    add(id: PlaylistId, trackIds: TrackId[]): Promise<void>;
    removeEntries(id: PlaylistId, entryIds: number[]): Promise<void>;
    move(id: PlaylistId, entryId: number, to: number): Promise<void>;
  };

  updates: {
    status(): Promise<UpdateStatus>;
    /** Null when this is the latest version. */
    check(): Promise<UpdateInfo | null>;
    /** Downloads, verifies and runs the installer; RYLORA restarts. */
    install(): Promise<void>;
  };

  settings: {
    get(): Promise<Preferences>;
    set(key: keyof Preferences, value: string): Promise<void>;
  };

  system: {
    pickFolder(): Promise<string | null>;
    pickAudioFiles(): Promise<string[]>;
    pickArtwork(): Promise<string | null>;
    confirm(message: string, title: string, okLabel: string): Promise<boolean>;
    window: {
      minimize(): Promise<void>;
      toggleMaximize(): Promise<void>;
      isMaximized(): Promise<boolean>;
      close(): Promise<void>;
      setFullscreen(on: boolean): Promise<void>;
      isFullscreen(): Promise<boolean>;
      onResized(handler: () => void): Promise<Unlisten>;
      onFileDrop(handler: (paths: string[], kind: "enter" | "leave" | "drop") => void): Promise<Unlisten>;
      /** Swap the main window for the always-on-top mini player, and back. */
      openMini(): Promise<void>;
      closeMini(): Promise<void>;
    };
  };
}
