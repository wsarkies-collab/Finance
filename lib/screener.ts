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
  type QualityValue,
} from "./valuation";
import { percentileRanks } from "./stats";
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
  /** The growth-rate assumption actually fed into the DCF, after clamping to
   * [MIN_GROWTH_RATE, MAX_GROWTH_RATE] — null only when dcfValue itself is null. */
  dcfGrowthRateUsed: number | null;
  /** The same assumption before clamping — equal to dcfGrowthRateUsed unless
   * dcfGrowthRateClamped is true. */
  dcfGrowthRateRaw: number | null;
  dcfGrowthRateClamped: boolean;
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
  /** Individualized, plain-English description per metric, built from this ticker's own
   * numbers — supplements (doesn't replace) the generic formula explanations in
   * lib/formula-explanations.ts. A missing key means there's nothing further to say beyond
   * the generic explanation (e.g. the metric simply doesn't apply to this ticker). */
  details: Partial<Record<DisplayMetric, string>>;
}

/** The metrics components/TickerDetailModal.tsx shows, in display order — a superset of
 * METRIC_NAMES below (which is ranking-only and deliberately excludes priceToBook/roePct). */
export const DISPLAY_METRICS = [
  "dcfMarginOfSafety",
  "grahamMarginOfSafety",
  "peg",
  "evEbitda",
  "fcfYieldPct",
  "pbRoeScore",
  "peRatio",
  "priceToBook",
  "roePct",
  "dividendYieldPct",
  "netInterestMarginPct",
] as const;

export type DisplayMetric = (typeof DISPLAY_METRICS)[number];

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

// Raw trailing EPS growth (yfinance's `earningsGrowth`, typically a single recent-quarter
// YoY figure) can't be trusted uncapped once it's compounded forward — found via two real
// failures live on this screen: LYC.AX's 5920% trailing growth produced a DCF value of
// -$821M/share, and RIO.AX's 46.9% exceeds the DDM's discount rate, making that model's
// denominator negative. Clamping keeps genuinely different companies at different (bounded)
// assumptions rather than flattening everyone to one fixed number.
//
// MAX_GROWTH_RATE must stay comfortably below the 9% discount rate used elsewhere (dcfValuePerShare's
// default, PROJECTION_DISCOUNT_RATE), not just under it — growth approaching the discount rate
// blows the Gordon Growth denominator (r-g) toward zero, producing an enormous but technically
// "valid" number, which is exactly the failure this cap exists to prevent.
export const MIN_GROWTH_RATE = -0.1;
export const MAX_GROWTH_RATE = 0.06;

/** The override if given, else the ticker's own trailing EPS growth if it has one, else
 * DEFAULT_GROWTH_RATE — before the sanity clamp below. Exposed (via scoreTicker's
 * dcfGrowthRateRaw) so the UI can show a ticker's real, unclamped trailing figure alongside
 * the standardized one the DCF actually used. */
function unclampedGrowthRate(epsGrowthPct: number | null, override?: number | null): number {
  return override ?? (epsGrowthPct ? epsGrowthPct / 100 : DEFAULT_GROWTH_RATE);
}

/** Growth-rate assumption used for the (single-point) DCF, clamped to [MIN_GROWTH_RATE,
 * MAX_GROWTH_RATE]. Also the basis for lib/projections.ts's multi-year projections. The clamp
 * applies even to an explicit override — there's no live UI path that relies on bypassing it
 * today, and a DCF this sensitive to its growth input shouldn't accept an unbounded one from
 * any source. */
export function resolveGrowthRate(epsGrowthPct: number | null, override?: number | null): number {
  return Math.min(MAX_GROWTH_RATE, Math.max(MIN_GROWTH_RATE, unclampedGrowthRate(epsGrowthPct, override)));
}

// ---- individualized, per-ticker description formatting ----

function scaled(v: number): { n: number; suffix: string } {
  const abs = Math.abs(v);
  if (abs >= 1e9) return { n: v / 1e9, suffix: "B" };
  if (abs >= 1e6) return { n: v / 1e6, suffix: "M" };
  if (abs >= 1e3) return { n: v / 1e3, suffix: "K" };
  return { n: v, suffix: "" };
}
function money(v: number | null): string {
  if (v === null) return "n/a";
  const { n, suffix } = scaled(v);
  return `${v < 0 ? "-$" : "$"}${Math.abs(n).toFixed(2)}${suffix}`;
}
function count(v: number | null): string {
  if (v === null) return "n/a";
  const { n, suffix } = scaled(v);
  return `${n.toFixed(2)}${suffix}`;
}
/** `fraction` is a plain fraction (e.g. 0.06 for 6%), not an already-scaled percentage. */
function pct(fraction: number | null, digits = 1): string {
  return fraction === null ? "n/a" : `${(fraction * 100).toFixed(digits)}%`;
}
function num(v: number | null, digits = 2): string {
  return v === null ? "n/a" : v.toFixed(digits);
}

