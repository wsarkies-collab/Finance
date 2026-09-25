"""Vercel Python serverless function: GET /api/fundamentals?ticker=AAPL

Deliberately a minimal, standalone duplicate of src/stockval/data.py's fetch logic
(not an import of that package) — see the plan for why. Returns raw fundamentals
only; no valuation math happens here, that all lives in the TypeScript app.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import yfinance as yf


@dataclass
class Fundamentals:
    ticker: str
    price: float | None
    market_cap: float | None
    enterprise_value: float | None
    shares_outstanding: float | None
    net_debt: float | None
    eps: float | None
    book_value_per_share: float | None
    pe_ratio: float | None
    eps_growth_pct: float | None
    ebitda: float | None
    free_cash_flow: float | None
    roe: float | None
    price_to_book: float | None
    sector: str | None
    industry: str | None
    dividend_yield: float | None
    # Only computed for tickers classified as banks (see _is_bank) — not a
    # meaningful concept outside banking, and requires extra statement fetches
    # we don't want to pay for on every ticker.
    net_interest_margin: float | None
    # Raw $ dividend (DDM needs this, not just the yield) and analyst consensus
    # price targets — both already sitting in the same info dict, no extra call.
    dividend_rate: float | None
    target_mean_price: float | None
    target_low_price: float | None
    target_high_price: float | None
    number_of_analyst_opinions: float | None


def _is_bank(sector: str | None, industry: str | None) -> bool:
    return sector == "Financial Services" and bool(industry) and "bank" in industry.lower()


def _latest_statement_value(frame, row_label: str) -> float | None:
    """Most recent (first) column's value for `row_label` in a yfinance statement
    DataFrame, or None if the row is missing or NaN (yfinance leaves plenty of gaps,
    especially for non-US listings)."""
    if frame is None or frame.empty or row_label not in frame.index:
        return None
    value = frame.loc[row_label, frame.columns[0]]
    if value is None or value != value:  # NaN check without importing math/pandas
        return None
    return float(value)


def _net_interest_margin(t: "yf.Ticker") -> float | None:
    """Approximation: latest annual Net Interest Income / latest annual Total
    Assets. Real bank disclosures divide by *average* earning assets over the
    period, which isn't available from these summary statements — this is a
    reasonable screener-level estimate, not a precise regulatory figure."""
    try:
        net_interest_income = _latest_statement_value(t.financials, "Net Interest Income")
        total_assets = _latest_statement_value(t.balance_sheet, "Total Assets")
    except Exception:
        return None
    if net_interest_income is None or not total_assets:
        return None
    return net_interest_income / total_assets


def _annual_eps_growth_pct(t: "yf.Ticker") -> float | None:
    """Year-over-year growth between the two most recently completed fiscal years'
    diluted EPS (falling back to basic EPS), as a percentage.

    Deliberately NOT yfinance's own `earningsGrowth`/`earningsQuarterlyGrowth` info
    fields — both are single-quarter year-over-year figures, which swing wildly for
    cyclical or recovering companies (real example: LYC.AX showed 5920% via
    `earningsGrowth` on a quarter where TTM earnings happened to compare against a
    near-zero prior-year quarter). A full fiscal year's EPS is a much steadier
    signal, though a company whose *prior fiscal year* EPS was itself near zero can
    still produce an extreme percentage here — that's a real, if unusual, feature of
    percentage growth off a small base, not a data-quality bug this function can fix.
    """
    try:
        income_stmt = t.income_stmt
    except Exception:
        return None
    if income_stmt is None or income_stmt.empty:
        return None
    for row_label in ("Diluted EPS", "Basic EPS"):
        if row_label not in income_stmt.index:
            continue
        values = [v for v in income_stmt.loc[row_label].tolist() if v == v]  # drop NaN
        if len(values) < 2:
            continue
        latest, prior = float(values[0]), float(values[1])
        if prior == 0:
            continue
        return (latest - prior) / abs(prior) * 100
    return None


def fetch_fundamentals(ticker: str) -> Fundamentals:
    t = yf.Ticker(ticker)
    info = t.info

    total_debt = info.get("totalDebt")
    total_cash = info.get("totalCash")
    net_debt = None
    if total_debt is not None and total_cash is not None:
        net_debt = total_debt - total_cash

    eps_growth_pct = _annual_eps_growth_pct(t)

    sector = info.get("sector")
    industry = info.get("industry")

    # info["dividendYield"] has shipped as both a fraction and a plain percentage
    # number across yfinance versions — trailingAnnualDividendYield has stayed a
    # fraction, so prefer it and fall back to deriving one from the dividend rate.
    dividend_yield = info.get("trailingAnnualDividendYield")
    if dividend_yield is None:
        dividend_rate = info.get("dividendRate")
        price = info.get("currentPrice") or info.get("regularMarketPrice")
        if dividend_rate is not None and price:
            dividend_yield = dividend_rate / price

    net_interest_margin = _net_interest_margin(t) if _is_bank(sector, industry) else None

    return Fundamentals(
        ticker=ticker,
        price=info.get("currentPrice") or info.get("regularMarketPrice"),
        market_cap=info.get("marketCap"),
        enterprise_value=info.get("enterpriseValue"),
        shares_outstanding=info.get("sharesOutstanding"),
        net_debt=net_debt,
        eps=info.get("trailingEps"),
        book_value_per_share=info.get("bookValue"),
        pe_ratio=info.get("trailingPE"),
        eps_growth_pct=eps_growth_pct,
        ebitda=info.get("ebitda"),
        free_cash_flow=info.get("freeCashflow"),
        roe=info.get("returnOnEquity"),
        price_to_book=info.get("priceToBook"),
        sector=sector,
        industry=industry,
        dividend_yield=dividend_yield,
        net_interest_margin=net_interest_margin,
        dividend_rate=info.get("dividendRate"),
        target_mean_price=info.get("targetMeanPrice"),
        target_low_price=info.get("targetLowPrice"),
        target_high_price=info.get("targetHighPrice"),
        number_of_analyst_opinions=info.get("numberOfAnalystOpinions"),
    )


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        expected_token = os.environ.get("FUNDAMENTALS_INTERNAL_TOKEN")
        if expected_token and self.headers.get("x-internal-token") != expected_token:
            self._json(403, {"error": "forbidden"})
            return

        query = parse_qs(urlparse(self.path).query)
        ticker = (query.get("ticker") or [None])[0]
        if not ticker:
            self._json(400, {"error": "missing ticker query param"})
            return
        ticker = ticker.strip().upper()

        try:
            data = fetch_fundamentals(ticker)
        except Exception as exc:  # yfinance/network failure
            self._json(502, {"error": f"failed to fetch fundamentals for {ticker}", "detail": str(exc)})
            return

        if data.price is None and data.market_cap is None:
            self._json(404, {"error": f"unknown or delisted ticker: {ticker}"})
            return

        self._json(200, asdict(data))

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
