-- ============================================================================
-- Net Worth — promote Crypto to its own asset class
-- ============================================================================
-- Run once in the Supabase dashboard (SQL editor). Claude cannot run DDL.
-- Idempotent: safe to re-run.
--
-- The 26 July 2026 restructure deliberately had no Crypto class and folded the
-- Crypto account into `investments`. That decision was reversed on 11 Sept 2026
-- so the new asset-class breakdown can report crypto exposure separately.
--
-- Two steps: widen the CHECK constraint to accept 'crypto', then reclassify the
-- existing Crypto account. Order matters — the update fails against the old
-- constraint.
-- ============================================================================


-- ── 1. Widen the asset_class CHECK constraint ───────────────────────────────
alter table public.accounts
  drop constraint if exists accounts_asset_class_check;

alter table public.accounts
  add constraint accounts_asset_class_check
  check (asset_class in ('cash','investments','crypto','pension','property','other'));


-- ── 2. Reclassify the existing Crypto account ───────────────────────────────
-- Matched by name; the seed created exactly one account called 'Crypto'.
update public.accounts
   set asset_class = 'crypto'
 where name = 'Crypto'
   and asset_class <> 'crypto';


-- ── Refresh PostgREST schema cache ──────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
