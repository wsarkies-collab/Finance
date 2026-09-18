"use client";

import { useState, type ReactNode } from "react";
import type { ValuationReport } from "@/lib/screener";
import { fmt, fmtPct, signClass } from "@/lib/format";
import { TickerDetailModal } from "./TickerDetailModal";

/** DCF/PEG/EV-EBITDA/FCF-yield are structurally unreliable for banks (see lib/screener.ts) —
 * when one of those is missing on a bank row, mark it distinctly from an ordinary data gap. */
function GeneralMetricCell({
  value,
  isBank,
  format,
}: {
  value: number | null;
  isBank: boolean;
  format: (value: number | null) => string;
}) {
  if (value !== null) {
    return <td className={format === fmtPct ? signClass(value) : undefined}>{format(value)}</td>;
  }
  if (isBank) {
    return (
      <td className="muted bank-na" title="Not a meaningful metric for banks">
        n/a*
      </td>
    );
  }
  return <td className="muted">n/a</td>;
}

export interface RankedTableProps {
  reports: ValuationReport[];
  /** Optional per-row trailing cell, e.g. a remove-from-watchlist button. A plain
   * ticker -> pre-rendered-node map, NOT a render-prop function — this component is a
   * Client Component, and a Server Component parent (e.g. app/watchlist/page.tsx) cannot
   * pass a plain function across that boundary, only serializable data/JSX. */
  rowActionsByTicker?: Record<string, ReactNode>;
}

export function RankedTable({ reports, rowActionsByTicker }: RankedTableProps) {
  const [selected, setSelected] = useState<ValuationReport | null>(null);

  if (reports.length === 0) {
    return <p className="muted">No results yet — search a ticker above.</p>;
  }

  const hasBankRow = reports.some((r) => r.isBank);
  const generalColumnCount = 13; // every <th> after Ticker, excluding the optional trailing action column

  return (
    <div className="table-scroll">
      <table className="ranked">
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Price</th>
            <th>DCF MoS</th>
            <th>Graham MoS</th>
            <th>PEG</th>
            <th>EV/EBITDA</th>
            <th>FCF Yld%</th>
            <th>PB/ROE</th>
            <th>P/E</th>
            <th>P/B</th>
            <th>ROE%</th>
            <th>Div Yld%</th>
            <th>NIM%</th>
            <th>Score</th>
            {rowActionsByTicker ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => {
            const unresolved = r.price === null && r.compositeScore === null;
            if (unresolved) {
              return (
                <tr key={r.ticker}>
                  <td>{r.ticker}</td>
                  <td colSpan={generalColumnCount} className="muted">
                    couldn&apos;t resolve this ticker
                  </td>
                  {rowActionsByTicker ? <td>{rowActionsByTicker[r.ticker]}</td> : null}
                </tr>
              );
            }
            return (
              <tr key={r.ticker}>
                <td>
                  <button type="button" className="ticker-link" onClick={() => setSelected(r)}>
                    {r.ticker}
                  </button>
                  {r.isBank ? (
                    <span className="badge" title={r.industry ?? "Bank"}>
                      Bank
                    </span>
                  ) : null}
                </td>
                <td>{fmt(r.price)}</td>
                <GeneralMetricCell value={r.dcfMarginOfSafety} isBank={r.isBank} format={fmtPct} />
                <td className={signClass(r.grahamMarginOfSafety)}>{fmtPct(r.grahamMarginOfSafety)}</td>
                <GeneralMetricCell value={r.peg} isBank={r.isBank} format={fmt} />
                <GeneralMetricCell value={r.evEbitda} isBank={r.isBank} format={fmt} />
                <GeneralMetricCell value={r.fcfYieldPct} isBank={r.isBank} format={fmt} />
                <td>{fmt(r.pbRoeScore)}</td>
                <td>{fmt(r.peRatio)}</td>
                <td>{fmt(r.priceToBook)}</td>
                <td>{fmt(r.roePct)}</td>
                <td>{fmt(r.dividendYieldPct)}</td>
                <td>{fmt(r.netInterestMarginPct)}</td>
                <td>{fmt(r.compositeScore)}</td>
                {rowActionsByTicker ? <td>{rowActionsByTicker[r.ticker]}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {hasBankRow ? (
        <p className="muted bank-footnote">
          * Banks don&apos;t generate &quot;free cash flow&quot; the way industrial companies
          do (loan/deposit movements swamp the number), so DCF, PEG, EV/EBITDA, and FCF yield
          aren&apos;t shown. P/E, P/B, ROE, dividend yield, and net interest margin (NIM, an
          estimate — see note below) are used instead.
        </p>
      ) : null}
      {selected ? <TickerDetailModal report={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
