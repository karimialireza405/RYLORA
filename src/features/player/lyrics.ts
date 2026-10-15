import type { LyricLine } from "@/types/domain";

/** Lines light up slightly before their timestamp so they never feel late. */
export const LYRICS_LEAD_MS = 200;

/** Index of the line being sung at `positionMs`, or -1 before the first line. */
export function activeLineIndex(lines: readonly LyricLine[], positionMs: number): number {
  const t = positionMs + LYRICS_LEAD_MS;
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((lines[mid]?.timeMs ?? Infinity) <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * Playback position between the backend's progress updates (every 250 ms):
 * the last reported position plus the time since, while playing.
 */
export function interpolatePosition(reportedMs: number, reportedAt: number, now: number, playing: boolean, durationMs: number): number {
  if (!playing) return reportedMs;
  const ms = reportedMs + Math.max(0, now - reportedAt);
  return durationMs > 0 ? Math.min(ms, durationMs) : ms;
}
