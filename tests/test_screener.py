import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from stockval.data import Fundamentals, is_bank_industry
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
        sector="Technology",
        industry="Consumer Electronics",
        dividend_yield=0.02,
        net_interest_margin=None,
    )
    base.update(overrides)
    return Fundamentals(**base)


def _bank_fundamentals(ticker, **overrides):
    bank_overrides = dict(
        sector="Financial Services",
        industry="Banks - Diversified",
        ebitda=None,
        free_cash_flow=None,
        dividend_yield=0.03,
        net_interest_margin=0.025,
    )
    bank_overrides.update(overrides)
    return _fundamentals(ticker, **bank_overrides)


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


def test_is_bank_industry_flags_financial_services_banks_only():
    assert is_bank_industry("Financial Services", "Banks - Diversified") is True
    assert is_bank_industry("Financial Services", "Banks - Regional") is True
    assert is_bank_industry("Financial Services", "Insurance - Life") is False
    assert is_bank_industry("Technology", "Consumer Electronics") is False
    assert is_bank_industry(None, None) is False


def test_score_ticker_marks_bank_and_populates_bank_metrics():
    report = score_ticker(_bank_fundamentals("BANK"))
    assert report.is_bank is True
    assert report.pe_ratio is not None
    assert report.price_to_book is not None
    assert report.roe_pct == 15.0
    assert report.dividend_yield_pct == 3.0
    assert report.net_interest_margin_pct == 2.5
    # ebitda/free_cash_flow are None in the fixture, so these must be None too.
    assert report.ev_ebitda is None
    assert report.fcf_yield_pct is None


def test_score_ticker_leaves_net_interest_margin_none_for_non_banks():
    report = score_ticker(_fundamentals("TEST"))
    assert report.is_bank is False
    assert report.net_interest_margin_pct is None


def test_apply_composite_scores_ranks_bank_against_non_bank():
    bank = score_ticker(_bank_fundamentals("BANK", price=50.0))
    non_bank = score_ticker(_fundamentals("NONBANK", price=500.0))
    reports = [bank, non_bank]
    _apply_composite_scores(reports)

    assert bank.composite_score is not None
    assert non_bank.composite_score is not None
