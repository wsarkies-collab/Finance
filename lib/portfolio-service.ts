import "server-only";

import {
  MIN_OVERLAP_WEEKS,
  alignByDate,
  benchmarkFor,
  buildCovariance,
  computeBeta,
  minVarianceWeights,
  portfolioVolatility,
  type PriceSeries,
} from "./portfolio";
import { fetchPriceHistory, type PriceHistory } from "./price-history-client";

const MAX_PORTFOLIO_TICKERS = 30;

export interface PortfolioTickerResult {
  ticker: string;
  weight: number;
  ewWeight: number;
  beta: number;
  individualVol: number;
}

export interface PortfolioAnalysis {
  tickers: PortfolioTickerResult[];
  portfolioVol: number;
  ewVol: number;
  overlapWeeks: number;
  droppedTickers: string[];
  error?: string;
}

function toPriceSeries(h: PriceHistory): PriceSeries {
  return { dates: h.dates, closes: h.closes };
}

function emptyResult(overlapWeeks: number, droppedTickers: string[], error: string): PortfolioAnalysis {
  return { tickers: [], portfolioVol: 0, ewVol: 0, overlapWeeks, droppedTickers, error };
}

/**
 * Fetches live weekly price history for each ticker, solves the Markowitz global
 * minimum-variance portfolio, and computes each ticker's beta against its home-market
 * benchmark (see lib/portfolio.ts). A ticker whose price history can't be fetched is
 * dropped (not zero-filled) — same "skip rather than fake it" approach as
 * lib/momentum-service.ts.
 */
export async function getPortfolioAnalysis(tickers: string[]): Promise<PortfolioAnalysis> {
  const normalized = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))].slice(
    0,
    MAX_PORTFOLIO_TICKERS,
  );

  const fetched = await Promise.allSettled(normalized.map((t) => fetchPriceHistory(t)));
  const seriesByTicker = new Map<string, PriceSeries>();
  const droppedTickers: string[] = [];
  fetched.forEach((result, i) => {
    if (result.status === "fulfilled") {
      seriesByTicker.set(normalized[i], toPriceSeries(result.value));
    } else {
      droppedTickers.push(normalized[i]);
    }
  });

  const okTickers = normalized.filter((t) => seriesByTicker.has(t));
  if (okTickers.length === 0) {
    return emptyResult(0, droppedTickers, "Could not fetch price history for any of the requested tickers.");
  }

  const seriesList = okTickers.map((t) => seriesByTicker.get(t)!);
  const { returns, n } = alignByDate(seriesList);
  const cov = buildCovariance(returns);
  if (!cov) {
    return emptyResult(
      n,
      droppedTickers,
      `Not enough overlapping trading weeks (${n}) across this ticker set to compute a reliable covariance matrix — try removing a very recently listed ticker.`,
    );
  }

  const weights = minVarianceWeights(cov);
  const pVol = portfolioVolatility(cov, weights);
  const ewWeights = new Array(okTickers.length).fill(1 / okTickers.length);
  const ewVol = portfolioVolatility(cov, ewWeights);

  // Beta is a pairwise regression against each ticker's own home-market benchmark, so it
  // aligns per-ticker against that benchmark rather than reusing the whole portfolio's
  // joint overlap above.
  const neededBenchmarks = [...new Set(okTickers.map(benchmarkFor))];
  const benchmarkFetches = await Promise.allSettled(neededBenchmarks.map((b) => fetchPriceHistory(b)));
  const benchmarkSeries = new Map<string, PriceSeries>();
  benchmarkFetches.forEach((result, i) => {
    if (result.status === "fulfilled") benchmarkSeries.set(neededBenchmarks[i], toPriceSeries(result.value));
  });

  const betas = okTickers.map((t) => {
    const benchmark = benchmarkSeries.get(benchmarkFor(t));
    if (!benchmark) return 1;
    const aligned = alignByDate([seriesByTicker.get(t)!, benchmark]);
    if (aligned.n < MIN_OVERLAP_WEEKS) return 1;
    return computeBeta(aligned.returns[0], aligned.returns[1]);
  });

  const results: PortfolioTickerResult[] = okTickers.map((t, i) => ({
    ticker: t,
    weight: weights[i],
    ewWeight: ewWeights[i],
    beta: betas[i],
    individualVol: Math.sqrt(Math.max(cov[i][i], 0)),
  }));

  return { tickers: results, portfolioVol: pVol, ewVol, overlapWeeks: n, droppedTickers };
}
