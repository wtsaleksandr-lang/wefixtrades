/**
 * Affiliate + Referral program — Drizzle table definitions (Phase 1).
 * Ported from QuoteFleet src/db/schema.ts (PR #352). Mirrors
 * migrations/0091_affiliate_referral.sql byte-for-byte (column names,
 * defaults, index names + directions) so `check:schema-drift` passes.
 *
 * TENANT→CLIENT MAPPING: QuoteFleet's billing entity is `tenants`; WFT's is
 * `clients` (shared/schemas/adminCrm.ts). Every `tenant` reference became a
 * `client` reference — owner_client_id, referred_client_id, referral_credits
 * .client_id, affiliate_commissions.client_id, and the matching index names.
 *
 * The peer-referral code itself lives on `clients.referral_code` (added to the
 * clients table def in adminCrm.ts, not here) + the unique index
 * `clients_referral_code_idx` declared there.
 *
 * TWO PROGRAMS
 *   • REFERRAL (existing clients → peers, double-sided): referrer earns 1 free
 *     month per referred client that becomes paying; referee gets a 30-day
 *     trial + 20% off the first 3 months.
 *   • AFFILIATE (public marketers, tiered recurring cash): 25% → 30% (12mo at
 *     10+ active) → negotiated partner %. Signup + dashboard UI ship in PR C;
 *     these tables + the shared modules are its foundation.
 *
 * Payouts + commission accrual are PHASE 2. See server/affiliate/*.
 */
