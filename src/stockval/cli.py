"""Command-line entry point: python -m stockval AAPL MSFT GOOG"""

from __future__ import annotations

import argparse

from .screener import screen


def main() -> None:
    parser = argparse.ArgumentParser(description="Screen stocks across five valuation formulas.")
    parser.add_argument("tickers", nargs="+", help="Ticker symbols, e.g. AAPL MSFT GOOG")
    parser.add_argument(
        "--growth-rate",
        type=float,
        default=None,
        help="Override the DCF growth rate (e.g. 0.05 for 5%%). Defaults to each stock's own EPS growth.",
    )
    args = parser.parse_args()

    reports = screen(args.tickers, growth_rate=args.growth_rate)

    header = f"{'Ticker':<8}{'Price':>10}{'DCF MoS':>10}{'Graham MoS':>12}{'PEG':>8}{'EV/EBITDA':>11}{'FCF Yld%':>10}{'PB/ROE':>9}{'Score':>8}"
    print(header)
    print("-" * len(header))
    for r in reports:
        print(
            f"{r.ticker:<8}"
            f"{_fmt(r.price):>10}"
            f"{_fmt_pct(r.dcf_margin_of_safety):>10}"
            f"{_fmt_pct(r.graham_margin_of_safety):>12}"
            f"{_fmt(r.peg):>8}"
            f"{_fmt(r.ev_ebitda):>11}"
            f"{_fmt(r.fcf_yield_pct):>10}"
            f"{_fmt(r.pb_roe_score):>9}"
            f"{_fmt(r.composite_score):>8}"
        )


def _fmt(value: float | None) -> str:
    return f"{value:.2f}" if value is not None else "n/a"


def _fmt_pct(value: float | None) -> str:
    return f"{value * 100:.1f}%" if value is not None else "n/a"


if __name__ == "__main__":
    main()
