import { describe, expect, it } from "vitest";
import { applyCompositeScores, scoreTicker } from "./screener";
import type { Fundamentals } from "./types";

function fundamentals(ticker: string, overrides: Partial<Fundamentals> = {}): Fundamentals {
  return {
    ticker,
    price: 100.0,
    marketCap: 10_000.0,
    enterpriseValue: 11_000.0,
    sharesOutstanding: 100.0,
    netDebt: 1_000.0,
    eps: 5.0,
    bookValuePerShare: 40.0,
    peRatio: 20.0,
    epsGrowthPct: 10.0,
    ebitda: 1_000.0,
    freeCashFlow: 500.0,
    roe: 0.15,
    priceToBook: 2.5,
    ...overrides,
  };
}

describe("scoreTicker", () => {
  it("populates all metrics", () => {
    const report = scoreTicker(fundamentals("TEST"));
    expect(report.ticker).toBe("TEST");
    expect(report.dcfValue).not.toBeNull();
    expect(report.grahamValue).not.toBeNull();
    expect(report.peg).not.toBeNull();
    expect(report.evEbitda).not.toBeNull();
    expect(report.fcfYieldPct).not.toBeNull();
    expect(report.pbRoeScore).not.toBeNull();
  });
});

describe("applyCompositeScores", () => {
  it("ranks the cheaper stock higher", () => {
    const cheap = scoreTicker(fundamentals("CHEAP", { price: 50.0 }));
    const expensive = scoreTicker(fundamentals("EXPENSIVE", { price: 500.0 }));
    const reports = [cheap, expensive];
    applyCompositeScores(reports);

    expect(cheap.compositeScore).not.toBeNull();
    expect(expensive.compositeScore).not.toBeNull();
    expect(cheap.compositeScore as number).toBeGreaterThan(expensive.compositeScore as number);
  });
});
