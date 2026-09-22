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

const SECTOR_CONCENTRATION_THRESHOLD = 0.35;

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
  const riskReduction = analysis && analysis.ewVol > 0 ? (analysis.ewVol - analysis.portfolioVol) / analysis.ewVol : 0;

  const sortedSectorConcentration = analysis
    ? [...analysis.sectorConcentration].sort((a, b) => b.weight - a.weight)
    : [];
  const rankedDiversification = analysis
    ? [...analysis.sectorDiversification].sort((a, b) => a.correlation - b.correlation)
    : [];
  const bestDiversifier = rankedDiversification.find((r) => !r.held) ?? null;
  const maxDiversificationCorr = Math.max(1e-9, ...rankedDiversification.map((r) => r.correlation));

  function nameFor(ticker: string): string | null {
    const chip = chips.find((c) => c.symbol === ticker);
    return chip && chip.name !== chip.symbol ? chip.name : null;
  }

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
          <h2 style={{ fontSize: "1.05rem" }}>Minimum-variance allocation</h2>

          <div className="stat-grid">
            <div className="stat-tile">
              <span className="stat-label">Portfolio volatility</span>
              <span className="stat-value">{fmtPct(analysis.portfolioVol)}</span>
              <span className="stat-sub">annualized, at these weights</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Equal-weight volatility</span>
              <span className="stat-value">{fmtPct(analysis.ewVol)}</span>
              <span className="stat-sub">same tickers, 1/N each</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Risk reduction</span>
              <span className="stat-value">
                {riskReduction >= 0 ? "-" : "+"}
                {fmtPct(Math.abs(riskReduction))}
              </span>
              <span className="stat-sub">vs. equal-weight</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Data used</span>
              <span className="stat-value">{analysis.overlapWeeks} weeks</span>
              <span className="stat-sub">shared trading weeks</span>
            </div>
          </div>
          {analysis.droppedTickers.length > 0 ? (
            <p className="muted" style={{ marginBottom: "0.5rem" }}>
              No data for: {analysis.droppedTickers.join(", ")}
            </p>
          ) : null}

          <div className="table-scroll">
            <table className="ranked">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Weight</th>
                  <th>Invest</th>
                  <th>Ann. volatility</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ticker}>
                    <td>
                      <strong>{r.ticker}</strong>
                      {nameFor(r.ticker) ? (
                        <div className="muted" style={{ fontSize: "0.78rem" }}>
                          {nameFor(r.ticker)}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div className="composite-cell">
                        <div className="composite-bar">
                          <span style={{ width: `${Math.round(r.weight * 100)}%` }} />
                        </div>
                        <span className="composite-val">{fmtPct(r.weight)}</span>
                      </div>
                    </td>
                    <td>${fmtMoney(r.amount)}</td>
                    <td>
                      <span className={`vol-badge${r.individualVol >= 0.4 ? " elevated" : ""}`}>
                        {fmtPct(r.individualVol)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="section" style={{ borderBottom: "none", marginBottom: 0 }}>
            <h2>Portfolio diversification</h2>
            <p className="muted metric-explanation">
              The allocation above minimizes variance, but &quot;low risk on paper&quot; and &quot;well-diversified&quot;
              aren&apos;t automatically the same thing — a solver can end up concentrated in one industry, or
              holding several tickers that are really just the same bet in disguise, if that happens to minimize the
              numbers. These views show you which of those is actually happening for the tickers you picked.
            </p>

            <h3 style={{ fontSize: "0.92rem", marginBottom: "0.5rem" }}>Sector concentration</h3>
            <p className="muted metric-explanation" style={{ marginBottom: "0.75rem" }}>
              Share of your total allocation sitting in each ticker&apos;s sector. A sector above{" "}
              <b>{fmtPct(SECTOR_CONCENTRATION_THRESHOLD)}</b> of the portfolio is flagged — not necessarily wrong,
              but worth knowing before you commit real money.
            </p>
            {sortedSectorConcentration.map((s) => (
              <div className="sector-bar-row" key={s.sector}>
                <span className="sector-bar-name">
                  {s.sector}
                  {s.weight >= SECTOR_CONCENTRATION_THRESHOLD ? (
                    <span style={{ color: "var(--warning)", fontSize: "0.75rem" }}> &#9888;</span>
                  ) : null}
                </span>
                <div className="sector-bar-track">
                  <div
                    className={`sector-bar-fill${s.weight >= SECTOR_CONCENTRATION_THRESHOLD ? " flagged" : ""}`}
                    style={{ width: `${Math.round(s.weight * 100)}%` }}
                  />
                </div>
                <span className="sector-bar-val">{fmtPct(s.weight)}</span>
              </div>
            ))}
            {sortedSectorConcentration.every((s) => s.weight < SECTOR_CONCENTRATION_THRESHOLD) ? (
              <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
                No sector exceeds the {fmtPct(SECTOR_CONCENTRATION_THRESHOLD)} guideline for this allocation.
              </p>
            ) : null}

            <h3 style={{ fontSize: "0.92rem", margin: "1.25rem 0 0.5rem" }}>Correlation matrix</h3>
            <p className="muted metric-explanation" style={{ marginBottom: "0.5rem" }}>
              How closely each pair of tickers&apos; weekly returns moved together over the same{" "}
              {analysis.overlapWeeks} weeks used to build the covariance matrix above, from &minus;1 (moved in
              exactly opposite directions) to +1 (moved in lockstep). The diagonal is always 1.00 &mdash; a ticker
              perfectly correlates with itself. Two tickers with a high positive correlation don&apos;t reduce risk
              much even if you hold both; negative or near-zero correlations are where the actual diversification
              benefit above is coming from.
            </p>
            {analysis.correlationMatrix ? (
              <>
                <div className="corr-legend">
                  <span>
                    <span
                      className="swatch"
                      style={{ background: "color-mix(in srgb, var(--negative) 55%, transparent)" }}
                    />{" "}
                    highly correlated (less diversification benefit)
                  </span>
                  <span>
                    <span className="swatch" style={{ background: "transparent", border: "1px solid var(--border)" }} />{" "}
                    near zero
                  </span>
                  <span>
                    <span
                      className="swatch"
                      style={{ background: "color-mix(in srgb, var(--positive) 55%, transparent)" }}
                    />{" "}
                    negatively correlated (diversifying)
                  </span>
                </div>
                <div className="table-scroll">
                  <table className="corr">
                    <thead>
                      <tr>
                        <th></th>
                        {analysis.tickers.map((t) => (
                          <th key={t.ticker}>{t.ticker}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.tickers.map((ti, i) => (
                        <tr key={ti.ticker}>
                          <th style={{ textAlign: "left" }}>{ti.ticker}</th>
                          {analysis.tickers.map((tj, j) => {
                            const v = analysis.correlationMatrix![i][j];
                            const isDiag = i === j;
                            return (
                              <td
                                key={tj.ticker}
                                className={isDiag ? "diag" : undefined}
                                style={
                                  isDiag
                                    ? undefined
                                    : {
                                        background: `color-mix(in srgb, ${v >= 0 ? "var(--negative)" : "var(--positive)"} ${Math.round(Math.abs(v) * 65)}%, transparent)`,
                                      }
                                }
                              >
                                {v.toFixed(2)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            <h3 style={{ fontSize: "0.92rem", margin: "1.5rem 0 0.5rem" }}>
              Which sector would diversify this portfolio further?
            </h3>
            <p className="muted metric-explanation" style={{ marginBottom: "0.75rem" }}>
              For each of 11 sectors, this correlates a representative sector fund&apos;s weekly returns against{" "}
              <b>your portfolio&apos;s own historical return stream</b> (at the weights above) &mdash; not against
              any single ticker. The sector with the lowest correlation has moved most independently of what you
              already hold, which is exactly what reduces risk when you add it. Sectors you already hold are shown
              for context, but adding more of a sector you&apos;re already in doesn&apos;t diversify you further
              even if its correlation happens to look low.
            </p>
            {bestDiversifier ? (
              <div className="sector-pick">
                <span className="stat-label">Best sector to add for further diversification</span>
                <span className="stat-value">{bestDiversifier.sector}</span>
                <span className="stat-sub">
                  {bestDiversifier.correlation.toFixed(2)} correlation to your portfolio&apos;s own return history —
                  the lowest among sectors you don&apos;t already hold
                </span>
              </div>
            ) : null}
            {rankedDiversification.map((r) => (
              <div className={`sector-rank-row${r.held ? " held" : ""}`} key={r.sector}>
                <span className="sector-rank-name">
                  {r.sector}
                  {r.held ? <span className="sector-rank-tag">already held</span> : null}
                </span>
                <div className="sector-rank-track">
                  <div
                    className={`sector-rank-fill${r.held ? "" : " candidate"}`}
                    style={{ width: `${Math.round((r.correlation / maxDiversificationCorr) * 100)}%` }}
                  />
                </div>
                <span className="sector-rank-val">{r.correlation.toFixed(2)}</span>
              </div>
            ))}
            {rankedDiversification.length > 0 ? (
              <p className="muted metric-explanation" style={{ marginTop: "0.75rem" }}>
                Each sector is represented by a broad, liquid real-world proxy fund (e.g. Technology by XLK,
                Utilities by XLU) rather than every individual ticker in that sector — the standard, practical way
                to measure sector-level diversification without needing hundreds of extra price-history fetches.
                This is a statistical diversification signal, not investment advice on its own: a low-correlation
                sector can still be a bad investment on its own fundamentals, and correlation measured
                historically isn&apos;t guaranteed to hold going forward.
              </p>
            ) : null}
          </div>

          <div className="projections-panel">
            <h2 style={{ fontSize: "1.05rem" }}>Risk-adjusted return — Sharpe ratio</h2>
            <p className="muted metric-explanation">
              The Sharpe ratio measures how much extra return a portfolio earns for each unit of risk (volatility) it
              takes on, above what you&apos;d get holding something essentially risk-free: (portfolio return − risk-free
              rate) ÷ portfolio volatility. A higher number means you&apos;re being compensated better for the risk
              you&apos;re carrying: as a rough rule of thumb, below 1 is considered weak, 1–2 is decent, and above 2
              is very good — though what counts as &quot;good&quot; varies a lot by asset class and time period.
            </p>
            <p className="muted metric-explanation">
              Expected return is estimated via the Capital Asset Pricing Model (CAPM) — the direct academic
              extension of Markowitz&apos;s own framework: E(R) = risk-free rate + beta × equity risk premium, where
              beta is each ticker&apos;s real trailing beta against its home index (S&amp;P 500 or ASX 200) and the
              equity risk premium is the extra return investors demand for holding stocks over a risk-free asset.
              Both inputs below are editable assumptions, not live data.
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

            <div className="stat-grid">
              <div className="stat-tile">
                <span className="stat-label">Portfolio return (CAPM)</span>
                <span className="stat-value">{fmtPct(portfolioExpectedReturn)}</span>
                <span className="stat-sub">weighted at MV weights</span>
              </div>
              <div className="stat-tile">
                <span className="stat-label">Portfolio beta</span>
                <span className="stat-value">{portfolioBeta.toFixed(2)}</span>
                <span className="stat-sub">weighted at MV weights</span>
              </div>
              <div className="stat-tile">
                <span className="stat-label">Sharpe ratio</span>
                <span className="stat-value">{sharpe.toFixed(2)}</span>
                <span className="stat-sub">this portfolio, at MV weights</span>
              </div>
              <div className="stat-tile">
                <span className="stat-label">Equal-weight Sharpe</span>
                <span className="stat-value">{ewSharpe.toFixed(2)}</span>
                <span className="stat-sub">same tickers, 1/N each</span>
              </div>
            </div>

            <div className="table-scroll">
              <table className="ranked">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Beta</th>
                    <th>CAPM expected return</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.ticker}>
                      <td>
                        <strong>{r.ticker}</strong>
                        {nameFor(r.ticker) ? (
                          <div className="muted" style={{ fontSize: "0.78rem" }}>
                            {nameFor(r.ticker)}
                          </div>
                        ) : null}
                      </td>
                      <td>{r.beta.toFixed(2)}</td>
                      <td>{fmtPct(r.expectedReturn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="muted metric-explanation" style={{ marginTop: "0.75rem" }}>
              <strong>Important caveat:</strong> the weights above were chosen purely to minimize risk — the
              optimizer never looked at expected return at all, CAPM or otherwise. This Sharpe ratio describes the
              return/risk trade-off that resulted from minimizing risk, not something the optimizer targeted.
              CAPM&apos;s own well-documented weakness is that beta (sensitivity to a single market index) only
              explains part of real-world stock returns — it&apos;s a more principled estimate than a raw trailing
              average, but still an estimate, not a forecast.
            </p>
          </div>

          <div className="section" style={{ borderBottom: "none", marginBottom: 0, marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.05rem" }}>How this is calculated</h2>
            <p className="muted" style={{ fontSize: "0.85rem", maxWidth: "68ch" }}>
              This solves the classic Markowitz global minimum-variance problem: find portfolio weights that
              minimize portfolio variance, subject to weights summing to 100% and no short-selling (every weight ≥
              0). It does not use expected-return forecasts — this is deliberately the &quot;minimize risk&quot;
              corner of the efficient frontier, not the &quot;best risk-adjusted return&quot; corner.
            </p>
            <ul className="muted" style={{ fontSize: "0.85rem", maxWidth: "68ch" }}>
              <li>
                The covariance matrix is built from real weekly returns (fetched live for whichever tickers you
                pick, up to 5 years of history), annualized.
              </li>
              <li>
                Returns are aligned by actual shared calendar date, not just trailing position — otherwise a mixed
                US/ASX portfolio would silently compare the wrong weeks against each other, since those markets
                trade on different holiday calendars.
              </li>
              <li>
                Solved numerically via projected gradient descent onto the simplex (long-only, fully invested) —
                there&apos;s no closed-form solution once the no-short-selling constraint is added.
              </li>
              <li>
                Beta is computed the same way, against each ticker&apos;s home-market benchmark (S&amp;P 500 or ASX
                200 by ticker suffix).
              </li>
              <li>
                The correlation matrix above is the same covariance matrix, normalized — no new data fetch needed.
                Sector concentration comes from each ticker&apos;s live fundamentals lookup (the same one the
                valuation and momentum screens already use). The sector diversification pick correlates 11 real
                sector-fund proxies against your portfolio&apos;s own realized return stream.
              </li>
              <li>Every calculation here is live — nothing is cached or pre-fetched, so it reflects current prices each time you calculate.</li>
            </ul>
          </div>
        </>
      ) : null}
    </>
  );
}
