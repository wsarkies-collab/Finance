import "server-only";

import { fetchFundamentals } from "./fundamentals-client";
import { applyCompositeScores, scoreTicker, sortReports, type ValuationReport } from "./screener";
import { createAdminClient } from "./supabase/admin";
import type { Fundamentals } from "./types";

const MAX_TICKERS_PER_REQUEST = 25;
const DEFAULT_CACHE_TTL_MINUTES = 30;

export interface FundamentalsCacheRow {
  ticker: string;
  fetched_at: string;
  price: number | null;
  market_cap: number | null;
  enterprise_value: number | null;
  shares_outstanding: number | null;
  net_debt: number | null;
  eps: number | null;
  book_value_per_share: number | null;
  pe_ratio: number | null;
  eps_growth_pct: number | null;
  ebitda: number | null;
  free_cash_flow: number | null;
  roe: number | null;
  price_to_book: number | null;
  sector: string | null;
  industry: string | null;
  dividend_yield: number | null;
  net_interest_margin: number | null;
  dividend_rate: number | null;
  target_mean_price: number | null;
  target_low_price: number | null;
  target_high_price: number | null;
  number_of_analyst_opinions: number | null;
}

export function rowToFundamentals(row: FundamentalsCacheRow): Fundamentals {
  return {
    ticker: row.ticker,
    price: row.price,
    marketCap: row.market_cap,
    enterpriseValue: row.enterprise_value,
    sharesOutstanding: row.shares_outstanding,
    netDebt: row.net_debt,
    eps: row.eps,
    bookValuePerShare: row.book_value_per_share,
    peRatio: row.pe_ratio,
    epsGrowthPct: row.eps_growth_pct,
    ebitda: row.ebitda,
    freeCashFlow: row.free_cash_flow,
    roe: row.roe,
    priceToBook: row.price_to_book,
    sector: row.sector,
    industry: row.industry,
    dividendYield: row.dividend_yield,
    netInterestMargin: row.net_interest_margin,
    dividendRate: row.dividend_rate,
    targetMeanPrice: row.target_mean_price,
    targetLowPrice: row.target_low_price,
    targetHighPrice: row.target_high_price,
    numberOfAnalystOpinions: row.number_of_analyst_opinions,
  };
}

function fundamentalsToRow(f: Fundamentals): Omit<FundamentalsCacheRow, "fetched_at"> {
  return {
    ticker: f.ticker,
    price: f.price,
    market_cap: f.marketCap,
    enterprise_value: f.enterpriseValue,
    shares_outstanding: f.sharesOutstanding,
    net_debt: f.netDebt,
    eps: f.eps,
    book_value_per_share: f.bookValuePerShare,
    pe_ratio: f.peRatio,
    eps_growth_pct: f.epsGrowthPct,
    ebitda: f.ebitda,
    free_cash_flow: f.freeCashFlow,
    roe: f.roe,
    price_to_book: f.priceToBook,
    sector: f.sector,
    industry: f.industry,
    dividend_yield: f.dividendYield,
    net_interest_margin: f.netInterestMargin,
    dividend_rate: f.dividendRate,
    target_mean_price: f.targetMeanPrice,
    target_low_price: f.targetLowPrice,
    target_high_price: f.targetHighPrice,
    number_of_analyst_opinions: f.numberOfAnalystOpinions,
  };
}

function emptyReport(ticker: string): ValuationReport {
  return {
    ticker,
    price: null,
    sector: null,
    industry: null,
    isBank: false,
    dcfValue: null,
    dcfMarginOfSafety: null,
    grahamValue: null,
    grahamMarginOfSafety: null,
    peg: null,
    evEbitda: null,
    fcfYieldPct: null,
    pbRoeScore: null,
    peRatio: null,
    priceToBook: null,
    roePct: null,
    dividendYieldPct: null,
    netInterestMarginPct: null,
    compositeScore: null,
  };
}

function cacheTtlMs(): number {
  const minutes = Number(process.env.FUNDAMENTALS_CACHE_TTL_MINUTES ?? DEFAULT_CACHE_TTL_MINUTES);
  return (Number.isFinite(minutes) ? minutes : DEFAULT_CACHE_TTL_MINUTES) * 60_000;
}

/**
 * Cache-first fundamentals lookup for a single ticker — same cache/fetch/upsert logic as
 * runScreen, factored out for callers (e.g. lib/projection-service.ts) that only ever need
 * one ticker and don't want runScreen's batch-ranking machinery. Returns null if the ticker
 * can't be resolved at all (unknown ticker, fetch failure with no cached fallback).
 */
export async function getFundamentals(ticker: string): Promise<Fundamentals | null> {
  const normalized = ticker.trim().toUpperCase();
  const admin = createAdminClient();
  const { data } = await admin.from("fundamentals_cache").select("*").eq("ticker", normalized).maybeSingle();

  const row = data as FundamentalsCacheRow | null;
  if (row && Date.now() - new Date(row.fetched_at).getTime() < cacheTtlMs()) {
    return rowToFundamentals(row);
  }

  try {
    const fresh = await fetchFundamentals(normalized);
    await admin
      .from("fundamentals_cache")
      .upsert({ ...fundamentalsToRow(fresh), fetched_at: new Date().toISOString() }, { onConflict: "ticker" });
    return fresh;
  } catch {
    return row ? rowToFundamentals(row) : null; // stale cache beats nothing
  }
}

/**
 * Fetches (cache-first) and scores every requested ticker, then ranks them against
 * each other. compositeScore is always recomputed here, across exactly this batch —
 * see lib/screener.ts for why it must never be cached or reused across batches.
 */
export async function runScreen(
  tickers: string[],
  growthRateOverride?: number,
): Promise<ValuationReport[]> {
  const normalized = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))].slice(
    0,
    MAX_TICKERS_PER_REQUEST,
  );
  if (normalized.length === 0) {
    return [];
  }

  const admin = createAdminClient();
  const { data: cached } = await admin
    .from("fundamentals_cache")
    .select("*")
    .in("ticker", normalized);

  const ttlMs = cacheTtlMs();
  const now = Date.now();
  const fresh = new Map<string, FundamentalsCacheRow>(
    ((cached ?? []) as FundamentalsCacheRow[])
      .filter((row) => now - new Date(row.fetched_at).getTime() < ttlMs)
      .map((row) => [row.ticker, row]),
  );

  const misses = normalized.filter((t) => !fresh.has(t));
  const fetchResults = await Promise.allSettled(misses.map((t) => fetchFundamentals(t)));

  const fetchedByTicker = new Map<string, Fundamentals>();
  const rowsToUpsert: FundamentalsCacheRow[] = [];
  fetchResults.forEach((result, i) => {
    if (result.status === "fulfilled") {
      fetchedByTicker.set(misses[i], result.value);
      rowsToUpsert.push({ ...fundamentalsToRow(result.value), fetched_at: new Date().toISOString() });
    }
  });

  if (rowsToUpsert.length > 0) {
    await admin.from("fundamentals_cache").upsert(rowsToUpsert, { onConflict: "ticker" });
  }

  const reports = normalized.map((ticker) => {
    const raw = fetchedByTicker.get(ticker) ?? (fresh.has(ticker) ? rowToFundamentals(fresh.get(ticker)!) : null);
    if (!raw) {
      return emptyReport(ticker);
    }
    return scoreTicker(raw, growthRateOverride);
  });

  applyCompositeScores(reports);
  return sortReports(reports);
}
