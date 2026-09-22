import "server-only";

import { mapWithConcurrency } from "./concurrency";
import {
  MIN_OVERLAP_WEEKS,
  SECTOR_ETF,
  alignByDate,
  alignReturnMapWithSeries,
  benchmarkFor,
  buildCovariance,
  computeBeta,
  correlation,
  correlationFromCovariance,
  minVarianceWeights,
  portfolioVolatility,
  weightedReturnSeries,
  type PriceSeries,
} from "./portfolio";
import { fetchPriceHistory, type PriceHistory } from "./price-history-client";
import { getFundamentals } from "./screen-service";

const MAX_PORTFOLIO_TICKERS = 30;
// Fetching price history (and now fundamentals) for up to 30 tickers, plus benchmark and
// sector-ETF fetches, could otherwise fire dozens of concurrent live requests at once.
const DEFAULT_CONCURRENCY = 15;

export interface PortfolioTickerResult {
  ticker: string;
  sector: string | null;
  weight: number;
  ewWeight: number;
  beta: number;
  individualVol: number;
}

export interface SectorWeight {
  sector: string;
  weight: number;
}

export interface SectorDiversificationCandidate {
  sector: string;
  etf: string;
  correlation: number;
  held: boolean;
}

export interface PortfolioAnalysis {
  tickers: PortfolioTickerResult[];
  portfolioVol: number;
  ewVol: number;
  overlapWeeks: number;
  droppedTickers: string[];
  correlationMatrix: number[][] | null;
  sectorConcentration: SectorWeight[];
  sectorDiversification: SectorDiversificationCandidate[];
  error?: string;
}

function toPriceSeries(h: PriceHistory): PriceSeries {
  return { dates: h.dates, closes: h.closes };
}

function emptyResult(overlapWeeks: number, droppedTickers: string[], error: string): PortfolioAnalysis {
  return {
    tickers: [],
    portfolioVol: 0,
    ewVol: 0,
    overlapWeeks,
    droppedTickers,
    correlationMatrix: null,
    sectorConcentration: [],
    sectorDiversification: [],
    error,
  };
}

/**
 * Fetches live weekly price history (and fundamentals, for sector) for each ticker, solves
 * the Markowitz global minimum-variance portfolio, and computes correlation/concentration/
 * diversification views on top of the same covariance matrix and weights — see lib/portfolio.ts
 * for the pure math. A ticker whose price history can't be fetched is dropped (not
 * zero-filled) — same "skip rather than fake it" approach as lib/momentum-service.ts.
 */
export async function getPortfolioAnalysis(tickers: string[]): Promise<PortfolioAnalysis> {
  const normalized = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))].slice(
    0,
    MAX_PORTFOLIO_TICKERS,
  );

  const fetched = await mapWithConcurrency(normalized, DEFAULT_CONCURRENCY, async (t) => {
    const [history, fundamentals] = await Promise.all([fetchPriceHistory(t), getFundamentals(t)]);
    return { history: toPriceSeries(history), sector: fundamentals?.sector ?? null };
  });

  const seriesByTicker = new Map<string, PriceSeries>();
  const sectorByTicker = new Map<string, string | null>();
  const droppedTickers: string[] = [];
  fetched.forEach((result, i) => {
    if (result.status === "fulfilled") {
      seriesByTicker.set(normalized[i], result.value.history);
      sectorByTicker.set(normalized[i], result.value.sector);
    } else {
      droppedTickers.push(normalized[i]);
    }
  });

  const okTickers = normalized.filter((t) => seriesByTicker.has(t));
  if (okTickers.length === 0) {
    return emptyResult(0, droppedTickers, "Could not fetch price history for any of the requested tickers.");
  }

  const seriesList = okTickers.map((t) => seriesByTicker.get(t)!);
  const { returns, dates, n } = alignByDate(seriesList);
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
  const correlationMatrix = correlationFromCovariance(cov);

  const sectorWeightMap = new Map<string, number>();
  okTickers.forEach((t, i) => {
    const sector = sectorByTicker.get(t) ?? "Unknown";
    sectorWeightMap.set(sector, (sectorWeightMap.get(sector) ?? 0) + weights[i]);
  });
  const sectorConcentration: SectorWeight[] = [...sectorWeightMap.entries()].map(([sector, weight]) => ({
    sector,
    weight,
  }));
  const heldSectors = new Set(sectorConcentration.filter((s) => s.weight > 0).map((s) => s.sector));

  // Beta: a pairwise regression against each ticker's own home-market benchmark, so it aligns
  // per-ticker against that benchmark rather than reusing the whole portfolio's joint overlap.
  const neededBenchmarks = [...new Set(okTickers.map(benchmarkFor))];
  const benchmarkFetches = await mapWithConcurrency(neededBenchmarks, DEFAULT_CONCURRENCY, (b) =>
    fetchPriceHistory(b),
  );
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
    sector: sectorByTicker.get(t) ?? null,
    weight: weights[i],
    ewWeight: ewWeights[i],
    beta: betas[i],
    individualVol: Math.sqrt(Math.max(cov[i][i], 0)),
  }));

  // Which sector would most reduce risk if added: correlate each sector's representative
  // fund against the portfolio's own realized (GMV-weighted) return stream, not any single
  // holding — lowest correlation among sectors not already held is the best diversifier.
  const portfolioReturns = weightedReturnSeries(returns, weights);
  const portfolioReturnByDate = new Map(dates.map((d, i) => [d, portfolioReturns[i]]));
  const sectorEntries = Object.entries(SECTOR_ETF);
  const etfFetches = await mapWithConcurrency(sectorEntries, DEFAULT_CONCURRENCY, ([, etf]) => fetchPriceHistory(etf));

  const sectorDiversification: SectorDiversificationCandidate[] = [];
  etfFetches.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    const [sector, etf] = sectorEntries[i];
    const aligned = alignReturnMapWithSeries(portfolioReturnByDate, toPriceSeries(result.value));
    if (aligned.n < MIN_OVERLAP_WEEKS) return;
    sectorDiversification.push({
      sector,
      etf,
      correlation: correlation(aligned.a, aligned.b),
      held: heldSectors.has(sector),
    });
  });

  return {
    tickers: results,
    portfolioVol: pVol,
    ewVol,
    overlapWeeks: n,
    droppedTickers,
    correlationMatrix,
    sectorConcentration,
    sectorDiversification,
  };
}
