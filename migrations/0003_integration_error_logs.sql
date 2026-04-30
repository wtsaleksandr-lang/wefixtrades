-- Phase 3 — integration_error_logs table.
--
-- Central log of integration-layer failures (webhooks, third-party API
-- calls, queue/publish errors). Read by the admin system-health
-- endpoint. Writers in server/services/integrationErrors.ts sanitize
-- all inputs before insertion — no tokens, no auth headers, no full
-- request bodies.
--
-- Idempotent: safe to re-run. Non-destructive: no existing data is
-- touched or altered.

BEGIN;

CREATE TABLE IF NOT EXISTS integration_error_logs (
  id                SERIAL PRIMARY KEY,
  integration_name  VARCHAR(64)  NOT NULL,
  area              VARCHAR(64),
  severity          VARCHAR(16)  NOT NULL,
  message           TEXT         NOT NULL,
  error_code        VARCHAR(64),
  status_code       INTEGER,
  request_id        VARCHAR(128),
  client_id         INTEGER,
  service_id        INTEGER,
  metadata          JSONB,
  created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMP
);

CREATE INDEX IF NOT EXISTS integration_error_logs_integration_idx
  ON integration_error_logs (integration_name, created_at DESC);

CREATE INDEX IF NOT EXISTS integration_error_logs_severity_idx
  ON integration_error_logs (severity, created_at DESC);

CREATE INDEX IF NOT EXISTS integration_error_logs_created_at_idx
  ON integration_error_logs (created_at DESC);

COMMIT;
