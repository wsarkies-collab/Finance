import "server-only";

import { pythonFunctionBaseUrl } from "./fundamentals-client";

export interface PriceHistory {
  dates: string[];
  closes: number[];
}

/** Fetches ~5 years of weekly closing prices from the Python serverless function. Throws on
 * failure. Kept separate from fetchFundamentals — a distinctly heavier call, only needed when
 * someone opens Future Projections for one specific ticker, not on every search. */
export async function fetchPriceHistory(ticker: string): Promise<PriceHistory> {
  const url = `${pythonFunctionBaseUrl()}/api/price_history?ticker=${encodeURIComponent(ticker)}`;
  const headers: Record<string, string> = {};
  if (process.env.FUNDAMENTALS_INTERNAL_TOKEN) {
    headers["x-internal-token"] = process.env.FUNDAMENTALS_INTERNAL_TOKEN;
  }

  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`price history fetch failed for ${ticker}: ${res.status} ${body}`);
  }

  return (await res.json()) as PriceHistory;
}
