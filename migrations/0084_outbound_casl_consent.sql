-- 0084_outbound_casl_consent.sql
--
-- Lane OB — CASL consent bookkeeping + global send-ramp state.
--
-- 1. prospects gains three consent columns:
--      consent_basis      — express | implied_conspicuous | implied_inquiry | none
--      consent_evidence   — jsonb audit trail (method, source URL, captured_at, …)
--      consent_expires_at — CASL's 2-year window for implied consent
--                           (inquiry / existing-business-relationship variants).
--                           Conspicuous-publication implied consent carries no
--                           statutory window, so it may stay NULL.
--    All columns additive + nullable / defaulted — no backfill, no data loss.
--    Legacy rows default to 'none'; the runtime gate falls back to the
--    published-on-own-domain conspicuous-publication test for them.
--
-- 2. outbound_send_state — single-row table persisting the FIRST real
--    (non-dry-run) send date, from which the global volume ramp is computed
--    (50/day starting, +25/day each full week). Cross-campaign, global.

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS consent_basis      VARCHAR(30) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS consent_evidence   JSONB,
  ADD COLUMN IF NOT EXISTS consent_expires_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS outbound_send_state (
  id                 SERIAL PRIMARY KEY,
  -- timestamp of the first real (non-dry-run) lead push to an outreach
  -- platform; NULL until the first real send ever happens.
  first_real_send_at TIMESTAMP,
  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW()
);
