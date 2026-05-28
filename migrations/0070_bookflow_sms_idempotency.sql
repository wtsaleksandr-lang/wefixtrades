-- 0070_bookflow_sms_idempotency.sql
--
-- Wave 80 — BookFlow homeowner SMS lifecycle idempotency columns.
--
-- Before Wave 80, BookFlow had a single homeowner SMS: the T-24h
-- reminder, idempotency-flagged via metadata.t24h_sms_sent_at on the
-- bookflow_appointments row. Wave 80 adds four more flows:
--
--   1. Booking confirmation       — immediately on createAppointment
--   2. Day-of reminder            — ~3-4h before start_time
--   3. Post-appointment thank-you — ~30 min after status='completed'
--   4. No-show recovery           — 1-2h after a no-show
--
-- (ETA "on the way" SMS already exists at the mobileApiRoutes /notify-eta
-- endpoint and is wave-77/79 era; it is not appointment-row-tracked
-- because the trade can fire it multiple times per appointment.)
--
-- Each new flow gets its own *_sent_at column so the worker can do a
-- cheap `WHERE col IS NULL` filter rather than parsing jsonb. We keep
-- the legacy metadata.t24h_sms_sent_at flag untouched — back-compat;
-- the T-24h worker still writes/reads it.
--
-- All additive + IF NOT EXISTS for re-run safety. Defaults are NULL
-- (== "not yet sent"). No backfill — historical rows that already had
-- T-24h reminders don't retroactively get the new flows.

ALTER TABLE bookflow_appointments
  ADD COLUMN IF NOT EXISTS confirmation_sent_at    timestamp,
  ADD COLUMN IF NOT EXISTS day_of_reminder_sent_at timestamp,
  ADD COLUMN IF NOT EXISTS post_thank_you_sent_at  timestamp,
  ADD COLUMN IF NOT EXISTS no_show_recovery_sent_at timestamp,
  ADD COLUMN IF NOT EXISTS completed_at            timestamp;

-- Partial indexes to keep the worker scans cheap. Each worker queries
-- the universe of rows where its sent_at flag is NULL and the
-- appointment is in a window (or status) that makes it eligible. A
-- partial index keyed on (start_time) / (completed_at) and filtering
-- on `WHERE *_sent_at IS NULL` lets Postgres pick the right slice
-- without scanning the full appointments table.

CREATE INDEX IF NOT EXISTS idx_bookflow_appt_day_of_pending
  ON bookflow_appointments (start_time)
  WHERE day_of_reminder_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bookflow_appt_thank_you_pending
  ON bookflow_appointments (completed_at)
  WHERE post_thank_you_sent_at IS NULL AND status = 'completed';

CREATE INDEX IF NOT EXISTS idx_bookflow_appt_no_show_pending
  ON bookflow_appointments (start_time)
  WHERE no_show_recovery_sent_at IS NULL AND status NOT IN ('completed', 'cancelled');
