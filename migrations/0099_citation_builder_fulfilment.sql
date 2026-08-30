-- 0099_citation_builder_fulfilment.sql
--
-- Citation Builder — the fulfilment record the product never had.
--
-- BEFORE THIS MIGRATION: Citation Builder charged $79 / $179 / $299 one-time,
-- promised "Listed within 7 business days" and a "Status dashboard +
-- completion report", and did none of it. The Stripe webhook inserted one
-- citation_builder_submissions row at status='pending'. No admin route, no
-- worker and no cron ever moved a row off 'pending'. The two written email
-- helpers (server/lib/citationBuilder{Progress,Completion}Email.ts) had zero
-- callers. citation_builder_submissions is EMPTY in production — nobody was
-- harmed; this is the fix that lands before the first purchase.
--
-- WHAT THIS ADDS
--
--   citation_builder_directory_tasks — one row per (order x directory). This
--     is the ONLY record of work performed. An operator marks each directory
--     submitted / live / rejected / not_applicable with a note and, for a
--     live listing, the URL. `live` is the only state the customer may ever
--     see described as a listing.
--
--   citation_builder_submissions.started_at — stamped when an operator opens
--     the order and the task rows are cut.
--
--   citation_builder_submissions.progress_email_sent_at
--   citation_builder_submissions.completion_email_sent_at — idempotency
--     stamps. Each customer email may fire at most once per order, only from
--     the fulfilment service, and only off recorded task rows. There is
--     deliberately NO column a timer or a cron could flip to make an email
--     go out; the send is a consequence of an operator writing a task row.
--
-- WHY A SEPARATE TABLE RATHER THAN AN ADMIN-EDITABLE COUNTER
--
-- citation_builder_submissions.directories_submitted_count already existed
-- and an admin PATCH could have simply set it. That reintroduces the exact
-- defect class this repo has spent several PRs removing (rankflowWorker's
-- canned "[AI-generated] Task completed", AdFlow's synthetic metrics,
-- sitelaunch's setTimeout that flipped ssl_status to 'active'): a number a
-- human types is indistinguishable from a number a human earned. Both count
-- columns are now MIRRORS recomputed from these task rows, and no route
-- accepts either from a request body. The guard
-- `npm run check:citation-builder-fulfilment` fails CI if that changes.
--
-- Additive only: one new table, three indexes, three new nullable columns.
-- Every statement is IF NOT EXISTS. No DROP / RENAME / TRUNCATE / DELETE
-- anywhere, so the file is safe to re-run on every boot.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS citation_builder_directory_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID NOT NULL REFERENCES citation_builder_submissions(id),
  directory_id    VARCHAR(64) NOT NULL,
  directory_name  VARCHAR(160) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'not_started',
  listing_url     TEXT,
  note            TEXT,
  submitted_at    TIMESTAMP,
  live_at         TIMESTAMP,
  -- Operator audit stamp. Deliberately NOT a foreign key into users: deleting
  -- a former staff account must never block or rewrite a customer's
  -- fulfilment record. Same reasoning as audit_log.actor_id.
  updated_by      INTEGER,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cb_dir_tasks_submission
  ON citation_builder_directory_tasks (submission_id);
CREATE INDEX IF NOT EXISTS idx_cb_dir_tasks_status
  ON citation_builder_directory_tasks (status);

-- One task per directory per order. The assignment step is idempotent and
-- relies on this constraint, so re-opening an order can never duplicate the
-- checklist or double-count progress.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cb_dir_tasks_submission_directory
  ON citation_builder_directory_tasks (submission_id, directory_id);

ALTER TABLE citation_builder_submissions
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;
ALTER TABLE citation_builder_submissions
  ADD COLUMN IF NOT EXISTS progress_email_sent_at TIMESTAMP;
ALTER TABLE citation_builder_submissions
  ADD COLUMN IF NOT EXISTS completion_email_sent_at TIMESTAMP;
