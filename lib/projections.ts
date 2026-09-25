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

/** Growth-rate assumption for the multi-year projections below — resolveGrowthRate's own
 * (uncapped, see its comment) trailing annual EPS growth. projectDDM's own guard is what
 * keeps the Gordon Growth Model sane if this ever meets or exceeds PROJECTION_DISCOUNT_RATE:
 * it returns nulls rather than a nonsense number, which is the correct behavior for a growth
 * rate the model genuinely can't handle — not something a blanket cap should hide. */
export function projectionGrowthRate(epsGrowthPct: number | null, override?: number | null): number {
  return resolveGrowthRate(epsGrowthPct, override);
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
