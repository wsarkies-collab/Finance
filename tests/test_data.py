import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from stockval.data import _annual_eps_growth_pct


class _FakeTicker:
    def __init__(self, income_stmt):
        self.income_stmt = income_stmt


def _income_stmt(rows: dict[str, list[float]]) -> pd.DataFrame:
    # Columns are fiscal years, most recent first — matches yfinance's own ordering.
    return pd.DataFrame(rows).T


def test_computes_yoy_growth_from_diluted_eps():
    frame = _income_stmt({"Diluted EPS": [6.13, 5.89], "Basic EPS": [6.16, 5.92]})
    growth = _annual_eps_growth_pct(_FakeTicker(frame))
    assert growth == ((6.13 - 5.89) / 5.89) * 100


def test_falls_back_to_basic_eps_when_diluted_is_missing():
    frame = _income_stmt({"Basic EPS": [1.0, 0.5]})
    growth = _annual_eps_growth_pct(_FakeTicker(frame))
    assert growth == 100.0


def test_uses_absolute_value_of_prior_year_as_the_denominator():
    # A loss-to-profit swing: prior year EPS was negative, so the denominator must not
    # flip the sign of the result.
    frame = _income_stmt({"Diluted EPS": [2.0, -4.0]})
    growth = _annual_eps_growth_pct(_FakeTicker(frame))
    assert growth == ((2.0 - (-4.0)) / 4.0) * 100
    assert growth > 0


def test_returns_none_when_only_one_year_of_data_exists():
    frame = _income_stmt({"Diluted EPS": [6.13]})
    assert _annual_eps_growth_pct(_FakeTicker(frame)) is None


def test_returns_none_when_prior_year_eps_is_exactly_zero():
    frame = _income_stmt({"Diluted EPS": [6.13, 0.0]})
    assert _annual_eps_growth_pct(_FakeTicker(frame)) is None


def test_returns_none_when_income_statement_is_empty():
    assert _annual_eps_growth_pct(_FakeTicker(pd.DataFrame())) is None


def test_returns_none_when_income_statement_fetch_raises():
    class _Broken:
        @property
        def income_stmt(self):
            raise RuntimeError("network error")

    assert _annual_eps_growth_pct(_Broken()) is None