/** Builds the individualized, plain-English description for every metric this ticker has (or
 * a specific reason why it doesn't), using the ticker's own numbers rather than a generic
 * formula blurb — see lib/formula-explanations.ts for the generic one each of these
 * supplements. Kept as a pure function of already-computed values so it never drifts from the
 * actual math above. */
function buildDetails(
  f: Fundamentals,
  isBank: boolean,
  growthRaw: number,
  growthUsed: number,
  growthClamped: boolean,
  dcfValue: number | null,
  dcfMoS: number | null,
  grahamValue: number | null,
  grahamMoS: number | null,
  peg: number | null,
  evEbitda: number | null,
  fcfYieldFraction: number | null,
  quality: QualityValue,
): Partial<Record<DisplayMetric, string>> {
  const t = f.ticker;
  const details: Partial<Record<DisplayMetric, string>> = {};

  if (dcfValue !== null && dcfMoS !== null) {
    let text =
      `${t}'s free cash flow of ${money(f.freeCashFlow)} is projected forward at ${pct(growthUsed)} per year for ` +
      `5 years, discounted at 9%, then a terminal value is added and the total divided across ${count(f.sharesOutstanding)} ` +
      `shares — an estimated fair value of ${money(dcfValue)} per share versus the current price of ${money(f.price)}, ` +
      `a margin of safety of ${pct(dcfMoS)}.`;
    if (growthClamped) {
      text +=
        ` Note: ${t}'s raw trailing earnings growth was ${pct(growthRaw)}, which this app caps to a standardized ` +
        `${pct(growthUsed)} before feeding it into the DCF — a single quarter's growth figure can't be trusted ` +
        `compounded over 5 years uncapped.`;
    }
    details.dcfMarginOfSafety = text;
  } else if (f.freeCashFlow === null) {
    details.dcfMarginOfSafety = `DCF can't be computed for ${t}: no free cash flow figure is available${isBank ? " (typical for banks, whose cash flow doesn't map cleanly onto this model)" : ""}.`;
  } else if (!f.sharesOutstanding) {
    details.dcfMarginOfSafety = `DCF can't be computed for ${t}: no shares-outstanding figure is available to convert enterprise value into a per-share estimate.`;
  }

  if (grahamValue !== null && grahamMoS !== null) {
    details.grahamMarginOfSafety =
      `${t}'s EPS of ${money(f.eps)} and book value of ${money(f.bookValuePerShare)} per share give a Graham ` +
      `fair-value estimate of √(22.5 × ${num(f.eps)} × ${num(f.bookValuePerShare)}) ≈ ${money(grahamValue)} per share, ` +
      `versus a price of ${money(f.price)} — a margin of safety of ${pct(grahamMoS)}.`;
  } else if (f.eps === null || f.eps <= 0) {
    details.grahamMarginOfSafety = `Graham value can't be computed for ${t}: trailing EPS is ${f.eps === null ? "not available" : `negative or zero (${num(f.eps)})`}, and this formula requires positive earnings.`;
  } else if (f.bookValuePerShare === null || f.bookValuePerShare <= 0) {
    details.grahamMarginOfSafety = `Graham value can't be computed for ${t}: book value per share is ${f.bookValuePerShare === null ? "not available" : `negative or zero (${num(f.bookValuePerShare)})`}.`;
  }

  if (peg !== null) {
    const growthLooksVolatile = Math.abs(f.epsGrowthPct ?? 0) > 100;
    details.peg =
      `${t} trades at a trailing P/E of ${num(f.peRatio)} against trailing EPS growth of ${num(f.epsGrowthPct, 1)}% ` +
      `— a PEG ratio of ${num(peg)}.` +
      (growthLooksVolatile
        ? " That growth figure is unusually large (likely a single volatile quarter, not a sustainable trend), so treat this PEG cautiously — it uses the raw reported figure, not the standardized rate the DCF above uses."
        : "");
  } else if (!isBank) {
    if (f.peRatio === null) details.peg = `PEG can't be computed for ${t}: no trailing P/E is available.`;
    else if (!f.epsGrowthPct) details.peg = `PEG can't be computed for ${t}: no trailing EPS growth figure is available.`;
  }

  if (evEbitda !== null) {
    details.evEbitda = `${t}'s enterprise value of ${money(f.enterpriseValue)} divided by EBITDA of ${money(f.ebitda)} gives an EV/EBITDA multiple of ${num(evEbitda)}x.`;
  } else if (!isBank) {
    if (f.enterpriseValue === null) details.evEbitda = `EV/EBITDA can't be computed for ${t}: no enterprise value figure is available.`;
    else if (!f.ebitda) details.evEbitda = `EV/EBITDA can't be computed for ${t}: no EBITDA figure is available.`;
  }

  if (fcfYieldFraction !== null) {
    details.fcfYieldPct = `${t} generated ${money(f.freeCashFlow)} of free cash flow against a market cap of ${money(f.marketCap)} — a free cash flow yield of ${pct(fcfYieldFraction)}.`;
  } else if (!isBank) {
    if (f.freeCashFlow === null) details.fcfYieldPct = `FCF yield can't be computed for ${t}: no free cash flow figure is available.`;
    else if (!f.marketCap) details.fcfYieldPct = `FCF yield can't be computed for ${t}: no market cap figure is available.`;
  }

  if (quality.score !== null) {
    details.pbRoeScore = `${t} trades at ${num(quality.priceToBook)}x book value with a return on equity of ${pct(quality.roe)} — a P/B-vs-ROE score of ${num(quality.score)} (ROE ÷ P/B).`;
  } else if (f.priceToBook === null) {
    details.pbRoeScore = `P/B-vs-ROE can't be computed for ${t}: no price-to-book figure is available.`;
  } else if (f.roe === null) {
    details.pbRoeScore = `P/B-vs-ROE can't be computed for ${t}: no return-on-equity figure is available.`;
  }

  details.peRatio =
    f.peRatio !== null
      ? `${t}'s price of ${money(f.price)} divided by trailing EPS of ${money(f.eps)} gives a P/E of ${num(f.peRatio)}.`
      : `P/E isn't available for ${t}: no trailing P/E figure is reported${f.eps !== null && f.eps <= 0 ? " (likely because trailing earnings are negative or zero)" : ""}.`;

  details.priceToBook =
    f.priceToBook !== null
      ? `${t}'s price of ${money(f.price)} divided by book value of ${money(f.bookValuePerShare)} per share gives a P/B of ${num(f.priceToBook)}.`
      : `P/B isn't available for ${t}: no price-to-book figure is reported.`;

  details.roePct =
    f.roe !== null
      ? `${t} earned a return on equity of ${pct(f.roe)} over the trailing period.`
      : `Return on equity isn't available for ${t}.`;

  details.dividendYieldPct =
    f.dividendYield !== null && f.dividendYield > 0
      ? `${t} pays an annual dividend of ${money(f.dividendRate)} per share, a ${pct(f.dividendYield)} yield at the current price of ${money(f.price)}.`
      : `${t} does not currently pay a dividend.`;

  if (isBank) {
    details.netInterestMarginPct =
      f.netInterestMargin !== null
        ? `${t}'s estimated net interest margin (net interest income ÷ total assets, latest annual figures) is ${pct(f.netInterestMargin)}.`
        : `Net interest margin couldn't be estimated for ${t}: the latest net interest income or total assets figures aren't available.`;
  }

  return details;
}

