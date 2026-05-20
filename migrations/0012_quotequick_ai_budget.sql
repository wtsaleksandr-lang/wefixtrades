-- Wave K — QuoteQuick editor AI assistant + budget enforcement.
--
-- Adds the per-user lifetime AI spend counters, the per-call spend log,
-- an admin-editable budget config table (global + per-tier overrides),
-- and an audit log capturing every config change.
--
-- All changes are additive. Defaults are populated so existing users
-- pre-dating Wave K count from $0 / 0 images.

/* ─── Users — cumulative spend + image counters ─── */
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ai_spend_usd" NUMERIC(10, 4) NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ai_images_used" INTEGER NOT NULL DEFAULT 0;

/* ─── Per-call spend log ─── */
-- One row per AI chat completion. The day column is the UTC calendar
-- day in YYYY-MM-DD form, indexed for "today's spend" lookups.
CREATE TABLE IF NOT EXISTS "ai_spend_log" (
  "id"             SERIAL PRIMARY KEY,
  "user_id"        INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "day"            VARCHAR(10) NOT NULL,
  "model"          VARCHAR(64) NOT NULL,
  "input_tokens"   INTEGER NOT NULL DEFAULT 0,
  "output_tokens"  INTEGER NOT NULL DEFAULT 0,
  "image_count"    INTEGER NOT NULL DEFAULT 0,
  "cost_usd"       NUMERIC(10, 6) NOT NULL DEFAULT 0,
  "created_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "ai_spend_log_user_day_idx"
  ON "ai_spend_log" ("user_id", "day");

CREATE INDEX IF NOT EXISTS "ai_spend_log_created_at_idx"
  ON "ai_spend_log" ("created_at");

/* ─── Budget config (global + per-tier) ─── */
-- One row per scope. `scope` is either `'global'` (the fall-back) or one
-- of `'tier_free' | 'tier_starter' | 'tier_pro' | 'tier_agency'`.
CREATE TABLE IF NOT EXISTS "ai_budget_config" (
  "id"                  SERIAL PRIMARY KEY,
  "scope"               VARCHAR(32) NOT NULL UNIQUE,
  "cap_lifetime_usd"    NUMERIC(10, 4) NOT NULL,
  "soft_warn_pct"       INTEGER NOT NULL,
  "per_call_max_usd"    NUMERIC(10, 4) NOT NULL,
  "daily_ceiling_usd"   NUMERIC(10, 4) NOT NULL,
  "image_lifetime_cap"  INTEGER NOT NULL,
  "updated_by"          INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Seed the global row with the spec defaults. ON CONFLICT keeps re-runs idempotent.
INSERT INTO "ai_budget_config"
  ("scope", "cap_lifetime_usd", "soft_warn_pct", "per_call_max_usd", "daily_ceiling_usd", "image_lifetime_cap")
VALUES
  ('global', 0.50, 80, 0.15, 0.20, 10)
ON CONFLICT ("scope") DO NOTHING;

/* ─── Audit log for budget config edits ─── */
CREATE TABLE IF NOT EXISTS "ai_budget_audit_log" (
  "id"          SERIAL PRIMARY KEY,
  "scope"       VARCHAR(32) NOT NULL,
  "admin_id"    INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "old_values"  JSONB,
  "new_values"  JSONB NOT NULL,
  "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "ai_budget_audit_log_scope_created_at_idx"
  ON "ai_budget_audit_log" ("scope", "created_at" DESC);
