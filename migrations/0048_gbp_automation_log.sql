-- 0047_gbp_automation_log.sql
--
-- Google Business Profile (GBP) daily automation — scaffold tables.
--
-- These tables back three crons that will activate the moment the
-- WeFixTrades-owned GBP listing is connected via the admin OAuth flow:
--
--   1. Daily auto-post (13:47 UTC) — drains gbp_post_queue, falls back
--      to a rotating template post when the queue is empty.
--   2. Hourly review monitoring (xx:23) — fetches reviews.list; new
--      reviewIds (not seen in gbp_seen_reviews) get logged + flagged.
--   3. Daily hours/services sync (05:37 UTC) — patches the GBP location
--      with the latest business_hours/special_hours from the primary
--      `clients` row.
--
-- All three crons no-op cleanly if no row exists in `oauth_tokens` for
-- provider='gbp' (the connect button hasn't been clicked yet).
--
-- Additive only: no existing tables touched.

-- ─── Post queue (drained daily) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gbp_post_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary         TEXT NOT NULL,
  topic_type      TEXT NOT NULL DEFAULT 'STANDARD',  -- STANDARD | EVENT | OFFER | ALERT
  language_code   TEXT NOT NULL DEFAULT 'en',
  call_to_action  JSONB,                              -- { actionType, url }
  media           JSONB,                              -- [{ mediaFormat, sourceUrl }]
  status          TEXT NOT NULL DEFAULT 'pending',   -- pending | posted | failed | skipped
  scheduled_for   TIMESTAMP WITH TIME ZONE,          -- NULL = next available run
  posted_at       TIMESTAMP WITH TIME ZONE,
  remote_post_id  TEXT,
  error           TEXT,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gbp_post_queue_status_scheduled_idx
  ON gbp_post_queue(status, scheduled_for);

-- ─── Automation log (append-only audit of every cron tick + API call) ─
CREATE TABLE IF NOT EXISTS gbp_automation_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job             TEXT NOT NULL,             -- 'daily_post' | 'review_monitor' | 'hours_sync'
  event_type      TEXT NOT NULL,             -- 'tick_start' | 'tick_ok' | 'tick_skipped' | 'post_created' | 'new_review' | 'hours_patched' | 'api_error'
  status          TEXT,                      -- 'ok' | 'error' | 'noop'
  reference_id    TEXT,                      -- queued post id, review id, or location name
  http_status     INTEGER,
  message         TEXT,
  payload         JSONB,                     -- request/response summary (no tokens)
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gbp_automation_log_job_created_idx
  ON gbp_automation_log(job, created_at DESC);

-- ─── Seen-reviews fingerprint (so hourly cron only fires on net-new) ──
CREATE TABLE IF NOT EXISTS gbp_seen_reviews (
  review_id       TEXT PRIMARY KEY,          -- GBP review name / id
  location_name   TEXT NOT NULL,
  star_rating     INTEGER,
  first_seen_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gbp_seen_reviews_location_idx
  ON gbp_seen_reviews(location_name, first_seen_at DESC);
