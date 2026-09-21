"use client";

import { useState } from "react";
import type { MomentumReport } from "@/lib/momentum";
import type { Market, SectorCount } from "@/lib/momentum-universe";
import { MomentumTable } from "./MomentumTable";

const MARKET_LABEL: Record<Market, string> = { all: "Both", SP500: "S&P 500", ASX: "ASX 200" };

function countFor(c: SectorCount, market: Market): number {
  if (market === "SP500") return c.sp500;
  if (market === "ASX") return c.asx;
  return c.sp500 + c.asx;
}

export function MomentumBrowseForm({ sectorCounts }: { sectorCounts: SectorCount[] }) {
  const [market, setMarket] = useState<Market>("all");
  const [sector, setSector] = useState<string | null>(null);
  const [reports, setReports] = useState<MomentumReport[]>([]);
  const [universeCount, setUniverseCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSector(nextMarket: Market, nextSector: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/momentum-screen?market=${encodeURIComponent(nextMarket)}&sector=${encodeURIComponent(nextSector)}`,
      );
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to screen this sector");
      }
      setReports(body.reports);
      setUniverseCount(body.universeCount ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleMarketChange(next: Market) {
    setMarket(next);
    if (sector) loadSector(next, sector);
  }

  function handleSectorClick(next: string) {
    setSector(next);
    loadSector(market, next);
  }

  return (
    <>
      <p className="muted momentum-intro">
        Pick a market and an industry to rank every real stock in that group — everything below is fetched live and
        scored with the exact same momentum/quality-value composite as the ticker search above.
      </p>

      <div className="market-toggle" role="group" aria-label="Market">
        {(Object.keys(MARKET_LABEL) as Market[]).map((m) => (
          <button key={m} type="button" className={m === market ? "active" : ""} onClick={() => handleMarketChange(m)}>
            {MARKET_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="sector-grid">
        {sectorCounts.map((c) => (
          <button
            key={c.sector}
            type="button"
            className={`sector-btn${c.sector === sector ? " active" : ""}`}
            onClick={() => handleSectorClick(c.sector)}
            disabled={countFor(c, market) === 0}
          >
            {c.sector} <span className="sector-count">{countFor(c, market)}</span>
          </button>
        ))}
      </div>

      {error ? <p className="error-banner">{error}</p> : null}

      {!sector ? (
        <p className="muted">Choose an industry above to see it ranked.</p>
      ) : loading ? (
        <p className="muted">
          Screening {universeCount ?? "…"} stocks live — larger sectors can take several seconds.
        </p>
      ) : (
        <>
          {universeCount !== null ? (
            <p className="muted" style={{ marginBottom: "0.5rem" }}>
              {sector} &middot; {MARKET_LABEL[market]} ({universeCount} considered)
            </p>
          ) : null}
          <MomentumTable reports={reports} />
        </>
      )}
    </>
  );
}
