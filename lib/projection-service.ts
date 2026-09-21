import "server-only";

import { getFundamentals } from "./screen-service";
import { fetchPriceHistory, type PriceHistory } from "./price-history-client";
import {
  PROJECTION_DISCOUNT_RATE,
  PROJECTION_YEARS,
  analystTargetPoint,
  projectDCF,
  projectDDM,
  projectTargetPrice,
  projectionGrowthRate,
  type AnalystTarget,
} from "./projections";

export interface ProjectionResult {
  ticker: string;
  history: PriceHistory | null;
  ddm: (number | null)[];
  targetPrice: (number | null)[];
  dcf: (number | null)[];
  analystTarget: AnalystTarget | null;
  assumptions: {
    growthRate: number;
    discountRate: number;
    peRatio: number | null;
    years: number;
  };
}

/**
 * Gathers everything the Future Projections chart needs for one ticker: cached fundamentals
 * (reusing the same cache lib/screen-service.ts already maintains), fresh price history from
 * the Python function, and the three computed projections + the real analyst target point.
 * History is fetched fresh every time (not cached) — this is a lower-traffic, on-demand path,
 * not worth a time-series cache table for v1 (see the plan for why).
 */
export async function getProjections(ticker: string): Promise<ProjectionResult | null> {
  const normalized = ticker.trim().toUpperCase();
  const fundamentals = await getFundamentals(normalized);
  if (!fundamentals) {
    return null;
  }

  const growth = projectionGrowthRate(fundamentals.epsGrowthPct);

  let history: PriceHistory | null = null;
  try {
    history = await fetchPriceHistory(normalized);
  } catch {
    history = null; // chart still works without historical context, just starts at "Today"
  }

  return {
    ticker: normalized,
    history,
    ddm: projectDDM(fundamentals.dividendRate, growth, PROJECTION_DISCOUNT_RATE, PROJECTION_YEARS),
    targetPrice: projectTargetPrice(fundamentals.eps, fundamentals.peRatio, growth, PROJECTION_YEARS),
    dcf: projectDCF(fundamentals, growth, PROJECTION_YEARS),
    analystTarget: analystTargetPoint(fundamentals),
    assumptions: {
      growthRate: growth,
      discountRate: PROJECTION_DISCOUNT_RATE,
      peRatio: fundamentals.peRatio,
      years: PROJECTION_YEARS,
    },
  };
}
