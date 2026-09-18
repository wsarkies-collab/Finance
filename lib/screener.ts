/**
 * Scores tickers across all five valuation formulas and ranks them.
 * Pure functions only — no fetching/caching here (see lib/screen-service.ts for that).
 * Ported 1:1 from src/stockval/screener.py.
 */

import {
  dcfValuePerShare,
  evToEbitda,
  fcfYield,
  grahamNumber,
  pegRatio,
  priceToBookVsRoe,
} from "./valuation";
import type { Fundamentals } from "./types";

export const DEFAULT_GROWTH_RATE = 0.05;

export interface ValuationReport {
  ticker: string;
  price: number | null;
  dcfValue: number | null;
  dcfMarginOfSafety: number | null;
  grahamValue: number | null;
  grahamMarginOfSafety: number | null;
  peg: number | null;
  evEbitda: number | null;
  fcfYieldPct: number | null;
  pbRoeScore: number | null;
  compositeScore: number | null;
}

/** Metrics where a lower raw value means "cheaper" get their percentile rank flipped
 * so that, after flipping, higher always means more attractive across every metric. */
const LOWER_IS_BETTER = new Set<MetricName>(["peg", "evEbitda"]);

const METRIC_NAMES = [
  "dcfMarginOfSafety",
  "grahamMarginOfSafety",
  "peg",
  "evEbitda",
  "fcfYieldPct",
  "pbRoeScore",
] as const;

type MetricName = (typeof METRIC_NAMES)[number];

function marginOfSafety(fairValue: number | null, price: number | null): number | null {
  if (fairValue === null || !price) {
    return null;
  }
  return (fairValue - price) / price;
}

export function scoreTicker(
  fundamentals: Fundamentals,
  growthRateOverride?: number | null,
): ValuationReport {
  const f = fundamentals;
  const growth =
    growthRateOverride ?? (f.epsGrowthPct ? f.epsGrowthPct / 100 : DEFAULT_GROWTH_RATE);

  const dcfValue = dcfValuePerShare(f.freeCashFlow, growth, f.sharesOutstanding, f.netDebt || 0.0);
  const grahamValue = grahamNumber(f.eps, f.bookValuePerShare);
  const quality = priceToBookVsRoe(f.priceToBook, f.roe);
  const fcfY = fcfYield(f.freeCashFlow, f.marketCap);

  return {
    ticker: f.ticker,
    price: f.price,
    dcfValue,
    dcfMarginOfSafety: marginOfSafety(dcfValue, f.price),
    grahamValue,
    grahamMarginOfSafety: marginOfSafety(grahamValue, f.price),
    peg: pegRatio(f.peRatio, f.epsGrowthPct),
    evEbitda: evToEbitda(f.enterpriseValue, f.ebitda),
    fcfYieldPct: fcfY !== null ? fcfY * 100 : null,
    pbRoeScore: quality.score,
    compositeScore: null,
  };
}

function percentileRanks(values: (number | null)[]): (number | null)[] {
  const present = values
    .map((v, i): [number, number | null] => [i, v])
    .filter((pair): pair is [number, number] => pair[1] !== null);
  if (present.length < 2) {
    return values.map(() => null);
  }
  const ordered = [...present].sort((a, b) => a[1] - b[1]);
  const ranks: (number | null)[] = values.map(() => null);
  ordered.forEach(([i], rank) => {
    ranks[i] = rank / (ordered.length - 1);
  });
  return ranks;
}

/** Mutates `report.compositeScore` on every report in place, ranked across this batch only. */
export function applyCompositeScores(reports: ValuationReport[]): void {
  const ranked: Record<MetricName, (number | null)[]> = {} as Record<
    MetricName,
    (number | null)[]
  >;

  for (const name of METRIC_NAMES) {
    const raw = reports.map((r) => r[name]);
    let ranks = percentileRanks(raw);
    if (LOWER_IS_BETTER.has(name)) {
      ranks = ranks.map((r) => (r === null ? null : 1 - r));
    }
    ranked[name] = ranks;
  }

  reports.forEach((report, idx) => {
    const scores = METRIC_NAMES.map((name) => ranked[name][idx]).filter(
      (v): v is number => v !== null,
    );
    report.compositeScore = scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;
  });
}

/** Nulls last; otherwise descending by compositeScore (highest/most attractive first). */
export function sortReports(reports: ValuationReport[]): ValuationReport[] {
  return [...reports].sort((a, b) => {
    const aNull = a.compositeScore === null;
    const bNull = b.compositeScore === null;
    if (aNull !== bNull) {
      return aNull ? 1 : -1;
    }
    return (b.compositeScore ?? 0) - (a.compositeScore ?? 0);
  });
}
