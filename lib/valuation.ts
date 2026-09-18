/** Core valuation formulas used by the screener. Ported 1:1 from src/stockval/valuation.py. */

/**
 * Discounted cash flow intrinsic value per share.
 *
 * Projects `freeCashFlow` forward at `growthRate` for `years`, discounts each year at
 * `discountRate`, adds a Gordon-growth terminal value, then subtracts net debt and
 * divides by shares outstanding.
 */
export function dcfValuePerShare(
  freeCashFlow: number | null,
  growthRate: number,
  sharesOutstanding: number | null,
  netDebt: number = 0.0,
  discountRate: number = 0.09,
  terminalGrowth: number = 0.025,
  years: number = 5,
): number | null {
  if (freeCashFlow === null || sharesOutstanding === null || sharesOutstanding === 0) {
    return null;
  }
  if (discountRate <= terminalGrowth) {
    return null;
  }

  let pvSum = 0.0;
  let fcf = freeCashFlow;
  for (let year = 1; year <= years; year++) {
    fcf *= 1 + growthRate;
    pvSum += fcf / Math.pow(1 + discountRate, year);
  }

  const terminalValue = (fcf * (1 + terminalGrowth)) / (discountRate - terminalGrowth);
  const pvTerminal = terminalValue / Math.pow(1 + discountRate, years);

  const enterpriseValue = pvSum + pvTerminal;
  const equityValue = enterpriseValue - netDebt;
  return equityValue / sharesOutstanding;
}

/** PE divided by expected EPS growth rate (as a percentage, e.g. 15 for 15%). */
export function pegRatio(peRatio: number | null, epsGrowthRatePct: number | null): number | null {
  if (peRatio === null || epsGrowthRatePct === null || epsGrowthRatePct === 0 || peRatio <= 0) {
    return null;
  }
  return peRatio / epsGrowthRatePct;
}

/** Enterprise value / EBITDA, capital-structure-neutral multiple. */
export function evToEbitda(enterpriseValue: number | null, ebitda: number | null): number | null {
  if (enterpriseValue === null || ebitda === null || ebitda === 0) {
    return null;
  }
  return enterpriseValue / ebitda;
}

/** Benjamin Graham's conservative fair-value estimate: sqrt(22.5 * EPS * BVPS). */
export function grahamNumber(eps: number | null, bookValuePerShare: number | null): number | null {
  if (eps === null || bookValuePerShare === null) {
    return null;
  }
  if (eps <= 0 || bookValuePerShare <= 0) {
    return null;
  }
  return Math.sqrt(22.5 * eps * bookValuePerShare);
}

export interface QualityValue {
  priceToBook: number | null;
  roe: number | null;
  /** ROE earned per unit of book value paid; higher means cheaper quality. */
  score: number | null;
}

export function priceToBookVsRoe(priceToBook: number | null, roe: number | null): QualityValue {
  const score =
    priceToBook === null || priceToBook === 0 || roe === null ? null : roe / priceToBook;
  return { priceToBook, roe, score };
}

/** Free cash flow as a fraction of market cap; higher is cheaper. */
export function fcfYield(freeCashFlow: number | null, marketCap: number | null): number | null {
  if (freeCashFlow === null || marketCap === null || marketCap === 0) {
    return null;
  }
  return freeCashFlow / marketCap;
}
