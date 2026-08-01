-- ============================================================================
-- Finance Rebuild — Net Worth restructure (schema + back-migration)
-- ============================================================================
-- Run once in the Supabase dashboard (SQL editor). Claude cannot run DDL.
-- Idempotent: safe to re-run (IF NOT EXISTS / guarded seed / ON CONFLICT).
--
-- Restructures Net Worth from flat point-in-time JSON snapshots
-- (net_worth_snapshots: {date, entries[], total}) into a proper per-account
-- model with per-account dated balance history. Foundation for the new Finance
-- Overview, the grouped Net Worth page, and the Projections engine.
--
-- DECISIONS (confirmed with Ben before writing):
--   • Taxonomy is TWO-TIER: top group Cash vs Invested Assets; Invested Assets
--     contains classes investments / pension / property / other. Only the leaf
--     `asset_class` is stored here — the two-tier grouping + labels + order live
--     in code (src/utils/financeTaxonomy.js), a single source of truth that
--     can't drift, so no asset_group column.
--   • country (UK/AU) and currency (GBP/AUD) are SEPARATE fields. country drives
--     the split donut; currency is the native denomination balances are stored
--     in (FX conversion happens on read via the app's CurrencyContext). Usually
--     aligned, but decoupled by design.
--   • Balances are stored in each account's NATIVE currency (matches the source
--     data, which already carried a per-entry currency), not pre-converted to GBP.
--   • FULL back-migration: seed the 11 real accounts and back-fill every dated
--     balance from the existing 7 snapshots, so per-account sparklines and the
--     Overview trend line have the full year of history from day one.
--   • Reclassifications from the old flat `type`: SIPP/Super → pension; Crypto →
--     investments (the new taxonomy has no Crypto class).
--   • Comm Cash → country AU (AUD-denominated CommBank account).
--   • Snapshot dates are FREE / unrestricted — no 1st/15th cadence anywhere.
--
-- The old net_worth_snapshots table is LEFT IN PLACE (unused by the new UI) as a
-- safety copy of the original data — not dropped.
-- ============================================================================


-- ── accounts ─────────────────────────────────────────────────────────────────
-- One row per account (the entity). asset_class is the leaf taxonomy class;
-- country/currency are independent. `name` is unique so the back-fill below can
-- match historical entries to accounts by name.
create table if not exists public.accounts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  asset_class text not null check (asset_class in ('cash','investments','pension','property','other')),
  country     text not null check (country in ('UK','AU')),
  currency    text not null check (currency in ('GBP','AUD')),
  active      boolean not null default true,
  created_at  timestamptz default now(),
  unique (name)
);

-- ── account_snapshots ────────────────────────────────────────────────────────
-- One dated balance record per account, in the account's native currency. Any
-- date is allowed (no enforced cadence). Bulk "New Snapshot" and per-account
-- "Add Entry" both write here.
create table if not exists public.account_snapshots (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts(id) on delete cascade,
  snapshot_date date not null,
  balance       numeric not null,   -- native currency of the account
  created_at    timestamptz default now(),
  unique (account_id, snapshot_date)
);

alter table public.accounts          disable row level security;
alter table public.account_snapshots disable row level security;


-- ── Seed the 11 real accounts (guarded by name — idempotent) ─────────────────
insert into public.accounts (name, asset_class, country, currency)
select v.name, v.asset_class, v.country, v.currency
from (values
  ('FD Cash',            'cash',        'UK', 'GBP'),
  ('Comm Cash',          'cash',        'AU', 'AUD'),
  ('T212 Cash',          'cash',        'UK', 'GBP'),
  ('RBS Cash',           'cash',        'UK', 'GBP'),
  ('HL SIPP',            'pension',     'UK', 'GBP'),
  ('RL SIPP',            'pension',     'UK', 'GBP'),
  ('Vanguard Super',     'pension',     'AU', 'AUD'),
  ('T212 ISA',           'investments', 'UK', 'GBP'),
  ('HL ISA',             'investments', 'UK', 'GBP'),
  ('HL LISA',            'investments', 'UK', 'GBP'),
  ('Crypto',             'investments', 'UK', 'GBP')
) as v(name, asset_class, country, currency)
where not exists (select 1 from public.accounts a where a.name = v.name);


-- ── Back-fill account_snapshots from the existing 7 JSON snapshots ───────────
-- Each old entry {name, type, value, currency} becomes one dated balance, keyed
-- to the account by name and dated by the snapshot's date. `value` is already
-- the native-currency amount, so it is stored as-is. Entries whose name has no
-- matching account (none expected) are skipped. Idempotent via ON CONFLICT.
insert into public.account_snapshots (account_id, snapshot_date, balance)
select a.id, s.date, (e->>'value')::numeric
from public.net_worth_snapshots s
cross join lateral jsonb_array_elements(s.entries::jsonb) e
join public.accounts a on a.name = e->>'name'
where coalesce(e->>'value', '') <> ''
on conflict (account_id, snapshot_date) do nothing;


-- ── Refresh PostgREST schema cache ───────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
