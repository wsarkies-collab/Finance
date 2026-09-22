"use client";

import { useState } from "react";
import type { SectorCount } from "@/lib/momentum-universe";
import { ScreenerBrowseForm } from "./ScreenerBrowseForm";
import { TickerSearchForm } from "./TickerSearchForm";

type Mode = "browse" | "search";

export function ScreenerTabs({ sectorCounts }: { sectorCounts: SectorCount[] }) {
  const [mode, setMode] = useState<Mode>("browse");

  return (
    <>
      <div className="mode-toggle" role="group" aria-label="Valuation screener mode">
        <button type="button" className={mode === "browse" ? "active" : ""} onClick={() => setMode("browse")}>
          Browse by industry
        </button>
        <button type="button" className={mode === "search" ? "active" : ""} onClick={() => setMode("search")}>
          Search tickers
        </button>
      </div>

      {mode === "browse" ? <ScreenerBrowseForm sectorCounts={sectorCounts} /> : <TickerSearchForm />}
    </>
  );
}
