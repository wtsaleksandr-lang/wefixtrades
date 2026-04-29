-- SiteLaunch / WebFix / WebCare — Phase A foundation
--
-- Adds fulfillment workflow extensions:
--   1. fulfillment_tasks.deliverables          (jsonb[])
--      fulfillment_tasks.revision_count        (int)
--      fulfillment_tasks.revision_notes        (jsonb[])
--      fulfillment_tasks.approval_required_from (varchar)
--      (status varchar already permits new values: assigned | qa_review | revision_required)
--   2. service_task_templates.sla_days         (int, default 3)
--   3. suppliers.current_capacity              (int, default 0)
--      suppliers.max_capacity                  (int, default 5)
--
-- Idempotent: safe to re-run. ADD COLUMN IF NOT EXISTS used throughout.
-- Non-destructive: existing rows backfilled with column defaults.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. fulfillment_tasks — workflow extensions
-- ─────────────────────────────────────────────────────────────
ALTER TABLE fulfillment_tasks
  ADD COLUMN IF NOT EXISTS deliverables JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS revision_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revision_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approval_required_from VARCHAR(20);

-- ─────────────────────────────────────────────────────────────
-- 2. service_task_templates.sla_days
-- ─────────────────────────────────────────────────────────────
ALTER TABLE service_task_templates
  ADD COLUMN IF NOT EXISTS sla_days INTEGER NOT NULL DEFAULT 3;

-- ─────────────────────────────────────────────────────────────
-- 3. suppliers — capacity tracking
-- ─────────────────────────────────────────────────────────────
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS current_capacity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_capacity     INTEGER NOT NULL DEFAULT 5;

COMMIT;
