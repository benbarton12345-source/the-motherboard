-- ============================================================================
-- Productivity Redesign — Session 1 (schema only)
-- ============================================================================
-- Run once in the Supabase dashboard (SQL editor). Claude cannot run DDL.
-- Idempotent: safe to re-run (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
--
-- IMPORTANT — this file DIVERGES from the raw DDL in the design handoff because
-- several proposed tables already exist in a different shape. See the header
-- notes on each block and design-handoffs/productivity/.../README.md. Summary of
-- decisions is in BRIEF.md > "Supabase Tables" and in the session hand-back.
--
--   Proposed in handoff      Decision
--   ----------------------   --------------------------------------------------
--   habits                   CREATE NEW (legacy habit_definitions/habit_logs
--   habit_completions        CREATE NEW   left in place — migrate in Session 2)
--   weekly_goals             ALREADY EXISTS → ALTER (add goal_type; keep
--                            target_count + active — do NOT rename to `target`)
--   weekly_goal_completions  CREATE NEW (supersedes aggregate weekly_goal_logs)
--   yearly_goals             CREATE NEW
--   long_term_goals          CREATE NEW
--   long_term_goal_journal   CREATE NEW
--   weekly_reviews           ALREADY EXISTS → ALTER (add anything_else, sealed;
--                            keep `week_start` key — do NOT rename to
--                            `week_start_date`)
-- ============================================================================


-- ── habits ──────────────────────────────────────────────────────────────────
-- New per-habit table. Distinct from the legacy `habit_definitions` +
-- `habit_logs` (positional boolean-array) system used by the Home page. The new
-- design needs per-habit streaks and a backfillable per-habit/per-day history,
-- which the positional array cannot support. `streak` is a denormalised cache —
-- Session 2 should recompute it from habit_completions, not trust it blindly.
create table if not exists public.habits (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  streak     int  default 0,
  created_at timestamptz default now()
);

-- ── habit_completions ───────────────────────────────────────────────────────
-- One row per habit per calendar day completed. Real dates (not session-relative
-- offsets) so history is permanent and backfillable.
create table if not exists public.habit_completions (
  id             uuid primary key default gen_random_uuid(),
  habit_id       uuid references public.habits(id) on delete cascade,
  completed_date date not null,
  created_at     timestamptz default now(),
  unique (habit_id, completed_date)
);


-- ── weekly_goals (EXISTING — ALTER, do not recreate) ─────────────────────────
-- Existing columns: id, name, target_count (int), active (bool), created_at.
-- The handoff proposed `target` + `goal_type`; we KEEP `target_count` (renaming
-- would break ProductivityPage.jsx and existing data) and only ADD `goal_type`
-- to support boolean (1x completion) vs numeric (Nx/week) weekly goals.
alter table public.weekly_goals
  add column if not exists goal_type text not null default 'numeric';
  -- 'numeric' (e.g. Gym 3x) or 'boolean' (single completion, e.g. Facetime Mum)

-- ── weekly_goal_completions ─────────────────────────────────────────────────
-- One row per weekly goal per day completed, per ISO week — drives the 7-day tap
-- grid and backfill-confirm interaction. Supersedes the aggregate-count table
-- `weekly_goal_logs` (which stores only a per-week total and cannot say WHICH
-- days were done). weekly_goal_logs is left untouched for existing history;
-- Session 2 decides whether to keep it read-only or drop it after migration.
-- NOTE: column is `weekly_goal_id` per the handoff (the legacy logs table uses
-- `goal_id` — intentional naming divergence, flagged for Session 2).
create table if not exists public.weekly_goal_completions (
  id              uuid primary key default gen_random_uuid(),
  weekly_goal_id  uuid references public.weekly_goals(id) on delete cascade,
  week_start_date date not null,   -- ISO week start (Monday)
  completed_date  date not null,
  created_at      timestamptz default now(),
  unique (weekly_goal_id, week_start_date, completed_date)
);


-- ── yearly_goals ────────────────────────────────────────────────────────────
-- Numeric and boolean goals for the current year. `linked_source` is reserved
-- for future cross-metric auto-linking — NO linking behaviour is built now.
create table if not exists public.yearly_goals (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  goal_type     text not null,                 -- 'numeric' or 'boolean'
  target_value  numeric,
  current_value numeric default 0,
  unit          text,                          -- e.g. 'times', 'books', 'km'
  done          boolean default false,
  target_date   date,                          -- optional, for boolean goals
  linked_source text,                          -- reserved, e.g. 'habit:sauna'
  year          int not null default extract(year from now())::int,
  created_at    timestamptz default now()
);

-- ── long_term_goals ─────────────────────────────────────────────────────────
-- Aspirational bucket-list items, no deadline pressure. Boolean milestones or a
-- numeric target (e.g. Freedom Figure). No on-track/behind judgement applies.
create table if not exists public.long_term_goals (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  goal_type     text not null default 'boolean',      -- 'boolean' or 'numeric'
  status        text not null default 'not_started',   -- not_started/in_progress/done
  timeframe     text,                                  -- optional label e.g. '2–3 years'
  target_value  numeric,                               -- numeric goals only
  current_value numeric,                               -- numeric goals only
  unit          text,                                  -- numeric goals only
  linked_source text,                                  -- reserved for future auto-linking
  created_at    timestamptz default now()
);

-- ── long_term_goal_journal ──────────────────────────────────────────────────
-- Dated free-text journal entries per long-term goal (running diary, no per-entry
-- structure beyond date + text).
create table if not exists public.long_term_goal_journal (
  id                 uuid primary key default gen_random_uuid(),
  long_term_goal_id  uuid references public.long_term_goals(id) on delete cascade,
  entry_date         date not null default current_date,
  entry_text         text not null,
  created_at         timestamptz default now()
);


-- ── weekly_reviews (EXISTING — ALTER, do not recreate) ───────────────────────
-- Existing columns include: week_start (unique Monday date — the key), went_well,
-- challenge_overcome, improve_next_week, consistency_score, proud_of, sealed_at,
-- plus dead legacy columns (wins, slipped, open_loops, next_week_top_3).
-- We KEEP `week_start` as the key (renaming to `week_start_date` would break
-- HomePage.jsx onConflict:'week_start'). We ADD the two fields the redesign needs:
--   • anything_else — the 6th open reflection field
--   • sealed        — explicit boolean (existing code derives seal-state from
--                     sealed_at; `sealed` is redundant with it — Session 3 should
--                     keep them consistent, treating sealed_at as source of truth).
alter table public.weekly_reviews
  add column if not exists anything_else text,
  add column if not exists sealed boolean default false;

-- Backfill `sealed` from existing sealed_at so the new column is correct on day 1.
update public.weekly_reviews
   set sealed = true
 where sealed_at is not null
   and sealed is distinct from true;

-- OPTIONAL: enforce consistency_score 1–10 at the DB level. Skipped by default —
-- it will error if any legacy row already violates it. Uncomment to apply.
-- alter table public.weekly_reviews
--   add constraint weekly_reviews_consistency_score_range
--   check (consistency_score is null or (consistency_score between 1 and 10));


-- ── RLS: disable on all NEW tables (single-user app, anon key only) ──────────
-- (weekly_goals and weekly_reviews already exist with RLS disabled — untouched.)
alter table public.habits                  disable row level security;
alter table public.habit_completions       disable row level security;
alter table public.weekly_goal_completions disable row level security;
alter table public.yearly_goals            disable row level security;
alter table public.long_term_goals         disable row level security;
alter table public.long_term_goal_journal  disable row level security;


-- ── Refresh PostgREST schema cache ───────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
