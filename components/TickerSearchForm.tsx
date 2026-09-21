"use client";

import { useEffect, useRef, useState } from "react";
import type { ValuationReport } from "@/lib/screener";
import { FutureProjectionsButton } from "./FutureProjectionsButton";
import { RankedTable } from "./RankedTable";

interface TickerMatch {
  symbol: string;
  name: string;
  exchange: string;
}

const DEFAULT_TICKERS: TickerMatch[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ" },
  { symbol: "GOOG", name: "Alphabet Inc.", exchange: "NASDAQ" },
];

export function TickerSearchForm() {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<TickerMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [chips, setChips] = useState<TickerMatch[]>(DEFAULT_TICKERS);
  const [reports, setReports] = useState<ValuationReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live search-as-you-type against the real cross-exchange listings (via Yahoo search),
  // debounced so we're not firing a network request on every keystroke.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setMatches([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/ticker-search?q=${encodeURIComponent(trimmed)}`)
        .then((res) => res.json())
        .then((body) => setMatches(body.matches ?? []))
        .catch(() => setMatches([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function addChip(match: TickerMatch) {
    setChips((prev) => {
      if (prev.some((c) => c.symbol.toUpperCase() === match.symbol.toUpperCase())) return prev;
      return [...prev, match];
    });
    setQuery("");
    setMatches([]);
  }

  function removeChip(symbol: string) {
    setChips((prev) => prev.filter((c) => c.symbol !== symbol));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    // No listing picked from the dropdown — fall back to adding exactly what was typed, the
    // same way the old free-text input worked, so knowing the exact symbol still just works.
    addChip({ symbol: trimmed.toUpperCase(), name: trimmed.toUpperCase(), exchange: "" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (chips.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      const tickers = chips.map((c) => c.symbol);
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
      <form className="ticker-search-form" onSubmit={handleSubmit}>
        <div className="ticker-picker">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search a ticker or company name…"
            aria-label="Search for a ticker or company name"
            autoComplete="off"
          />
          {matches.length > 0 ? (
            <div className="ticker-dropdown" role="listbox">
              {matches.map((m) => (
                <button type="button" key={m.symbol} onClick={() => addChip(m)}>
                  <span>
                    <strong>{m.symbol}</strong> — {m.name}
                  </span>
                  <span className="exch">{m.exchange}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <p className="ticker-search-hint">
          {searching
            ? "Searching…"
            : "Pick a listing from the dropdown to choose its exchange, or type an exact symbol and press Enter."}
        </p>
        <div className="chip-list">
          {chips.map((c) => (
            <span className="chip" key={c.symbol}>
              <strong>{c.symbol}</strong>
              {c.exchange ? <span className="chip-exch">{c.exchange}</span> : null}
              <button type="button" onClick={() => removeChip(c.symbol)} aria-label={`Remove ${c.symbol}`}>
                ×
              </button>
            </span>
          ))}
        </div>
        <button type="submit" disabled={loading || chips.length === 0}>
          {loading ? "Screening…" : "Screen"}
        </button>
      </form>
      {error ? <p className="error-banner">{error}</p> : null}
      <RankedTable reports={reports} />
      {reports.length > 0 ? <FutureProjectionsButton reports={reports} /> : null}
    </>
  );
}
