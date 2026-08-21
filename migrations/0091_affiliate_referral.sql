-- Affiliate + Referral program (Phase 1) — ported from QuoteFleet 0053.
-- Adds the shareable referral code to `clients` and the four program tables.
--
-- WFT tenant→client mapping: QuoteFleet's billing entity is `tenants`; WFT's
-- is `clients` (shared/schemas/adminCrm.ts). Every tenant reference in the QF
-- source became a client reference here (owner_client_id, referred_client_id,
-- referral_credits.client_id, affiliate_commissions.client_id + index renames).
--
-- Applied idempotently on every cold boot by bootstrapMigrations()
-- (server/lib/bootstrapMigrations.ts). All statements are IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS — additive only, safe to re-run, no drops/renames.

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "referral_code" text;
CREATE UNIQUE INDEX IF NOT EXISTS "clients_referral_code_idx" ON "clients" ("referral_code");

CREATE TABLE IF NOT EXISTS "affiliates" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_client_id" integer,
	"owner_user_id" integer,
	"email" text NOT NULL,
	"name" text,
	"code" text NOT NULL,
	"tier" text DEFAULT 'base' NOT NULL,
	"commission_rate" double precision DEFAULT 0.25 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payout_method" text,
	"payout_details" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "affiliates_code_unique" UNIQUE("code")
);

CREATE TABLE IF NOT EXISTS "referral_attributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"kind" text DEFAULT 'unknown' NOT NULL,
	"referred_client_id" integer,
	"visitor_token" text NOT NULL,
	"landed_at" timestamp DEFAULT now() NOT NULL,
	"converted_at" timestamp,
	"reward_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "referral_credits" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"source_attribution_id" integer,
	"months_granted" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"applied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "affiliate_commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"affiliate_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"period_month" text NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"rate" double precision DEFAULT 0.25 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "affiliates_code_idx" ON "affiliates" ("code");
CREATE INDEX IF NOT EXISTS "affiliates_email_idx" ON "affiliates" ("email");
CREATE INDEX IF NOT EXISTS "affiliates_owner_client_idx" ON "affiliates" ("owner_client_id");
CREATE INDEX IF NOT EXISTS "referral_attributions_code_idx" ON "referral_attributions" ("code");
CREATE INDEX IF NOT EXISTS "referral_attributions_client_idx" ON "referral_attributions" ("referred_client_id");
CREATE INDEX IF NOT EXISTS "referral_attributions_visitor_idx" ON "referral_attributions" ("visitor_token");
CREATE INDEX IF NOT EXISTS "referral_credits_client_idx" ON "referral_credits" ("client_id");
CREATE INDEX IF NOT EXISTS "referral_credits_status_idx" ON "referral_credits" ("status");
CREATE INDEX IF NOT EXISTS "affiliate_commissions_affiliate_idx" ON "affiliate_commissions" ("affiliate_id");
CREATE INDEX IF NOT EXISTS "affiliate_commissions_client_idx" ON "affiliate_commissions" ("client_id");
CREATE UNIQUE INDEX IF NOT EXISTS "affiliate_commissions_uniq_idx" ON "affiliate_commissions" ("affiliate_id","client_id","period_month");
