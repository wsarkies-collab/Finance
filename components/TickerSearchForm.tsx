"use client";

import { useState } from "react";
import type { ValuationReport } from "@/lib/screener";
import { FutureProjectionsButton } from "./FutureProjectionsButton";
import { RankedTable } from "./RankedTable";

export function TickerSearchForm() {
  const [input, setInput] = useState("AAPL, MSFT, GOOG");
  const [reports, setReports] = useState<ValuationReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const tickers = input
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tickers.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/screen?tickers=${encodeURIComponent(tickers.join(","))}`);
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to screen tickers");
      }
      setReports(body.reports);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form className="search-form" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="AAPL, MSFT, GOOG"
          aria-label="Ticker symbols, comma separated"
        />
        <button type="submit" disabled={loading}>
          {loading ? "Screening…" : "Screen"}
        </button>
      </form>
      {error ? <p className="error-banner">{error}</p> : null}
      <RankedTable reports={reports} />
      {reports.length > 0 ? <FutureProjectionsButton reports={reports} /> : null}
    </>
  );
}
