"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MIN_OVERLAP_WEEKS,
  alignReturnSeriesByDate,
  correlationFromCovariance,
  frontierWeights,
  maxSharpeWeights,
  minVarianceWeights,
  portfolioVolatility,
  weightedReturnSeries,
  correlation as returnCorrelation,
} from "@/lib/portfolio";
import type { PortfolioAnalysis } from "@/lib/portfolio-service";

interface TickerMatch {
  symbol: string;
  name: string;
  exchange: string;
}

type Mode = "minvar" | "maxsharpe" | "frontier";

interface FrontierPoint {
  t: number;
  vol: number;
  ret: number;
}

interface FrontierBounds {
  wGmv: number[];
  wMs: number[];
  rGmv: number;
  rMs: number;
  volGmv: number;
  volMs: number;
  sharpeGmv: number;
  sharpeMs: number;
}

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
function weightedSum(weights: number[], values: number[]): number {
  return weights.reduce((s, w, i) => s + w * values[i], 0);
}

const SECTOR_CONCENTRATION_THRESHOLD = 0.35;
// Browser-local only — no login/account involved. Just enough to survive switching tabs or
// reloading the page; not shared across devices or browsers.
const STORAGE_KEY = "portfolioCalc.tickers";

function loadSavedTickers(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function FrontierChart({
  bounds,
  curve,
  current,
  positionLabel,
}: {
  bounds: FrontierBounds;
  curve: FrontierPoint[];
  current: { vol: number; ret: number };
  positionLabel: string;
}) {
  const W = 560;
  const H = 280;
  const ML = 58;
  const MR = 18;
  const MT = 16;
  const MB = 38;
  const plotW = W - ML - MR;
  const plotH = H - MT - MB;
  const vols = curve.map((p) => p.vol);
  const rets = curve.map((p) => p.ret);
  let volMin = Math.min(...vols);
  let volMax = Math.max(...vols);
  let retMin = Math.min(...rets);
  let retMax = Math.max(...rets);
  const volPad = (volMax - volMin) * 0.15 || 0.01;
  const retPad = (retMax - retMin) * 0.18 || 0.005;
  volMin -= volPad;
  volMax += volPad;
  retMin -= retPad;
  retMax += retPad;
  const x = (v: number) => ML + ((v - volMin) / (volMax - volMin)) * plotW;
  const y = (r: number) => MT + (1 - (r - retMin) / (retMax - retMin)) * plotH;
  const pathD = curve.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.vol).toFixed(1)},${y(p.ret).toFixed(1)}`).join(" ");

  function Marker({
    vol,
    ret,
    color,
    label,
    r,
    dy,
  }: {
    vol: number;
    ret: number;
    color: string;
    label: string;
    r: number;
    dy: number;
  }) {
    const cx = x(vol);
    const cy = y(ret);
    return (
      <>
        <circle cx={cx} cy={cy} r={r} fill={color} stroke="var(--bg)" strokeWidth={1.5}>
          <title>{`${label}: ${fmtPct(vol)} volatility, ${fmtPct(ret)} expected return`}</title>
        </circle>
        <text x={cx} y={cy + dy} textAnchor="middle" fontSize={10.5} fill="var(--fg)">
          {label}
        </text>
      </>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", maxWidth: 560, display: "block" }}
      role="img"
      aria-label="Efficient frontier: annualized volatility versus expected return"
    >
      <line x1={ML} y1={MT + plotH} x2={ML + plotW} y2={MT + plotH} stroke="var(--border)" strokeWidth={1} />
      <line x1={ML} y1={MT} x2={ML} y2={MT + plotH} stroke="var(--border)" strokeWidth={1} />
      <text x={ML + 4} y={MT + 10} fontSize={10} fill="var(--muted)">
        {fmtPct(retMax)}
      </text>
      <text x={ML + 4} y={MT + plotH - 4} fontSize={10} fill="var(--muted)">
        {fmtPct(retMin)}
      </text>
      <text x={ML} y={H - 6} fontSize={10} fill="var(--muted)">
        {fmtPct(volMin)}
      </text>
      <text x={ML + plotW} y={H - 6} fontSize={10} textAnchor="end" fill="var(--muted)">
        {fmtPct(volMax)}
      </text>
      <text x={ML + plotW / 2} y={H - 6} textAnchor="middle" fontSize={10.5} fill="var(--muted)">
        Annualized volatility
      </text>
      <text
        x={12}
        y={MT + plotH / 2}
        textAnchor="middle"
        fontSize={10.5}
        fill="var(--muted)"
        transform={`rotate(-90 12 ${MT + plotH / 2})`}
      >
        Expected return
      </text>
      <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth={2} />
      <Marker vol={bounds.volGmv} ret={bounds.rGmv} color="var(--muted)" label="Min risk" r={5} dy={-10} />
      <Marker vol={bounds.volMs} ret={bounds.rMs} color="var(--muted)" label="Max Sharpe" r={5} dy={-10} />
      <Marker vol={current.vol} ret={current.ret} color="var(--positive)" label={positionLabel} r={6} dy={18} />
    </svg>
  );
}

export function PortfolioCalculatorForm() {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<TickerMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [chips, setChips] = useState<TickerMatch[]>([]);
  const [amount, setAmount] = useState("10000");
  const [rfPct, setRfPct] = useState("4");
  const [erpPct, setErpPct] = useState("5");
  const [mode, setMode] = useState<Mode>("minvar");
  const [frontierT, setFrontierT] = useState(0.5);
  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load once on mount (localStorage isn't available during server rendering).
  useEffect(() => {
    const saved = loadSavedTickers();
    if (saved.length > 0) {
      setChips(saved.map((symbol) => ({ symbol, name: symbol, exchange: "" })));
    }
  }, []);

  // Persist on every change so switching tabs (or reloading) doesn't lose the ticker list.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chips.map((c) => c.symbol)));
    } catch {
      // Best-effort only — a private-window/storage-blocked browser just won't remember it.
    }
  }, [chips]);

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

  const ok = analysis && !analysis.error;
  const cov = ok ? analysis!.covarianceMatrix : null;
  const mu = useMemo(() => (ok ? analysis!.tickers.map((t) => rf + t.beta * erp) : []), [ok, analysis, rf, erp]);

  // Both frontier endpoints, plus a sampled curve between them — only computed in frontier
  // mode. Every point (including both endpoints) is independently solved for its own target
  // return, not blended from the minimum-variance and maximum-Sharpe weight vectors.
  const frontierData = useMemo(() => {
    if (mode !== "frontier" || !cov || mu.length === 0) return null;
    const wGmv = minVarianceWeights(cov);
    const wMs = maxSharpeWeights(cov, mu, rf);
    const rGmv = weightedSum(wGmv, mu);
    const rMs = weightedSum(wMs, mu);
    const volGmv = portfolioVolatility(cov, wGmv);
    const volMs = portfolioVolatility(cov, wMs);
    const bounds: FrontierBounds = {
      wGmv,
      wMs,
      rGmv,
      rMs,
      volGmv,
      volMs,
      sharpeGmv: volGmv > 0 ? (rGmv - rf) / volGmv : 0,
      sharpeMs: volMs > 0 ? (rMs - rf) / volMs : 0,
    };
    const STEPS = 20;
    const curve: FrontierPoint[] = Array.from({ length: STEPS + 1 }, (_, i) => {
      const t = i / STEPS;
      const target = rGmv + t * (rMs - rGmv);
      const w = frontierWeights(cov, mu, target);
      return { t, vol: portfolioVolatility(cov, w), ret: weightedSum(w, mu) };
    });
    return { bounds, curve };
  }, [mode, cov, mu, rf]);

  const weights = useMemo(() => {
    if (!cov || mu.length === 0) return null;
    if (mode === "minvar") return minVarianceWeights(cov);
    if (mode === "maxsharpe") return maxSharpeWeights(cov, mu, rf);
    if (!frontierData) return null;
    const target = frontierData.bounds.rGmv + frontierT * (frontierData.bounds.rMs - frontierData.bounds.rGmv);
    return frontierWeights(cov, mu, target);
  }, [mode, cov, mu, rf, frontierT, frontierData]);

  const ewWeights = ok ? new Array(analysis!.tickers.length).fill(1 / analysis!.tickers.length) : [];

  const portVol = cov && weights ? portfolioVolatility(cov, weights) : 0;
  const ewVol = cov && ewWeights.length > 0 ? portfolioVolatility(cov, ewWeights) : 0;
  const portReturn = weights ? weightedSum(weights, mu) : 0;
  const ewReturn = ewWeights.length > 0 ? weightedSum(ewWeights, mu) : 0;
  const portBeta = weights && ok ? weightedSum(weights, analysis!.tickers.map((t) => t.beta)) : 0;
  const sharpe = portVol > 0 ? (portReturn - rf) / portVol : 0;
  const ewSharpe = ewVol > 0 ? (ewReturn - rf) / ewVol : 0;
  const riskReduction = ewVol > 0 ? (ewVol - portVol) / ewVol : 0;

  const rows = useMemo(() => {
    if (!ok || !cov || !weights) return [];
    return analysis!.tickers
      .map((t, i) => ({
        ticker: t.ticker,
        beta: t.beta,
        weight: weights[i],
        individualVol: Math.sqrt(Math.max(cov[i][i], 0)),
        amount: weights[i] * totalAmount,
        expectedReturn: mu[i],
      }))
      .sort((a, b) => b.weight - a.weight);
  }, [ok, analysis, cov, weights, mu, totalAmount]);

  const sortedSectorConcentration = useMemo(() => {
    if (!ok || !weights) return [];
    const map = new Map<string, number>();
    analysis!.tickers.forEach((t, i) => {
      const sector = t.sector ?? "Unknown";
      map.set(sector, (map.get(sector) ?? 0) + weights[i]);
    });
    return [...map.entries()].map(([sector, weight]) => ({ sector, weight })).sort((a, b) => b.weight - a.weight);
  }, [ok, analysis, weights]);

  // The correlation matrix depends only on historical covariance, not on the current mode's
  // weights — so it's identical across all three tabs, unlike sector concentration/diversification.
  const correlationMatrix = useMemo(() => (cov ? correlationFromCovariance(cov) : null), [cov]);

  const rankedDiversification = useMemo(() => {
    if (!ok || !weights) return [];
    const heldSectors = new Set(sortedSectorConcentration.filter((s) => s.weight > 0).map((s) => s.sector));
    const portfolioReturns = weightedReturnSeries(analysis!.alignedReturns, weights);
    return analysis!.sectorEtfReturns
      .map(({ sector, etf, dates, returns }) => {
        const aligned = alignReturnSeriesByDate(analysis!.dates, portfolioReturns, dates, returns);
        if (aligned.n < MIN_OVERLAP_WEEKS) return null;
        return { sector, etf, correlation: returnCorrelation(aligned.a, aligned.b), held: heldSectors.has(sector) };
      })
      .filter((r): r is { sector: string; etf: string; correlation: number; held: boolean } => r !== null)
      .sort((a, b) => a.correlation - b.correlation);
  }, [ok, analysis, weights, sortedSectorConcentration]);

  const bestDiversifier = rankedDiversification.find((r) => !r.held) ?? null;
  const maxDiversificationCorr = Math.max(1e-9, ...rankedDiversification.map((r) => r.correlation));

  function nameFor(ticker: string): string | null {
    const chip = chips.find((c) => c.symbol === ticker);
    return chip && chip.name !== chip.symbol ? chip.name : null;
  }

  const minvar = mode === "minvar";
  const maxsharpe = mode === "maxsharpe";
  const frontier = mode === "frontier";
  const volDiff = portVol - ewVol;
  const volDiffPct = ewVol > 0 ? volDiff / ewVol : 0;
  const VOL_EPS = 0.0005;

  return (
    <>
      <div className="mode-toggle" role="group" aria-label="Optimization objective">
        <button type="button" className={minvar ? "active" : undefined} onClick={() => setMode("minvar")}>
          Minimize risk
        </button>
        <button type="button" className={maxsharpe ? "active" : undefined} onClick={() => setMode("maxsharpe")}>
          Maximize Sharpe ratio
        </button>
        <button type="button" className={frontier ? "active" : undefined} onClick={() => setMode("frontier")}>
          Efficient frontier
        </button>
      </div>

      <p className="muted momentum-intro">
        {minvar
          ? "Solves the classic Markowitz global minimum-variance problem: find the long-only portfolio weights that minimize risk (volatility) for the tickers you pick — no return forecast involved. Built on real weekly price history, fetched live and aligned by actual trading date across markets."
          : maxsharpe
            ? "Solves for the long-only portfolio weights that maximize the Sharpe ratio — the best risk-adjusted return — using each ticker's CAPM-estimated expected return directly as an input to the optimization, not just historical volatility. Built on the same real weekly price history as the minimum-risk mode."
            : "Traces the mean-variance efficient frontier between the minimum-variance and maximum-Sharpe portfolios above. Every point the slider can reach is a genuine long-only optimal portfolio for its own expected-return level — solved fresh, not interpolated between the other two tabs' weights."}
      </p>

      {frontier ? (
        <div style={{ marginBottom: "1.25rem" }}>
          <label htmlFor="frontierSlider" style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
            Position on the efficient frontier: <strong>{Math.round(frontierT * 100)}%</strong>
          </label>
          <input
            id="frontierSlider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(frontierT * 100)}
            onChange={(e) => setFrontierT((parseFloat(e.target.value) || 0) / 100)}
            style={{ width: "100%" }}
            aria-label="Position on the efficient frontier, from minimum risk to maximum Sharpe ratio"
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.75rem",
              color: "var(--muted)",
              marginTop: "0.25rem",
            }}
          >
            <span>0% &middot; Min risk</span>
            <span>100% &middot; Max Sharpe</span>
          </div>
        </div>
      ) : null}

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

        <p className="ticker-search-hint">Your tickers are remembered in this browser, so switching tabs won&apos;t lose them.</p>

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

      {ok && weights ? (
        <>
          <h2 style={{ fontSize: "1.05rem" }}>
            {minvar
              ? "Minimum-variance allocation"
              : maxsharpe
                ? "Maximum Sharpe-ratio allocation"
                : `Efficient frontier allocation (${Math.round(frontierT * 100)}% from min-risk to max-Sharpe)`}
          </h2>

          <div className="stat-grid">
            {minvar ? (
              <>
                <div className="stat-tile">
                  <span className="stat-label">Portfolio volatility</span>
                  <span className="stat-value">{fmtPct(portVol)}</span>
                  <span className="stat-sub">annualized, at these weights</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-label">Equal-weight volatility</span>
                  <span className="stat-value">{fmtPct(ewVol)}</span>
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
                  <span className="stat-value">{analysis!.overlapWeeks} weeks</span>
                  <span className="stat-sub">shared trading weeks</span>
                </div>
              </>
            ) : maxsharpe ? (
              <>
                <div className="stat-tile highlight">
                  <span className="stat-label">Portfolio Sharpe ratio</span>
                  <span className="stat-value">{sharpe.toFixed(2)}</span>
                  <span className="stat-sub">what this mode directly targets</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-label">Equal-weight Sharpe</span>
                  <span className="stat-value">{ewSharpe.toFixed(2)}</span>
                  <span className="stat-sub">same tickers, 1/N each</span>
                </div>
                <div className="stat-tile highlight">
                  <span className="stat-label">Sharpe improvement</span>
                  <span className="stat-value">
                    +{fmtPct(Math.abs(ewSharpe !== 0 ? (sharpe - ewSharpe) / Math.abs(ewSharpe) : 0))}
                  </span>
                  <span className="stat-sub">vs. equal-weight</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-label">Data used</span>
                  <span className="stat-value">{analysis!.overlapWeeks} weeks</span>
                  <span className="stat-sub">shared trading weeks</span>
                </div>
              </>
            ) : (
              <>
                <div className="stat-tile">
                  <span className="stat-label">Portfolio volatility</span>
                  <span className="stat-value">{fmtPct(portVol)}</span>
                  <span className="stat-sub">at this frontier point</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-label">Portfolio return (CAPM)</span>
                  <span className="stat-value">{fmtPct(portReturn)}</span>
                  <span className="stat-sub">at this frontier point</span>
                </div>
                <div className="stat-tile highlight">
                  <span className="stat-label">Sharpe ratio</span>
                  <span className="stat-value">{sharpe.toFixed(2)}</span>
                  <span className="stat-sub">at this frontier point</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-label">Position on frontier</span>
                  <span className="stat-value">{Math.round(frontierT * 100)}%</span>
                  <span className="stat-sub">0% min-risk &middot; 100% max-Sharpe</span>
                </div>
              </>
            )}
          </div>
          {analysis!.droppedTickers.length > 0 ? (
            <p className="muted" style={{ marginBottom: "0.5rem" }}>
              No data for: {analysis!.droppedTickers.join(", ")}
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

          {frontier && frontierData ? (
            <div className="section" style={{ borderBottom: "none", marginBottom: 0 }}>
              <h2>Efficient frontier</h2>
              <p className="muted metric-explanation" style={{ marginBottom: "0.75rem" }}>
                Each point on this curve is a genuine long-only optimal portfolio — the lowest-risk combination of
                these tickers achievable for that expected-return level — not a simple blend of the minimum-variance
                and maximum-Sharpe weight vectors above. Drag the slider to move along it.
              </p>
              <FrontierChart
                bounds={frontierData.bounds}
                curve={frontierData.curve}
                current={{ vol: portVol, ret: portReturn }}
                positionLabel={`${Math.round(frontierT * 100)}%`}
              />
            </div>
          ) : null}

          <div className="section" style={{ borderBottom: "none", marginBottom: 0 }}>
            <h2>Portfolio diversification</h2>
            <p className="muted metric-explanation">
              The allocation above optimizes for a single objective, but &quot;optimal&quot; and
              &quot;well-diversified&quot; aren&apos;t automatically the same thing — a solver can end up
              concentrated in one industry, or holding several tickers that are really just the same bet in
              disguise, if that happens to minimize (or maximize) the numbers. These views show you which of those
              is actually happening for the tickers you picked, at the weights this mode produced.
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
            {sortedSectorConcentration.length > 0 &&
            sortedSectorConcentration.every((s) => s.weight < SECTOR_CONCENTRATION_THRESHOLD) ? (
              <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
                No sector exceeds the {fmtPct(SECTOR_CONCENTRATION_THRESHOLD)} guideline for this allocation.
              </p>
            ) : null}
            {sortedSectorConcentration.some((s) => s.weight >= SECTOR_CONCENTRATION_THRESHOLD) && !minvar ? (
              <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
                {maxsharpe
                  ? "Maximizing Sharpe ratio tends to concentrate into fewer high-conviction names — that's what's happening here, versus the more evenly spread minimum-variance allocation."
                  : "Moving further toward the max-Sharpe end of the frontier tends to concentrate into fewer high-conviction names — that's part of what's happening at this position."}
              </p>
            ) : null}

            <h3 style={{ fontSize: "0.92rem", margin: "1.25rem 0 0.5rem" }}>Correlation matrix</h3>
            <p className="muted metric-explanation" style={{ marginBottom: "0.5rem" }}>
              How closely each pair of tickers&apos; weekly returns moved together over the same{" "}
              {analysis!.overlapWeeks} weeks used to build the covariance matrix above, from &minus;1 (moved in
              exactly opposite directions) to +1 (moved in lockstep). The diagonal is always 1.00 &mdash; a ticker
              perfectly correlates with itself. Two tickers with a high positive correlation don&apos;t reduce risk
              much even if you hold both; negative or near-zero correlations are where the actual diversification
              benefit above is coming from. This is the same for every mode above — it depends only on historical
              price movement, not on the current weights.
            </p>
            {correlationMatrix ? (
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
                        {analysis!.tickers.map((t) => (
                          <th key={t.ticker}>{t.ticker}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {analysis!.tickers.map((ti, i) => (
                        <tr key={ti.ticker}>
                          <th style={{ textAlign: "left" }}>{ti.ticker}</th>
                          {analysis!.tickers.map((tj, j) => {
                            const v = correlationMatrix[i][j];
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
                                {isDiag ? "" : v.toFixed(2)}
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
              <b>your portfolio&apos;s own historical return stream</b> (at the weights this mode produced) &mdash;
              not against any single ticker. The pick below changes with the mode above, since the weights (and
              therefore the portfolio&apos;s own return history) are different for each objective. The sector with
              the lowest correlation has moved most independently of what you already hold, which is exactly what
              reduces risk when you add it. Sectors you already hold are shown for context, but adding more of a
              sector you&apos;re already in doesn&apos;t diversify you further even if its correlation happens to
              look low.
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
            <h2 style={{ fontSize: "1.05rem" }}>
              {minvar
                ? "Risk-adjusted return — Sharpe ratio"
                : maxsharpe
                  ? "Portfolio volatility — maximizing Sharpe vs. equal-weight"
                  : "Where this sits on the risk/return trade-off"}
            </h2>
            <p className="muted metric-explanation">
              {minvar
                ? "The Sharpe ratio measures how much extra return a portfolio earns for each unit of risk (volatility) it takes on, above what you'd get holding something essentially risk-free: (portfolio return − risk-free rate) ÷ portfolio volatility. A higher number means you're being compensated better for the risk you're carrying: as a rough rule of thumb, below 1 is considered weak, 1–2 is decent, and above 2 is very good — though what counts as \"good\" varies a lot by asset class and time period."
                : maxsharpe
                  ? "This mode optimizes directly for Sharpe ratio, not for the lowest possible volatility — so the resulting risk level isn't guaranteed to land higher or lower than simply spreading the same tickers evenly. Here's how the two actually compare, using the real numbers for this portfolio."
                  : "This point is a genuine efficient-frontier portfolio, solved to minimize risk for its exact expected-return level — not a blend of the minimum-variance and maximum-Sharpe weight vectors. Here's how it compares to both ends of the frontier."}
            </p>
            {minvar ? (
              <p className="muted metric-explanation">
                Expected return is estimated via the Capital Asset Pricing Model (CAPM) — the direct academic
                extension of Markowitz&apos;s own framework: E(R) = risk-free rate + beta × equity risk premium,
                where beta is each ticker&apos;s real trailing beta against its home index (S&amp;P 500 or ASX 200)
                and the equity risk premium is the extra return investors demand for holding stocks over a
                risk-free asset. Both inputs below are editable assumptions, not live data.
              </p>
            ) : null}
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
            <p className="muted metric-explanation" style={{ marginBottom: "0.75rem" }}>
              {minvar
                ? "Adjusting these updates the Sharpe ratio below instantly, without changing the allocation above — this mode never used expected return as an input to begin with."
                : maxsharpe
                  ? "Adjusting these re-solves the allocation above instantly too, since expected return is a direct input to what's being maximized in this mode — not just a number reported afterward."
                  : "Adjusting these re-solves both ends of the frontier — and every point along it, including this one — instantly, since expected return is a direct input here too."}
            </p>

            <div className="stat-grid">
              {minvar ? (
                <>
                  <div className="stat-tile">
                    <span className="stat-label">Portfolio return (CAPM)</span>
                    <span className="stat-value">{fmtPct(portReturn)}</span>
                    <span className="stat-sub">weighted at current weights</span>
                  </div>
                  <div className="stat-tile">
                    <span className="stat-label">Portfolio beta</span>
                    <span className="stat-value">{portBeta.toFixed(2)}</span>
                    <span className="stat-sub">weighted at current weights</span>
                  </div>
                  <div className="stat-tile">
                    <span className="stat-label">Sharpe ratio</span>
                    <span className="stat-value">{sharpe.toFixed(2)}</span>
                    <span className="stat-sub">this portfolio</span>
                  </div>
                  <div className="stat-tile">
                    <span className="stat-label">Equal-weight Sharpe</span>
                    <span className="stat-value">{ewSharpe.toFixed(2)}</span>
                    <span className="stat-sub">same tickers, 1/N each</span>
                  </div>
                </>
              ) : maxsharpe ? (
                <>
                  <div className="stat-tile">
                    <span className="stat-label">Portfolio volatility</span>
                    <span className="stat-value">{fmtPct(portVol)}</span>
                    <span className="stat-sub">annualized, at these weights</span>
                  </div>
                  <div className="stat-tile">
                    <span className="stat-label">Equal-weight volatility</span>
                    <span className="stat-value">{fmtPct(ewVol)}</span>
                    <span className="stat-sub">same tickers, 1/N each</span>
                  </div>
                  <div className="stat-tile highlight">
                    <span className="stat-label">Volatility vs. equal-weight</span>
                    <span className="stat-value">
                      {volDiff >= 0 ? "+" : "−"}
                      {fmtPct(Math.abs(volDiffPct))}
                    </span>
                    <span className="stat-sub">{volDiff >= 0 ? "higher" : "lower"} than equal-weight</span>
                  </div>
                  <div className="stat-tile">
                    <span className="stat-label">Portfolio beta</span>
                    <span className="stat-value">{portBeta.toFixed(2)}</span>
                    <span className="stat-sub">weighted at current weights</span>
                  </div>
                </>
              ) : frontierData ? (
                <>
                  <div className="stat-tile">
                    <span className="stat-label">Portfolio volatility</span>
                    <span className="stat-value">{fmtPct(portVol)}</span>
                    <span className="stat-sub">at this position</span>
                  </div>
                  <div className="stat-tile highlight">
                    <span className="stat-label">Sharpe ratio</span>
                    <span className="stat-value">{sharpe.toFixed(2)}</span>
                    <span className="stat-sub">at this position</span>
                  </div>
                  <div className="stat-tile">
                    <span className="stat-label">Volatility above min-risk</span>
                    <span className="stat-value">+{fmtPct(portVol - frontierData.bounds.volGmv)}</span>
                    <span className="stat-sub">vs. the 0% (min-risk) point</span>
                  </div>
                  <div className="stat-tile">
                    <span className="stat-label">Sharpe below max</span>
                    <span className="stat-value">−{(frontierData.bounds.sharpeMs - sharpe).toFixed(2)}</span>
                    <span className="stat-sub">vs. the 100% (max-Sharpe) point&apos;s {frontierData.bounds.sharpeMs.toFixed(2)}</span>
                  </div>
                </>
              ) : null}
            </div>

            {maxsharpe ? (
              <p className="muted metric-explanation" style={{ marginBottom: "0.75rem" }}>
                {Math.abs(volDiff) < VOL_EPS
                  ? `At these weights, maximizing Sharpe ratio lands on almost exactly the same volatility (${fmtPct(portVol)}) as simply spreading the same tickers evenly (${fmtPct(ewVol)}). The Sharpe improvement above is coming mainly from a higher expected return at a similar risk level, not from taking on more or less risk.`
                  : volDiff < 0
                    ? `Maximizing Sharpe ratio here also happens to produce lower volatility (${fmtPct(portVol)}) than the equal-weight portfolio (${fmtPct(ewVol)}) — about ${fmtPct(Math.abs(volDiffPct))} less. That's not something this mode targets directly (it optimizes for risk-adjusted return, not low risk on its own); it happens here because the highest-conviction names by expected return also turn out to be comparatively low-volatility or well-diversified across sectors.`
                    : `Maximizing Sharpe ratio here comes with higher volatility (${fmtPct(portVol)}) than the equal-weight portfolio (${fmtPct(ewVol)}) — about ${fmtPct(Math.abs(volDiffPct))} more. That's the trade-off this mode is willing to make: it concentrates weight into the names with the best expected return per unit of risk, even if that means moving away from the more evenly-spread, lower-volatility allocation.`}
              </p>
            ) : null}
            {frontier && frontierData ? (
              <p className="muted metric-explanation" style={{ marginBottom: "0.75rem" }}>
                {`At ${Math.round(frontierT * 100)}% along the frontier, this portfolio takes on ${fmtPct(portVol - frontierData.bounds.volGmv)} more volatility than the minimum possible for these tickers (${fmtPct(frontierData.bounds.volGmv)}), in exchange for a Sharpe ratio of ${sharpe.toFixed(2)} — versus ${frontierData.bounds.sharpeGmv.toFixed(2)} at the 0% (min-risk) end and ${frontierData.bounds.sharpeMs.toFixed(2)} at the 100% (max-Sharpe) end of the frontier.`}
              </p>
            ) : null}

            {minvar ? (
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
            ) : null}

            <p className="muted metric-explanation" style={{ marginTop: "0.75rem" }}>
              {minvar ? (
                <>
                  <strong>Important caveat:</strong> the weights above were chosen purely to minimize risk — the
                  optimizer never looked at expected return at all, CAPM or otherwise. This Sharpe ratio describes
                  the return/risk trade-off that resulted from minimizing risk, not something the optimizer
                  targeted. CAPM&apos;s own well-documented weakness is that beta (sensitivity to a single market
                  index) only explains part of real-world stock returns — it&apos;s a more principled estimate than
                  a raw trailing average, but still an estimate, not a forecast.
                </>
              ) : maxsharpe ? (
                <>
                  <strong>Important caveat:</strong> unlike minimum-variance, this optimizer explicitly uses the
                  CAPM expected-return estimates above as a direct input — so it inherits all of CAPM&apos;s own
                  uncertainty (beta only explains part of real-world returns). It also tends to concentrate weight
                  into fewer, higher-conviction names or sectors rather than spreading risk evenly, which you can
                  see by comparing this allocation to the more diversified minimum-variance one.
                </>
              ) : (
                <>
                  <strong>Important caveat:</strong> like maximum-Sharpe, this optimizer uses the CAPM
                  expected-return estimates as a direct input once you move away from the 0% (min-risk) end, so it
                  inherits the same CAPM uncertainty. There&apos;s no single &quot;correct&quot; position on this
                  frontier — it&apos;s a genuine risk/return trade-off, and where you land should reflect your own
                  risk tolerance, not a mathematical optimum.
                </>
              )}
            </p>
          </div>

          <div className="section" style={{ borderBottom: "none", marginBottom: 0, marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.05rem" }}>How this is calculated</h2>
            <p className="muted" style={{ fontSize: "0.85rem", maxWidth: "68ch" }}>
              {minvar
                ? 'This solves the classic Markowitz global minimum-variance problem: find portfolio weights that minimize portfolio variance, subject to weights summing to 100% and no short-selling (every weight ≥ 0). It does not use expected-return forecasts — this is deliberately the "minimize risk" corner of the efficient frontier, not the "best risk-adjusted return" corner.'
                : maxsharpe
                  ? 'This solves for the long-only portfolio weights that maximize the Sharpe ratio directly — (portfolio return − risk-free rate) ÷ portfolio volatility — using CAPM expected returns as the return input. This is the "best risk-adjusted return" corner of the efficient frontier (the tangency portfolio), not the "minimize risk at any cost" corner.'
                  : "This traces the efficient frontier itself: for the expected return implied by the slider (interpolated between the minimum-variance and maximum-Sharpe portfolios' own returns), it solves for the long-only weights that minimize variance at exactly that return level — via a primal-dual projected-gradient method, validated against a reference QP solver. Every point, including both endpoints, is independently solved; the slider never blends or interpolates the weight vectors themselves."}
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
                All three objectives are solved numerically via projected gradient descent/ascent onto the simplex
                (long-only, fully invested) — none has a closed-form solution once the no-short-selling constraint
                is added.
              </li>
              <li>
                Switching between modes, adjusting the risk-free rate or equity risk premium, and (in Efficient
                frontier mode) dragging the slider all re-solve instantly from the same already-fetched data — no
                new live fetch needed, since every mode is built from the same covariance matrix and CAPM expected
                returns.
              </li>
              <li>
                {minvar
                  ? "Beta is computed against each ticker's home-market benchmark (S&P 500 or ASX 200 by ticker suffix); it only feeds the Sharpe ratio reported below, not the weights themselves."
                  : maxsharpe
                    ? "Beta is computed the same way, and here it feeds directly into the weights: a higher assumed equity risk premium pushes more weight toward higher-beta names, since their CAPM expected return rises faster."
                    : "Beta is computed the same way, and it feeds into the weights the same way it does in maximum-Sharpe mode for every position past 0% — since expected return re-enters the optimization as soon as you target anything above the minimum-variance return."}
              </li>
              <li>
                The correlation matrix above is the same covariance matrix, normalized — no new data fetch needed.
                Sector concentration and the sector diversification pick recompute per mode, since they depend on
                that mode&apos;s own weights and (for diversification) its own realized return stream. The
                diversification pick correlates 11 real sector-fund proxies against that stream.
              </li>
              <li>Every calculation here is live — nothing is cached or pre-fetched, so it reflects current prices each time you calculate.</li>
            </ul>
          </div>
        </>
      ) : null}
    </>
  );
}
