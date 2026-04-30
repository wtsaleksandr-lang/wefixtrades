-- ─────────────────────────────────────────────────────────────────────────────
-- Stripe catalog cleanup — Phase 2: soft-retire duplicate / legacy products.
--
-- This script flips service_catalog.is_active = false on six DB rows that have
-- been superseded by tier-laddered equivalents. It does NOT delete rows, does
-- NOT archive Stripe products, and does NOT affect existing subscriptions.
--
-- Idempotency: the WHERE clause filters on is_active = true, so re-running this
-- script after the first commit is a no-op (UPDATE 0).
--
-- Manual review pattern:
--   1.   psql "$DATABASE_URL" < server/scripts/retire-duplicate-services.sql
--   2.   Verify the SELECT block reports six rows with is_active = false.
--   3.   If something looks wrong, run rollback (see bottom of file).
--
-- Retire list (rationale lives in the Phase-2 audit, §E):
--   quotequick           — superseded by quotequick-starter / quotequick-pro
--   socialsync           — superseded by socialsync-starter/-growth/-pro
--   mapguard-ongoing     — duplicate of mapguard-pro at $149/mo
--   reputationshield     — superseded by reputationshield-basic/-pro/-premium
--   tradeline            — superseded by tradeline-starter/-pro/-premium
--   tradeline-complete   — duplicate of tradeline-pro at $197/mo
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

UPDATE service_catalog
   SET is_active = false,
       updated_at = NOW()
 WHERE id IN (
         'quotequick',
         'socialsync',
         'mapguard-ongoing',
         'reputationshield',
         'tradeline',
         'tradeline-complete'
       )
   AND is_active = true;

-- Verification: should list all six rows with is_active = f after first commit.
SELECT id, name, category, is_active, updated_at
  FROM service_catalog
 WHERE id IN (
         'quotequick',
         'socialsync',
         'mapguard-ongoing',
         'reputationshield',
         'tradeline',
         'tradeline-complete'
       )
 ORDER BY id;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (run only if you need to re-activate every retired product):
--
--   BEGIN;
--   UPDATE service_catalog
--      SET is_active = true,
--          updated_at = NOW()
--    WHERE id IN (
--            'quotequick',
--            'socialsync',
--            'mapguard-ongoing',
--            'reputationshield',
--            'tradeline',
--            'tradeline-complete'
--          )
--      AND is_active = false;
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
