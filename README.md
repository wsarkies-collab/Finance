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

## Web dashboard

The same formulas are also available as a public web dashboard: a Next.js app
(`app/`, `lib/`, `components/`) deployed on Vercel, backed by Supabase for
caching and per-user watchlists, plus one small Vercel Python function
(`api/fundamentals.py`) that does the actual `yfinance` fetch. The CLI above
is untouched by any of this — it's an additive layer in the same repo.

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
