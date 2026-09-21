import { describe, expect, it } from "vitest";
import {
  ELEVATED_VOLATILITY_THRESHOLD,
  MOMENTUM_LOOKBACK_WEEKS,
  computeMomentumScreen,
  momentum12to1,
  proximityTo52wkHigh,
  qualityValuePercentiles,
  realizedVolatility,
  type MomentumRawRow,
} from "./momentum";

function flatCloses(n: number, value = 100): number[] {
  return new Array(n).fill(value);
}

describe("momentum12to1", () => {
  it("returns null when there isn't enough history", () => {
    expect(momentum12to1(flatCloses(MOMENTUM_LOOKBACK_WEEKS))).toBeNull();
  });

  it("computes the return from ~52 weeks ago to ~4 weeks ago, skipping the most recent month", () => {
    const closes = flatCloses(MOMENTUM_LOOKBACK_WEEKS + 5, 100);
    // price 52 weeks back (from the end, skipping the most recent 4 weeks) = 100
    closes[closes.length - 1 - MOMENTUM_LOOKBACK_WEEKS] = 100;
    closes[closes.length - 1 - 4] = 150;
    // last 4 weeks swing wildly — must NOT affect the result, since they're skipped
    closes[closes.length - 1] = 10;
    expect(momentum12to1(closes)).toBeCloseTo(0.5);
  });
});

describe("proximityTo52wkHigh", () => {
  it("returns 1.0 when the current price is the trailing-52-week high", () => {
    const closes = flatCloses(60, 50);
    closes[closes.length - 1] = 100;
    expect(proximityTo52wkHigh(closes)).toBeCloseTo(1.0);
  });

  it("returns a fraction below 1.0 when off the high", () => {
    const closes = flatCloses(60, 100);
    closes[30] = 200; // the 52-week high, well before "now"
    expect(proximityTo52wkHigh(closes)).toBeCloseTo(0.5);
  });
});

describe("realizedVolatility", () => {
  it("returns 0 for a perfectly flat price series", () => {
    expect(realizedVolatility(flatCloses(20, 100))).toBeCloseTo(0);
  });

  it("returns a higher figure for a choppier series", () => {
    const flat = flatCloses(20, 100);
    const choppy = [...flat];
    for (let i = 1; i < choppy.length; i += 2) choppy[i] = 130;
    expect(realizedVolatility(choppy)!).toBeGreaterThan(realizedVolatility(flat)!);
  });

  it("returns null with too little history", () => {
    expect(realizedVolatility([100, 101])).toBeNull();
  });
});

describe("qualityValuePercentiles", () => {
  it("ranks higher ROE and lower P/E as better", () => {
    const roe = [0.05, 0.5, 0.2];
    const pe = [40, 10, 20];
    const pcts = qualityValuePercentiles(roe, pe);
    // index 1: best ROE (0.5) and best (lowest) P/E (10) -> should be the top score
    expect(pcts[1]!).toBeGreaterThan(pcts[0]!);
    expect(pcts[1]!).toBeGreaterThan(pcts[2]!);
  });

  it("fills a missing fundamental with a neutral 0.5 rather than zeroing the blend", () => {
    const pcts = qualityValuePercentiles([0.3, null], [15, 15]);
    expect(pcts[1]).not.toBeNull();
  });
});

function row(overrides: Partial<MomentumRawRow> & { ticker: string }): MomentumRawRow {
  return {
    name: null,
    sector: "Technology",
    price: 100,
    momentum: 0,
    proximity: 0.9,
    volatility: 0.2,
    roe: 0.15,
    peRatio: 20,
    ...overrides,
  };
}

describe("computeMomentumScreen", () => {
  it("regression: ELEVATED_VOLATILITY_THRESHOLD stays a sane annualized figure (documented UI cutoff)", () => {
    expect(ELEVATED_VOLATILITY_THRESHOLD).toBeGreaterThan(0.1);
    expect(ELEVATED_VOLATILITY_THRESHOLD).toBeLessThan(1);
  });

  it("flags a ticker that entered the top N as a new entrant", () => {
    // 3 tickers, top 2 by momentum. B has weak momentum now but jumps to the top later.
    const prior: MomentumRawRow[] = [
      row({ ticker: "A", momentum: 0.5 }),
      row({ ticker: "B", momentum: -0.5 }),
      row({ ticker: "C", momentum: 0.3 }),
    ];
    const now: MomentumRawRow[] = [
      row({ ticker: "A", momentum: 0.5 }),
      row({ ticker: "B", momentum: 0.9 }),
      row({ ticker: "C", momentum: 0.3 }),
    ];
    const result = computeMomentumScreen(now, prior, 2);
    const b = result.find((r) => r.ticker === "B")!;
    expect(b.signal).toBe("new_entrant");
    expect(b.inTopNow).toBe(true);
  });

  it("flags a former top-N ticker that fell out as dropped_out, and excludes tickers never in the top N", () => {
    const prior: MomentumRawRow[] = [
      row({ ticker: "A", momentum: 0.5 }),
      row({ ticker: "B", momentum: 0.4 }),
      row({ ticker: "C", momentum: -0.9 }),
    ];
    const now: MomentumRawRow[] = [
      row({ ticker: "A", momentum: 0.5 }),
      row({ ticker: "B", momentum: -0.9 }), // falls hard
      row({ ticker: "C", momentum: 0.4 }), // takes B's old spot
    ];
    const result = computeMomentumScreen(now, prior, 2);
    const tickers = result.map((r) => r.ticker).sort();
    expect(tickers).toEqual(["A", "B", "C"]); // C was never top-N before, but is now, so it's included
    expect(result.find((r) => r.ticker === "B")!.signal).toBe("dropped_out");
    expect(result.find((r) => r.ticker === "A")!.signal).toBe("held");
  });

  it("marks everyone held when the top N is unchanged", () => {
    const rows: MomentumRawRow[] = [row({ ticker: "A", momentum: 0.5 }), row({ ticker: "B", momentum: 0.1 })];
    const result = computeMomentumScreen(rows, rows, 2);
    expect(result.every((r) => r.signal === "held")).toBe(true);
  });
});
