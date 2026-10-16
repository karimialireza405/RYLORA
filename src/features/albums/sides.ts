import type { Track } from "@/types/domain";

export interface AlbumSide {
  /** "A", "B", … for one disc split in two; the disc number for multi-disc albums. */
  label: string;
  kind: "side" | "disc";
  tracks: Track[];
  /** Index of the side's first track within the whole album (for playing from there). */
  offset: number;
  durationMs: number;
}

/**
 * Lay an album out like a record: a multi-disc album by disc, a single disc as side A
 * and side B (split in half by track count). Short albums (under four songs) stay whole.
 * `tracks` must already be in album order.
 */
export function albumSides(tracks: Track[]): AlbumSide[] {
  const make = (label: string, kind: AlbumSide["kind"], list: Track[], offset: number): AlbumSide => ({
    label,
    kind,
    tracks: list,
    offset,
    durationMs: list.reduce((sum, t) => sum + t.durationMs, 0),
  });
  const discs = [...new Set(tracks.map((t) => t.discNumber ?? 1))];
  if (discs.length > 1) {
    let offset = 0;
    return discs.map((disc) => {
      const list = tracks.filter((t) => (t.discNumber ?? 1) === disc);
      const side = make(String(disc), "disc", list, offset);
      offset += list.length;
      return side;
    });
  }
  if (tracks.length < 4) return [make("A", "side", tracks, 0)];
  const half = Math.ceil(tracks.length / 2);
  return [make("A", "side", tracks.slice(0, half), 0), make("B", "side", tracks.slice(half), half)];
}
