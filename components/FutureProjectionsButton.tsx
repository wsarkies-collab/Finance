"use client";

import { useState } from "react";
import type { ValuationReport } from "@/lib/screener";
import { ProjectionChart } from "./ProjectionChart";

interface ProjectionsResponse {
  ticker: string;
  history: { dates: string[]; closes: number[] } | null;
  ddm: (number | null)[];
  targetPrice: (number | null)[];
  dcf: (number | null)[];
  analystTarget: { mean: number; low: number; high: number; count: number } | null;
  assumptions: { growthRate: number; discountRate: number; peRatio: number | null; years: number };
}

export function FutureProjectionsButton({ reports }: { reports: ValuationReport[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>(reports[0]?.ticker ?? "");
  const [data, setData] = useState<ProjectionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadProjections(ticker: string) {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/projections?ticker=${encodeURIComponent(ticker)}`);
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to load projections");
      }
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    if (selected) void loadProjections(selected);
  }

  function handleSelect(ticker: string) {
    setSelected(ticker);
    void loadProjections(ticker);
  }

  if (!open) {
    return (
      <button type="button" className="future-projections-btn" onClick={handleOpen}>
        Future Projections
      </button>
    );
  }

  return (
    <div className="projections-panel">
      <div className="projections-controls">
        <label htmlFor="company-picker">
          <strong>Which Company?</strong>
        </label>
        <select id="company-picker" value={selected} onChange={(e) => handleSelect(e.target.value)}>
          {reports.map((r) => (
            <option key={r.ticker} value={r.ticker}>
              {r.ticker}
            </option>
          ))}
        </select>
      </div>

      {loading ? <p className="muted">Loading projections…</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}

      {data ? (
        <>
          <ProjectionChart
            ticker={data.ticker}
            history={data.history}
            ddm={data.ddm}
            targetPrice={data.targetPrice}
            dcf={data.dcf}
            analystTarget={data.analystTarget}
            years={data.assumptions.years}
          />
          <p className="muted assumptions-note">
            <strong>Assumptions</strong> — growth rate {(data.assumptions.growthRate * 100).toFixed(1)}%
            (capped to a sane range — see below), discount rate {(data.assumptions.discountRate * 100).toFixed(0)}%,
            future P/E held at the current trailing P/E{" "}
            {data.assumptions.peRatio !== null ? `(${data.assumptions.peRatio.toFixed(1)}×)` : "(n/a)"}.
            {data.analystTarget
              ? ` Analyst Target is real data: mean $${data.analystTarget.mean.toFixed(2)} across ${data.analystTarget.count} analysts, plotted only at Year 1 since that's the actual forecast horizon given.`
              : ""}
          </p>
        </>
      ) : null}
    </div>
  );
}
