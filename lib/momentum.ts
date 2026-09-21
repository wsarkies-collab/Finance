/**
 * Momentum + quality/value screening math. Pure functions only — no I/O (see
 * lib/momentum-service.ts for fetching/orchestration). Mirrors the pure/impure split already
 * used for lib/screener.ts / lib/screen-service.ts.
 *
 * Built on the two signals the research behind this feature found actually held up out of
 * sample: 12-1 month price momentum (Jegadeesh & Titman 1993, skip-the-most-recent-month per
 * Novy-Marx 2012) and 52-week-high proximity (George & Hwang 2004), blended with this app's
 * existing ROE/P·E quality-value screen. See the "Short to medium term trading strategies"
 * research report for citations and the (real) caveats about small-universe pattern matching.
 *
 * api/price_history.py returns WEEKLY bars (5y history), not daily — so all windows here are
 * expressed in trading weeks, not trading days. That's a deliberate, disclosed approximation:
 * this screen only ever rebalances weekly/monthly, so daily granularity wouldn't change the
 * output, and it lets this reuse the same price-history endpoint Future Projections already
 * fetches instead of adding a second, heavier daily-bar endpoint.
 */

import { percentileRanks } from "./stats";

export const WEEKS_PER_YEAR = 52;
export const MOMENTUM_LOOKBACK_WEEKS = 52; // ~12 months
export const MOMENTUM_SKIP_WEEKS = 4; // skip the most recent ~1 month (Novy-Marx 2012)
export const PROXIMITY_WINDOW_WEEKS = 52; // 52-week high
export const VOLATILITY_WINDOW_WEEKS = 13; // ~3 months
export const REBALANCE_WEEKS = 4; // ~1 month, for the "signal" (new entrant/held/dropped) comparison

export const MOMENTUM_WEIGHT = 0.4;
export const PROXIMITY_WEIGHT = 0.3;
export const QUALITY_VALUE_WEIGHT = 0.3;
export const ELEVATED_VOLATILITY_THRESHOLD = 0.4; // annualized

export type Signal = "new_entrant" | "held" | "dropped_out";

/** 12-1 month momentum: return from ~52 weeks ago to ~4 weeks ago, skipping the most recent
 * month. `closes` must be chronological (oldest first), matching api/price_history.py's output. */
export function momentum12to1(closes: number[]): number | null {
  if (closes.length <= MOMENTUM_LOOKBACK_WEEKS) return null;
  const priceSkip = closes[closes.length - 1 - MOMENTUM_SKIP_WEEKS];
  const priceLookback = closes[closes.length - 1 - MOMENTUM_LOOKBACK_WEEKS];
  if (priceSkip === undefined || priceLookback === undefined || !priceLookback) return null;
  return priceSkip / priceLookback - 1;
}

/** Current price divided by the highest close in the trailing 52 weeks. */
export function proximityTo52wkHigh(closes: number[]): number | null {
  if (closes.length === 0) return null;
  const window = closes.slice(-PROXIMITY_WINDOW_WEEKS);
  const high = Math.max(...window);
  if (!high) return null;
  return closes[closes.length - 1] / high;
}

/** Annualized volatility of weekly returns over the trailing ~3 months. */
export function realizedVolatility(closes: number[]): number | null {
  const window = closes.slice(-(VOLATILITY_WINDOW_WEEKS + 1));
  if (window.length < 3) return null;
  const returns: number[] = [];
  for (let i = 1; i < window.length; i++) {
    if (window[i - 1]) returns.push(window[i] / window[i - 1] - 1);
  }
  if (returns.length < 2) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(WEEKS_PER_YEAR);
}

export interface MomentumRawRow {
  ticker: string;
  name: string | null;
  sector: string | null;
  price: number | null;
  momentum: number | null;
  proximity: number | null;
  volatility: number | null;
  roe: number | null;
  peRatio: number | null;
}

export interface MomentumReport extends MomentumRawRow {
  qualityValuePct: number | null;
  compositeScore: number | null;
  rank: number;
  signal: Signal;
  inTopNow: boolean;
}

