-- 0067_ai_action_audit_log.sql
--
-- Wave 34 — Universal AI-action-with-approval audit log.
--
-- Backs the central dispatcher in server/services/aiActions/dispatcher.ts.
-- Every action attempted via the universal `POST /api/ai-actions/dispatch`
-- endpoint (and every legacy per-product `/api/portal/<product>/run-action`
-- call, since those now delegate to the dispatcher) writes one row to this
-- table — success OR failure.
--
-- The existing per-product logs continue to populate too (alert_actions_log
-- for admin alerts, webcare_action_log for WebCare maintenance feed). This
-- new table is the *cross-product* audit trail Alex asked for so we can
-- answer "every AI action the customer or admin approved in May" without
-- joining five different tables.
--
-- Additive, online DDL. Safe to re-run via IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS ai_action_audit_log (
  id SERIAL PRIMARY KEY,
  client_id INTEGER,                        -- nullable for admin-context system actions
  product VARCHAR(48) NOT NULL,
  context VARCHAR(16) NOT NULL,             -- 'portal' | 'admin'
  action_key VARCHAR(96) NOT NULL,
  params JSONB,                             -- sanitised (no secrets) snapshot of submitted params
  result_payload JSONB,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  error_message TEXT,
  triggered_by VARCHAR(24) NOT NULL DEFAULT 'user_click',  -- 'user_click' | 'auto_approved'
  user_id INTEGER,                          -- whoever clicked (customer OR admin)
  recommendation_id VARCHAR(200),           -- the originating AI recommendation, when applicable
  recorded_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_action_audit_log_client_recorded
  ON ai_action_audit_log (client_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_action_audit_log_product
  ON ai_action_audit_log (product, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_action_audit_log_action_key
  ON ai_action_audit_log (action_key);
CREATE INDEX IF NOT EXISTS idx_ai_action_audit_log_recorded_at
  ON ai_action_audit_log (recorded_at DESC);
