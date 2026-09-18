import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from stockval.data import Fundamentals
from stockval.screener import _apply_composite_scores, score_ticker


def _fundamentals(ticker, **overrides):
    base = dict(
        ticker=ticker,
        price=100.0,
        market_cap=10_000.0,
        enterprise_value=11_000.0,
        shares_outstanding=100.0,
        net_debt=1_000.0,
        eps=5.0,
        book_value_per_share=40.0,
        pe_ratio=20.0,
        eps_growth_pct=10.0,
        ebitda=1_000.0,
        free_cash_flow=500.0,
        roe=0.15,
        price_to_book=2.5,
    )
    base.update(overrides)
    return Fundamentals(**base)


def test_score_ticker_populates_all_metrics():
    report = score_ticker(_fundamentals("TEST"))
    assert report.ticker == "TEST"
    assert report.dcf_value is not None
    assert report.graham_value is not None
    assert report.peg is not None
    assert report.ev_ebitda is not None
    assert report.fcf_yield_pct is not None
    assert report.pb_roe_score is not None


def test_apply_composite_scores_ranks_cheaper_stock_higher():
    cheap = score_ticker(_fundamentals("CHEAP", price=50.0))
    expensive = score_ticker(_fundamentals("EXPENSIVE", price=500.0))
    reports = [cheap, expensive]
    _apply_composite_scores(reports)

    assert cheap.composite_score is not None
    assert expensive.composite_score is not None
    assert cheap.composite_score > expensive.composite_score
