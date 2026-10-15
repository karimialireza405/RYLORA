import { describe, expect, it } from "vitest";

import { EQ_BANDS, matchPreset, PRESETS, presetPreamp } from "./audio";

describe("equalizer presets", () => {
  it("cover every band within the engine's ±12 dB range", () => {
    for (const gains of Object.values(PRESETS)) {
      expect(gains).toHaveLength(EQ_BANDS.length);
      expect(gains.every((g) => Math.abs(g) <= 12)).toBe(true);
    }
  });

  it("are recognised from the current gains", () => {
    expect(matchPreset({ enabled: true, preampDb: -3, gainsDb: [...PRESETS.rock] })).toBe("rock");
    expect(matchPreset({ enabled: true, preampDb: 0, gainsDb: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] })).toBeNull();
  });

  it("leave headroom proportional to the largest boost", () => {
    expect(presetPreamp(PRESETS.flat)).toBe(-0);
    expect(presetPreamp(PRESETS.bassBoost)).toBe(-3);
    expect(presetPreamp([-6, -3, 0])).toBe(-0);
  });
});
