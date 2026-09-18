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

    header = (
        f"{'Ticker':<9}{'Price':>10}{'DCF MoS':>10}{'Graham MoS':>12}{'PEG':>8}{'EV/EBITDA':>11}"
        f"{'FCF Yld%':>10}{'PB/ROE':>9}{'P/E':>8}{'P/B':>8}{'ROE%':>8}{'DivYld%':>9}{'NIM%':>7}{'Score':>8}"
    )
    print(header)
    print("-" * len(header))
    for r in reports:
        ticker_label = f"{r.ticker}*" if r.is_bank else r.ticker
        print(
            f"{ticker_label:<9}"
            f"{_fmt(r.price):>10}"
            f"{_fmt_pct_general(r.dcf_margin_of_safety, r.is_bank):>10}"
            f"{_fmt_pct(r.graham_margin_of_safety):>12}"
            f"{_fmt_general(r.peg, r.is_bank):>8}"
            f"{_fmt_general(r.ev_ebitda, r.is_bank):>11}"
            f"{_fmt_general(r.fcf_yield_pct, r.is_bank):>10}"
            f"{_fmt(r.pb_roe_score):>9}"
            f"{_fmt(r.pe_ratio):>8}"
            f"{_fmt(r.price_to_book):>8}"
            f"{_fmt(r.roe_pct):>8}"
            f"{_fmt(r.dividend_yield_pct):>9}"
            f"{_fmt(r.net_interest_margin_pct):>7}"
            f"{_fmt(r.composite_score):>8}"
        )

    if any(r.is_bank for r in reports):
        print()
        print(
            "* Banks don't generate \"free cash flow\" the way industrial companies do\n"
            "  (loan/deposit movements swamp the number), so DCF, PEG, EV/EBITDA, and FCF\n"
            "  yield show as n/a. P/E, P/B, ROE%, dividend yield%, and net interest margin%\n"
            "  (NIM, an estimate — see README) are used instead."
        )


def _fmt(value: float | None) -> str:
    return f"{value:.2f}" if value is not None else "n/a"


def _fmt_pct(value: float | None) -> str:
    return f"{value * 100:.1f}%" if value is not None else "n/a"


def _fmt_general(value: float | None, is_bank: bool) -> str:
    """DCF/PEG/EV-EBITDA/FCF-yield are structurally unreliable for banks — mark a
    missing value distinctly from an ordinary data gap when the row is a bank."""
    if value is not None:
        return _fmt(value)
    return "n/a*" if is_bank else "n/a"


def _fmt_pct_general(value: float | None, is_bank: bool) -> str:
    if value is not None:
        return _fmt_pct(value)
    return "n/a*" if is_bank else "n/a"


if __name__ == "__main__":
    main()
