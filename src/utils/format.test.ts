import { describe, expect, it } from "vitest";

import { formatLongDuration, formatRelativeDate, formatTime, isRtl, joinMeta, plural } from "./format";

describe("formatTime", () => {
  it("formats minutes and hours", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(187_400)).toBe("3:07");
    expect(formatTime(3_765_000)).toBe("1:02:45");
  });
  it("clamps invalid input", () => {
    expect(formatTime(-5)).toBe("0:00");
    expect(formatTime(Number.NaN)).toBe("0:00");
  });
});

describe("formatLongDuration", () => {
  it("summarises collection lengths", () => {
    expect(formatLongDuration(0)).toBe("0 min");
    expect(formatLongDuration(20_000)).toBe("< 1 min");
    expect(formatLongDuration(48 * 60_000)).toBe("48 min");
    expect(formatLongDuration(125 * 60_000)).toBe("2 hr 5 min");
    expect(formatLongDuration(120 * 60_000)).toBe("2 hr");
  });
});

describe("plural", () => {
  it("chooses the right form", () => {
    expect(plural(1, "song")).toBe("1 song");
    expect(plural(3, "song")).toBe("3 songs");
  });
});

describe("formatRelativeDate", () => {
  const now = new Date(2026, 9, 14, 15, 0).getTime();
  it("uses friendly words for recent dates", () => {
    expect(formatRelativeDate(now - 3_600_000, now)).toBe("Today");
    expect(formatRelativeDate(now - 86_400_000, now)).toBe("Yesterday");
  });
});

describe("joinMeta", () => {
  it("isolates each part and drops empty ones", () => {
    expect(joinMeta(["سایه‌ها", 2021, null, ""])).toBe("⁨سایه‌ها⁩ · ⁨2021⁩");
    expect(joinMeta([])).toBe("");
  });
});

describe("isRtl", () => {
  it("detects Persian titles", () => {
    expect(isRtl("ماه نو")).toBe(true);
    expect(isRtl("Night Tide")).toBe(false);
    expect(isRtl("01 ماه")).toBe(true);
    expect(isRtl("")).toBe(false);
  });
});
