"use client";

import { useState } from "react";
import type { AnalystTarget } from "@/lib/projections";
import type { PriceHistory } from "@/lib/price-history-client";

export interface ProjectionChartProps {
  ticker: string;
  history: PriceHistory | null;
  ddm: (number | null)[];
  targetPrice: (number | null)[];
  dcf: (number | null)[];
  analystTarget: AnalystTarget | null;
  years: number;
}

interface Series {
  key: "history" | "ddm" | "targetPrice" | "dcf";
  label: string;
  values: (number | null)[];
  lineClass: string;
  dotClass: string;
  swatchClass: string;
}

function monthLabel(iso: string): string {
  const [y, m] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m) - 1]} ${y}`;
}

export function ProjectionChart({ ticker, history, ddm, targetPrice, dcf, analystTarget, years }: ProjectionChartProps) {
  const [visible, setVisible] = useState({ history: true, ddm: true, targetPrice: true, dcf: true, analyst: true });

  const historyDates = history?.dates ?? [];
  const historyCloses = history?.closes ?? [];
  const hasHistory = historyCloses.length > 0;

  // "Today" is the last historical close if we have one, otherwise there's no reference point
  // to anchor the projections to visually — they just start at index 0.
  const historyLabels = hasHistory
    ? historyDates.slice(0, -1).map(monthLabel).concat(["Today"])
    : ["Today"];
  const yearLabels = Array.from({ length: years }, (_, i) => `Year ${i + 1}`);
  const labels = [...historyLabels, ...yearLabels];
  const n = labels.length;
  const todayIdx = historyLabels.length - 1;

  function pad(projectionValues: (number | null)[]): (number | null)[] {
    // projectionValues[0] is "Today" (overlaps historyLabels' last slot), 1..years are Year 1..N
    return [...new Array(todayIdx).fill(null), ...projectionValues];
  }

  const series: Series[] = [
    {
      key: "history",
      label: "Historical price",
      values: hasHistory ? [...historyCloses.slice(0, -1), historyCloses[historyCloses.length - 1], ...new Array(years).fill(null)] : new Array(n).fill(null),
      lineClass: "proj-line-history",
      dotClass: "proj-dot-history",
      swatchClass: "swatch-history",
    },
    {
      key: "ddm",
      label: "DDM",
      values: pad(ddm),
      lineClass: "proj-line-ddm",
      dotClass: "proj-dot-ddm",
      swatchClass: "legend-ddm",
    },
    {
      key: "targetPrice",
      label: "Target Price (EPSn × Future P/E)",
      values: pad(targetPrice),
      lineClass: "proj-line-target",
      dotClass: "proj-dot-target",
      swatchClass: "swatch-target",
    },
    {
      key: "dcf",
      label: "DCF (5yr)",
      values: pad(dcf),
      lineClass: "proj-line-dcf",
      dotClass: "proj-dot-dcf",
      swatchClass: "swatch-dcf",
    },
  ];

  const allVals = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  if (analystTarget) {
    allVals.push(analystTarget.low, analystTarget.high);
  }
  if (allVals.length === 0) {
    return <p className="muted">Not enough data to project {ticker}.</p>;
  }
  let yMin = Math.min(...allVals);
  let yMax = Math.max(...allVals);
  const pad2 = (yMax - yMin) * 0.08 || 1;
  yMin -= pad2;
  yMax += pad2;

  const W = 920;
  const H = 420;
  const marginLeft = 60;
  const marginRight = 20;
  const marginTop = 20;
  const marginBottom = 70;
  const plotW = W - marginLeft - marginRight;
  const plotH = H - marginTop - marginBottom;

  const xAt = (i: number) => marginLeft + (i / (n - 1)) * plotW;
  const yAt = (v: number) => marginTop + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const tickCount = 5;
  const tickVals = Array.from({ length: tickCount }, (_, k) => yMin + ((yMax - yMin) * k) / (tickCount - 1));

  const todayX = xAt(todayIdx);

  const analystIdx = todayIdx + 1; // "Year 1"

  function toggle(key: keyof typeof visible) {
    setVisible((v) => ({ ...v, [key]: !v[key] }));
  }

  return (
    <div className="chart-wrap">
      <div className="chart-toggles">
        {series.map((s) => (
          <label key={s.key}>
            <input type="checkbox" checked={visible[s.key]} onChange={() => toggle(s.key)} />
            <i className={`swatch ${s.swatchClass}`} />
            {s.label}
          </label>
        ))}
        {analystTarget ? (
          <label>
            <input type="checkbox" checked={visible.analyst} onChange={() => toggle("analyst")} />
            <i className="dot-swatch swatch-analyst" />
            Analyst Target (12mo, {analystTarget.count} analysts)
          </label>
        ) : null}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="projection-chart" role="img" aria-label={`5-year price projection chart for ${ticker}`}>
        {tickVals.map((tv, i) => {
          const y = yAt(tv);
          return (
            <g key={i}>
              <line x1={marginLeft} y1={y} x2={W - marginRight} y2={y} className="chart-grid" />
              <text x={marginLeft - 10} y={y + 4} className="chart-axis-label" textAnchor="end">
                ${tv.toFixed(0)}
              </text>
            </g>
          );
        })}

        <line x1={todayX} y1={marginTop} x2={todayX} y2={H - marginBottom} className="chart-today-line" />

        {series.map(
          (s) =>
            visible[s.key] && (
              <polyline
                key={s.key}
                points={s.values.map((v, i) => (v !== null ? `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}` : null)).filter(Boolean).join(" ")}
                className={s.lineClass}
              />
            ),
        )}
        {series.map(
          (s) =>
            visible[s.key] &&
            s.values.map(
              (v, i) =>
                v !== null && (
                  <circle key={`${s.key}-${i}`} cx={xAt(i)} cy={yAt(v)} r={3.5} className={s.dotClass}>
                    <title>
                      {labels[i]}: ${v.toFixed(2)}
                    </title>
                  </circle>
                ),
            ),
        )}

        {analystTarget && visible.analyst ? (
          <g>
            <line x1={xAt(analystIdx)} y1={yAt(analystTarget.low)} x2={xAt(analystIdx)} y2={yAt(analystTarget.high)} className="range-whisker" />
            <line x1={xAt(analystIdx) - 6} y1={yAt(analystTarget.low)} x2={xAt(analystIdx) + 6} y2={yAt(analystTarget.low)} className="range-whisker" />
            <line x1={xAt(analystIdx) - 6} y1={yAt(analystTarget.high)} x2={xAt(analystIdx) + 6} y2={yAt(analystTarget.high)} className="range-whisker" />
            <circle cx={xAt(analystIdx)} cy={yAt(analystTarget.mean)} r={5} className="proj-dot-analyst">
              <title>
                Analyst Target: ${analystTarget.mean.toFixed(2)} (range ${analystTarget.low.toFixed(2)}-${analystTarget.high.toFixed(2)})
              </title>
            </circle>
          </g>
        ) : null}

        {labels.map((lab, i) => {
          if (!(i % 4 === 0 || i >= todayIdx)) return null;
          const x = xAt(i);
          const y = H - marginBottom + 18;
          return (
            <text key={i} x={x} y={y} className="chart-axis-label" textAnchor="end" transform={`rotate(-40 ${x} ${y})`}>
              {lab}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
