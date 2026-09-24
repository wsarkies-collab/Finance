import "server-only";

import { mapWithConcurrency } from "./concurrency";
import {
  MIN_OVERLAP_WEEKS,
  SECTOR_ETF,
  alignByDate,
  benchmarkFor,
  buildCovariance,
  computeBeta,
  returnsByDate,
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
  beta: number;
}

export interface SectorEtfSeries {
  sector: string;
  etf: string;
  dates: string[];
  returns: number[];
}

/**
 * Everything needed to compute — client-side, for any of the three optimization modes
 * (minimum-variance, maximum-Sharpe, or a point on the efficient frontier between them) —
 * weights, volatility, Sharpe ratio, sector concentration, the correlation matrix, and the
 * sector-diversification pick, with no further live fetch. Deliberately raw rather than
 * pre-solved for one mode: the actual weights depend on the risk-free rate and equity risk
 * premium (via CAPM expected returns) once you're maximizing Sharpe or on the frontier, and
 * those are user-editable inputs, not fixed at fetch time.
 */
export interface PortfolioAnalysis {
  tickers: PortfolioTickerResult[];
  covarianceMatrix: number[][];
  /** Aligned return arrays, same order/index as `tickers`, same dates as `dates`. */
  alignedReturns: number[][];
  dates: string[];
  overlapWeeks: number;
  droppedTickers: string[];
  /** Real weekly returns for each of the 11 SPDR sector-fund proxies that could be fetched —
   * lets the client recompute the sector-diversification pick fresh for whichever mode's
   * weights (and therefore whichever portfolio return series) is currently active. */
  sectorEtfReturns: SectorEtfSeries[];
  error?: string;
}

function toPriceSeries(h: PriceHistory): PriceSeries {
  return { dates: h.dates, closes: h.closes };
}

function emptyResult(overlapWeeks: number, droppedTickers: string[], error: string): PortfolioAnalysis {
  return {
    tickers: [],
    covarianceMatrix: [],
    alignedReturns: [],
    dates: [],
    overlapWeeks,
    droppedTickers,
    sectorEtfReturns: [],
    error,
  };
}

/**
 * Fetches live weekly price history (and fundamentals, for sector) for each ticker plus the
 * 11 SPDR sector-fund proxies, and returns the raw covariance matrix, aligned returns, and
 * sector-ETF return series — see lib/portfolio.ts for the pure math this feeds into
 * (minVarianceWeights, maxSharpeWeights, frontierWeights, and everything derived from
 * whichever one is active). A ticker whose price history can't be fetched is dropped (not
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
    beta: betas[i],
  }));

  // Real weekly returns for each sector-fund proxy — the client joins these against whichever
  // mode's own weighted return series is currently active to recompute the diversification pick.
  const sectorEntries = Object.entries(SECTOR_ETF);
  const etfFetches = await mapWithConcurrency(sectorEntries, DEFAULT_CONCURRENCY, ([, etf]) => fetchPriceHistory(etf));
  const sectorEtfReturns: SectorEtfSeries[] = [];
  etfFetches.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    const [sector, etf] = sectorEntries[i];
    const byDate = returnsByDate(toPriceSeries(result.value));
    const etfDates = [...byDate.keys()].sort();
    if (etfDates.length < MIN_OVERLAP_WEEKS) return;
    sectorEtfReturns.push({ sector, etf, dates: etfDates, returns: etfDates.map((d) => byDate.get(d)!) });
  });

  return {
    tickers: results,
    covarianceMatrix: cov,
    alignedReturns: returns,
    dates,
    overlapWeeks: n,
    droppedTickers,
    sectorEtfReturns,
  };
}
