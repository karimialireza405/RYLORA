import { describe, expect, it } from "vitest";
import { AudioPulseEnvelope } from "./audioPulse";

describe("audio-reactive cover motion", () => {
  it("keeps silence and a steady sustained tone still instead of inventing beats", () => {
    for (const level of [0, 150]) {
      const pulse = new AudioPulseEnvelope();
      for (let frame = 1; frame < 180; frame++) {
        const now = frame * (1000 / 60);
        expect(pulse.step(new Uint8Array(64).fill(level), now, now, 1 / 60)).toBe(1);
      }
    }
  });

  it("responds to a musical attack with a visible, gradual swell and soft return", () => {
    const pulse = new AudioPulseEnvelope();
    const values: number[] = [];
    for (let frame = 1; frame <= 180; frame++) {
      const now = frame * (1000 / 60);
      const level = frame >= 30 && frame < 36 ? 220 : 30;
      values.push(pulse.step(new Uint8Array(64).fill(level), now, now, 1 / 60));
    }
    expect(Math.max(...values)).toBeGreaterThan(1.035);
    expect(Math.max(...values)).toBeLessThanOrEqual(1.08);
    expect(values[29]! - values[28]!).toBeLessThan(0.01);
    expect(Math.max(...values.slice(1).map((v, i) => Math.abs(v - values[i]!)))).toBeLessThan(0.012);
    expect(values.at(-1)).toBeCloseTo(1, 4);
  });

  it("settles when the audio stream stops delivering frames", () => {
    const pulse = new AudioPulseEnvelope();
    pulse.step(new Uint8Array(64).fill(30), 10, 10, 1 / 60);
    let scale = pulse.step(new Uint8Array(64).fill(230), 210, 210, 1 / 60);
    for (let frame = 1; frame <= 120; frame++) {
      scale = pulse.step(new Uint8Array(64).fill(230), 210, 210 + frame * (1000 / 60), 1 / 60);
    }
    expect(scale).toBeCloseTo(1, 4);
  });
});
