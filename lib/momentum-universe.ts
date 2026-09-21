/**
 * Pure helpers over the static S&P 500 + ASX 200 membership list
 * (lib/data/momentum-universe.json, regenerated occasionally by
 * scripts/build-momentum-universe.py — see that script's docstring for why
 * sector comes from yfinance's own taxonomy, not GICS). No I/O here, so this
 * is safe to import from both server and client components.
 */

import universe from "./data/momentum-universe.json";

export type Market = "SP500" | "ASX" | "all";

export interface UniverseEntry {
  ticker: string;
  name: string;
  market: "SP500" | "ASX";
  sector: string;
}

export interface SectorCount {
  sector: string;
  sp500: number;
  asx: number;
}

const UNIVERSE = universe as UniverseEntry[];

/** Tickers in the given market belonging to the given sector. */
export function getUniverseTickers(market: Market, sector: string): string[] {
  return UNIVERSE.filter((r) => (market === "all" || r.market === market) && r.sector === sector).map(
    (r) => r.ticker,
  );
}

/** Every sector present in the universe, with per-market counts, sorted by combined size descending. */
export function getSectorCounts(): SectorCount[] {
  const counts = new Map<string, SectorCount>();
  for (const r of UNIVERSE) {
    const entry = counts.get(r.sector) ?? { sector: r.sector, sp500: 0, asx: 0 };
    if (r.market === "SP500") entry.sp500 += 1;
    else entry.asx += 1;
    counts.set(r.sector, entry);
  }
  return [...counts.values()].sort((a, b) => b.sp500 + b.asx - (a.sp500 + a.asx));
}

/** True if `sector` is one this universe actually contains — used to validate the API query param. */
export function isKnownSector(sector: string): boolean {
  return UNIVERSE.some((r) => r.sector === sector);
}
