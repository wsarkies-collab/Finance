import { describe, expect, it } from "vitest";
import { getSectorCounts, getUniverseTickers, isKnownSector } from "./momentum-universe";

describe("getSectorCounts", () => {
  const counts = getSectorCounts();

  it("returns a non-empty list covering both markets", () => {
    expect(counts.length).toBeGreaterThan(0);
    const totalSp500 = counts.reduce((sum, c) => sum + c.sp500, 0);
    const totalAsx = counts.reduce((sum, c) => sum + c.asx, 0);
    expect(totalSp500).toBeGreaterThan(0);
    expect(totalAsx).toBeGreaterThan(0);
  });

  it("sorts by combined market size descending", () => {
    for (let i = 1; i < counts.length; i++) {
      const prevTotal = counts[i - 1].sp500 + counts[i - 1].asx;
      const curTotal = counts[i].sp500 + counts[i].asx;
      expect(prevTotal).toBeGreaterThanOrEqual(curTotal);
    }
  });

  it("every count matches getUniverseTickers for that sector", () => {
    for (const c of counts) {
      expect(getUniverseTickers("SP500", c.sector).length).toBe(c.sp500);
      expect(getUniverseTickers("ASX", c.sector).length).toBe(c.asx);
      expect(getUniverseTickers("all", c.sector).length).toBe(c.sp500 + c.asx);
    }
  });
});

describe("getUniverseTickers", () => {
  it("returns an empty array for an unknown sector", () => {
    expect(getUniverseTickers("all", "Not A Real Sector")).toEqual([]);
  });

  it("'all' market returns the union of SP500 and ASX for a real sector", () => {
    const [{ sector }] = getSectorCounts();
    const sp500Only = getUniverseTickers("SP500", sector);
    const asxOnly = getUniverseTickers("ASX", sector);
    const all = getUniverseTickers("all", sector);
    expect(all.length).toBe(sp500Only.length + asxOnly.length);
    for (const t of [...sp500Only, ...asxOnly]) {
      expect(all).toContain(t);
    }
  });
});

describe("isKnownSector", () => {
  it("is true for a sector that actually appears in the universe", () => {
    const [{ sector }] = getSectorCounts();
    expect(isKnownSector(sector)).toBe(true);
  });

  it("is false for a made-up sector name", () => {
    expect(isKnownSector("Not A Real Sector")).toBe(false);
  });
});
