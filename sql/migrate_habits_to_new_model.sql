-- ============================================================================
-- Migrate legacy habits → new per-habit model
--   habit_definitions + habit_logs  ➜  habits + habit_completions
-- ============================================================================
-- Run once in the Supabase dashboard (SQL editor), AFTER sql/productivity_redesign.sql
-- and BEFORE loading the updated app (the app auto-seeds default habits into an
-- empty `habits` table, which would block this migration's "already migrated" guard).
--
-- BEST-EFFORT HISTORY: legacy habit_logs stored a positional boolean array whose
-- index maps to habit_definitions.position. This migration maps each array cell
-- to the habit at the CURRENT position. If the habit set was ever reordered or a
-- middle habit deleted/added, older logs may map to the wrong habit — an inherent
-- limitation of the old model. Recent history (stable habit set) migrates cleanly.
-- Idempotent: re-running is a no-op once `habits` has any rows.
-- ============================================================================

do $$
declare
  r record;
  new_id uuid;
begin
  -- Guard: only migrate into an empty habits table.
  if exists (select 1 from public.habits limit 1) then
    raise notice 'habits table already populated — skipping migration';
    return;
  end if;

  -- 1. One habits row per definition, preserving display order via created_at
  --    (created_at asc == old position asc). Keep a position→id mapping.
  create temp table _habit_map (position int, habit_id uuid) on commit drop;

  for r in select position, label from public.habit_definitions order by position loop
    insert into public.habits (name, created_at)
    values (r.label, now() + (r.position || ' seconds')::interval)
    returning id into new_id;
    insert into _habit_map (position, habit_id) values (r.position, new_id);
  end loop;

  -- 2. Expand each habit_logs boolean array into one completion per `true` cell.
  --    ordinality is 1-based; legacy position is 0-based → (idx - 1).
  insert into public.habit_completions (habit_id, completed_date)
  select m.habit_id, hl.date
  from (select date, habits from public.habit_logs where jsonb_typeof(habits) = 'array') hl
  cross join lateral jsonb_array_elements(hl.habits) with ordinality as e(val, idx)
  join _habit_map m on m.position = (e.idx - 1)
  where e.val::text = 'true'
  on conflict (habit_id, completed_date) do nothing;

  raise notice 'habit migration complete: % habits, % completions',
    (select count(*) from public.habits),
    (select count(*) from public.habit_completions);
end $$;

-- Refresh PostgREST schema cache (harmless if already fresh).
NOTIFY pgrst, 'reload schema';
