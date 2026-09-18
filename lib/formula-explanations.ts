import type { ValuationReport } from "./screener";

export interface FormulaExplanation {
  label: string;
  explanation: string;
  /** True for the metrics that don't apply to banks (see isBankIndustry in screener.ts) —
   * a null value for these on a bank row means "not meaningful," not "missing data." */
  bankInapplicable?: boolean;
}

/** Keyed by the same field names used on ValuationReport. */
export const FORMULA_EXPLANATIONS: Record<
  Exclude<
    keyof ValuationReport,
    "ticker" | "price" | "sector" | "industry" | "isBank" | "dcfValue" | "grahamValue" | "compositeScore"
  >,
  FormulaExplanation
> = {
  dcfMarginOfSafety: {
    label: "DCF Margin of Safety",
    explanation:
      "Discounted Cash Flow: projects the company's free cash flow forward, discounts it back to today's dollars, and compares that estimated fair value to the current price. A positive margin of safety means the model thinks the stock is undervalued (fair value above price); negative means it looks overvalued.",
    bankInapplicable: true,
  },
  grahamMarginOfSafety: {
    label: "Graham Margin of Safety",
    explanation:
      "Benjamin Graham's conservative fair-value estimate: the square root of 22.5 × EPS × Book Value per Share. Compares that to the current price the same way as DCF — positive means the stock looks cheap by this conservative measure.",
  },
  peg: {
    label: "PEG Ratio",
    explanation:
      "P/E divided by expected EPS growth (as a percentage). Lower is more attractive — it means you're paying less for each unit of expected growth. A PEG below 1 is the classic \"cheap relative to growth\" signal.",
    bankInapplicable: true,
  },
  evEbitda: {
    label: "EV/EBITDA",
    explanation:
      "Enterprise Value divided by EBITDA (earnings before interest, tax, depreciation and amortization) — a capital-structure-neutral multiple, useful for comparing companies with different debt levels. Lower is cheaper.",
    bankInapplicable: true,
  },
  fcfYieldPct: {
    label: "FCF Yield",
    explanation:
      "Free cash flow as a percentage of market cap. Higher means the company generates more cash relative to its price — a direct \"cash return\" measure.",
    bankInapplicable: true,
  },
  pbRoeScore: {
    label: "P/B vs ROE",
    explanation:
      "Return on Equity divided by Price-to-Book. Book value only matters if the company actually earns a decent return on it, so this rewards companies that are both cheap relative to book value AND profitable on that book value. Higher is better.",
  },
  peRatio: {
    label: "P/E Ratio",
    explanation:
      "Price divided by trailing earnings per share — the classic \"how many years of current earnings am I paying for\" measure. Lower generally means cheaper, though it doesn't account for growth (see PEG) or debt (see EV/EBITDA).",
  },
  priceToBook: {
    label: "P/B Ratio",
    explanation:
      "Price divided by book value (net assets) per share. Lower means you're paying less relative to the company's accounting net worth — often used for banks and financials, where book value is a more stable anchor than earnings.",
  },
  roePct: {
    label: "Return on Equity",
    explanation:
      "Net income as a percentage of shareholders' equity — how efficiently the company turns its own capital into profit. Higher is better, but very high ROE can also come from heavy debt (little equity to divide by), so it's worth reading alongside P/B or debt levels.",
  },
  dividendYieldPct: {
    label: "Dividend Yield",
    explanation:
      "Annual dividends paid per share, as a percentage of the current price. Higher means more cash income relative to what you'd pay today — though an unusually high yield can also signal the market expects the dividend to be cut.",
  },
  netInterestMarginPct: {
    label: "Net Interest Margin (NIM)",
    explanation:
      "Bank-specific: net interest income (interest earned minus interest paid) as a percentage of total assets — roughly, how much a bank earns on the spread between what it pays depositors and what it charges borrowers. Higher generally means a more profitable lending business. This app estimates it from the latest annual figures, not the precise average-earning-assets figure banks report themselves.",
  },
};
