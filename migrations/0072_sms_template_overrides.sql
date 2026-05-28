-- 0072_sms_template_overrides.sql
--
-- Wave 82 — per-tenant overrides for the central SMS template registry.
--
-- The registry itself (`shared/sms/templateRegistry.ts`) ships in code with
-- defaults for every template id (bookflow.confirmation, quotequick.quote_ready,
-- reputation.review_request, tradeline.after_hours_apology, etc). This table
-- lets a trade tenant override:
--
--   - `enabled`        toggle the send on/off (resolver refuses the toggle
--                      when the registry marks the template as non-disable-able,
--                      e.g. deposit-receipt / first-touch carrier-compliance sends)
--   - `body_override`  swap the wording (NULL = use registry default)
--
-- Wave 82 ships the registry + resolver + portal API only. Wave 83 owns the
-- frontend settings UI; users start editing rows here once that lands.
--
-- All additive + IF NOT EXISTS for re-run safety. Defaults: enabled=true
-- (no behaviour change for tenants without a row), body_override=NULL
-- (resolver falls back to the registry default).
--
-- `clients.id` is a serial (integer) in this codebase, so this FK chain is
-- integer-typed — not the uuid the original Wave 82 plan drafted.

CREATE TABLE IF NOT EXISTS sms_template_overrides (
  id            serial PRIMARY KEY,
  client_id     integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  template_id   text NOT NULL,
  enabled       boolean NOT NULL DEFAULT true,
  body_override text,
  updated_by    integer REFERENCES users(id),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_template_overrides_client_template_key
    UNIQUE (client_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_sms_template_overrides_client
  ON sms_template_overrides (client_id);
