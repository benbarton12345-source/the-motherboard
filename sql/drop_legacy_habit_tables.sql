-- ============================================================================
-- Retire the legacy positional habit system
-- ============================================================================
-- Run this LAST — only after:
--   1. sql/migrate_habits_to_new_model.sql has run, and
--   2. the updated app has been loaded and you've confirmed habits + today's
--      completions + the Productivity week-summary (habit score / streak) all
--      look correct on the new `habits` / `habit_completions` tables.
--
-- This is destructive and irreversible. No code references these tables after
-- the HomePage / ProductivityPage migration.
-- ============================================================================

drop table if exists public.habit_logs;
drop table if exists public.habit_definitions;

NOTIFY pgrst, 'reload schema';
