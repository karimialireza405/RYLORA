import { create } from "zustand";

import { messages } from "@/i18n";
import { backend } from "@/services/backend";
import type { AudioSettings, EqSettings } from "@/types/domain";
import { notifyError } from "./toasts";

/** Band centres, mirrored from `audio::eq::BAND_FREQUENCIES`. */
export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const EQ_LIMIT_DB = 12;

export type PresetId = "flat" | "bassBoost" | "trebleBoost" | "vocal" | "rock" | "electronic" | "acoustic" | "loudness";

export const PRESETS: Record<PresetId, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bassBoost: [6, 5, 4, 2, 0.5, 0, 0, 0, 0, 0],
  trebleBoost: [0, 0, 0, 0, 0, 0.5, 2, 4, 5, 6],
  vocal: [-2, -2, -1, 1, 3, 4, 3, 1.5, 0, -1],
  rock: [4.5, 3.5, 1.5, -1, -2, -1, 1, 3, 4, 4.5],
  electronic: [5, 4, 1.5, 0, -2, 1, 0, 1.5, 4, 5],
  acoustic: [3, 2.5, 1.5, 1, 2, 2, 3, 3, 2, 1],
  loudness: [5, 3.5, 0, 0, -1, 0, -0.5, 1, 3.5, 4],
};

/** Headroom so a preset's largest boost does not drive the signal into the limiter. */
export function presetPreamp(gains: readonly number[]): number {
  return -Math.round(Math.max(0, ...gains) * 0.5 * 2) / 2;
}

export function matchPreset(eq: EqSettings): PresetId | null {
  const found = (Object.keys(PRESETS) as PresetId[]).find((id) => PRESETS[id].every((g, i) => Math.abs(g - (eq.gainsDb[i] ?? 0)) < 0.01));
  return found ?? null;
}

interface AudioState extends AudioSettings {
  loaded: boolean;
  open: boolean;
}

export const useAudio = create<AudioState>(() => ({
  loaded: false,
  open: false,
  equalizer: { enabled: false, preampDb: 0, gainsDb: Array(10).fill(0) },
  outputDevice: null,
  devices: [],
}));

export async function loadAudioSettings(): Promise<void> {
  try {
    const settings = await backend().audio.settings();
    useAudio.setState({ ...settings, loaded: true });
  } catch (e) {
    notifyError(messages().sound.loadFailed, e);
  }
}

export function openSound(): void {
  useAudio.setState({ open: true });
  void loadAudioSettings();
}

let sendTimer = 0;
let lastSent: EqSettings | null = null;

/** Update the equalizer locally at once; send to the engine at most every 40 ms while dragging. */
export function updateEqualizer(patch: Partial<EqSettings>): void {
  const equalizer = { ...useAudio.getState().equalizer, ...patch };
  useAudio.setState({ equalizer });
  if (sendTimer) return;
  sendTimer = window.setTimeout(() => {
    sendTimer = 0;
    const latest = useAudio.getState().equalizer;
    if (latest === lastSent) return;
    lastSent = latest;
    backend()
      .audio.setEqualizer(latest)
      .catch((e: unknown) => notifyError(messages().sound.saveFailed, e));
  }, 40);
}

export function applyPreset(id: PresetId): void {
  const gainsDb = [...PRESETS[id]];
  updateEqualizer({ gainsDb, preampDb: presetPreamp(gainsDb), enabled: id !== "flat" || useAudio.getState().equalizer.enabled });
}

export async function setOutputDevice(id: string | null): Promise<void> {
  const previous = useAudio.getState().outputDevice;
  useAudio.setState({ outputDevice: id });
  try {
    await backend().audio.setOutputDevice(id);
  } catch (e) {
    useAudio.setState({ outputDevice: previous });
    notifyError(messages().sound.saveFailed, e);
  }
}
