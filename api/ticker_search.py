"""Vercel Python serverless function: GET /api/ticker_search?q=BHP

Lets the frontend resolve an ambiguous ticker or company name — one listed on
several exchanges (e.g. "BHP" trades as BHP on the NYSE, BHP.AX on the ASX,
and BHP.L on the LSE) — into the specific listings to choose from, instead of
guessing which exchange a bare symbol means. Backed by Yahoo's own search
endpoint via yfinance.Search, not a hand-maintained ticker list.
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import yfinance as yf


def search_tickers(query: str) -> list[dict]:
    quotes = yf.Search(query, max_results=15).quotes
    matches = []
    seen: set[str] = set()
    for q in quotes:
        # Restrict to equities — the same search also returns ETFs, indices, etc.
        # which aren't tickers this screener can value.
        if q.get("quoteType") != "EQUITY":
            continue
        symbol = q.get("symbol")
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        matches.append(
            {
                "symbol": symbol,
                "name": q.get("longname") or q.get("shortname") or symbol,
                "exchange": q.get("exchDisp") or q.get("exchange") or "",
            }
        )
    return matches


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        expected_token = os.environ.get("FUNDAMENTALS_INTERNAL_TOKEN")
        if expected_token and self.headers.get("x-internal-token") != expected_token:
            self._json(403, {"error": "forbidden"})
            return

        query = parse_qs(urlparse(self.path).query)
        q = (query.get("q") or [None])[0]
        if not q or not q.strip():
            self._json(400, {"error": "missing q query param"})
            return

        try:
            matches = search_tickers(q.strip())
        except Exception as exc:  # yfinance/network failure
            self._json(502, {"error": f"failed to search for {q}", "detail": str(exc)})
            return

        self._json(200, {"matches": matches})

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
