"""Vercel Python serverless function: GET /api/price-history?ticker=AAPL

Separate from api/fundamentals.py because it's a distinctly heavier yfinance
call (a full price history fetch), only needed when someone opens the Future
Projections view for one specific ticker — not on every search.
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import yfinance as yf


def fetch_price_history(ticker: str) -> dict:
    hist = yf.Ticker(ticker).history(period="5y", interval="1wk")
    hist = hist.dropna(subset=["Close"])
    return {
        "dates": [d.strftime("%Y-%m-%d") for d in hist.index],
        "closes": [float(c) for c in hist["Close"].tolist()],
    }


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
            data = fetch_price_history(ticker)
        except Exception as exc:  # yfinance/network failure
            self._json(502, {"error": f"failed to fetch price history for {ticker}", "detail": str(exc)})
            return

        if not data["dates"]:
            self._json(404, {"error": f"no price history for {ticker}"})
            return

        self._json(200, data)

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
