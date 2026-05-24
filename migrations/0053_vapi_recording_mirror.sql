-- 0053_vapi_recording_mirror.sql
--
-- Vapi recording mirror: Vapi-hosted call recordings expire after ~30
-- days, which silently 404s the admin UI's <audio> player and any
-- downstream tooling that referenced the URL. To kill the expiry hole
-- we mirror each recording into Replit Object Storage shortly after the
-- call and persist the object key on the call-log row.
--
-- Two columns on tradeline_call_log:
--   * mirrored_object_key — TEXT, NULL until the cron has mirrored the
--     recording. Format: 'vapi-recordings/<client_id>/<call_id>.mp3'.
--   * mirrored_at         — TIMESTAMPTZ, NULL until mirrored. Stamped by
--     the cron on successful upload.
--
-- Partial index on (created_at) WHERE recording_url IS NOT NULL AND
-- mirrored_at IS NULL — keeps the cron's SELECT cheap: it only scans
-- rows that still need work. Drops the index entries automatically on
-- update once mirrored_at is set.
--
-- Additive, online DDL. Safe to add to a populated table; no backfill
-- needed (the cron will pick up the backlog inside the 25-day window
-- on subsequent ticks).

ALTER TABLE tradeline_call_log
  ADD COLUMN IF NOT EXISTS mirrored_object_key TEXT;

ALTER TABLE tradeline_call_log
  ADD COLUMN IF NOT EXISTS mirrored_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tradeline_call_log_mirror_pending
  ON tradeline_call_log (created_at)
  WHERE recording_url IS NOT NULL AND mirrored_at IS NULL;
