-- ============================================================================
-- Trading — IG closed-trade store + sync state
-- ============================================================================
-- Run once in the Supabase dashboard (SQL editor). Claude cannot run DDL.
-- Idempotent: safe to re-run.
--
-- Backs the Trading page. One row per closed IG trade, pulled by api/ig-sync.js
-- from IG's REST API (/history/transactions for the trade itself, /history/activity
-- for the original stop, which transactions do not carry — see the R multiple note
-- below). RLS disabled to match the rest of the app (single-user, anon key).
-- ============================================================================


-- ── 1. Closed trades ────────────────────────────────────────────────────────
-- `deal_id` is IG's transaction `reference`: stable for a given closed trade, so
-- re-running the sync upserts over the same row rather than duplicating it. That
-- is the whole de-duplication story — there is no secondary dedupe pass.
create table if not exists public.ig_trades (
  deal_id         text primary key,
  instrument_name text        not null,
  direction       text        not null check (direction in ('BUY','SELL')),
  open_level      numeric,
  close_level     numeric,
  -- Decimal places for display. IG has no such field; the sync counts the digits
  -- after the point in the level strings, which IG already formats to the
  -- instrument's own precision (1.27401 -> 5, 18240.4 -> 1).
  price_dp        int         not null default 2,
  open_date       timestamptz,
  close_date      timestamptz not null,
  pnl             numeric     not null,
  currency        text,
  size            numeric,
  -- Both nullable on purpose. IG's transaction history has no stop, so these are
  -- only filled when the trade could be matched to its opening activity. The UI
  -- renders a dash when r_multiple is null rather than inventing a number.
  --
  -- stop_distance is in PRICE units (the same units as open_level/close_level),
  -- NOT IG's points: IG quotes a GBP/USD stop as 50 points meaning 0.005 of the
  -- level, while 50 points on Germany 40 means 50.0. api/ig-sync.js normalises
  -- that before storing, so r_multiple = move / stop_distance holds everywhere.
  stop_distance   numeric,
  r_multiple      numeric,
  raw             jsonb,
  synced_at       timestamptz default now()
);

alter table public.ig_trades disable row level security;

-- Every query on this page filters/sorts by close date.
create index if not exists ig_trades_close_date_idx
  on public.ig_trades (close_date desc);

-- The drill-down scopes by instrument within a period.
create index if not exists ig_trades_instrument_close_idx
  on public.ig_trades (instrument_name, close_date desc);


-- ── 2. Sync state ───────────────────────────────────────────────────────────
-- Single row (id = 1). Drives the header indicator and lets the sync ask for
-- only what changed since last time instead of refetching all history.
create table if not exists public.ig_sync_state (
  id             int primary key default 1 check (id = 1),
  last_synced_at timestamptz,
  last_status    text,
  last_error     text,
  trades_synced  int,
  updated_at     timestamptz default now()
);

alter table public.ig_sync_state disable row level security;

insert into public.ig_sync_state (id, last_status)
values (1, 'never')
on conflict (id) do nothing;


-- ── Refresh PostgREST schema cache ──────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
