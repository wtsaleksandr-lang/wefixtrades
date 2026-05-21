-- Wave AJ-2 — API platform foundation.
--
-- Tables that back the public API platform for WeFixTrades tools.
-- Phase 1 of a multi-phase rollout: this PR ships the schemas + auth
-- middleware + admin/portal management endpoints. Stripe billing, the
-- customer-facing UIs, and the actual public API endpoints land in
-- follow-up PRs.
--
-- Security:
--   - api_keys.hash is the SHA-256 of the plaintext key. The plaintext
--     is shown to the user EXACTLY ONCE at creation/rotation.
--   - api_keys.prefix is the first 12 chars of the plaintext, persisted
--     for human-friendly UI rendering (safe to display).
--
-- Indexing:
--   - api_keys.hash unique — used by the auth middleware to look up
--     the key from the Authorization header.
--   - api_usage_logs (key_id, created_at) + (user_id, created_at)
--     composite indexes carry the common dashboard queries.
--   - api_subscriptions.user_id unique — one active subscription per
--     user for Phase 1. Relax later if upgrade-in-flight is needed.

CREATE TABLE IF NOT EXISTS "api_keys" (
  "id"            text PRIMARY KEY NOT NULL,
  "user_id"       integer NOT NULL,
  "name"          text NOT NULL,
  "prefix"        varchar(24) NOT NULL,
  "hash"          varchar(64) NOT NULL,
  "tier"          varchar(30) NOT NULL DEFAULT 'free',
  "status"        varchar(20) NOT NULL DEFAULT 'active',
  "last_used_at"  timestamp,
  "total_calls"   integer NOT NULL DEFAULT 0,
  "created_at"    timestamp NOT NULL DEFAULT now(),
  "expires_at"    timestamp,
  "metadata"      jsonb
);

CREATE TABLE IF NOT EXISTS "api_subscriptions" (
  "id"                     text PRIMARY KEY NOT NULL,
  "user_id"                integer NOT NULL,
  "tier"                   varchar(30) NOT NULL DEFAULT 'free',
  "status"                 varchar(20) NOT NULL DEFAULT 'trial',
  "stripe_subscription_id" text,
  "stripe_customer_id"     text,
  "current_period_start"   timestamp NOT NULL DEFAULT now(),
  "current_period_end"     timestamp NOT NULL,
  "monthly_call_quota"     integer NOT NULL DEFAULT 0,
  "monthly_calls_used"     integer NOT NULL DEFAULT 0,
  "reset_at"               timestamp NOT NULL,
  "created_at"             timestamp NOT NULL DEFAULT now(),
  "updated_at"             timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "api_usage_logs" (
  "id"           bigserial PRIMARY KEY,
  "key_id"       text NOT NULL,
  "user_id"      integer NOT NULL,
  "endpoint"     text NOT NULL,
  "method"       varchar(10) NOT NULL,
  "status_code"  integer NOT NULL,
  "response_ms"  integer NOT NULL,
  "bytes_out"    integer,
  "ip"           varchar(45),
  "user_agent"   text,
  "created_at"   timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "api_rate_limit_buckets" (
  "key_id"               text PRIMARY KEY NOT NULL,
  "tokens"               integer NOT NULL,
  "refill_rate_per_sec"  integer NOT NULL,
  "capacity"             integer NOT NULL,
  "last_refill_at"       timestamp NOT NULL DEFAULT now()
);

-- Foreign keys. Cascade so deleting a user cleans up everything they
-- owned (keys, subscription, usage logs, buckets).
DO $$ BEGIN
  ALTER TABLE "api_keys"
    ADD CONSTRAINT "api_keys_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "api_subscriptions"
    ADD CONSTRAINT "api_subscriptions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "api_usage_logs"
    ADD CONSTRAINT "api_usage_logs_key_id_api_keys_id_fk"
    FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id")
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "api_usage_logs"
    ADD CONSTRAINT "api_usage_logs_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "api_rate_limit_buckets"
    ADD CONSTRAINT "api_rate_limit_buckets_key_id_api_keys_id_fk"
    FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id")
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_api_keys_hash"
  ON "api_keys" USING btree ("hash");
CREATE INDEX IF NOT EXISTS "idx_api_keys_user"
  ON "api_keys" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_api_keys_status"
  ON "api_keys" USING btree ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_api_subscriptions_user"
  ON "api_subscriptions" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_api_usage_key_created"
  ON "api_usage_logs" USING btree ("key_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_api_usage_user_created"
  ON "api_usage_logs" USING btree ("user_id", "created_at");
