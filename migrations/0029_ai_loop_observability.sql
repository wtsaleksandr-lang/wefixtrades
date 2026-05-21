-- Wave W-BA-0 — multi-step agent loop observability.
--
-- The agent loop fires N Anthropic calls per user request (read state →
-- decide → execute → verify → respond). To keep the existing ai_usage_logs
-- table as the single observability source, we add two columns that join
-- the per-call rows into one logical "loop run":
--
--   loop_run_id — UUID shared by every call within a single loop. Used by
--                 the future admin trace view to render the whole chain.
--   step_index  — 0-based ordinal within the loop.
--
-- Both are nullable so existing single-call rows (and any caller that does
-- not run inside a loop) keep working unchanged. The agent loop populates
-- them via the metadata column today and writes the dedicated columns when
-- they exist — schema-additive only.

ALTER TABLE "ai_usage_logs"
  ADD COLUMN IF NOT EXISTS "loop_run_id" text,
  ADD COLUMN IF NOT EXISTS "step_index"  integer;

CREATE INDEX IF NOT EXISTS "ai_usage_logs_loop_idx"
  ON "ai_usage_logs" ("loop_run_id");
