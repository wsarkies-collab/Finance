"use client";

import { useState } from "react";
import type { SectorCount } from "@/lib/momentum-universe";
import { MomentumBrowseForm } from "./MomentumBrowseForm";
import { MomentumScreenForm } from "./MomentumScreenForm";

type Mode = "browse" | "search";

export function MomentumScreenTabs({ sectorCounts }: { sectorCounts: SectorCount[] }) {
  const [mode, setMode] = useState<Mode>("browse");

  return (
    <>
      <div className="mode-toggle" role="group" aria-label="Momentum screen mode">
        <button type="button" className={mode === "browse" ? "active" : ""} onClick={() => setMode("browse")}>
          Browse by industry
        </button>
        <button type="button" className={mode === "search" ? "active" : ""} onClick={() => setMode("search")}>
          Search tickers
        </button>
      </div>

      {mode === "browse" ? <MomentumBrowseForm sectorCounts={sectorCounts} /> : <MomentumScreenForm />}
    </>
  );
}
