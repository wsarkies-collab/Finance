import "server-only";

import { scoreTicker, type ValuationReport } from "./screener";
import { rowToFundamentals, type FundamentalsCacheRow } from "./screen-service";
import { createAdminClient } from "./supabase/admin";
import { aggregateMetrics, type ComparisonResult } from "./industry-comparison";

const MIN_PEERS = 3;

async function peersFor(
  admin: ReturnType<typeof createAdminClient>,
  column: "industry" | "sector",
  value: string,
  excludeTicker: string,
): Promise<ValuationReport[]> {
  const { data } = await admin
    .from("fundamentals_cache")
    .select("*")
    .eq(column, value)
    .neq("ticker", excludeTicker);
  return ((data ?? []) as FundamentalsCacheRow[]).map((row) => scoreTicker(rowToFundamentals(row)));
}

/**
 * Compares a ticker against cached peers in the same industry, widening to sector if
 * there aren't enough industry-level peers yet, and giving up gracefully (level: "none")
 * if even that pool is too small — the cache only has whatever's been searched so far,
 * so this is often sparse until an exchange-wide sync exists.
 */
export async function getIndustryComparison(
  ticker: string,
  industry: string | null,
  sector: string | null,
): Promise<ComparisonResult> {
  const admin = createAdminClient();

  if (industry) {
    const industryPeers = await peersFor(admin, "industry", industry, ticker);
    if (industryPeers.length >= MIN_PEERS) {
      return { level: "industry", peerCount: industryPeers.length, medians: aggregateMetrics(industryPeers) };
    }
  }

  if (sector) {
    const sectorPeers = await peersFor(admin, "sector", sector, ticker);
    if (sectorPeers.length >= MIN_PEERS) {
      return { level: "sector", peerCount: sectorPeers.length, medians: aggregateMetrics(sectorPeers) };
    }
  }

  return { level: "none", peerCount: 0, medians: null };
}
