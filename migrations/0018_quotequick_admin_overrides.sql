-- Wave W-AI-2 — QuoteQuick admin-editable override tables.
--
-- Two sparse jsonb override tables layered on top of the code-default
-- catalogues:
--   - quotequick_template_overrides (templates in shared/templatePresets.ts)
--   - quotequick_trade_overrides    (trades in client/src/data/trades.ts)
--
-- Admins can override any subset of fields per id; existing calculators
-- referencing a template/trade are unaffected (calculator_settings.advanced
-- remains the live source for an individual calculator instance).
-- Soft-archive via the `archived` flag keeps referencing calculators
-- working even after an admin removes a template/trade from the catalogue.
--
-- Rows with `is_user_created: true` inside `overrides` represent
-- admin-authored templates/trades that have no code default — the full
-- config lives in the jsonb blob in that case.
--
-- Idempotent — re-running is a no-op.

/* ─── Template overrides ─── */
CREATE TABLE IF NOT EXISTS "quotequick_template_overrides" (
  "template_id"  TEXT PRIMARY KEY,
  "overrides"    JSONB NOT NULL,
  "archived"     BOOLEAN NOT NULL DEFAULT FALSE,
  "archived_at"  TIMESTAMP WITH TIME ZONE,
  "updated_by"   INTEGER,
  "updated_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "created_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "quotequick_template_overrides_archived_idx"
  ON "quotequick_template_overrides" ("archived");

/* ─── Trade overrides ─── */
CREATE TABLE IF NOT EXISTS "quotequick_trade_overrides" (
  "trade_id"     TEXT PRIMARY KEY,
  "overrides"    JSONB NOT NULL,
  "archived"     BOOLEAN NOT NULL DEFAULT FALSE,
  "archived_at"  TIMESTAMP WITH TIME ZONE,
  "updated_by"   INTEGER,
  "updated_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "created_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "quotequick_trade_overrides_archived_idx"
  ON "quotequick_trade_overrides" ("archived");
