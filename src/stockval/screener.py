"""Scores a list of tickers across all five valuation formulas and ranks them."""

from __future__ import annotations

from dataclasses import dataclass

from .data import Fundamentals, fetch_fundamentals, is_bank_industry
from .valuation import (
    dcf_value_per_share,
    ev_to_ebitda,
    fcf_yield,
    graham_number,
    peg_ratio,
    price_to_book_vs_roe,
)

DEFAULT_GROWTH_RATE = 0.05

# Metrics where a lower raw value means "cheaper" get their percentile rank flipped
# so that, after flipping, higher always means more attractive across every metric.
LOWER_IS_BETTER = {"peg", "ev_ebitda", "pe_ratio"}


@dataclass
class ValuationReport:
    ticker: str
    price: float | None
    sector: str | None
    industry: str | None
    # True for banks (sector "Financial Services" + "bank" in industry). DCF/PEG/
    # EV-EBITDA/FCF-yield are structurally unreliable for banks (see pe_ratio etc.
    # below for the metrics used instead), so the CLI uses this to explain those n/a's.
    is_bank: bool
    dcf_value: float | None
    dcf_margin_of_safety: float | None
    graham_value: float | None
    graham_margin_of_safety: float | None
    peg: float | None
    ev_ebitda: float | None
    fcf_yield_pct: float | None
    pb_roe_score: float | None
    # Raw pass-throughs, always populated when Yahoo has them (not bank-specific) —
    # shown alongside pb_roe_score for banks, where P/B-vs-ROE alone is a less
    # familiar framing.
    pe_ratio: float | None
    price_to_book: float | None
    roe_pct: float | None
    dividend_yield_pct: float | None
    # Only ever non-None for banks — see Fundamentals.net_interest_margin.
    net_interest_margin_pct: float | None
    composite_score: float | None = None


def _margin_of_safety(fair_value: float | None, price: float | None) -> float | None:
    if fair_value is None or not price:
        return None
    return (fair_value - price) / price


def score_ticker(fundamentals: Fundamentals, growth_rate: float | None = None) -> ValuationReport:
    f = fundamentals
    growth = growth_rate
    if growth is None:
        growth = (f.eps_growth_pct / 100) if f.eps_growth_pct else DEFAULT_GROWTH_RATE

    dcf_value = dcf_value_per_share(
        free_cash_flow=f.free_cash_flow,
        growth_rate=growth,
        shares_outstanding=f.shares_outstanding,
        net_debt=f.net_debt or 0.0,
    )
    graham_value = graham_number(f.eps, f.book_value_per_share)
    quality = price_to_book_vs_roe(f.price_to_book, f.roe)
    fcf_y = fcf_yield(f.free_cash_flow, f.market_cap)

    return ValuationReport(
        ticker=f.ticker,
        price=f.price,
        sector=f.sector,
        industry=f.industry,
        is_bank=is_bank_industry(f.sector, f.industry),
        dcf_value=dcf_value,
        dcf_margin_of_safety=_margin_of_safety(dcf_value, f.price),
        graham_value=graham_value,
        graham_margin_of_safety=_margin_of_safety(graham_value, f.price),
        peg=peg_ratio(f.pe_ratio, f.eps_growth_pct),
        ev_ebitda=ev_to_ebitda(f.enterprise_value, f.ebitda),
        fcf_yield_pct=fcf_y * 100 if fcf_y is not None else None,
        pb_roe_score=quality.score,
        pe_ratio=f.pe_ratio,
        price_to_book=f.price_to_book,
        roe_pct=f.roe * 100 if f.roe is not None else None,
        dividend_yield_pct=f.dividend_yield * 100 if f.dividend_yield is not None else None,
        net_interest_margin_pct=f.net_interest_margin * 100 if f.net_interest_margin is not None else None,
    )


def _percentile_ranks(values: list[float | None]) -> list[float | None]:
    present = [(i, v) for i, v in enumerate(values) if v is not None]
    if len(present) < 2:
        return [None] * len(values)
    ordered = sorted(present, key=lambda pair: pair[1])
    ranks: list[float | None] = [None] * len(values)
    for rank, (i, _) in enumerate(ordered):
        ranks[i] = rank / (len(ordered) - 1)
    return ranks


def _apply_composite_scores(reports: list[ValuationReport]) -> None:
    metric_names = [
        "dcf_margin_of_safety",
        "graham_margin_of_safety",
        "peg",
        "ev_ebitda",
        "fcf_yield_pct",
        "pb_roe_score",
        # Bank-relevant additions. pe_ratio/dividend_yield_pct are populated for most
        # tickers, not just banks, but net_interest_margin_pct is None for everyone
        # else, so it naturally drops out of the ranking (see _percentile_ranks) for
        # non-bank tickers rather than needing a separate bank-only ranking path.
        # price_to_book/roe_pct are deliberately NOT ranked here — pb_roe_score
        # already combines them, and ranking both would double-count book value.
        "pe_ratio",
        "dividend_yield_pct",
        "net_interest_margin_pct",
    ]
    ranked = {}
    for name in metric_names:
        raw = [getattr(r, name) for r in reports]
        ranks = _percentile_ranks(raw)
        if name in LOWER_IS_BETTER:
            ranks = [None if r is None else 1 - r for r in ranks]
        ranked[name] = ranks

    for idx, report in enumerate(reports):
        scores = [ranked[name][idx] for name in metric_names if ranked[name][idx] is not None]
        report.composite_score = sum(scores) / len(scores) if scores else None


def screen(tickers: list[str], growth_rate: float | None = None) -> list[ValuationReport]:
    reports = [score_ticker(fetch_fundamentals(ticker), growth_rate) for ticker in tickers]
    _apply_composite_scores(reports)
    reports.sort(key=lambda r: (r.composite_score is None, -(r.composite_score or 0)))
    return reports
