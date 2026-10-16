import { describe, expect, it } from "vitest";

import { partOfDay } from "./greeting";

const at = (h: number, m = 0) => new Date(2026, 9, 16, h, m);

describe("home greeting", () => {
  it("follows the local time of day", () => {
    expect(partOfDay(at(4, 59))).toBe("night");
    expect(partOfDay(at(5))).toBe("morning");
    expect(partOfDay(at(11, 59))).toBe("morning");
    expect(partOfDay(at(12))).toBe("afternoon");
    expect(partOfDay(at(17))).toBe("evening");
    expect(partOfDay(at(22))).toBe("night");
  });
});