import { pgTable, serial, integer, text, timestamp, doublePrecision, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./adminCrm";
import { users } from "./db";

// ── AFFILIATES — a partner earning recurring commission on referred clients. ──
// The owner is EITHER an existing customer (owner_client_id/owner_user_id set)
// OR a standalone marketer with no WFT account (both null; identified by
// `email`). `code` is the shareable slug used in `/?ref=<code>` + `/ref/<code>`.
export const affiliates = pgTable(
  "affiliates",
  {
    id: serial("id").primaryKey(),
    /** Optional link to an existing client (a customer who is also an affiliate). */
    owner_client_id: integer("owner_client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    /** Optional link to a specific user account. */
    owner_user_id: integer("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Contact/login email — always set (the standalone affiliate's identity). */
    email: text("email").notNull(),
    /** Optional display / payout name. */
    name: text("name"),
    /** Unique short code used in the referral link. */
    code: text("code").notNull().unique(),
    /** Commission tier: 'base' (25%) | 'pro' (30% for 12mo once 10+ active) |
     *  'partner' (negotiated lifetime % for top partners). */
    tier: text("tier").notNull().default("base"),
    /** Current commission rate as a fraction (0.25 = 25%). Denormalized from
     *  `tier` so a phase-2 billing job reads one authoritative number, and a
     *  hand-negotiated 'partner' rate can differ from the tier default. */
    commission_rate: doublePrecision("commission_rate").notNull().default(0.25),
    /** Lifecycle: 'pending' (self-registered, not yet approved) | 'active' |
     *  'suspended'. */
    status: text("status").notNull().default("pending"),
    /** How the affiliate wants to be paid: 'paypal' | 'stripe' | 'bank' | null. */
    payout_method: text("payout_method"),
    /** Free-form payout target (PayPal email, etc.). Nullable until they set it. */
    payout_details: text("payout_details"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("affiliates_code_idx").on(t.code),
    index("affiliates_email_idx").on(t.email),
    index("affiliates_owner_client_idx").on(t.owner_client_id),
  ],
);
export type Affiliate = typeof affiliates.$inferSelect;
export type NewAffiliate = typeof affiliates.$inferInsert;
export const insertAffiliateSchema = createInsertSchema(affiliates).omit({ id: true, created_at: true, updated_at: true });
export type InsertAffiliate = z.infer<typeof insertAffiliateSchema>;

// ── REFERRAL ATTRIBUTIONS — one click of a `?ref=<code>` / `/ref/:code` link. ──
// Written when a visitor lands with `?ref` (or `/ref/:code`); `referred_client_id`
// is filled in on signup, `converted_at` when that client becomes paying.
export const referralAttributions = pgTable(
  "referral_attributions",
  {
    id: serial("id").primaryKey(),
    /** The referral/affiliate code that was clicked (clients.referral_code OR
     *  affiliates.code). Denormalized so the row survives even if the code is
     *  later rotated. */
    code: text("code").notNull(),
    /** Which program the code belonged to at capture: 'referral' (a client's
     *  peer code) | 'affiliate' (a public affiliate) | 'unknown'. */
    kind: text("kind").notNull().default("unknown"),
    /** The client that signed up through this click — null until signup links it. */
    referred_client_id: integer("referred_client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    /** Opaque per-visitor token stored in the `wft_ref` cookie; dedupes repeat
     *  clicks from the same browser before signup. */
    visitor_token: text("visitor_token").notNull(),
    landed_at: timestamp("landed_at").notNull().defaultNow(),
    /** When the referred client converted to a PAYING subscription (phase-2
     *  billing job). Null while trialing / free. */
    converted_at: timestamp("converted_at"),
    /** Reward pipeline state: 'pending' (click only) | 'signed_up' (linked to a
     *  client, referee reward applied, referrer credit queued) | 'converted'
     *  (client paying) | 'rewarded' (referrer credit granted) | 'ignored'
     *  (self-referral / invalid). */
    reward_status: text("reward_status").notNull().default("pending"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("referral_attributions_code_idx").on(t.code),
    index("referral_attributions_client_idx").on(t.referred_client_id),
    index("referral_attributions_visitor_idx").on(t.visitor_token),
  ],
);
export type ReferralAttribution = typeof referralAttributions.$inferSelect;
export type NewReferralAttribution = typeof referralAttributions.$inferInsert;

// ── REFERRAL CREDITS — the "1 free month" reward owed to a REFERRER. ─────────
// Queued (applied_at null) when a referred peer signs up; a phase-2 billing job
// grants the free month (sets applied_at + status 'applied') once the referee
// is paying.
export const referralCredits = pgTable(
  "referral_credits",
  {
    id: serial("id").primaryKey(),
    /** The REFERRER client that earns the free month. */
    client_id: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** The attribution that produced this credit. */
    source_attribution_id: integer("source_attribution_id").references(
      () => referralAttributions.id,
      { onDelete: "set null" },
    ),
    /** How many free months this credit grants (default 1). */
    months_granted: integer("months_granted").notNull().default(1),
    /** 'pending' (queued, awaiting referee payment) | 'applied' | 'void'. */
    status: text("status").notNull().default("pending"),
    /** When the free month was actually applied to the referrer's subscription
     *  (phase-2). Null while pending. */
    applied_at: timestamp("applied_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("referral_credits_client_idx").on(t.client_id),
    index("referral_credits_status_idx").on(t.status),
  ],
);
export type ReferralCredit = typeof referralCredits.$inferSelect;
export type NewReferralCredit = typeof referralCredits.$inferInsert;

// ── AFFILIATE COMMISSIONS — monthly accrual per referred customer. ──────────
// Created by a PHASE-2 billing job (one row per affiliate × referred client ×
// billing month). Created empty in phase 1 so the schema + payout dashboard
// seam exists; nothing writes to it yet.
export const affiliateCommissions = pgTable(
  "affiliate_commissions",
  {
    id: serial("id").primaryKey(),
    affiliate_id: integer("affiliate_id")
      .notNull()
      .references(() => affiliates.id, { onDelete: "cascade" }),
    /** The referred paying client this commission is for. */
    client_id: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Billing month, 'YYYY-MM'. One accrual row per affiliate/client/month. */
    period_month: text("period_month").notNull(),
    /** Commission amount in cents (integer money — never floats for payouts). */
    amount_cents: integer("amount_cents").notNull().default(0),
    /** Rate applied for this row (fraction), snapshotted for audit. */
    rate: doublePrecision("rate").notNull().default(0.25),
    /** 'pending' (accrued) | 'approved' (cleared for payout) | 'paid'. */
    status: text("status").notNull().default("pending"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("affiliate_commissions_affiliate_idx").on(t.affiliate_id),
    index("affiliate_commissions_client_idx").on(t.client_id),
    uniqueIndex("affiliate_commissions_uniq_idx").on(t.affiliate_id, t.client_id, t.period_month),
  ],
);
export type AffiliateCommission = typeof affiliateCommissions.$inferSelect;
export type NewAffiliateCommission = typeof affiliateCommissions.$inferInsert;
