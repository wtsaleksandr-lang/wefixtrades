-- Wave BA-7 — shared-files retention sweep + admin override.
--
-- Customer-shared files (voicemail recordings, multimodal-chat image
-- attachments, future inbound email attachments + quote-flow photo uploads)
-- accumulate without bound. Default retention is 180 days unless an admin
-- pins a specific file via the retention_overrides table.
--
-- This migration:
--   1. Creates retention_overrides — one row per pinned (table, id) pair.
--   2. Adds a deleted_at column to every covered file-bearing table so the
--      retention sweep can soft-delete rows. Soft delete only this wave;
--      hard blob purge ships in BA-7b.
--
-- The sweep cron (`shared_files_retention_sweep`, daily 04:15 UTC, wired in
-- server/jobs/scheduler.ts) consults retention_overrides before marking
-- anything deleted, so pinned rows are skipped even when older than 180
-- days. Re-running the sweep on the same day is idempotent because rows
-- already carrying a deleted_at are excluded from the candidate set.

CREATE TABLE IF NOT EXISTS retention_overrides (
  id SERIAL PRIMARY KEY,
  -- Name of the source table this override applies to, e.g.
  -- 'voicemails', 'assistant_messages'. Kept as varchar (not enum) so
  -- new tables can be added in BA-7b without another migration.
  file_table VARCHAR(64) NOT NULL,
  -- Stringified primary key from the source table. Kept as varchar so
  -- bigint / uuid / int sources all share the same column shape.
  file_id VARCHAR(64) NOT NULL,
  -- When the file becomes eligible for the sweep again. NULL = pinned
  -- indefinitely (never sweeps until the override is deleted).
  retained_until TIMESTAMP,
  reason TEXT NOT NULL DEFAULT '',
  created_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (file_table, file_id)
);

CREATE INDEX IF NOT EXISTS retention_overrides_table_idx
  ON retention_overrides (file_table);
CREATE INDEX IF NOT EXISTS retention_overrides_retained_until_idx
  ON retention_overrides (retained_until);

-- Soft-delete columns on covered tables. The sweep stamps these; blob
-- purge (BA-7b) reads them later.
ALTER TABLE voicemails
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

ALTER TABLE assistant_messages
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Indexes scoped to non-deleted rows so the sweep's candidate query stays
-- fast as historical soft-deleted rows pile up.
CREATE INDEX IF NOT EXISTS voicemails_retention_idx
  ON voicemails (created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assistant_messages_retention_idx
  ON assistant_messages (created_at) WHERE deleted_at IS NULL AND attachments IS NOT NULL;
