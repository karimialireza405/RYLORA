import { describe, expect, it } from "vitest";

import type { Track } from "@/types/domain";
import { albumSides } from "./sides";

const track = (id: number, disc: number | null = null): Track =>
  ({ id, discNumber: disc, durationMs: 1000 * id }) as unknown as Track;

describe("album sides", () => {
  it("splits one disc into side A and side B", () => {
    const sides = albumSides([1, 2, 3, 4, 5].map((i) => track(i)));
    expect(sides.map((s) => [s.label, s.tracks.map((t) => t.id), s.offset])).toEqual([
      ["A", [1, 2, 3], 0],
      ["B", [4, 5], 3],
    ]);
    expect(sides[1]!.durationMs).toBe(9000);
  });

  it("uses discs when the album has several", () => {
    const sides = albumSides([track(1, 1), track(2, 1), track(3, 2)]);
    expect(sides.map((s) => [s.kind, s.label, s.offset])).toEqual([
      ["disc", "1", 0],
      ["disc", "2", 2],
    ]);
  });

  it("keeps short albums whole", () => {
    expect(albumSides([track(1), track(2), track(3)])).toHaveLength(1);
  });
});
