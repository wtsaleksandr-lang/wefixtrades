-- 0068_sms_opt_outs_scope.sql
--
-- Wave 77 — per-tenant SMS routing + scoped opt-outs.
--
-- Adds scope_client_id to sms_opt_outs so a STOP keyword routed via a
-- specific client's per-tenant Twilio number opts the homeowner out for
-- THAT client only — not globally across every WeFixTrades tenant.
--
-- scope_client_id semantics:
--   NULL  → global opt-out (unchanged historical behavior; STOPs to the
--           shared WeFixTrades brand line continue to land here).
--   <int> → per-client opt-out. The opt-out is enforced only when an
--           outbound SMS is sent on behalf of THAT client (i.e. via
--           sendSmsAsClient({clientId, ...}) in server/twilioClient.ts).
--
-- Existing rows default to NULL, preserving current global-opt-out
-- behavior end-to-end. The drop of the legacy UNIQUE(phone_e164)
-- constraint is replaced with a partial unique index over phone_e164
-- for the NULL-scope rows + a composite unique index on (phone, scope)
-- so a phone can carry one global opt-out AND one opt-out per client
-- without conflict.
--
-- Additive + reversible at the data layer. Safe to re-run via
-- IF NOT EXISTS / DROP CONSTRAINT IF EXISTS.

ALTER TABLE sms_opt_outs
  ADD COLUMN IF NOT EXISTS scope_client_id INTEGER;

-- Replace the global UNIQUE(phone_e164) with scope-aware indexes.
-- The old constraint name is auto-generated; drop by predicate name if
-- present and also handle the IF EXISTS path for re-runs.
ALTER TABLE sms_opt_outs DROP CONSTRAINT IF EXISTS sms_opt_outs_phone_e164_key;

-- One global opt-out per phone (scope_client_id IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sms_opt_outs_phone_global
  ON sms_opt_outs (phone_e164)
  WHERE scope_client_id IS NULL;

-- One per-client opt-out per (phone, client) pair.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sms_opt_outs_phone_scope
  ON sms_opt_outs (phone_e164, scope_client_id)
  WHERE scope_client_id IS NOT NULL;

-- Lookup index for per-client checks (phone + scope).
CREATE INDEX IF NOT EXISTS idx_sms_opt_outs_phone_scope
  ON sms_opt_outs (phone_e164, scope_client_id);
