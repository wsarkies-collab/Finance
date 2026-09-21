"use client";

import { useState } from "react";
import type { MomentumReport } from "@/lib/momentum";
import { ELEVATED_VOLATILITY_THRESHOLD } from "@/lib/momentum";
import { fmt, signClass } from "@/lib/format";
import { MomentumExplainerModal } from "./MomentumExplainerModal";

const SIGNAL_LABEL: Record<MomentumReport["signal"], string> = {
  new_entrant: "New entrant",
  held: "Held",
  dropped_out: "Dropped out",
};

function InfoButton({ ticker, onClick }: { ticker: string; onClick: () => void }) {
  return (
    <button type="button" className="info-btn" onClick={onClick} aria-label={`What do these figures mean for ${ticker}?`}>
      i
    </button>
  );
}

function fmtPctSigned(value: number | null): string {
  if (value === null) return "n/a";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

export function MomentumTable({ reports }: { reports: MomentumReport[] }) {
  const [selected, setSelected] = useState<MomentumReport | null>(null);

  if (reports.length === 0) {
    return <p className="muted">No results yet — search a ticker above.</p>;
  }

  const ranked = reports.filter((r) => r.inTopNow);
  const dropped = reports.filter((r) => !r.inTopNow);

  return (
    <div>
      <div className="table-scroll">
        <table className="ranked">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>12–1mo momentum</th>
              <th>52-wk high</th>
              <th>Quality/value</th>
              <th>Composite</th>
              <th>Volatility</th>
              <th>Signal</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => (
              <tr key={r.ticker}>
                <td>
                  <button type="button" className="ticker-link" onClick={() => setSelected(r)}>
                    {r.ticker}
                  </button>
                  <InfoButton ticker={r.ticker} onClick={() => setSelected(r)} />
                </td>
                <td className={signClass(r.momentum)}>{fmtPctSigned(r.momentum)}</td>
                <td>{r.proximity === null ? "n/a" : `${(r.proximity * 100).toFixed(1)}%`}</td>
                <td>
                  <div className="qv-cell">
                    <span className="qv-pct">{r.qualityValuePct === null ? "n/a" : Math.round(r.qualityValuePct * 100)}</span>
                    <span className="qv-raw">
                      ROE {r.roe === null ? "n/a" : `${(r.roe * 100).toFixed(1)}%`} · P/E{" "}
                      {r.peRatio === null ? "n/a" : r.peRatio.toFixed(1)}
                    </span>
                  </div>
                </td>
                <td>
                  <div className="composite-cell">
                    <div className="composite-bar">
                      <span style={{ width: `${Math.round((r.compositeScore ?? 0) * 100)}%` }} />
                    </div>
                    <span className="composite-val">{r.compositeScore === null ? "n/a" : Math.round(r.compositeScore * 100)}</span>
                  </div>
                </td>
                <td>
                  {r.volatility === null ? (
                    <span className="vol-badge">n/a</span>
                  ) : (
                    <span className={`vol-badge${r.volatility >= ELEVATED_VOLATILITY_THRESHOLD ? " elevated" : ""}`}>
                      {(r.volatility * 100).toFixed(0)}%
                    </span>
                  )}
                </td>
                <td>
                  <span className={`signal-pill ${r.signal}`}>{SIGNAL_LABEL[r.signal]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dropped.length > 0 ? (
        <div className="dropped-section">
          <h3>Dropped this rebalance</h3>
          {dropped.map((r) => (
            <div key={r.ticker} className="dropped-row">
              <span>
                <button type="button" className="ticker-link" onClick={() => setSelected(r)}>
                  {r.ticker}
                </button>
                <InfoButton ticker={r.ticker} onClick={() => setSelected(r)} />
              </span>
              <span className="muted">
                Composite {r.compositeScore === null ? "n/a" : Math.round(r.compositeScore * 100)} — fell out of the
                ranked list versus last rebalance.
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <p className="muted momentum-note">
        Rebalances roughly monthly. This is a screening aid for further research, not an automated buy/sell trigger — tap the{" "}
        <strong>i</strong> next to any ticker to see what each figure means.
      </p>

      {selected ? <MomentumExplainerModal report={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
