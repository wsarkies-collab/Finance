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

### Banks

DCF, PEG, EV/EBITDA, and FCF yield don't work for banks — a bank's GAAP
operating cash flow is dominated by loan/deposit movements, not a coherent
"free cash flow" signal (verified against JPMorgan's actual 10-K filings).
Tickers classified as banks (Yahoo sector "Financial Services" + "bank" in
the industry name) get P/E, P/B, ROE%, dividend yield%, and net interest
margin% (NIM, approximated as latest annual Net Interest Income / Total
Assets — a screener-level estimate, not the precise average-earning-assets
figure banks report themselves) instead. The CLI marks a bank row's ticker
and its inapplicable columns with `*` and prints a footnote explaining why.

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

## Web dashboard

The same formulas are also available as a public web dashboard: a Next.js app
(`app/`, `lib/`, `components/`) deployed on Vercel, backed by Supabase for
caching and per-user watchlists, plus three small Vercel Python functions
(`api/fundamentals.py`, `api/price_history.py`, `api/ticker_search.py`) that
do the actual `yfinance` fetches. The CLI above is untouched by any of this —
it's an additive layer in the same repo.

Many companies list on more than one exchange under overlapping tickers (BHP
trades as `BHP` on the NYSE, `BHP.AX` on the ASX, and `BHP.L` on the LSE), so
the search box on the dashboard resolves what you type against Yahoo's own
search (`yfinance.Search`, `api/ticker_search.py`) and offers every matching
exchange listing in a dropdown rather than guessing one. Picking a listing
adds it as a ticker chip with its exchange shown; typing an exact symbol and
pressing Enter still works exactly as before, so knowing the suffix you want
is never blocked on the search returning. Searching by company name finds
every exchange more reliably than a bare ticker does — Yahoo's relevance
ranking can drop a real listing (e.g. searching `RIO` alone omits `RIO.AX`)
that the full name surfaces.

Clicking a ticker in the results table opens a popup explaining each formula
and comparing the company to cached industry peers. A "Future Projections"
button lets you pick a searched company and see a 5-year price chart with
four toggleable series: DDM, Target Price (EPS × future P/E), DCF, and real
analyst consensus targets (12-month, so only plotted at Year 1). All three
computed models share a capped growth-rate assumption (`lib/projections.ts`)
— raw trailing EPS growth is not safe to compound over 5 years (it broke the
Gordon Growth Model's math outright for some real tickers tested during
development).

A separate **Momentum & quality** tab (`/momentum`) offers a short-to-medium-term
screen, distinct from the long-term valuation screener above: it ranks
searched tickers by 12-month price momentum (skipping the most recent month,
per Novy-Marx 2012), proximity to their 52-week high, and this app's existing
ROE/P·E quality-value fundamentals — the specific combination a research pass
on trading-strategy evidence found actually holds up out of sample, unlike
single-indicator signals like RSI or MACD (see `lib/momentum.ts` for the
math and citations). It rebalances roughly monthly rather than daily, and a
"Signal" (New entrant / Held / Dropped out) derived from rank changes stands
in for a buy/sell trigger without adding an unvalidated technical indicator.
Every ticker's figures are one click away from a plain-English explanation
of what they mean and why, via `components/MomentumExplainerModal.tsx`.

### One-time setup

1. **Supabase**: open your project's SQL editor and run `supabase/schema.sql`
   once. This creates `fundamentals_cache` (public read, service-role write)
   and `watchlists` (per-user, RLS-protected) tables.
2. **Env vars**: copy `.env.local.example` to `.env.local` for local dev, and
   set the same variables in the Vercel project's Environment Variables for
   production:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY` — from your Supabase project's API settings.
   - `FUNDAMENTALS_INTERNAL_TOKEN` — any random string, set identically for
     the Next.js app and for `api/fundamentals.py`'s function environment, so
     the fundamentals endpoint isn't an open scraping proxy.
3. **Deploy**: connect the Vercel project to this repo (or run `vercel --prod`
   from the repo root). Vercel builds the Next.js app and the Python function
   in the same deployment automatically.

### Local development

```bash
npm install
npm run test         # Vitest — ported valuation/screener unit tests
```

`next dev` alone does **not** serve `api/*.py`, so the fundamentals endpoint
needs the Vercel CLI locally:

```bash
npm install -g vercel
vercel dev
```

with `PYTHON_FUNDAMENTALS_BASE_URL=http://localhost:3000` set in `.env.local`.
