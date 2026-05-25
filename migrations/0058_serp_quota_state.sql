-- 0058_serp_quota_state.sql
--
-- SERP provider quota state (Wave 6.5). One row per provider id in the
-- multi-provider SERP orchestrator (Google CSE, Serper, Brave, ScaleSerp,
-- SerpStack, DataForSEO). Persisted so a process restart can't reset the
-- monthly counter mid-month and silently over-spend a free tier.
--
-- Additive, online DDL. Safe to re-run via IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS serp_quota_state (
  id TEXT PRIMARY KEY,
  monthly_count INTEGER NOT NULL DEFAULT 0,
  monthly_limit INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMP NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP,
  last_error TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS serp_quota_state_id_uq
  ON serp_quota_state (id);
