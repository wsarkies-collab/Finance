"""One-off generator for lib/data/momentum-universe.json.

NOT run automatically (no cron, no build step) — index membership and sector
classification both change extremely rarely, so this is a manual, occasional
regeneration script, not live infrastructure.

Combines two static ticker-membership lists (scripts/sp500_tickers.json,
scripts/asx200_tickers.json — which market/index a ticker belongs to, rarely
changes) with a *live* per-ticker yfinance lookup for `name` and `sector`.

Sector is deliberately pulled straight from yfinance's `info.get("sector")` —
the exact same field api/fundamentals.py reads into Fundamentals.sector —
rather than a GICS/Wikipedia-style scheme, so a sector this file assigns a
ticker always agrees with the sector the app displays once you actually
screen that ticker (which comes from the same live field).

Usage: python3 scripts/build-momentum-universe.py
Output: lib/data/momentum-universe.json
"""

from __future__ import annotations

import json
import os
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed

import yfinance as yf

warnings.filterwarnings("ignore")

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)


def load_membership() -> dict[str, str]:
    with open(os.path.join(HERE, "sp500_tickers.json")) as f:
        sp500 = json.load(f)
    with open(os.path.join(HERE, "asx200_tickers.json")) as f:
        asx200 = json.load(f)
    membership: dict[str, str] = {}
    for t in sp500:
        membership[t] = "SP500"
    for t in asx200:
        membership[t] = "ASX"
    return membership


def fetch_one(ticker: str) -> dict | None:
    try:
        info = yf.Ticker(ticker).info
        sector = info.get("sector")
        name = info.get("shortName") or info.get("longName")
        if not sector or not name:
            return None
        return {"name": name, "sector": sector}
    except Exception:
        return None


def main() -> None:
    membership = load_membership()
    tickers = sorted(membership)
    print(f"Fetching name + sector for {len(tickers)} tickers from yfinance...")

    rows: list[dict] = []
    skipped: list[str] = []
    with ThreadPoolExecutor(max_workers=16) as ex:
        futures = {ex.submit(fetch_one, t): t for t in tickers}
        done = 0
        for fut in as_completed(futures):
            ticker = futures[fut]
            result = fut.result()
            done += 1
            if result is None:
                skipped.append(ticker)
                continue
            rows.append(
                {
                    "ticker": ticker,
                    "name": result["name"],
                    "market": membership[ticker],
                    "sector": result["sector"],
                }
            )
            if done % 100 == 0:
                print(f"  {done}/{len(tickers)}")

    rows.sort(key=lambda r: r["ticker"])
    print(f"Resolved {len(rows)} tickers, skipped {len(skipped)}: {skipped}")

    out_path = os.path.join(REPO_ROOT, "lib", "data", "momentum-universe.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(rows, f, separators=(",", ":"))
    print(f"Wrote {out_path} ({os.path.getsize(out_path) / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