/** ROE percentile (higher = better) blended with inverted P/E percentile (lower P/E = better),
 * missing values filled with a neutral 0.5 so one missing fundamental doesn't zero out the
 * blend for that ticker. */
export function qualityValuePercentiles(roe: (number | null)[], peRatio: (number | null)[]): (number | null)[] {
  const roePct = percentileRanks(roe);
  const pePct = percentileRanks(peRatio).map((p) => (p === null ? null : 1 - p));
  return roe.map((_, i) => {
    const r = roePct[i] ?? 0.5;
    const p = pePct[i] ?? 0.5;
    return (r + p) / 2;
  });
}

/** Ranks a batch of raw rows by composite momentum/proximity/quality-value score. Rows with
 * insufficient data to compute anything meaningful (momentum and proximity both null) are
 * dropped rather than ranked with a meaningless composite. */
function rankRows(rows: MomentumRawRow[]): Array<Omit<MomentumReport, "signal" | "inTopNow">> {
  const usable = rows.filter((r) => r.momentum !== null || r.proximity !== null);
  const momentumPct = percentileRanks(usable.map((r) => r.momentum));
  const proximityPct = percentileRanks(usable.map((r) => r.proximity));
  const qvPct = qualityValuePercentiles(usable.map((r) => r.roe), usable.map((r) => r.peRatio));

  const scored = usable.map((r, i) => {
    const parts: number[] = [];
    if (momentumPct[i] !== null) parts.push(MOMENTUM_WEIGHT * momentumPct[i]!);
    if (proximityPct[i] !== null) parts.push(PROXIMITY_WEIGHT * proximityPct[i]!);
    if (qvPct[i] !== null) parts.push(QUALITY_VALUE_WEIGHT * qvPct[i]!);
    const weightUsed =
      (momentumPct[i] !== null ? MOMENTUM_WEIGHT : 0) +
      (proximityPct[i] !== null ? PROXIMITY_WEIGHT : 0) +
      (qvPct[i] !== null ? QUALITY_VALUE_WEIGHT : 0);
    const compositeScore = weightUsed > 0 ? parts.reduce((a, b) => a + b, 0) / weightUsed : null;
    return { ...r, qualityValuePct: qvPct[i], compositeScore, rank: 0 };
  });

  scored.sort((a, b) => (b.compositeScore ?? -Infinity) - (a.compositeScore ?? -Infinity));
  scored.forEach((r, i) => {
    r.rank = i + 1;
  });
  return scored;
}

/**
 * Ranks `nowRows` against themselves, ranks `priorRows` (the same tickers' data from
 * ~REBALANCE_WEEKS ago) against themselves, and diffs the top-`topN` sets of each to derive a
 * "signal" per ticker — this screen's stand-in for a buy/sell trigger (see the mockup this was
 * built from): entered the top N since the prior rebalance ("new_entrant"), stayed in
 * ("held"), or fell out ("dropped_out"). Returns every usable row, not just the top N, so the
 * caller can show "dropped this rebalance" context.
 */
export function computeMomentumScreen(
  nowRows: MomentumRawRow[],
  priorRows: MomentumRawRow[],
  topN = 8,
): MomentumReport[] {
  const now = rankRows(nowRows);
  const prior = rankRows(priorRows);

  const topNowTickers = new Set(now.slice(0, topN).map((r) => r.ticker));
  const topPriorTickers = new Set(prior.slice(0, topN).map((r) => r.ticker));

  return now
    .filter((r) => topNowTickers.has(r.ticker) || topPriorTickers.has(r.ticker))
    .map((r) => {
      const inTopNow = topNowTickers.has(r.ticker);
      let signal: Signal = "held";
      if (inTopNow && !topPriorTickers.has(r.ticker)) {
        signal = "new_entrant";
      } else if (!inTopNow) {
        signal = "dropped_out";
      }
      return { ...r, signal, inTopNow };
    });
}
