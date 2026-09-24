import { describe, expect, it } from "vitest";
import {
  MAX_GROWTH_RATE,
  MIN_GROWTH_RATE,
  applyCompositeScores,
  isBankIndustry,
  resolveGrowthRate,
  scoreTicker,
} from "./screener";
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
    sector: "Technology",
    industry: "Consumer Electronics",
    dividendYield: 0.02,
    netInterestMargin: null,
    dividendRate: 2.0,
    targetMeanPrice: 110.0,
    targetLowPrice: 90.0,
    targetHighPrice: 130.0,
    numberOfAnalystOpinions: 10,
    ...overrides,
  };
}

function bankFundamentals(ticker: string, overrides: Partial<Fundamentals> = {}): Fundamentals {
  return fundamentals(ticker, {
    sector: "Financial Services",
    industry: "Banks - Diversified",
    ebitda: null,
    freeCashFlow: null,
    dividendYield: 0.03,
    netInterestMargin: 0.025,
    ...overrides,
  });
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

  it("regression: LYC.AX's real 5920% trailing growth no longer produces a nonsensical DCF margin of safety", () => {
    // Before this fix, this exact input produced a DCF value of roughly -$821M/share (the
    // free cash flow compounds by (1+59.2)^5 before the terminal value is even added) —
    // found live scanning the S&P 500 + ASX 200 valuation screen.
    const report = scoreTicker(fundamentals("LYC", { epsGrowthPct: 5920.3, freeCashFlow: -50.0 }));
    expect(report.dcfValue).not.toBeNull();
    expect(Math.abs(report.dcfValue as number)).toBeLessThan(10_000);
    expect(report.dcfMarginOfSafety).not.toBeNull();
    expect(Math.abs(report.dcfMarginOfSafety as number)).toBeLessThan(1000);
  });

  it("flags dcfGrowthRateClamped and notes it in the DCF description when the raw growth rate gets capped", () => {
    const report = scoreTicker(fundamentals("LYC", { epsGrowthPct: 5920.3 }));
    expect(report.dcfGrowthRateClamped).toBe(true);
    expect(report.dcfGrowthRateUsed).toBeCloseTo(0.06);
    expect(report.dcfGrowthRateRaw).toBeCloseTo(59.203);
    expect(report.details.dcfMarginOfSafety).toContain("raw trailing earnings growth was 5920.3%");
    expect(report.details.dcfMarginOfSafety).toContain("standardized 6.0%");
  });

  it("leaves dcfGrowthRateClamped false for a sane growth rate, with no clamp note in the description", () => {
    const report = scoreTicker(fundamentals("TEST", { epsGrowthPct: 4.0 }));
    expect(report.dcfGrowthRateClamped).toBe(false);
    expect(report.dcfGrowthRateUsed).toBeCloseTo(0.04);
    expect(report.dcfGrowthRateRaw).toBeCloseTo(0.04);
    expect(report.details.dcfMarginOfSafety).not.toContain("Note:");
  });

  it("gives an individualized reason (not a generic n/a) when a metric can't be computed", () => {
    const report = scoreTicker(fundamentals("TEST", { freeCashFlow: null }));
    expect(report.dcfValue).toBeNull();
    expect(report.details.dcfMarginOfSafety).toContain("no free cash flow figure is available");

    const noDividend = scoreTicker(fundamentals("TEST", { dividendYield: 0 }));
    expect(noDividend.details.dividendYieldPct).toBe("TEST does not currently pay a dividend.");
  });

  it("builds a real individualized description using the ticker's own numbers for a populated metric", () => {
    const report = scoreTicker(fundamentals("TEST"));
    expect(report.details.peRatio).toBe("TEST's price of $100.00 divided by trailing EPS of $5.00 gives a P/E of 20.00.");
  });
});

describe("resolveGrowthRate", () => {
  it("caps a very large positive trailing growth rate to MAX_GROWTH_RATE", () => {
    expect(resolveGrowthRate(5920.3)).toBe(MAX_GROWTH_RATE);
  });

  it("caps a large negative trailing growth rate to MIN_GROWTH_RATE", () => {
    expect(resolveGrowthRate(-80.0)).toBe(MIN_GROWTH_RATE);
  });

  it("leaves a sane growth rate unchanged", () => {
    expect(resolveGrowthRate(4.0)).toBeCloseTo(0.04);
  });

  it("clamps an explicit override too", () => {
    expect(resolveGrowthRate(10.0, 0.5)).toBe(MAX_GROWTH_RATE);
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

describe("isBankIndustry", () => {
  it("flags Financial Services + bank industries only", () => {
    expect(isBankIndustry("Financial Services", "Banks - Diversified")).toBe(true);
    expect(isBankIndustry("Financial Services", "Banks - Regional")).toBe(true);
    expect(isBankIndustry("Financial Services", "Insurance - Life")).toBe(false);
    expect(isBankIndustry("Technology", "Consumer Electronics")).toBe(false);
    expect(isBankIndustry(null, null)).toBe(false);
  });
});

describe("scoreTicker for banks", () => {
  it("marks the report as a bank and populates bank-specific metrics", () => {
    const report = scoreTicker(bankFundamentals("BANK"));
    expect(report.isBank).toBe(true);
    expect(report.peRatio).not.toBeNull();
    expect(report.priceToBook).not.toBeNull();
    expect(report.roePct).toBeCloseTo(15.0);
    expect(report.dividendYieldPct).toBeCloseTo(3.0);
    expect(report.netInterestMarginPct).toBeCloseTo(2.5);
    // ebitda/freeCashFlow are null in the fixture, so these must be null too.
    expect(report.evEbitda).toBeNull();
    expect(report.fcfYieldPct).toBeNull();
  });

  it("leaves netInterestMarginPct null for non-banks even if somehow present upstream", () => {
    const report = scoreTicker(fundamentals("TEST"));
    expect(report.isBank).toBe(false);
    expect(report.netInterestMarginPct).toBeNull();
  });

  it("still ranks a bank against non-banks using whichever metrics both have", () => {
    const bank = scoreTicker(bankFundamentals("BANK", { price: 50.0 }));
    const nonBank = scoreTicker(fundamentals("NONBANK", { price: 500.0 }));
    const reports = [bank, nonBank];
    applyCompositeScores(reports);

    expect(bank.compositeScore).not.toBeNull();
    expect(nonBank.compositeScore).not.toBeNull();
  });
});
