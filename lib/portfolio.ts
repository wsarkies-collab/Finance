/**
 * Portfolio construction math — Markowitz global minimum-variance (GMV) optimization plus
 * CAPM beta. Pure functions only — no I/O (see lib/portfolio-service.ts for
 * fetching/orchestration). Ported from a validated mock-up (mockups/portfolio-calculator.html)
 * that ran the same solver against real historical data.
 *
 * api/price_history.py returns WEEKLY bars (5y history), not daily — the same deliberate
 * choice already made for lib/momentum.ts (avoids a second, heavier daily-bar endpoint).
 * Weekly returns over up to 5 years (~260 points) is a standard window for covariance/beta
 * estimation, so annualization here is x52, not the mock-up's x252.
 *
 * Each ticker's price history is fetched independently, so two tickers' `closes` arrays are
 * NOT guaranteed to line up by array position — US and ASX (and even two US tickers with
 * different listing/delisting dates) can have different sets of trading dates. Every multi-
 * series function here aligns by the actual date *string*, not position.
 */

export const PERIODS_PER_YEAR = 52;
// Below this many overlapping weeks, a covariance/beta estimate is too noisy to trust —
// mirrors the mock-up's 30-trading-day (~6 week) floor, scaled up for weekly data to about a
// year, since weekly sampling means far fewer data points per unit of calendar time.
export const MIN_OVERLAP_WEEKS = 52;

export interface PriceSeries {
  dates: string[]; // ISO "YYYY-MM-DD", chronological, same length as closes
  closes: number[];
}

/** Simple period-over-period returns; `returns[i]` is the return as of `dates[i]`. One
 * element shorter than `closes`/`dates`. */
export function returnsFromCloses(closes: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1]) returns.push(closes[i] / closes[i - 1] - 1);
  }
  return returns;
}

function returnsByDate(series: PriceSeries): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 1; i < series.closes.length; i++) {
    const prev = series.closes[i - 1];
    if (prev) map.set(series.dates[i], series.closes[i] / prev - 1);
  }
  return map;
}

/** Aligns N price series by actual shared calendar date (inner join) — not by trailing
 * array position, which silently mismatches once series don't share a trading calendar
 * (e.g. mixing US and ASX tickers, or tickers with different listing histories). Returns
 * one returns array per input series, all the same length and date-ordered. */
export function alignByDate(seriesList: PriceSeries[]): { returns: number[][]; n: number } {
  const perSeries = seriesList.map(returnsByDate);
  let commonDates = [...perSeries[0].keys()];
  for (let i = 1; i < perSeries.length; i++) {
    const dates = perSeries[i];
    commonDates = commonDates.filter((d) => dates.has(d));
  }
  commonDates.sort();
  const returns = perSeries.map((byDate) => commonDates.map((d) => byDate.get(d)!));
  return { returns, n: commonDates.length };
}

/** Annualized sample covariance matrix from already-aligned per-ticker return arrays (all
 * the same length). Returns null if there isn't enough overlap for a reliable estimate. */
export function buildCovariance(alignedReturns: number[][], periodsPerYear = PERIODS_PER_YEAR): number[][] | null {
  const n = alignedReturns.length;
  const len = alignedReturns[0]?.length ?? 0;
  if (len < MIN_OVERLAP_WEEKS) return null;

  const means = alignedReturns.map((r) => r.reduce((a, b) => a + b, 0) / len);
  const cov: number[][] = [];
  for (let i = 0; i < n; i++) {
    cov.push([]);
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < len; k++) {
        s += (alignedReturns[i][k] - means[i]) * (alignedReturns[j][k] - means[j]);
      }
      cov[i][j] = (s / (len - 1)) * periodsPerYear;
    }
  }
  return cov;
}

function matVec(m: number[][], v: number[]): number[] {
  return m.map((row) => row.reduce((a, x, i) => a + x * v[i], 0));
}

function dot(a: number[], b: number[]): number {
  return a.reduce((s, x, i) => s + x * b[i], 0);
}

/** Euclidean projection of `v` onto the probability simplex (weights sum to 1, all >= 0) —
 * no closed form for the long-only-constrained minimum-variance problem, so the solver below
 * projects back onto this set after every gradient step. */
export function projectToSimplex(v: number[]): number[] {
  const n = v.length;
  const u = [...v].sort((a, b) => b - a);
  let cumSum = 0;
  let rho = -1;
  let cumSumAtRho = 0;
  for (let i = 0; i < n; i++) {
    cumSum += u[i];
    const t = (cumSum - 1) / (i + 1);
    if (u[i] - t > 0) {
      rho = i;
      cumSumAtRho = cumSum;
    }
  }
  const theta = (cumSumAtRho - 1) / (rho + 1);
  return v.map((x) => Math.max(x - theta, 0));
}

/** Power iteration estimate of the covariance matrix's largest eigenvalue, used to size the
 * gradient step so it converges without a full eigendecomposition. */
function largestEigenApprox(cov: number[][], n: number): number {
  let v = new Array(n).fill(1 / Math.sqrt(n));
  for (let iter = 0; iter < 50; iter++) {
    const w = matVec(cov, v);
    const norm = Math.sqrt(w.reduce((s, x) => s + x * x, 0)) || 1;
    v = w.map((x) => x / norm);
  }
  return dot(v, matVec(cov, v));
}

/**
 * Solves the classic Markowitz global minimum-variance problem: minimize w'Σw subject to
 * weights summing to 1 and no short-selling (w >= 0). Deliberately return-forecast-free —
 * the "minimize risk" corner of the efficient frontier, not "best risk-adjusted return."
 * Solved via projected gradient descent since the long-only constraint removes the closed
 * form the unconstrained problem would otherwise have.
 */
export function minVarianceWeights(cov: number[][]): number[] {
  const n = cov.length;
  const lambdaMax = largestEigenApprox(cov, n) || 1;
  const learningRate = 1 / (2 * lambdaMax);
  let w = new Array(n).fill(1 / n);
  for (let iter = 0; iter < 3000; iter++) {
    const grad = matVec(cov, w).map((x) => 2 * x);
    let wNew = w.map((x, i) => x - learningRate * grad[i]);
    wNew = projectToSimplex(wNew);
    const diff = wNew.reduce((s, x, i) => s + Math.abs(x - w[i]), 0);
    w = wNew;
    if (diff < 1e-10) break;
  }
  return w;
}

export function portfolioVolatility(cov: number[][], weights: number[]): number {
  const variance = dot(weights, matVec(cov, weights));
  return Math.sqrt(Math.max(variance, 0));
}

/** Beta via the standard cov(stock, market) / var(market) regression on already-aligned,
 * same-length return arrays. */
export function computeBeta(stockReturns: number[], marketReturns: number[]): number {
  const n = stockReturns.length;
  const meanS = stockReturns.reduce((a, b) => a + b, 0) / n;
  const meanM = marketReturns.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varM = 0;
  for (let k = 0; k < n; k++) {
    cov += (stockReturns[k] - meanS) * (marketReturns[k] - meanM);
    varM += (marketReturns[k] - meanM) ** 2;
  }
  return varM > 0 ? cov / varM : 1;
}

/** Home-market benchmark for beta, by ticker suffix — Yahoo's convention for ASX listings
 * (".AX") vs. everything else, which defaults to the S&P 500. Not restricted to a fixed
 * two-index universe, unlike the mock-up: any ticker Yahoo's search resolves gets a sensible
 * benchmark. */
export function benchmarkFor(ticker: string): "^GSPC" | "^AXJO" {
  return ticker.toUpperCase().endsWith(".AX") ? "^AXJO" : "^GSPC";
}
