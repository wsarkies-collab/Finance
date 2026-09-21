import { describe, expect, it } from "vitest";
import {
  MIN_OVERLAP_WEEKS,
  alignByDate,
  benchmarkFor,
  buildCovariance,
  computeBeta,
  minVarianceWeights,
  portfolioVolatility,
  projectToSimplex,
  returnsFromCloses,
  type PriceSeries,
} from "./portfolio";

describe("returnsFromCloses", () => {
  it("computes simple period-over-period returns", () => {
    const [r1, r2] = returnsFromCloses([100, 110, 99]);
    expect(r1).toBeCloseTo(0.1);
    expect(r2).toBeCloseTo(-0.1);
  });
});

describe("alignByDate", () => {
  it("aligns two series with identical dates to their full overlap", () => {
    const dates = ["2020-01-01", "2020-01-02", "2020-01-03"];
    const a: PriceSeries = { dates, closes: [100, 110, 121] };
    const b: PriceSeries = { dates, closes: [50, 55, 60.5] };
    const { returns, n } = alignByDate([a, b]);
    expect(n).toBe(2);
    expect(returns[0][0]).toBeCloseTo(0.1);
    expect(returns[0][1]).toBeCloseTo(0.1);
  });

  it("inner-joins on real dates, dropping days only one series has (the cross-calendar case)", () => {
    // Series A trades on 1/2/3/4; series B (a different market's holiday calendar) trades
    // on 1/2/4/5 — only 1, 2, 4 are shared. A naive "same array position" join would wrongly
    // compare A's day-3 return against B's day-4 return.
    const a: PriceSeries = { dates: ["2020-01-01", "2020-01-02", "2020-01-03", "2020-01-04"], closes: [100, 110, 120, 130] };
    const b: PriceSeries = { dates: ["2020-01-01", "2020-01-02", "2020-01-04", "2020-01-05"], closes: [10, 11, 13, 14] };
    const { returns, n } = alignByDate([a, b]);
    // Shared dates with a defined return (needs the prior day too): 1/2 and 1/4.
    expect(n).toBe(2);
    expect(returns[0][0]).toBeCloseTo(0.1);
    expect(returns[0][1]).toBeCloseTo(130 / 120 - 1);
    expect(returns[1][0]).toBeCloseTo(0.1);
    expect(returns[1][1]).toBeCloseTo(13 / 11 - 1);
  });
});

describe("buildCovariance", () => {
  it("returns null when there isn't enough overlap", () => {
    const short = [returnsFromCloses(Array(10).fill(100).map((v, i) => v + i))];
    expect(buildCovariance([...short, ...short])).toBeNull();
  });

  it("computes annualized variance on the diagonal for a single series", () => {
    const n = MIN_OVERLAP_WEEKS + 10;
    const closes = Array.from({ length: n + 1 }, (_, i) => 100 * (1 + (i % 2 === 0 ? 0.01 : -0.01)));
    const r = returnsFromCloses(closes);
    const cov = buildCovariance([r, r]);
    expect(cov).not.toBeNull();
    expect(cov![0][0]).toBeCloseTo(cov![1][1]);
    expect(cov![0][1]).toBeCloseTo(cov![0][0]); // identical series => cov(a,b) == var(a)
  });
});

describe("minVarianceWeights", () => {
  it("returns non-negative weights that sum to 1", () => {
    const cov = [
      [0.04, 0.01, 0.0],
      [0.01, 0.09, 0.02],
      [0.0, 0.02, 0.16],
    ];
    const w = minVarianceWeights(cov);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    for (const x of w) expect(x).toBeGreaterThanOrEqual(-1e-9);
  });

  it("favors the lower-variance asset when assets are uncorrelated", () => {
    const cov = [
      [0.01, 0, 0],
      [0, 0.04, 0],
      [0, 0, 0.09],
    ];
    const w = minVarianceWeights(cov);
    expect(w[0]).toBeGreaterThan(w[1]);
    expect(w[1]).toBeGreaterThan(w[2]);
  });

  it("puts all weight on a single risk-free-like (zero-variance) asset when one exists", () => {
    const cov = [
      [0, 0, 0],
      [0, 0.04, 0.01],
      [0, 0.01, 0.09],
    ];
    const w = minVarianceWeights(cov);
    expect(w[0]).toBeCloseTo(1, 3);
  });
});

describe("portfolioVolatility", () => {
  it("matches the individual asset's volatility for a single-asset portfolio", () => {
    const cov = [[0.09]];
    expect(portfolioVolatility(cov, [1])).toBeCloseTo(0.3);
  });
});

describe("computeBeta", () => {
  it("is ~1 for a series that mirrors the market exactly", () => {
    const market = [0.01, -0.02, 0.03, 0.01, -0.01, 0.02, 0.0, 0.015];
    expect(computeBeta(market, market)).toBeCloseTo(1);
  });

  it("is ~2 for a series that moves twice as much as the market", () => {
    const market = [0.01, -0.02, 0.03, 0.01, -0.01, 0.02, 0.0, 0.015];
    const stock = market.map((r) => r * 2);
    expect(computeBeta(stock, market)).toBeCloseTo(2);
  });

  it("falls back to 1 when the market series has no variance", () => {
    const market = new Array(8).fill(0);
    const stock = [0.01, -0.02, 0.03, 0.01, -0.01, 0.02, 0.0, 0.015];
    expect(computeBeta(stock, market)).toBe(1);
  });
});

describe("benchmarkFor", () => {
  it("uses ^AXJO for .AX-suffixed tickers", () => {
    expect(benchmarkFor("BHP.AX")).toBe("^AXJO");
    expect(benchmarkFor("bhp.ax")).toBe("^AXJO");
  });

  it("defaults to ^GSPC for everything else", () => {
    expect(benchmarkFor("AAPL")).toBe("^GSPC");
    expect(benchmarkFor("MSFT")).toBe("^GSPC");
  });
});

describe("projectToSimplex", () => {
  it("projects an arbitrary vector onto the probability simplex", () => {
    const w = projectToSimplex([0.5, 0.3, -0.1]);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    for (const x of w) expect(x).toBeGreaterThanOrEqual(0);
  });
});
