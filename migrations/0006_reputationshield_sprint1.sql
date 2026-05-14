-- Sprint 1: ReputationShield readiness migration
--
-- Adds:
--   1. Indexes on hot query paths for reviews + review_requests + monitored_reviews
--      (dashboard would otherwise time out at >5k reviews/client)
--   2. review_request_suppression — per-client DNC list (parallel to prospects.do_not_contact)
--   3. monitored_reviews approval-workflow columns + review_response_edits audit table

-- ─── 1. Indexes ─────────────────────────────────────────────────────

-- reviews: list/filter/count by client + status + time
CREATE INDEX IF NOT EXISTS idx_reviews_client_id          ON reviews(client_id);
CREATE INDEX IF NOT EXISTS idx_reviews_client_created     ON reviews(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_client_platform    ON reviews(client_id, platform);
CREATE INDEX IF NOT EXISTS idx_reviews_client_reply_status ON reviews(client_id, reply_status);
CREATE INDEX IF NOT EXISTS idx_reviews_sentiment          ON reviews(sentiment);
CREATE INDEX IF NOT EXISTS idx_reviews_needs_reply        ON reviews(needs_reply) WHERE needs_reply = true;

-- review_requests: list by client, by status, plus delivery cron sweep
CREATE INDEX IF NOT EXISTS idx_review_requests_client_id     ON review_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_status        ON review_requests(status);
CREATE INDEX IF NOT EXISTS idx_review_requests_run_at        ON review_requests(run_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_review_requests_next_followup ON review_requests(next_followup_at) WHERE next_followup_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_review_requests_client_created ON review_requests(client_id, created_at DESC);

-- monitored_reviews: admin dashboard + posting queue
CREATE INDEX IF NOT EXISTS idx_monitored_reviews_client_id      ON monitored_reviews(client_id);
CREATE INDEX IF NOT EXISTS idx_monitored_reviews_client_created ON monitored_reviews(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitored_reviews_is_new         ON monitored_reviews(client_id, is_new) WHERE is_new = true;
CREATE INDEX IF NOT EXISTS idx_monitored_reviews_low_rating     ON monitored_reviews(client_id, rating) WHERE rating <= 2;
CREATE INDEX IF NOT EXISTS idx_monitored_reviews_unposted_draft ON monitored_reviews(client_id) WHERE draft_response IS NOT NULL AND posted_at IS NULL;


-- ─── 2. Customer suppression / DNC ─────────────────────────────────

CREATE TABLE IF NOT EXISTS review_request_suppression (
  id              SERIAL PRIMARY KEY,
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  customer_email  TEXT,
  customer_phone  VARCHAR(30),
  reason          TEXT,
  source          VARCHAR(40) NOT NULL DEFAULT 'manual',
  -- manual | customer_unsubscribe | bounce | complaint | admin_block
  suppressed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  metadata        JSONB,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  -- At least one of email or phone must be present
  CONSTRAINT review_suppression_target_required
    CHECK (customer_email IS NOT NULL OR customer_phone IS NOT NULL)
);

-- Lookup is always "is (client, email) or (client, phone) suppressed?"
CREATE UNIQUE INDEX IF NOT EXISTS idx_review_suppression_email
  ON review_request_suppression(client_id, lower(customer_email))
  WHERE customer_email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_review_suppression_phone
  ON review_request_suppression(client_id, customer_phone)
  WHERE customer_phone IS NOT NULL;


-- ─── 3. Approval workflow on monitored_reviews ────────────────────

ALTER TABLE monitored_reviews
  ADD COLUMN IF NOT EXISTS approval_status   VARCHAR(20) NOT NULL DEFAULT 'unreviewed',
  -- unreviewed | approved | rejected | auto_approved
  ADD COLUMN IF NOT EXISTS approved_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMP,
  ADD COLUMN IF NOT EXISTS approval_notes    TEXT,
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_monitored_reviews_pending_approval
  ON monitored_reviews(client_id)
  WHERE approval_status = 'unreviewed' AND draft_response IS NOT NULL;


-- ─── 4. Response edit audit ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS review_response_edits (
  id                   SERIAL PRIMARY KEY,
  monitored_review_id  INTEGER NOT NULL REFERENCES monitored_reviews(id) ON DELETE CASCADE,
  edited_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  edit_kind            VARCHAR(30) NOT NULL,
  -- ai_generated | human_edit | human_replace | approval | rejection | post_published
  old_text             TEXT,
  new_text             TEXT,
  reason               TEXT,
  metadata             JSONB,
  created_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_response_edits_review_id
  ON review_response_edits(monitored_review_id, created_at DESC);
