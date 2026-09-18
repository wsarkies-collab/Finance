import type { ValuationReport } from "@/lib/screener";

function fmt(value: number | null): string {
  return value !== null ? value.toFixed(2) : "n/a";
}

function fmtPct(value: number | null): string {
  return value !== null ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function signClass(value: number | null): string {
  if (value === null) return "muted";
  return value >= 0 ? "positive" : "negative";
}

export interface RankedTableProps {
  reports: ValuationReport[];
  /** Optional per-row trailing cell, e.g. a remove-from-watchlist button. */
  renderRowExtra?: (report: ValuationReport) => React.ReactNode;
}

export function RankedTable({ reports, renderRowExtra }: RankedTableProps) {
  if (reports.length === 0) {
    return <p className="muted">No results yet — search a ticker above.</p>;
  }

  return (
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
          <th>Score</th>
          {renderRowExtra ? <th /> : null}
        </tr>
      </thead>
      <tbody>
        {reports.map((r) => {
          const unresolved = r.price === null && r.compositeScore === null;
          if (unresolved) {
            return (
              <tr key={r.ticker}>
                <td>{r.ticker}</td>
                <td colSpan={renderRowExtra ? 8 : 7} className="muted">
                  couldn&apos;t resolve this ticker
                </td>
                {renderRowExtra ? <td>{renderRowExtra(r)}</td> : null}
              </tr>
            );
          }
          return (
            <tr key={r.ticker}>
              <td>{r.ticker}</td>
              <td>{fmt(r.price)}</td>
              <td className={signClass(r.dcfMarginOfSafety)}>{fmtPct(r.dcfMarginOfSafety)}</td>
              <td className={signClass(r.grahamMarginOfSafety)}>{fmtPct(r.grahamMarginOfSafety)}</td>
              <td>{fmt(r.peg)}</td>
              <td>{fmt(r.evEbitda)}</td>
              <td>{fmt(r.fcfYieldPct)}</td>
              <td>{fmt(r.pbRoeScore)}</td>
              <td>{fmt(r.compositeScore)}</td>
              {renderRowExtra ? <td>{renderRowExtra(r)}</td> : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
