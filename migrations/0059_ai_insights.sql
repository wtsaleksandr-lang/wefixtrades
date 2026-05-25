-- 0059_ai_insights.sql
--
-- AI Insights (Wave 7) — bundled with MapGuard $99/$149.
--
-- Two tables:
--   ai_insights_cache             — 24h-TTL Claude-generated JSON per client
--   ai_insights_dismissed_actions — per-client dismissed action titles (hashed)
--
-- Additive, online DDL. Safe to re-run via IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS ai_insights_cache (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  result_json JSONB NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT now(),
  expires_at TIMESTAMP NOT NULL,
  model VARCHAR(60),
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_cache_client
  ON ai_insights_cache (client_id);

CREATE INDEX IF NOT EXISTS idx_ai_insights_cache_expires
  ON ai_insights_cache (expires_at);

CREATE TABLE IF NOT EXISTS ai_insights_dismissed_actions (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  action_title_hash VARCHAR(64) NOT NULL,
  action_title TEXT,
  dismissed_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_dismissed_client_hash
  ON ai_insights_dismissed_actions (client_id, action_title_hash);
