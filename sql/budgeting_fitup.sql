-- ============================================================================
-- Finance Budgeting fit-up — transactions, soft targets, seed-dedup guard
-- ============================================================================
-- Run once in the Supabase dashboard (SQL editor). Claude cannot run DDL.
-- Idempotent: safe to re-run (IF NOT EXISTS / guarded delete).
--
-- Part of the Budgeting fit-up. Adds per-transaction storage (going-forward from
-- the next import — historical raw transactions were never persisted, only
-- category aggregates), advisory per-category soft targets, and fixes the
-- recurring double-seed at the DB level.
-- ============================================================================


-- ── transactions ─────────────────────────────────────────────────────────────
-- One row per imported (or manually added) transaction. Budgeting is AUD-only.
-- Older months keep their category aggregates in budget_entries; Insights read
-- transactions for months that have them and fall back to aggregates otherwise.
-- `tag` drives the shared/individual include-exclude toggle.
create table if not exists public.transactions (
  id         uuid primary key default gen_random_uuid(),
  tx_date    date not null,
  merchant   text not null,
  category   text not null,
  amount     numeric not null,                    -- AUD
  currency   text not null default 'AUD',
  tag        text not null default 'individual'
             check (tag in ('shared', 'individual')),
  month      date not null,                        -- first-of-month bucket (matches budget_entries.month)
  source     text,                                 -- 'commbank' | 'amex' | 'manual'
  one_off    boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists transactions_month_idx on public.transactions (month);
alter table public.transactions disable row level security;


-- ── budget_targets ───────────────────────────────────────────────────────────
-- Standing advisory soft target per category (AUD/month). One row per category;
-- purely informational (amber when trending over — never blocks).
create table if not exists public.budget_targets (
  id            uuid primary key default gen_random_uuid(),
  category      text not null unique,
  target_amount numeric not null,                  -- AUD / month
  created_at    timestamptz default now()
);
alter table public.budget_targets disable row level security;


-- ── Fix + prevent the recurring double-seed (Salary etc.) ────────────────────
-- A seed race could insert two budget_entries for the same recurring item in the
-- same month (e.g. August Salary counted twice). Delete duplicates keeping the
-- physically-first row per (month, recurring_item_id), then enforce uniqueness so
-- it can never happen again. The app's seed insert also switches to upsert.
delete from public.budget_entries a
using public.budget_entries b
where a.recurring_item_id is not null
  and a.recurring_item_id = b.recurring_item_id
  and a.month = b.month
  and a.ctid > b.ctid;

create unique index if not exists budget_entries_recurring_unique
  on public.budget_entries (month, recurring_item_id)
  where recurring_item_id is not null;


-- ── Refresh PostgREST schema cache ───────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
