import { describe, expect, it } from "vitest";

import { activeLineIndex, interpolatePosition, LYRICS_LEAD_MS } from "./lyrics";

const lines = [1000, 4000, 4000, 9000].map((timeMs, i) => ({ timeMs, text: `line ${i}` }));

describe("synced lyrics", () => {
  it("finds the line being sung", () => {
    expect(activeLineIndex(lines, 0)).toBe(-1);
    expect(activeLineIndex(lines, 1000 - LYRICS_LEAD_MS)).toBe(0);
    expect(activeLineIndex(lines, 3000)).toBe(0);
    // Two lines at the same moment: the later one in the file wins.
    expect(activeLineIndex(lines, 4500)).toBe(2);
    expect(activeLineIndex(lines, 60_000)).toBe(3);
    expect(activeLineIndex([], 5000)).toBe(-1);
  });

  it("advances the clock between progress updates only while playing", () => {
    expect(interpolatePosition(10_000, 1_000, 1_180, true, 200_000)).toBe(10_180);
    expect(interpolatePosition(10_000, 1_000, 1_180, false, 200_000)).toBe(10_000);
    expect(interpolatePosition(199_900, 0, 500, true, 200_000)).toBe(200_000);
  });
});
