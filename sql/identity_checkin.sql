-- ============================================================================
-- Daily Identity Check-In — schema
-- ============================================================================
-- Run once in the Supabase dashboard (SQL editor). Claude cannot run DDL.
-- Idempotent: safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
-- guarded seed inserts).
--
-- Adds the daily "vote toward who I'm becoming" practice: one FOR / NEUTRAL /
-- AGAINST vote (plus an optional note) per life domain per day. The 8 domains
-- and their identity descriptors are FIXED standing copy and live in code
-- (src/utils/identityDomains.js) — they are NOT stored per-user and NOT editable
-- through the daily UI, so no domain/config table is created here.
--
-- DIVERGENCE FROM HANDOFF DATA MODEL:
--   The handoff lists `user_id` on identity_votes. This is a single-user app on
--   the anon key with RLS disabled — the existing tables (habits,
--   habit_completions, weekly_goal_completions, reading_activity) all omit
--   user_id. We follow that established convention and omit it here too, keeping
--   the row identity as (date, domain). If this ever becomes multi-user, add
--   user_id and fold it into the unique key alongside a real RLS policy.
-- ============================================================================


-- ── identity_votes ───────────────────────────────────────────────────────────
-- One row per domain per calendar day. `vote` is nullable: a row may exist with
-- vote = null but a note attached (or a vote cleared back to null). `domain`
-- stores the fixed domain name (e.g. 'Mind', 'Family & Friends') — the app maps
-- it back to descriptor copy from the code constant.
create table if not exists public.identity_votes (
  id         uuid primary key default gen_random_uuid(),
  vote_date  date not null,
  domain     text not null,
  vote       text check (vote in ('for', 'neutral', 'against')),  -- null = no vote
  note       text,
  created_at timestamptz default now(),
  unique (vote_date, domain)
);

alter table public.identity_votes disable row level security;


-- ── weekly_reviews (EXISTING — ALTER, do not recreate) ───────────────────────
-- Add the 4 "IDENTITY CHECK" free-text fields to the existing weekly review row.
-- Keyed by week_start (Monday) like the other review fields — see
-- productivity_redesign.sql for the standing note on this table's key.
alter table public.weekly_reviews
  add column if not exists fewest_votes_domain          text,
  add column if not exists against_trigger              text,
  add column if not exists trading_lesson               text,
  add column if not exists identity_match_vs_last_week  text;


-- ── Seed the 3 new weekly goals (EXISTING weekly_goals table) ────────────────
-- Appended to the live goals list, all numeric, matching the existing 7-day
-- square + count-badge pattern. Guarded by name so re-running is a no-op and it
-- won't duplicate goals the user may have already added by hand.
insert into public.weekly_goals (name, goal_type, target_count, active)
select v.name, 'numeric', v.target, true
from (values
  ('Relationship - protected undistracted time with partner', 3),
  ('Professional - outward-facing industry engagement', 1),
  ('Trading - logged demo session with full process', 1)
) as v(name, target)
where not exists (
  select 1 from public.weekly_goals g where g.name = v.name
);


-- ── Refresh PostgREST schema cache ───────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
