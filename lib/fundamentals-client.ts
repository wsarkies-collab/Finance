import "server-only";

import type { Fundamentals, FundamentalsWire } from "./types";

function wireToFundamentals(wire: FundamentalsWire): Fundamentals {
  return {
    ticker: wire.ticker,
    price: wire.price,
    marketCap: wire.market_cap,
    enterpriseValue: wire.enterprise_value,
    sharesOutstanding: wire.shares_outstanding,
    netDebt: wire.net_debt,
    eps: wire.eps,
    bookValuePerShare: wire.book_value_per_share,
    peRatio: wire.pe_ratio,
    epsGrowthPct: wire.eps_growth_pct,
    ebitda: wire.ebitda,
    freeCashFlow: wire.free_cash_flow,
    roe: wire.roe,
    priceToBook: wire.price_to_book,
    sector: wire.sector,
    industry: wire.industry,
    dividendYield: wire.dividend_yield,
    netInterestMargin: wire.net_interest_margin,
    dividendRate: wire.dividend_rate,
    targetMeanPrice: wire.target_mean_price,
    targetLowPrice: wire.target_low_price,
    targetHighPrice: wire.target_high_price,
    numberOfAnalystOpinions: wire.number_of_analyst_opinions,
  };
}

/** Shared by any client calling one of the Python serverless functions (fundamentals, price
 * history, ...) — they all live behind the same base URL and internal-token gate. */
export function pythonFunctionBaseUrl(): string {
  if (process.env.PYTHON_FUNDAMENTALS_BASE_URL) {
    return process.env.PYTHON_FUNDAMENTALS_BASE_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

/** Fetches one ticker's raw fundamentals from the Python serverless function. Throws on failure. */
export async function fetchFundamentals(ticker: string): Promise<Fundamentals> {
  const url = `${pythonFunctionBaseUrl()}/api/fundamentals?ticker=${encodeURIComponent(ticker)}`;
  const headers: Record<string, string> = {};
  if (process.env.FUNDAMENTALS_INTERNAL_TOKEN) {
    headers["x-internal-token"] = process.env.FUNDAMENTALS_INTERNAL_TOKEN;
  }

  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`fundamentals fetch failed for ${ticker}: ${res.status} ${body}`);
  }

  const wire = (await res.json()) as FundamentalsWire;
  return wireToFundamentals(wire);
}
