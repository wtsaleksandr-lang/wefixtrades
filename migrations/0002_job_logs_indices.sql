-- Phase A: admin system health + job monitoring
--
-- Adds indices that the new /admin/system endpoints query against.
-- Without them, "last run per job_name" and "failed in last 24h"
-- queries do a full sequential scan over a job_logs table that grows
-- by ~1.4k rows/day from per-minute workers alone.
--
-- Idempotent: safe to re-run.

BEGIN;

CREATE INDEX IF NOT EXISTS job_logs_job_name_started_at_idx
  ON job_logs (job_name, started_at DESC);

CREATE INDEX IF NOT EXISTS job_logs_status_idx
  ON job_logs (status);

COMMIT;
