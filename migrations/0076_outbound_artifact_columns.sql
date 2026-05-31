-- 0076_outbound_artifact_columns.sql
--
-- Artifact-first outbound: each approved prospect gets a real, personalized
-- local-visibility audit generated for THEIR business, hosted at a public
-- /audit/report/<uuid> link. We store the artifact reference + headline
-- findings on prospect_enrichment so the outbound sync worker can merge the
-- link + score into the cold email, and so a report VIEW can be detected as a
-- buy-signal. All columns are additive + nullable — no backfill, no data loss.

ALTER TABLE prospect_enrichment
  ADD COLUMN IF NOT EXISTS artifact_type         TEXT,           -- 'audit' (future: 'calculator')
  ADD COLUMN IF NOT EXISTS artifact_status       TEXT DEFAULT 'pending', -- pending | generated | failed | skipped
  ADD COLUMN IF NOT EXISTS artifact_ref_id       TEXT,           -- audit_reports.id (uuid)
  ADD COLUMN IF NOT EXISTS artifact_url          TEXT,           -- public /audit/report/<id> link
  ADD COLUMN IF NOT EXISTS artifact_score        INTEGER,        -- audit total score 0-100 (merge field)
  ADD COLUMN IF NOT EXISTS artifact_grade        TEXT,           -- audit letter grade A-F (merge field)
  ADD COLUMN IF NOT EXISTS artifact_headline     TEXT,           -- one-line finding for the cold email
  ADD COLUMN IF NOT EXISTS artifact_generated_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS artifact_error        TEXT,           -- last failure reason (if status=failed)
  ADD COLUMN IF NOT EXISTS artifact_viewed_at    TIMESTAMP,      -- first time the prospect opened their report (buy signal)
  ADD COLUMN IF NOT EXISTS artifact_view_count   INTEGER DEFAULT 0;

-- Worker picks prospects whose artifact hasn't been generated yet; index the
-- status so that scan stays cheap as the prospect table grows.
CREATE INDEX IF NOT EXISTS prospect_enrichment_artifact_status_idx
  ON prospect_enrichment(artifact_status);

-- View-signal lookup: report GET maps the viewed report uuid back to the
-- prospect_enrichment row via artifact_ref_id.
CREATE INDEX IF NOT EXISTS prospect_enrichment_artifact_ref_idx
  ON prospect_enrichment(artifact_ref_id);
