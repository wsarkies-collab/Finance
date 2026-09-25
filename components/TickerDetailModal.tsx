"use client";

import { useEffect, useState } from "react";
import type { ValuationReport } from "@/lib/screener";
import { isLowerBetterMetric } from "@/lib/screener";
import { FORMULA_EXPLANATIONS } from "@/lib/formula-explanations";
import { fmt, fmtPct } from "@/lib/format";
import type { ComparableMetric, ComparisonResult } from "@/lib/industry-comparison";

const METRIC_ORDER: ComparableMetric[] = [
  "dcfMarginOfSafety",
  "grahamMarginOfSafety",
  "peg",
  "evEbitda",
  "fcfYieldPct",
  "pbRoeScore",
  "peRatio",
  "priceToBook",
  "roePct",
  "dividendYieldPct",
  "netInterestMarginPct",
];

const PCT_METRICS = new Set<ComparableMetric>(["dcfMarginOfSafety", "grahamMarginOfSafety"]);

function formatMetric(metric: ComparableMetric, value: number | null): string {
  return PCT_METRICS.has(metric) ? fmtPct(value) : fmt(value);
}

function directionIndicator(
  metric: ComparableMetric,
  value: number | null,
  peerValue: number | null,
): string | null {
  if (value === null || peerValue === null || value === peerValue) return null;
  const higherIsBetter = !isLowerBetterMetric(metric);
  const isBetter = higherIsBetter ? value > peerValue : value < peerValue;
  return isBetter ? "▲ better than peers" : "▼ worse than peers";
}

export function TickerDetailModal({
  report,
  onClose,
}: {
  report: ValuationReport;
  onClose: () => void;
}) {
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ ticker: report.ticker });
    if (report.industry) params.set("industry", report.industry);
    if (report.sector) params.set("sector", report.sector);

    fetch(`/api/industry-comparison?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load industry comparison");
        return res.json();
      })
      .then((data: ComparisonResult) => {
        if (!cancelled) setComparison(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [report.ticker, report.industry, report.sector]);

  const rows = METRIC_ORDER.map((metric) => {
    const value = report[metric];
    const info = FORMULA_EXPLANATIONS[metric];
    const show = value !== null || (info.bankInapplicable && report.isBank);
    if (!show) return null;

    const peerValue = comparison?.medians ? comparison.medians[metric] : null;
    const direction = directionIndicator(metric, value, peerValue);

    const detail = report.details[metric];
    const showBankNa = value === null && info.bankInapplicable && report.isBank;

    return (
      <div key={metric} className="metric-row">
        <div className="metric-row-header">
          <strong>{info.label}</strong>
          {showBankNa ? (
            <span className="muted bank-na" title="Not a meaningful metric for banks">
              n/a*
            </span>
          ) : (
            <span>{formatMetric(metric, value)}</span>
          )}
        </div>
        <p className="muted metric-explanation">{info.explanation}</p>
        {detail ? <p className="muted metric-detail">{detail}</p> : null}
        {value !== null ? (
          <p className="muted metric-peer">
            {loading
              ? "Loading industry comparison…"
              : error
                ? "Couldn't load industry comparison."
                : comparison?.level === "none"
                  ? "Not enough cached data yet to compare."
                  : comparison?.level === "sector"
                    ? `Sector median (${comparison.peerCount} peers in ${report.sector}, not enough industry-level data yet): ${formatMetric(metric, peerValue)}`
                    : `Industry median (${comparison?.peerCount} peers in ${report.industry}): ${formatMetric(metric, peerValue)}`}
            {direction ? <span className={direction.startsWith("▲") ? "positive" : "negative"}> {direction}</span> : null}
          </p>
        ) : null}
      </div>
    );
  }).filter(Boolean);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${report.ticker} details`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>
            {report.ticker}
            {report.isBank ? (
              <span className="badge" title={report.industry ?? "Bank"}>
                Bank
              </span>
            ) : null}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="muted">Price: {fmt(report.price)}</p>
        <div className="modal-body">{rows}</div>
      </div>
    </div>
  );
}
