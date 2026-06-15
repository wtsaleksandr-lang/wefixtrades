-- P0-1: idempotency for audit follow-up emails.
--
-- The lead-capture path (auditRoutes POST /save-lead) enqueues a 4-email
-- follow-up sequence plus a Day-0 report email per submission. A double-
-- click or a client retry creates a SECOND audit_submissions row and a
-- SECOND full sequence — a real lead then receives the whole sequence
-- twice (4N follow-ups) plus duplicate reports.
--
-- This adds a UNIQUE index on (audit_submission_id, step) so the sequence
-- can be inserted with ON CONFLICT DO NOTHING: re-enqueuing the same
-- submission's steps is a no-op. The instant Day-0 report email is also
-- modeled as a follow-up row (step = 'day0'), so the same unique guard
-- makes the Day-0 send idempotent per submission too.
--
-- Additive + non-destructive: CREATE UNIQUE INDEX IF NOT EXISTS only.
-- Existing rows: legacy data has at most one row per (submission, step)
-- under normal single-send operation, so the index builds cleanly. If a
-- pre-existing duplicate ever blocked the build, the IF NOT EXISTS keeps
-- re-runs safe and the build would surface the conflict explicitly rather
-- than silently dropping data.

CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_followup_emails_submission_step
  ON audit_followup_emails (audit_submission_id, step);
