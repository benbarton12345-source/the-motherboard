-- app_settings — single-row table for Budgeting Insights targets.
-- Run once in the Supabase dashboard (SQL editor). RLS disabled to match the
-- app's other tables (health_settings, reading_settings, etc.).

create table if not exists public.app_settings (
  id            uuid primary key default gen_random_uuid(),
  savings_target  numeric not null default 0.45,      -- fraction of income (0–1)
  fi_target       numeric not null default 1500000,   -- GBP
  fi_target_date  date    not null default (date_trunc('month', current_date + interval '10 years'))::date,
  created_at    timestamptz not null default now()
);

alter table public.app_settings disable row level security;

-- Seed exactly one row with the defaults (no-op if a row already exists).
insert into public.app_settings (savings_target, fi_target, fi_target_date)
select 0.45, 1500000, (date_trunc('month', current_date + interval '10 years'))::date
where not exists (select 1 from public.app_settings);
