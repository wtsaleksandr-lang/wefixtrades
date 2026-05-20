-- Wave Q — grandfather any leftover QuoteQuick `starter` calculators onto `pro`.
--
-- Background:
--   The QuoteQuick three-tier ladder (Free / Pro $29 / Business $79) replaced
--   the older Starter $49 tier in May 2026. The checkout route already
--   normalises any inbound `plan='starter'` to plan_tier='pro' (see
--   server/routes/calculatorRoutes.ts ~line 673), and the admin UI rolls
--   starter rows into the Pro count (client/src/pages/admin/QuoteQuickPage.tsx).
--
-- What this migration does:
--   Flip any existing calculator rows with plan_tier='starter' to plan_tier='pro'.
--   Stripe-side, the legacy STRIPE_PRICE_QQ_STARTER_* env vars (if set) already
--   resolve to 'pro' in the webhook's priceIdToQuoteQuickTier() helper, so a
--   subscription updated event won't flip them back.
--
--   Idempotent — re-running is a no-op once the rows are migrated.
--   Only touches QuoteQuick `calculators.plan_tier`. Unrelated tiers on other
--   tables (rankflow_profiles, contentflow, etc.) still legitimately use
--   'starter' as a tier value and are NOT touched.

UPDATE calculators
SET plan_tier = 'pro'
WHERE plan_tier = 'starter';

-- Sanity check (informational): if any rows remain, the migration didn't
-- apply cleanly. Wrapped in DO so it logs without failing the migration.
DO $$
DECLARE
  remaining int;
BEGIN
  SELECT COUNT(*) INTO remaining FROM calculators WHERE plan_tier = 'starter';
  IF remaining > 0 THEN
    RAISE NOTICE 'migration 0014: % calculator row(s) still have plan_tier=starter after migration', remaining;
  END IF;
END $$;
