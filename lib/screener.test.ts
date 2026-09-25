import { describe, expect, it } from "vitest";
import { applyCompositeScores, isBankIndustry, resolveGrowthRate, scoreTicker } from "./screener";
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

  it("no longer clamps the growth rate: an extreme trailing growth figure flows straight through into the DCF", () => {
    // eps_growth_pct is now sourced from annual (not quarterly) EPS growth upstream (see
    // api/fundamentals.py's _annual_eps_growth_pct), which is far less prone to extreme swings
    // — so the DCF no longer needs a blanket cap to stay sane in the common case. A synthetic
    // input this extreme should still flow straight through, uncapped, by design.
    const report = scoreTicker(fundamentals("LYC", { epsGrowthPct: 5920.3, freeCashFlow: -50.0 }));
    expect(report.dcfGrowthRate).toBeCloseTo(59.203);
    expect(report.dcfValue).not.toBeNull();
    expect(Math.abs(report.dcfValue as number)).toBeGreaterThan(1_000_000);
  });

  it("sets dcfGrowthRate to the resolved growth rate whenever the DCF itself computes", () => {
    const report = scoreTicker(fundamentals("TEST", { epsGrowthPct: 4.0 }));
    expect(report.dcfGrowthRate).toBeCloseTo(0.04);
    expect(report.details.dcfMarginOfSafety).toContain("4.0% per year");
    expect(report.details.dcfMarginOfSafety).not.toContain("Note:");
  });

  it("flags an extreme resulting growth rate in the DCF description instead of capping it", () => {
    const report = scoreTicker(fundamentals("LYC", { epsGrowthPct: 5920.3 }));
    expect(report.dcfGrowthRate).toBeCloseTo(59.203);
    expect(report.details.dcfMarginOfSafety).toContain("5920.3% annual growth is unusually large");
  });

  it("sets dcfGrowthRate to null when the DCF itself can't be computed", () => {
    const report = scoreTicker(fundamentals("TEST", { freeCashFlow: null }));
    expect(report.dcfGrowthRate).toBeNull();
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
  it("is not clamped: a very large positive trailing growth rate passes straight through", () => {
    expect(resolveGrowthRate(5920.3)).toBeCloseTo(59.203);
  });

  it("is not clamped: a large negative trailing growth rate passes straight through", () => {
    expect(resolveGrowthRate(-80.0)).toBeCloseTo(-0.8);
  });

  it("leaves a sane growth rate unchanged", () => {
    expect(resolveGrowthRate(4.0)).toBeCloseTo(0.04);
  });

  it("passes an explicit override straight through too", () => {
    expect(resolveGrowthRate(10.0, 0.5)).toBe(0.5);
  });

  it("falls back to DEFAULT_GROWTH_RATE when there's no growth figure at all", () => {
    expect(resolveGrowthRate(null)).toBeCloseTo(0.05);
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
