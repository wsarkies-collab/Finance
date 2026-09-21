"use client";

import { useEffect, useRef, useState } from "react";
import type { PortfolioAnalysis } from "@/lib/portfolio-service";

interface TickerMatch {
  symbol: string;
  name: string;
  exchange: string;
}

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function PortfolioCalculatorForm() {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<TickerMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [chips, setChips] = useState<TickerMatch[]>([]);
  const [amount, setAmount] = useState("10000");
  const [rfPct, setRfPct] = useState("4");
  const [erpPct, setErpPct] = useState("5");
  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    addChip({ symbol: trimmed.toUpperCase(), name: trimmed.toUpperCase(), exchange: "" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (chips.length < 2) return;

    setLoading(true);
    setError(null);
    try {
      const tickers = chips.map((c) => c.symbol);
      const res = await fetch(`/api/portfolio?tickers=${encodeURIComponent(tickers.join(","))}`);
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to compute the portfolio");
      }
      setAnalysis(body as PortfolioAnalysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }

  const totalAmount = parseFloat(amount) || 0;
  const rf = (parseFloat(rfPct) || 0) / 100;
  const erp = (parseFloat(erpPct) || 0) / 100;

  const rows =
    analysis && !analysis.error
      ? [...analysis.tickers]
          .map((t) => ({ ...t, amount: t.weight * totalAmount, expectedReturn: rf + t.beta * erp }))
          .sort((a, b) => b.weight - a.weight)
      : [];

  const portfolioExpectedReturn = analysis
    ? analysis.tickers.reduce((s, t) => s + t.weight * (rf + t.beta * erp), 0)
    : 0;
  const ewExpectedReturn = analysis
    ? analysis.tickers.reduce((s, t) => s + t.ewWeight * (rf + t.beta * erp), 0)
    : 0;
  const portfolioBeta = analysis ? analysis.tickers.reduce((s, t) => s + t.weight * t.beta, 0) : 0;
  const sharpe = analysis && analysis.portfolioVol > 0 ? (portfolioExpectedReturn - rf) / analysis.portfolioVol : 0;
  const ewSharpe = analysis && analysis.ewVol > 0 ? (ewExpectedReturn - rf) / analysis.ewVol : 0;

  return (
    <>
      <p className="muted momentum-intro">
        Solves the classic Markowitz global minimum-variance problem: find the long-only portfolio weights that
        minimize risk (volatility) for the tickers you pick — no return forecast involved. Built on real weekly price
        history, fetched live and aligned by actual trading date across markets.
      </p>

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
          {searching ? "Searching…" : "Pick a listing from the dropdown, or type an exact symbol and press Enter."}
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

        <label className="ticker-search-hint" htmlFor="portfolioAmount" style={{ display: "block", marginBottom: "0.3rem" }}>
          Total investment amount ($)
        </label>
        <input
          id="portfolioAmount"
          type="number"
          min="0"
          step="100"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{
            padding: "0.6rem 0.8rem",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            background: "var(--bg)",
            color: "var(--fg)",
            fontSize: "1rem",
            marginBottom: "1rem",
            width: "100%",
          }}
        />

        <button type="submit" disabled={loading || chips.length < 2}>
          {loading ? "Calculating…" : "Calculate"}
        </button>
        {chips.length > 0 && chips.length < 2 ? (
          <p className="ticker-search-hint">Add at least 2 tickers to compute a portfolio.</p>
        ) : null}
      </form>

      {error ? <p className="error-banner">{error}</p> : null}

      {analysis?.error ? <p className="error-banner">{analysis.error}</p> : null}

      {analysis && !analysis.error ? (
        <>
          <p className="muted" style={{ marginBottom: "0.5rem" }}>
            {analysis.overlapWeeks} weeks of overlapping price history used
            {analysis.droppedTickers.length > 0 ? ` — no data for: ${analysis.droppedTickers.join(", ")}` : ""}
          </p>
          <div className="table-scroll">
            <table className="ranked">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Weight</th>
                  <th>Amount</th>
                  <th>Volatility</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ticker}>
                    <td>{r.ticker}</td>
                    <td>
                      <div className="composite-cell">
                        <div className="composite-bar">
                          <span style={{ width: `${Math.round(r.weight * 100)}%` }} />
                        </div>
                        <span className="composite-val">{fmtPct(r.weight)}</span>
                      </div>
                    </td>
                    <td>${fmtMoney(r.amount)}</td>
                    <td>{fmtPct(r.individualVol)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            Portfolio volatility {fmtPct(analysis.portfolioVol)} vs. equal-weight volatility {fmtPct(analysis.ewVol)}
          </p>

          <div className="projections-panel">
            <h2 style={{ fontSize: "1.05rem" }}>Risk-adjusted return — Sharpe ratio</h2>
            <p className="muted metric-explanation">
              The Sharpe ratio measures how much extra return a portfolio earns for each unit of risk it takes on,
              above a risk-free rate: (portfolio return − risk-free rate) ÷ portfolio volatility. Expected return per
              ticker is estimated via CAPM (E(R) = risk-free rate + beta × equity risk premium), using each ticker's
              real trailing beta against its home-market index. The weights above were chosen purely to minimize
              risk — the optimizer never looked at expected return, so this Sharpe ratio describes the trade-off
              that resulted, not something the optimizer targeted.
            </p>
            <div className="projections-controls">
              <label>
                Risk-free rate (%){" "}
                <input
                  type="number"
                  step="0.1"
                  value={rfPct}
                  onChange={(e) => setRfPct(e.target.value)}
                  style={{ width: "5rem" }}
                />
              </label>
              <label>
                Equity risk premium (%){" "}
                <input
                  type="number"
                  step="0.1"
                  value={erpPct}
                  onChange={(e) => setErpPct(e.target.value)}
                  style={{ width: "5rem" }}
                />
              </label>
            </div>
            <p className="muted">
              Portfolio expected return {fmtPct(portfolioExpectedReturn)}, beta {portfolioBeta.toFixed(2)}
            </p>
            <p>
              Sharpe ratio: <strong>{sharpe.toFixed(2)}</strong> (equal-weight: {ewSharpe.toFixed(2)})
            </p>
            <div className="table-scroll">
              <table className="ranked">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Beta</th>
                    <th>Expected return</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.ticker}>
                      <td>{r.ticker}</td>
                      <td>{r.beta.toFixed(2)}</td>
                      <td>{fmtPct(r.expectedReturn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
