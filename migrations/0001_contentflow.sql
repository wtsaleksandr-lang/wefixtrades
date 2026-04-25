-- ContentFlow Sprint 1 migration
--
-- Adds the kernel tables that sit between generation and publishing:
--   1. content_drafts     — unified draft record across surfaces
--   2. content_approvals  — append-only approval audit log
--   3. content_assets     — client media library
-- And adds nullable back-reference columns on the surface tables:
--   4. socialsync_posts.content_draft_id
--   5. rankflow_tasks.content_draft_id
--
-- Idempotent: safe to re-run. Uses IF NOT EXISTS where supported.
-- Non-destructive: no existing data is touched or altered.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. content_drafts
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_drafts (
  id                         SERIAL PRIMARY KEY,
  client_id                  INTEGER NOT NULL REFERENCES clients(id),
  client_service_id          INTEGER REFERENCES client_services(id),
  kind                       VARCHAR(30) NOT NULL,
  surface                    VARCHAR(30) NOT NULL,
  title                      TEXT,
  body                       TEXT,
  excerpt                    TEXT,
  target_platform            VARCHAR(30),
  target_url                 TEXT,
  metadata                   JSONB,
  quality_score              INTEGER,
  quality_notes              JSONB,
  status                     VARCHAR(30) NOT NULL DEFAULT 'draft',
  auto_approved              BOOLEAN NOT NULL DEFAULT FALSE,
  requires_admin_review      BOOLEAN NOT NULL DEFAULT FALSE,
  requires_client_review     BOOLEAN NOT NULL DEFAULT FALSE,
  admin_approved_at          TIMESTAMP,
  admin_approved_by          INTEGER REFERENCES users(id),
  client_approved_at         TIMESTAMP,
  rejected_at                TIMESTAMP,
  rejection_reason           TEXT,
  linked_social_post_id      INTEGER,
  linked_task_id             INTEGER,
  generation_cost_micro_usd  INTEGER,
  created_by                 VARCHAR(20) NOT NULL DEFAULT 'system',
  created_at                 TIMESTAMP DEFAULT NOW(),
  updated_at                 TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_drafts_client_status_idx
  ON content_drafts (client_id, status);
CREATE INDEX IF NOT EXISTS content_drafts_surface_status_idx
  ON content_drafts (surface, status);
CREATE UNIQUE INDEX IF NOT EXISTS content_drafts_linked_social_uidx
  ON content_drafts (linked_social_post_id)
  WHERE linked_social_post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS content_drafts_linked_task_uidx
  ON content_drafts (linked_task_id)
  WHERE linked_task_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. content_approvals
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_approvals (
  id          SERIAL PRIMARY KEY,
  draft_id    INTEGER NOT NULL REFERENCES content_drafts(id),
  actor_type  VARCHAR(20) NOT NULL,
  actor_id    INTEGER,
  action      VARCHAR(30) NOT NULL,
  notes       TEXT,
  metadata    JSONB,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_approvals_draft_idx
  ON content_approvals (draft_id, created_at);

-- ─────────────────────────────────────────────────────────────
-- 3. content_assets
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_assets (
  id          SERIAL PRIMARY KEY,
  client_id   INTEGER NOT NULL REFERENCES clients(id),
  source      VARCHAR(30) NOT NULL,
  url         TEXT NOT NULL,
  public_url  TEXT,
  mime_type   VARCHAR(50),
  width       INTEGER,
  height      INTEGER,
  alt_text    TEXT,
  metadata    JSONB,
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_assets_client_source_idx
  ON content_assets (client_id, source);

-- ─────────────────────────────────────────────────────────────
-- 4. socialsync_posts.content_draft_id (back-reference, nullable)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE socialsync_posts
  ADD COLUMN IF NOT EXISTS content_draft_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'socialsync_posts'
      AND constraint_name = 'socialsync_posts_content_draft_id_fkey'
  ) THEN
    ALTER TABLE socialsync_posts
      ADD CONSTRAINT socialsync_posts_content_draft_id_fkey
      FOREIGN KEY (content_draft_id)
      REFERENCES content_drafts(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 5. rankflow_tasks.content_draft_id (back-reference, nullable)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE rankflow_tasks
  ADD COLUMN IF NOT EXISTS content_draft_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'rankflow_tasks'
      AND constraint_name = 'rankflow_tasks_content_draft_id_fkey'
  ) THEN
    ALTER TABLE rankflow_tasks
      ADD CONSTRAINT rankflow_tasks_content_draft_id_fkey
      FOREIGN KEY (content_draft_id)
      REFERENCES content_drafts(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 6. FK constraints on content_drafts forward links
--    (deferred here so the surface tables exist first — they do,
--     but we add them separately so the contentflow block can be
--     read/maintained as a single unit above.)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'content_drafts'
      AND constraint_name = 'content_drafts_linked_social_post_id_fkey'
  ) THEN
    ALTER TABLE content_drafts
      ADD CONSTRAINT content_drafts_linked_social_post_id_fkey
      FOREIGN KEY (linked_social_post_id)
      REFERENCES socialsync_posts(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'content_drafts'
      AND constraint_name = 'content_drafts_linked_task_id_fkey'
  ) THEN
    ALTER TABLE content_drafts
      ADD CONSTRAINT content_drafts_linked_task_id_fkey
      FOREIGN KEY (linked_task_id)
      REFERENCES rankflow_tasks(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
