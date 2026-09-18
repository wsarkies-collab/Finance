export interface Fundamentals {
  ticker: string;
  price: number | null;
  marketCap: number | null;
  enterpriseValue: number | null;
  sharesOutstanding: number | null;
  netDebt: number | null;
  eps: number | null;
  bookValuePerShare: number | null;
  peRatio: number | null;
  epsGrowthPct: number | null;
  ebitda: number | null;
  freeCashFlow: number | null;
  roe: number | null;
  priceToBook: number | null;
}

/** Wire shape returned by api/fundamentals.py (snake_case, mirrors the Python dataclass). */
export interface FundamentalsWire {
  ticker: string;
  price: number | null;
  market_cap: number | null;
  enterprise_value: number | null;
  shares_outstanding: number | null;
  net_debt: number | null;
  eps: number | null;
  book_value_per_share: number | null;
  pe_ratio: number | null;
  eps_growth_pct: number | null;
  ebitda: number | null;
  free_cash_flow: number | null;
  roe: number | null;
  price_to_book: number | null;
}
