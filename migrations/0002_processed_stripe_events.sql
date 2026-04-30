-- Stripe billing Phase 1 — webhook idempotency table.
--
-- Adds processed_stripe_events. Each successfully-handled Stripe webhook
-- event is recorded here so duplicate deliveries are short-circuited at
-- the top of the webhook handler. Insertion happens AFTER the per-event
-- handler completes; failed handlers leave no row behind so Stripe can
-- retry normally.
--
-- Idempotent: safe to re-run. Uses IF NOT EXISTS.
-- Non-destructive: no existing data is touched or altered.

BEGIN;

CREATE TABLE IF NOT EXISTS processed_stripe_events (
  id              SERIAL PRIMARY KEY,
  stripe_event_id TEXT        NOT NULL UNIQUE,
  event_type      VARCHAR(64),
  processed_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
  metadata        JSONB
);

CREATE INDEX IF NOT EXISTS idx_processed_stripe_events_processed_at
  ON processed_stripe_events (processed_at DESC);

COMMIT;
