-- ============================================================================
-- reading_activity — per-day reading activity log (drives the heatmap + streak)
-- ============================================================================
-- Run once in the Supabase dashboard (SQL editor). Claude cannot run DDL.
--
-- Documented in BRIEF.md but never actually created in the DB, so useReading.js
-- has been reading/writing a non-existent table (heatmap + streak silently dead,
-- and the new "Log 10 min reading" action has nowhere to record activity). This
-- creates it to match the documented shape. Idempotent (IF NOT EXISTS).
--
-- One row per day; `intensity` is bumped +1 (cap 4) on each progress update,
-- finish, or "Log 10 min reading" tap. RLS disabled (single-user app, anon key).
-- ============================================================================

create table if not exists public.reading_activity (
  activity_date date primary key,
  intensity     int not null default 0,
  updated_at    timestamptz default now()
);

alter table public.reading_activity disable row level security;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
