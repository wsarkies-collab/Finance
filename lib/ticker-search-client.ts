import "server-only";

import { pythonFunctionBaseUrl } from "./fundamentals-client";

export interface TickerMatch {
  symbol: string;
  name: string;
  exchange: string;
}

/** Resolves an ambiguous ticker or company name (one that lists on multiple exchanges) into
 * the specific listings to choose from, via the Python function's live Yahoo search. Never
 * throws for "no matches" or a search failure — callers fall back to letting the user type an
 * exact symbol directly, so a flaky search shouldn't block screening. */
export async function searchTickers(query: string): Promise<TickerMatch[]> {
  const url = `${pythonFunctionBaseUrl()}/api/ticker_search?q=${encodeURIComponent(query)}`;
  const headers: Record<string, string> = {};
  if (process.env.FUNDAMENTALS_INTERNAL_TOKEN) {
    headers["x-internal-token"] = process.env.FUNDAMENTALS_INTERNAL_TOKEN;
  }

  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) {
      return [];
    }
    const body = (await res.json()) as { matches: TickerMatch[] };
    return body.matches ?? [];
  } catch {
    return [];
  }
}
