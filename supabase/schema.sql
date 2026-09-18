-- Run this once in the Supabase project's SQL editor (Project -> SQL Editor -> New query).

create table public.fundamentals_cache (
  ticker               text primary key,
  fetched_at           timestamptz not null default now(),
  price                numeric,
  market_cap           numeric,
  enterprise_value     numeric,
  shares_outstanding   numeric,
  net_debt             numeric,
  eps                  numeric,
  book_value_per_share numeric,
  pe_ratio             numeric,
  eps_growth_pct       numeric,
  ebitda               numeric,
  free_cash_flow       numeric,
  roe                  numeric,
  price_to_book        numeric,
  sector               text,
  industry             text,
  dividend_yield       numeric,
  net_interest_margin  numeric
);

alter table public.fundamentals_cache enable row level security;

-- Public read (not user-specific data); no insert/update/delete policy for anon/authenticated,
-- so writes only happen via the service-role key, which bypasses RLS entirely.
create policy "fundamentals_cache_public_read"
  on public.fundamentals_cache for select
  to anon, authenticated
  using (true);

create table public.watchlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  ticker     text not null,
  added_at  timestamptz not null default now(),
  unique (user_id, ticker)
);

create index watchlists_user_id_idx on public.watchlists(user_id);

alter table public.watchlists enable row level security;

create policy "watchlists_select_own" on public.watchlists for select
  to authenticated using (auth.uid() = user_id);
create policy "watchlists_insert_own" on public.watchlists for insert
  to authenticated with check (auth.uid() = user_id);
create policy "watchlists_delete_own" on public.watchlists for delete
  to authenticated using (auth.uid() = user_id);

-- If you already ran an earlier version of this file (before sector/bank metrics were
-- added), run this block instead of the create table above — it's safe to run either way.
alter table public.fundamentals_cache add column if not exists sector text;
alter table public.fundamentals_cache add column if not exists industry text;
alter table public.fundamentals_cache add column if not exists dividend_yield numeric;
alter table public.fundamentals_cache add column if not exists net_interest_margin numeric;
