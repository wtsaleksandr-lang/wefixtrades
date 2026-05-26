-- 0065_webcare_action_log.sql
--
-- Wave 31 — WebCare UI upgrade. Adds the Maintenance Log Inbox storage
-- (`webcare_action_log`). This is the single biggest UX win per the
-- competitive research — no competitor exposes live in-app actions.
--
-- Schema mirrors the Drizzle definition in shared/schemas/adminCrm.ts.
-- Safe to re-run (IF NOT EXISTS everywhere).

CREATE TABLE IF NOT EXISTS webcare_action_log (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL,
  client_service_id INTEGER,
  event_type VARCHAR(32) NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'info',
  technical_summary TEXT NOT NULL,
  plain_language_summary TEXT NOT NULL,
  expanded_detail JSONB,
  recorded_at TIMESTAMP NOT NULL DEFAULT now(),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webcare_action_log_client_recorded
  ON webcare_action_log (client_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_webcare_action_log_event_type
  ON webcare_action_log (event_type);
