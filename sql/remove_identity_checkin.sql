-- ============================================================================
-- Remove the Identity Check-In feature
-- ============================================================================
-- Run in the Supabase dashboard (SQL editor). Claude cannot run DDL.
--
-- The feature was removed from the app on 11 September 2026 (unused). All UI,
-- helpers and the DailyIdentityModal are already deleted from the codebase, so
-- nothing reads these objects any more — the app works with or without this
-- script having been run.
--
-- PART 1 is the vote data itself. PART 2 is OPTIONAL and DESTRUCTIVE of written
-- prose — read the note before running it.
-- ============================================================================


-- ── PART 1 — drop the votes table ───────────────────────────────────────────
-- 32 vote rows at time of writing. Nothing else references this table.
drop table if exists public.identity_votes;


-- ── PART 2 — OPTIONAL: drop the four weekly_reviews columns ─────────────────
--
--   ⚠ THIS DESTROYS WRITTEN REFLECTIONS. At time of writing these columns hold
--     real prose on two sealed weeks:
--       2026-07-13  fewest_votes_domain, against_trigger, trading_lesson,
--                   identity_match_vs_last_week   (all four written)
--       2026-07-20  fewest_votes_domain           ("Trading")
--
--   Note `trading_lesson` ("One trading observation or lesson this week") is
--   arguably not an identity field at all — it just lived in that section of the
--   Weekly Review. Dropping it loses that prompt permanently.
--
--   The app no longer reads or writes any of these columns either way. Leaving
--   them in place costs nothing but four unused nullable text columns, and keeps
--   the existing entries readable in the Supabase table editor.
--
--   To keep the prose: DO NOT run this part.
--   To remove it completely: uncomment and run.
--
-- alter table public.weekly_reviews
--   drop column if exists fewest_votes_domain,
--   drop column if exists against_trigger,
--   drop column if exists trading_lesson,
--   drop column if exists identity_match_vs_last_week;


-- ── Refresh PostgREST schema cache ──────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
