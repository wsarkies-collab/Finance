"""Fetches the fundamentals each valuation formula needs, via yfinance."""

from __future__ import annotations

from dataclasses import dataclass

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


def fetch_fundamentals(ticker: str) -> Fundamentals:
    t = yf.Ticker(ticker)
    info = t.info

    total_debt = info.get("totalDebt")
    total_cash = info.get("totalCash")
    net_debt = None
    if total_debt is not None and total_cash is not None:
        net_debt = total_debt - total_cash

    free_cash_flow = info.get("freeCashflow")

    eps_growth_pct = info.get("earningsGrowth")
    if eps_growth_pct is not None:
        eps_growth_pct *= 100

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
        free_cash_flow=free_cash_flow,
        roe=info.get("returnOnEquity"),
        price_to_book=info.get("priceToBook"),
    )
