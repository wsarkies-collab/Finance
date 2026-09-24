/**
 * Pure aggregation logic — no I/O, no "server-only" import, so it can be unit-tested
 * directly and safely imported from Client Components (see components/TickerDetailModal.tsx,
 * which only needs the types/constants here, not the Supabase-backed query in
 * lib/industry-comparison-service.ts).
 */

import { median } from "./stats";
import { DISPLAY_METRICS, type DisplayMetric, type ValuationReport } from "./screener";

const COMPARABLE_METRICS = DISPLAY_METRICS;

/** Alias kept for this module's existing external callers (e.g. TickerDetailModal.tsx) —
 * DisplayMetric (lib/screener.ts) is the single source of truth for this metric set now. */
export type ComparableMetric = DisplayMetric;

export type PeerMedians = Record<ComparableMetric, number | null>;

export type ComparisonLevel = "industry" | "sector" | "none";

export interface ComparisonResult {
  level: ComparisonLevel;
  peerCount: number;
  medians: PeerMedians | null;
}

/** Median of each comparable metric across the given reports. */
export function aggregateMetrics(reports: ValuationReport[]): PeerMedians {
  const medians = {} as PeerMedians;
  for (const metric of COMPARABLE_METRICS) {
    medians[metric] = median(reports.map((r) => r[metric]));
  }
  return medians;
}
