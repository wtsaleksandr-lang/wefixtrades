-- Wave AJ-6 — public API v1 webhook subscriptions.
--
-- External developers using the QuoteQuick public API can subscribe to
-- events (submission.created, calculator.updated, etc.) and we will
-- POST a signed payload to their `url` when the event fires.
--
-- Security model:
--   - `secret` is the HMAC signing secret. We persist the PLAINTEXT so
--     the dispatcher can sign outbound payloads. The secret is shown to
--     the user EXACTLY ONCE at creation; subsequent GETs redact it.
--   - One row per (user_id, url). Re-subscribing rotates events.
--   - Soft delete via status = 'revoked' so historical deliveries can
--     still be audited.
--
-- Tier gating happens in the route layer (POST /api/v1/webhooks reads
-- ApiTier.webhookQuota); the DB itself does not enforce a per-user cap.

CREATE TABLE IF NOT EXISTS "api_webhooks" (
  "id"         text PRIMARY KEY NOT NULL,
  "user_id"    integer NOT NULL,
  "url"        text NOT NULL,
  "secret"     varchar(80) NOT NULL,
  "events"     jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status"     varchar(20) NOT NULL DEFAULT 'active',
  "last_delivery_at"     timestamp,
  "last_delivery_status" integer,
  "total_deliveries"     integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "api_webhooks"
    ADD CONSTRAINT "api_webhooks_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_api_webhooks_user"
  ON "api_webhooks" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_api_webhooks_status"
  ON "api_webhooks" USING btree ("status");
