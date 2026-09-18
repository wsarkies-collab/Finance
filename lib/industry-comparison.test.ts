import { describe, expect, it } from "vitest";
import { aggregateMetrics } from "./industry-comparison";
import { scoreTicker } from "./screener";
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
    sector: "Basic Materials",
    industry: "Other Industrial Metals & Mining",
    dividendYield: 0.02,
    netInterestMargin: null,
    ...overrides,
  };
}

describe("aggregateMetrics", () => {
  it("takes the median of each metric, excluding nulls", () => {
    const reports = [
      scoreTicker(fundamentals("A", { peRatio: 10 })),
      scoreTicker(fundamentals("B", { peRatio: 20 })),
      scoreTicker(fundamentals("C", { peRatio: 30 })),
    ];
    const medians = aggregateMetrics(reports);
    expect(medians.peRatio).toBe(20);
  });

  it("is not badly skewed by one extreme outlier report, unlike a mean would be", () => {
    const reports = [
      scoreTicker(fundamentals("A", { peRatio: 10 })),
      scoreTicker(fundamentals("B", { peRatio: 12 })),
      scoreTicker(fundamentals("C", { peRatio: 11 })),
      // A report with an extreme growth-rate-driven DCF blowup, like LYC.AX in practice.
      scoreTicker(fundamentals("EXTREME", { epsGrowthPct: 5920.3, peRatio: 65 })),
    ];
    const medians = aggregateMetrics(reports);
    // Median of [10, 11, 12, 65] is (11+12)/2 = 11.5 — nowhere near a mean of ~24.5.
    expect(medians.peRatio).toBeCloseTo(11.5);
    expect(medians.dcfMarginOfSafety).not.toBeNull();
  });

  it("returns null for a metric that's null across every report", () => {
    const reports = [scoreTicker(fundamentals("A")), scoreTicker(fundamentals("B"))];
    const medians = aggregateMetrics(reports);
    expect(medians.netInterestMarginPct).toBeNull();
  });
});
