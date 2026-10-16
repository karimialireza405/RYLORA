import { create } from "zustand";

import { backend } from "@/services/backend";
import type { Preferences, TrackId } from "@/types/domain";
import { notifyError } from "./toasts";
import { messages } from "@/i18n";

interface UiState {
  queueOpen: boolean;
  nowPlayingPanelOpen: boolean;
  listeningTab: "playing" | "queue" | "info";
  editTrackId: TrackId | null;
  dragTrackIds: TrackId[];
  immersive: boolean;
  shortcutsOpen: boolean;
  lyricsOpen: boolean;
  /** Full-screen player shows big synced lyrics (karaoke). */
  immersiveLyrics: boolean;
  searchQuery: string;
  dropActive: boolean;
  addMusicOpen: boolean;
  /** Tracks waiting to be added once the "new playlist" dialog completes. */
  newPlaylist: { open: boolean; trackIds: TrackId[] };
  prefs: Preferences;
}

export const useUi = create<UiState>(() => ({
  queueOpen: false,
  nowPlayingPanelOpen: true,
  listeningTab: "playing",
  editTrackId: null,
  dragTrackIds: [],
  immersive: false,
  shortcutsOpen: false,
  lyricsOpen: false,
  immersiveLyrics: false,
  searchQuery: "",
  dropActive: false,
  addMusicOpen: false,
  newPlaylist: { open: false, trackIds: [] },
  prefs: {},
}));

export function openNewPlaylist(trackIds: TrackId[] = []): void {
  useUi.setState({ newPlaylist: { open: true, trackIds } });
}

/** The interface accent: silver (default), gold, rose, or the playing song's cover colour. */
export function applyAccentPreference(accent: Preferences["accentColor"]): void {
  const root = document.documentElement;
  if (!accent || accent === "silver") delete root.dataset.accent;
  else root.dataset.accent = accent;
}

export function applyMotionPreference(motion: Preferences["motion"]): void {
  const root = document.documentElement;
  if (!motion || motion === "system") delete root.dataset.motion;
  else root.dataset.motion = motion;
}

export async function setPreference<K extends keyof Preferences>(
  key: K,
  value: NonNullable<Preferences[K]>,
) {
  const previous = useUi.getState().prefs;
  useUi.setState({ prefs: { ...previous, [key]: value } });
  if (key === "motion") applyMotionPreference(value as Preferences["motion"]);
  if (key === "accentColor") applyAccentPreference(value as Preferences["accentColor"]);
  try {
    await backend().settings.set(key, value);
  } catch (e) {
    const current = useUi.getState().prefs;
    if (current[key] === value) {
      const restored = { ...current, [key]: previous[key] };
      if (previous[key] === undefined) delete restored[key];
      useUi.setState({ prefs: restored });
      if (key === "motion") applyMotionPreference(previous.motion);
      if (key === "accentColor") applyAccentPreference(previous.accentColor);
    }
    notifyError(messages().errors.saveSetting, e);
  }
}

/** Boolean preference with its default. */
export function prefEnabled(
  prefs: Preferences,
  key: "ambientBackground" | "visualizer" | "scanOnStartup" | "watchFolders" | "cleanTags",
): boolean {
  return prefs[key] !== "false";
}
