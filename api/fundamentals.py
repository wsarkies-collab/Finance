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


def fetch_fundamentals(ticker: str) -> Fundamentals:
    info = yf.Ticker(ticker).info

    total_debt = info.get("totalDebt")
    total_cash = info.get("totalCash")
    net_debt = None
    if total_debt is not None and total_cash is not None:
        net_debt = total_debt - total_cash

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
        free_cash_flow=info.get("freeCashflow"),
        roe=info.get("returnOnEquity"),
        price_to_book=info.get("priceToBook"),
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
