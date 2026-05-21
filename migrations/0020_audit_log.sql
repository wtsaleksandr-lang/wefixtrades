-- Wave W-AI-3c — General-purpose audit log.
--
-- A single append-only table tracks who did what to which entity, and
-- captures before/after JSON snapshots so admins can diff state changes.
-- Used initially by the QuoteQuick template + trade admin routes; designed
-- to be reused by any future admin surface (api_key rotations, user role
-- changes, etc.).
--
-- Rows are written fire-and-forget from request handlers (see
-- `server/lib/auditLog.ts`) and read via `GET /api/admin/audit-log` plus
-- the in-page <EntityAuditWidget> on entity detail pages.
--
-- Idempotent — re-running is a no-op.

/* ─── Audit log table ─── */
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id"            BIGSERIAL PRIMARY KEY,
  "actor_id"      TEXT,
  "actor_type"    TEXT NOT NULL DEFAULT 'admin',
  "action"        TEXT NOT NULL,
  "entity_type"   TEXT NOT NULL,
  "entity_id"     TEXT NOT NULL,
  "before"        JSONB,
  "after"         JSONB,
  "diff"          JSONB,
  "metadata"      JSONB,
  "ip"            TEXT,
  "user_agent"    TEXT,
  "created_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

/* ─── Indexes ─── */
-- Per-entity history (entity detail page widget + filtered reader UI).
CREATE INDEX IF NOT EXISTS "audit_log_entity_idx"
  ON "audit_log" ("entity_type", "entity_id", "created_at" DESC);

-- Per-actor activity (admin activity report).
CREATE INDEX IF NOT EXISTS "audit_log_actor_idx"
  ON "audit_log" ("actor_id", "created_at" DESC);

-- Global recency (default reader UI ordering).
CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx"
  ON "audit_log" ("created_at" DESC);
