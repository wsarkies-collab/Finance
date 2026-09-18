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
  sector: string | null;
  industry: string | null;
  /** True for banks (sector "Financial Services" + "bank" in industry) — see isBankIndustry.
   * DCF/PEG/EV-EBITDA/FCF-yield are structurally unreliable for banks (see peRatio etc. below
   * for the metrics used instead), so the UI treats this as a hint to explain those n/a's. */
  isBank: boolean;
  dcfValue: number | null;
  dcfMarginOfSafety: number | null;
  grahamValue: number | null;
  grahamMarginOfSafety: number | null;
  peg: number | null;
  evEbitda: number | null;
  fcfYieldPct: number | null;
  pbRoeScore: number | null;
  /** Raw pass-throughs, always populated when Yahoo has them (not bank-specific) — shown
   * alongside pbRoeScore for banks, where P/B-vs-ROE alone is a less familiar framing. */
  peRatio: number | null;
  priceToBook: number | null;
  roePct: number | null;
  dividendYieldPct: number | null;
  /** Only ever non-null for banks — see Fundamentals.netInterestMargin. */
  netInterestMarginPct: number | null;
  compositeScore: number | null;
}

/** Metrics where a lower raw value means "cheaper" get their percentile rank flipped
 * so that, after flipping, higher always means more attractive across every metric. */
const LOWER_IS_BETTER = new Set<MetricName>(["peg", "evEbitda", "peRatio"]);

const METRIC_NAMES = [
  "dcfMarginOfSafety",
  "grahamMarginOfSafety",
  "peg",
  "evEbitda",
  "fcfYieldPct",
  "pbRoeScore",
  // Bank-relevant additions. peRatio/dividendYieldPct are populated for most tickers, not
  // just banks, but netInterestMarginPct is null for everyone else, so it naturally drops
  // out of the ranking (see percentileRanks) for non-bank tickers rather than needing a
  // separate bank-only ranking path. priceToBook/roePct are deliberately NOT ranked here —
  // pbRoeScore already combines them, and ranking both would double-count book value.
  "peRatio",
  "dividendYieldPct",
  "netInterestMarginPct",
] as const;

type MetricName = (typeof METRIC_NAMES)[number];

export function isBankIndustry(sector: string | null, industry: string | null): boolean {
  return sector === "Financial Services" && !!industry && industry.toLowerCase().includes("bank");
}

/** True if a lower raw value is more attractive for this metric (see LOWER_IS_BETTER above). */
export function isLowerBetterMetric(metric: string): boolean {
  return LOWER_IS_BETTER.has(metric as MetricName);
}

function marginOfSafety(fairValue: number | null, price: number | null): number | null {
  if (fairValue === null || !price) {
    return null;
  }
  return (fairValue - price) / price;
}

/** Growth-rate assumption used for the (single-point) DCF: the override if given, else the
 * ticker's own trailing EPS growth if it has one, else DEFAULT_GROWTH_RATE. Also the basis
 * for lib/projections.ts's multi-year projections, which additionally clamp this to a sane
 * range — see the comment there for why raw trailing growth can't be trusted uncapped over
 * a multi-year compounding horizon. */
export function resolveGrowthRate(epsGrowthPct: number | null, override?: number | null): number {
  return override ?? (epsGrowthPct ? epsGrowthPct / 100 : DEFAULT_GROWTH_RATE);
}

export function scoreTicker(
  fundamentals: Fundamentals,
  growthRateOverride?: number | null,
): ValuationReport {
  const f = fundamentals;
  const growth = resolveGrowthRate(f.epsGrowthPct, growthRateOverride);

  const dcfValue = dcfValuePerShare(f.freeCashFlow, growth, f.sharesOutstanding, f.netDebt || 0.0);
  const grahamValue = grahamNumber(f.eps, f.bookValuePerShare);
  const quality = priceToBookVsRoe(f.priceToBook, f.roe);
  const fcfY = fcfYield(f.freeCashFlow, f.marketCap);

  return {
    ticker: f.ticker,
    price: f.price,
    sector: f.sector,
    industry: f.industry,
    isBank: isBankIndustry(f.sector, f.industry),
    dcfValue,
    dcfMarginOfSafety: marginOfSafety(dcfValue, f.price),
    grahamValue,
    grahamMarginOfSafety: marginOfSafety(grahamValue, f.price),
    peg: pegRatio(f.peRatio, f.epsGrowthPct),
    evEbitda: evToEbitda(f.enterpriseValue, f.ebitda),
    fcfYieldPct: fcfY !== null ? fcfY * 100 : null,
    pbRoeScore: quality.score,
    peRatio: f.peRatio,
    priceToBook: f.priceToBook,
    roePct: f.roe !== null ? f.roe * 100 : null,
    dividendYieldPct: f.dividendYield !== null ? f.dividendYield * 100 : null,
    netInterestMarginPct: f.netInterestMargin !== null ? f.netInterestMargin * 100 : null,
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
