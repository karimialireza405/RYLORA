import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ audio: { setLeveling: vi.fn(), setCrossfade: vi.fn() } }));
vi.mock("@/services/backend", () => ({ backend: () => api }));
vi.mock("./toasts", () => ({ notifyError: vi.fn() }));

import { notifyError } from "./toasts";
import { EQ_BANDS, matchPreset, PRESETS, presetPreamp, setCrossfade, setLeveling, useAudio } from "./audio";

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

describe("levelling and crossfade", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("applies a levelling change at once and rolls it back if the engine refuses", async () => {
    api.audio.setLeveling.mockResolvedValueOnce(undefined);
    await setLeveling({ mode: "album" });
    expect(useAudio.getState().leveling).toEqual({ mode: "album", target: "normal" });
    expect(api.audio.setLeveling).toHaveBeenCalledWith({ mode: "album", target: "normal" });

    api.audio.setLeveling.mockRejectedValueOnce(new Error("no"));
    await setLeveling({ target: "loud" });
    expect(useAudio.getState().leveling.target).toBe("normal");
    expect(notifyError).toHaveBeenCalled();
  });

  it("sends only the final crossfade length while the slider moves", () => {
    vi.useFakeTimers();
    api.audio.setCrossfade.mockResolvedValue(undefined);
    setCrossfade({ enabled: true });
    setCrossfade({ seconds: 4 });
    setCrossfade({ seconds: 8.5 });
    expect(useAudio.getState().crossfade.seconds).toBe(8.5);
    expect(api.audio.setCrossfade).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(api.audio.setCrossfade).toHaveBeenCalledTimes(1);
    expect(api.audio.setCrossfade).toHaveBeenCalledWith({ enabled: true, seconds: 8.5, keepAlbumsGapless: true });
  });
});
