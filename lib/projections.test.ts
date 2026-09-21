import { describe, expect, it } from "vitest";
import {
  PROJECTION_DISCOUNT_RATE,
  PROJECTION_MAX_GROWTH,
  PROJECTION_MIN_GROWTH,
  analystTargetPoint,
  projectDCF,
  projectDDM,
  projectTargetPrice,
  projectionGrowthRate,
} from "./projections";
import type { Fundamentals } from "./types";

function fundamentals(overrides: Partial<Fundamentals> = {}): Fundamentals {
  return {
    ticker: "TEST",
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

describe("projectionGrowthRate", () => {
  it("caps LYC.AX's real 5920% trailing growth to the max", () => {
    expect(projectionGrowthRate(5920.3)).toBe(PROJECTION_MAX_GROWTH);
  });

  it("caps RIO.AX's real 46.9% trailing growth (which would break the Gordon Growth Model at a 9% discount rate)", () => {
    expect(projectionGrowthRate(46.9)).toBe(PROJECTION_MAX_GROWTH);
  });

  it("caps a large negative growth rate to the min", () => {
    expect(projectionGrowthRate(-80.0)).toBe(PROJECTION_MIN_GROWTH);
  });

  it("leaves a sane growth rate unchanged", () => {
    expect(projectionGrowthRate(4.0)).toBeCloseTo(0.04);
  });

  it("respects an explicit override even if it's outside the normal default range, then still clamps it", () => {
    expect(projectionGrowthRate(10.0, 0.5)).toBe(PROJECTION_MAX_GROWTH);
  });
});

describe("projectDDM", () => {
  it("grows the Gordon Growth value forward at the growth rate", () => {
    const values = projectDDM(2.0, 0.05, 0.09, 5);
    expect(values).toHaveLength(6);
    expect(values.every((v) => v !== null)).toBe(true);
    // value0 = 2*1.05/0.04 = 52.5; year 1 = value0*1.05
    expect(values[0]).toBeCloseTo(52.5);
    expect(values[1]).toBeCloseTo(52.5 * 1.05);
  });

  it("returns all nulls if growth would exceed the discount rate (RIO.AX's real 46.9% case, uncapped)", () => {
    const values = projectDDM(6.63, 0.469, 0.09, 5);
    expect(values.every((v) => v === null)).toBe(true);
  });

  it("regression: PROJECTION_MAX_GROWTH must stay below PROJECTION_DISCOUNT_RATE, or every high-growth stock silently gets a null DDM forever", () => {
    const values = projectDDM(6.63, PROJECTION_MAX_GROWTH, PROJECTION_DISCOUNT_RATE, 5);
    expect(values.some((v) => v !== null)).toBe(true);
  });

  it("returns all nulls for a non-dividend payer", () => {
    expect(projectDDM(null, 0.05).every((v) => v === null)).toBe(true);
    expect(projectDDM(0, 0.05).every((v) => v === null)).toBe(true);
  });
});

describe("projectTargetPrice", () => {
  it("computes EPS x P/E at year 0 and grows forward", () => {
    const values = projectTargetPrice(5.0, 20.0, 0.05, 5);
    expect(values[0]).toBeCloseTo(100.0);
    expect(values[5]).toBeCloseTo(100.0 * Math.pow(1.05, 5));
  });

  it("returns all nulls when EPS or P/E is missing", () => {
    expect(projectTargetPrice(null, 20.0, 0.05).every((v) => v === null)).toBe(true);
    expect(projectTargetPrice(5.0, null, 0.05).every((v) => v === null)).toBe(true);
  });
});

describe("projectDCF", () => {
  it("reuses dcfValuePerShare for year 0 and grows forward at the same rate", () => {
    const values = projectDCF(fundamentals(), 0.05, 5);
    expect(values[0]).not.toBeNull();
    const expectedRatio = values[1]! / values[0]!;
    expect(expectedRatio).toBeCloseTo(1.05);
  });

  it("returns all nulls when the underlying DCF can't be computed", () => {
    const values = projectDCF(fundamentals({ freeCashFlow: null }), 0.05, 5);
    expect(values.every((v) => v === null)).toBe(true);
  });
});

describe("analystTargetPoint", () => {
  it("passes through all four fields when present", () => {
    const point = analystTargetPoint(fundamentals());
    expect(point).toEqual({ mean: 110.0, low: 90.0, high: 130.0, count: 10 });
  });

  it("returns null if any field is missing", () => {
    expect(analystTargetPoint(fundamentals({ targetMeanPrice: null }))).toBeNull();
  });
});
