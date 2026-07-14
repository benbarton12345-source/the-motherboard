-- ============================================================================
-- Meal prep calculator — ingredient library + saved prep plans
-- ============================================================================
-- Run once in the Supabase dashboard (SQL editor). Claude cannot run DDL.
-- RLS disabled to match the app's other tables (single-user app, anon key).
-- Idempotent (IF NOT EXISTS). Backs the Nutrition → Meal prep calculator.
--
--   ingredient_library  — reusable per-100 (g/ml/unit) macro lookup. Grows as
--                         Ben adds foods; a row's macros scale by the qty entered
--                         in a plan (qty/100 × per-100 value).
--   meal_prep_plans     — a saved plan header (name + timestamps).
--   meal_prep_plan_items— ingredient rows within a plan. Macros are SNAPSHOTTED
--                         onto the row (name + per-100 values copied at add time)
--                         so a saved plan survives later library edits/deletes;
--                         ingredient_id is a soft link for "update from library".
-- ============================================================================

create table if not exists public.ingredient_library (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  unit            text not null default 'g',   -- 'g' | 'ml' | 'unit'
  kcal_per_100    numeric not null default 0,
  protein_per_100 numeric not null default 0,
  carbs_per_100   numeric not null default 0,
  fat_per_100     numeric not null default 0,
  created_at      timestamptz not null default now()
);

alter table public.ingredient_library disable row level security;

create table if not exists public.meal_prep_plans (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.meal_prep_plans disable row level security;

create table if not exists public.meal_prep_plan_items (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references public.meal_prep_plans(id) on delete cascade,
  ingredient_id   uuid references public.ingredient_library(id) on delete set null,
  -- Snapshot fields (copied from the library at add time; qty scales them):
  name            text not null,
  unit            text not null default 'g',
  qty             numeric not null default 0,
  kcal_per_100    numeric not null default 0,
  protein_per_100 numeric not null default 0,
  carbs_per_100   numeric not null default 0,
  fat_per_100     numeric not null default 0,
  sort_order      int not null default 0
);

alter table public.meal_prep_plan_items disable row level security;

create index if not exists meal_prep_plan_items_plan_id_idx
  on public.meal_prep_plan_items (plan_id);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