export function scoreTicker(
  fundamentals: Fundamentals,
  growthRateOverride?: number | null,
): ValuationReport {
  const f = fundamentals;
  const growthRaw = unclampedGrowthRate(f.epsGrowthPct, growthRateOverride);
  const growth = resolveGrowthRate(f.epsGrowthPct, growthRateOverride);
  const isBank = isBankIndustry(f.sector, f.industry);

  const dcfValue = dcfValuePerShare(f.freeCashFlow, growth, f.sharesOutstanding, f.netDebt || 0.0);
  const dcfMarginOfSafety = marginOfSafety(dcfValue, f.price);
  const grahamValue = grahamNumber(f.eps, f.bookValuePerShare);
  const grahamMarginOfSafety = marginOfSafety(grahamValue, f.price);
  const quality = priceToBookVsRoe(f.priceToBook, f.roe);
  const fcfY = fcfYield(f.freeCashFlow, f.marketCap);
  const peg = pegRatio(f.peRatio, f.epsGrowthPct);
  const evEbitda = evToEbitda(f.enterpriseValue, f.ebitda);

  return {
    ticker: f.ticker,
    price: f.price,
    sector: f.sector,
    industry: f.industry,
    isBank,
    dcfValue,
    dcfMarginOfSafety,
    dcfGrowthRateUsed: dcfValue !== null ? growth : null,
    dcfGrowthRateRaw: dcfValue !== null ? growthRaw : null,
    dcfGrowthRateClamped: dcfValue !== null && Math.abs(growthRaw - growth) > 1e-9,
    grahamValue,
    grahamMarginOfSafety,
    peg,
    evEbitda,
    fcfYieldPct: fcfY !== null ? fcfY * 100 : null,
    pbRoeScore: quality.score,
    peRatio: f.peRatio,
    priceToBook: f.priceToBook,
    roePct: f.roe !== null ? f.roe * 100 : null,
    dividendYieldPct: f.dividendYield !== null ? f.dividendYield * 100 : null,
    netInterestMarginPct: f.netInterestMargin !== null ? f.netInterestMargin * 100 : null,
    compositeScore: null,
    details: buildDetails(
      f,
      isBank,
      growthRaw,
      growth,
      dcfValue !== null && Math.abs(growthRaw - growth) > 1e-9,
      dcfValue,
      dcfMarginOfSafety,
      grahamValue,
      grahamMarginOfSafety,
      peg,
      evEbitda,
      fcfY,
      quality,
    ),
  };
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
