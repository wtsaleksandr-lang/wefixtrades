-- 0062_alert_actions_log.sql
--
-- Wave 12D — Admin AI Diagnosis Panel (Phase 1).
--
-- Every "Run fix" button click on the System Alerts page is recorded here
-- for audit. Action names come from a server-side whitelist
-- (see server/services/alertFixActions.ts); the AI Copilot can SUGGEST
-- fixes but the admin operator clicks the button explicitly — no LLM-
-- driven writes in Phase 1.
--
-- Additive, online DDL. Safe to re-run via IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS alert_actions_log (
  id SERIAL PRIMARY KEY,
  alert_id INTEGER NOT NULL,
  admin_user_id INTEGER,
  action TEXT NOT NULL,
  params JSONB,
  result JSONB,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  error_message TEXT,
  executed_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_actions_log_alert_id
  ON alert_actions_log (alert_id);

CREATE INDEX IF NOT EXISTS idx_alert_actions_log_executed_at
  ON alert_actions_log (executed_at DESC);
