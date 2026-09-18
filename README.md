# stockval

Screens stocks across five valuation formulas to surface names that look
undervalued on multiple metrics at once, rather than relying on any single
number.

## Formulas

- **DCF** — intrinsic value from projected free cash flow, discounted at a
  chosen rate, plus a terminal value.
- **Graham Number** — `sqrt(22.5 * EPS * Book Value per Share)`, a
  conservative fair-value screen.
- **PEG ratio** — P/E divided by expected EPS growth.
- **EV/EBITDA** — capital-structure-neutral multiple for cross-company
  comparisons.
- **P/B vs. ROE** — book value only matters if the company earns a decent
  return on it; the score is ROE divided by P/B.

Plus FCF yield (free cash flow / market cap) as a sixth cross-check.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

## Usage

```bash
python -m stockval AAPL MSFT GOOG
```

Prints each ticker's price, DCF/Graham margin of safety, PEG, EV/EBITDA,
FCF yield, P/B-vs-ROE score, and a composite score (percentile rank averaged
across all available metrics, higher = more attractive), sorted best first.

Override the DCF growth-rate assumption (default: each stock's own trailing
EPS growth, falling back to 5%):

```bash
python -m stockval AAPL MSFT --growth-rate 0.06
```

## Tests

```bash
pip install pytest
pytest
```

Tests run against synthetic fundamentals and don't require network access.
Live data comes from Yahoo Finance via `yfinance`, so running the CLI for
real needs outbound internet access to `query1.finance.yahoo.com` /
`query2.finance.yahoo.com`.
