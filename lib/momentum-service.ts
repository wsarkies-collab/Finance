import "server-only";

import {
  MOMENTUM_LOOKBACK_WEEKS,
  REBALANCE_WEEKS,
  computeMomentumScreen,
  momentum12to1,
  proximityTo52wkHigh,
  realizedVolatility,
  type MomentumRawRow,
  type MomentumReport,
} from "./momentum";
import { fetchPriceHistory } from "./price-history-client";
import { getFundamentals } from "./screen-service";

const MAX_TICKERS_PER_REQUEST = 25;
// Need at least a full lookback window plus the rebalance offset to compute a "prior" snapshot
// at all (see lib/momentum.ts's window constants).
const MIN_WEEKS_REQUIRED = MOMENTUM_LOOKBACK_WEEKS + REBALANCE_WEEKS;
// Sector/market "browse" groups can run into the hundreds (e.g. Financials across both
// markets); firing that many concurrent requests at the Python fundamentals/price-history
// functions at once risks overwhelming yfinance and Vercel's own concurrency limits.
const DEFAULT_CONCURRENCY = 15;

/** Runs `fn` over `items` with at most `limit` in flight at once, preserving input order in
 * the returned settled results (same shape as Promise.allSettled). */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(new Array(Math.min(limit, items.length)).fill(null).map(worker));
  return results;
}

function buildRawRow(
  ticker: string,
  name: string | null,
  sector: string | null,
  roe: number | null,
  peRatio: number | null,
  closes: number[],
): MomentumRawRow {
  return {
    ticker,
    name,
    sector,
    price: closes.length ? closes[closes.length - 1] : null,
    momentum: momentum12to1(closes),
    proximity: proximityTo52wkHigh(closes),
    volatility: realizedVolatility(closes),
    roe,
    peRatio,
  };
}

/**
 * Fetches fundamentals + weekly price history for each ticker and runs the momentum/quality
 * screen. A ticker is silently dropped (not a partial/empty row) if either fetch fails or
 * there isn't enough price history for a meaningful momentum window — same "skip rather than
 * fake it" approach as the rest of this app's data-gap handling.
 */
export async function runMomentumScreen(
  tickers: string[],
  topN = 8,
  maxTickers = MAX_TICKERS_PER_REQUEST,
): Promise<MomentumReport[]> {
  const normalized = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))].slice(0, maxTickers);
  if (normalized.length === 0) {
    return [];
  }

  const results = await mapWithConcurrency(normalized, DEFAULT_CONCURRENCY, async (ticker) => {
    const [fundamentals, history] = await Promise.all([getFundamentals(ticker), fetchPriceHistory(ticker)]);
    if (!fundamentals || history.closes.length < MIN_WEEKS_REQUIRED) {
      return null;
    }
    // "Now" uses every close fetched; "prior" (~1 rebalance period ago) drops the most
    // recent REBALANCE_WEEKS closes, so the same momentum/proximity/volatility math runs
    // on data as it looked a month ago — no second network fetch needed.
    const nowCloses = history.closes;
    const priorCloses = history.closes.slice(0, history.closes.length - REBALANCE_WEEKS);
    return {
      // This app's Fundamentals type doesn't carry a company display name (only the
      // ranked screener's ticker symbol is shown elsewhere in the UI) — null here on
      // purpose rather than a made-up value.
      now: buildRawRow(ticker, null, fundamentals.sector, fundamentals.roe, fundamentals.peRatio, nowCloses),
      prior: buildRawRow(ticker, null, fundamentals.sector, fundamentals.roe, fundamentals.peRatio, priorCloses),
    };
  });

  const nowRows: MomentumRawRow[] = [];
  const priorRows: MomentumRawRow[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      nowRows.push(result.value.now);
      priorRows.push(result.value.prior);
    }
  }

  return computeMomentumScreen(nowRows, priorRows, topN);
}
