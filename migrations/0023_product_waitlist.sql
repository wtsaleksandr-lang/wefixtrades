-- Wave W-AN-2 — Coming Soon waitlist capture for products blocked on
-- platform approvals (SocialSync = Meta App Review, ReputationShield =
-- Meta App Review, MapGuard = GBP API verification + 60-day GBP
-- account-age window). These three products cannot ship at the
-- 2026-07-15 launch but their marketing pages must still convert
-- interested trades. A "Coming Soon" banner + per-product waitlist form
-- captures email + optional phone/business so Alex can manually invite
-- early-access users once each platform clears.
--
-- One row per signup, one waitlist per (product_slug, email) — unique
-- so resubmits don't duplicate. Slug is free-form text (not an enum) to
-- avoid coupling to the product list; the API validates the slug
-- against known product configs.

CREATE TABLE IF NOT EXISTS "product_waitlist" (
  "id" bigserial PRIMARY KEY,
  "product_slug" text NOT NULL,
  "email" text NOT NULL,
  "phone" text,
  "business_name" text,
  "source" text,
  "ip" text,
  "user_agent" text,
  "notified_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "product_waitlist_slug_idx"
  ON "product_waitlist" ("product_slug", "created_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "product_waitlist_email_slug_idx"
  ON "product_waitlist" ("product_slug", "email");
