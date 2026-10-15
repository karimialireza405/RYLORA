import { backend } from "@/services/backend";

/**
 * Latest spectrum frame from the audio engine (64 log-spaced bands, 0–255).
 * Kept outside React: frames arrive ~30×/s and are read directly by canvas
 * render loops, so they never trigger re-renders.
 */
export const BAND_COUNT = 64;

const state = {
  bands: new Uint8Array(BAND_COUNT),
  receivedAt: 0,
  listeners: new Set<() => void>(),
  consumers: 0,
};

export function pushSpectrum(frame: number[]): void {
  for (let i = 0; i < BAND_COUNT; i++) state.bands[i] = frame[i] ?? 0;
  state.receivedAt = performance.now();
  state.listeners.forEach((l) => l());
}

export function latestSpectrum(): { bands: Uint8Array; receivedAt: number } {
  return state;
}

export function onSpectrum(listener: () => void): () => void {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

/** Reference-counted: the backend only computes spectra while something displays them. */
export function acquireSpectrum(): () => void {
  state.consumers += 1;
  if (state.consumers === 1) void backend().player.setVisualizer(true);
  return () => {
    state.consumers -= 1;
    if (state.consumers === 0) void backend().player.setVisualizer(false);
  };
}
