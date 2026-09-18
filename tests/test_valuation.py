import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from stockval.valuation import (
    dcf_value_per_share,
    ev_to_ebitda,
    fcf_yield,
    graham_number,
    peg_ratio,
    price_to_book_vs_roe,
)


def test_dcf_value_per_share_basic():
    value = dcf_value_per_share(
        free_cash_flow=100.0,
        growth_rate=0.05,
        shares_outstanding=100.0,
        net_debt=0.0,
        discount_rate=0.10,
        terminal_growth=0.02,
        years=5,
    )
    assert value is not None
    assert value > 0


def test_dcf_value_per_share_invalid_rates_returns_none():
    assert (
        dcf_value_per_share(
            free_cash_flow=100.0,
            growth_rate=0.05,
            shares_outstanding=100.0,
            discount_rate=0.02,
            terminal_growth=0.05,
        )
        is None
    )


def test_peg_ratio():
    assert peg_ratio(20, 10) == 2.0
    assert peg_ratio(20, 0) is None
    assert peg_ratio(None, 10) is None


def test_ev_to_ebitda():
    assert ev_to_ebitda(1000, 100) == 10.0
    assert ev_to_ebitda(1000, 0) is None


def test_graham_number():
    expected = math.sqrt(22.5 * 5 * 20)
    assert math.isclose(graham_number(5, 20), expected)
    assert graham_number(-1, 20) is None
    assert graham_number(5, -20) is None


def test_price_to_book_vs_roe_score():
    quality = price_to_book_vs_roe(price_to_book=2.0, roe=0.20)
    assert math.isclose(quality.score, 0.10)
    assert price_to_book_vs_roe(0, 0.2).score is None


def test_fcf_yield():
    assert math.isclose(fcf_yield(50, 1000), 0.05)
    assert fcf_yield(50, 0) is None
