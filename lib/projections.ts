/**
 * 5-year price projections for the "Future Projections" view. Pure functions only — no I/O
 * (see lib/projection-service.ts for fetching/orchestration). Mirrors the pure/impure split
 * already used for lib/screener.ts / lib/screen-service.ts.
 */

import { dcfValuePerShare } from "./valuation";
import { resolveGrowthRate } from "./screener";
import type { Fundamentals } from "./types";

export const PROJECTION_YEARS = 5;
export const PROJECTION_DISCOUNT_RATE = 0.09; // matches the existing DCF's default

// Raw trailing EPS growth can't be trusted uncapped over a 5-year compounding horizon — we
// found two real failures building this: LYC.AX's 5920% trailing growth produced a nonsensical
// DCF, and RIO.AX's 46.9% exceeds PROJECTION_DISCOUNT_RATE, which makes the Gordon Growth
// Model's denominator negative. Clamping keeps genuinely different companies at different
// (bounded) assumptions rather than flattening everyone to one fixed number.
//
// PROJECTION_MAX_GROWTH must stay comfortably below PROJECTION_DISCOUNT_RATE, not just under
// it — this was caught by testing against real RIO.AX data: an earlier version capped growth
// at 15%, which is *itself* above the 9% discount rate, so DDM was silently null for every
// stock that hit the cap (exactly the failure this cap exists to prevent). Even short of that,
// growth approaching the discount rate blows the Gordon Growth denominator (r-g) toward zero,
// producing an enormous but technically "valid" number — so this leaves real headroom, not
// just enough to avoid the guard.
export const PROJECTION_MIN_GROWTH = -0.1;
export const PROJECTION_MAX_GROWTH = 0.06;

export function projectionGrowthRate(epsGrowthPct: number | null, override?: number | null): number {
  const raw = resolveGrowthRate(epsGrowthPct, override);
  return Math.min(PROJECTION_MAX_GROWTH, Math.max(PROJECTION_MIN_GROWTH, raw));
}

function growForward(value0: number, growth: number, years: number): number[] {
  return Array.from({ length: years + 1 }, (_, n) => value0 * Math.pow(1 + growth, n));
}

function allNull(years: number): null[] {
  return new Array(years + 1).fill(null);
}

/** Gordon Growth (Dividend Discount) Model: D0*(1+g)/(r-g) at year 0, grown forward at g.
 * Null (not a crash) if there's no dividend to discount, or if discountRate <= growth —
 * the same guard style as dcfValuePerShare. */
export function projectDDM(
  dividendRate: number | null,
  growth: number,
  discountRate: number = PROJECTION_DISCOUNT_RATE,
  years: number = PROJECTION_YEARS,
): (number | null)[] {
  if (dividendRate === null || dividendRate <= 0 || discountRate <= growth) {
    return allNull(years);
  }
  const value0 = (dividendRate * (1 + growth)) / (discountRate - growth);
  return growForward(value0, growth, years);
}

/** EPS(1+g)^n x future P/E, with the future P/E held at the current trailing P/E. */
export function projectTargetPrice(
  eps: number | null,
  peRatio: number | null,
  growth: number,
  years: number = PROJECTION_YEARS,
): (number | null)[] {
  if (eps === null || peRatio === null) {
    return allNull(years);
  }
  return growForward(eps * peRatio, growth, years);
}

/** Year-0 value from the existing dcfValuePerShare, grown forward at the same rate. */
export function projectDCF(
  fundamentals: Fundamentals,
  growth: number,
  years: number = PROJECTION_YEARS,
): (number | null)[] {
  const value0 = dcfValuePerShare(
    fundamentals.freeCashFlow,
    growth,
    fundamentals.sharesOutstanding,
    fundamentals.netDebt || 0.0,
  );
  if (value0 === null) {
    return allNull(years);
  }
  return growForward(value0, growth, years);
}

export interface AnalystTarget {
  mean: number;
  low: number;
  high: number;
  count: number;
}

/** Real Yahoo consensus data, not a formula — only ever plotted at Year 1, since that's the
 * actual forecast horizon analysts gave (not the full 5 years the other three models cover). */
export function analystTargetPoint(fundamentals: Fundamentals): AnalystTarget | null {
  const { targetMeanPrice, targetLowPrice, targetHighPrice, numberOfAnalystOpinions } = fundamentals;
  if (
    targetMeanPrice === null ||
    targetLowPrice === null ||
    targetHighPrice === null ||
    numberOfAnalystOpinions === null
  ) {
    return null;
  }
  return { mean: targetMeanPrice, low: targetLowPrice, high: targetHighPrice, count: numberOfAnalystOpinions };
}
