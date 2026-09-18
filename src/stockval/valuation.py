"""Core valuation formulas used by the screener."""

from __future__ import annotations

import math
from dataclasses import dataclass


def dcf_value_per_share(
    free_cash_flow: float,
    growth_rate: float,
    shares_outstanding: float,
    net_debt: float = 0.0,
    discount_rate: float = 0.09,
    terminal_growth: float = 0.025,
    years: int = 5,
) -> float | None:
    """Discounted cash flow intrinsic value per share.

    Projects `free_cash_flow` forward at `growth_rate` for `years`, discounts
    each year at `discount_rate`, adds a Gordon-growth terminal value, then
    subtracts net debt and divides by shares outstanding.
    """
    if free_cash_flow is None or shares_outstanding in (None, 0):
        return None
    if discount_rate <= terminal_growth:
        return None

    pv_sum = 0.0
    fcf = free_cash_flow
    for year in range(1, years + 1):
        fcf *= 1 + growth_rate
        pv_sum += fcf / (1 + discount_rate) ** year

    terminal_value = fcf * (1 + terminal_growth) / (discount_rate - terminal_growth)
    pv_terminal = terminal_value / (1 + discount_rate) ** years

    enterprise_value = pv_sum + pv_terminal
    equity_value = enterprise_value - net_debt
    return equity_value / shares_outstanding


def peg_ratio(pe_ratio: float, eps_growth_rate_pct: float) -> float | None:
    """PE divided by expected EPS growth rate (as a percentage, e.g. 15 for 15%)."""
    if pe_ratio is None or eps_growth_rate_pct in (None, 0) or pe_ratio <= 0:
        return None
    return pe_ratio / eps_growth_rate_pct


def ev_to_ebitda(enterprise_value: float, ebitda: float) -> float | None:
    """Enterprise value / EBITDA, capital-structure-neutral multiple."""
    if enterprise_value is None or ebitda in (None, 0):
        return None
    return enterprise_value / ebitda


def graham_number(eps: float, book_value_per_share: float) -> float | None:
    """Benjamin Graham's conservative fair-value estimate: sqrt(22.5 * EPS * BVPS)."""
    if eps is None or book_value_per_share is None:
        return None
    if eps <= 0 or book_value_per_share <= 0:
        return None
    return math.sqrt(22.5 * eps * book_value_per_share)


@dataclass
class QualityValue:
    price_to_book: float | None
    roe: float | None

    @property
    def score(self) -> float | None:
        """ROE earned per unit of book value paid; higher means cheaper quality."""
        if self.price_to_book in (None, 0) or self.roe is None:
            return None
        return self.roe / self.price_to_book


def price_to_book_vs_roe(price_to_book: float, roe: float) -> QualityValue:
    return QualityValue(price_to_book=price_to_book, roe=roe)


def fcf_yield(free_cash_flow: float, market_cap: float) -> float | None:
    """Free cash flow as a percentage of market cap; higher is cheaper."""
    if free_cash_flow is None or market_cap in (None, 0):
        return None
    return free_cash_flow / market_cap
