/**
 * Citation Tracker — Continuous monitoring subscription tables.
 *
 * Wave 3 add-on product (PR series). Distinct from Citation Builder
 * (PR #815) which is a one-shot $79-$299 service. Citation Tracker is a
 * recurring $19/mo standalone (or $5/mo bundle with MapGuard) that
 * continuously diff-checks the customer's existing citations across
 * 50+ directories.
 *
 *   1. citation_tracker_subscriptions — one row per active sub
 *   2. citation_tracker_listings      — discovered citations per sub
 *   3. citation_tracker_alerts        — drift detections + dispatch log
 *
 * The actual per-directory scraping logic is structurally placed in
 * server/services/citationTracker/directories.ts but the scrapers
 * themselves are stubbed (Wave 4).
 */
import { pgTable, text, varchar, serial, integer, timestamp, jsonb, uuid, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./db";

/* ═══════════════════════════════════════════
   Subscriptions
   ═══════════════════════════════════════════ */

export const citationTrackerSubscriptions = pgTable("citation_tracker_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  customer_id: integer("customer_id").notNull().references(() => users.id),
  business_name: text("business_name").notNull(),
  /** {phone, address, name, website} — the customer's canonical NAP */
  nap: jsonb("nap").notNull(),
  /** "standalone" | "bundle" — pricing tier */
  plan_tier: varchar("plan_tier", { length: 20 }).notNull().default("standalone"),
  stripe_subscription_id: text("stripe_subscription_id"),
  /** "active" | "canceled" | "past_due" */
  status: varchar("status", { length: 20 }).notNull().default("active"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  canceled_at: timestamp("canceled_at"),
}, (table) => ({
  customerIdx: index("idx_citation_tracker_subs_customer").on(table.customer_id),
  statusIdx: index("idx_citation_tracker_subs_status").on(table.status),
  stripeSubIdx: index("idx_citation_tracker_subs_stripe_sub").on(table.stripe_subscription_id),
}));

export const insertCitationTrackerSubscriptionSchema = createInsertSchema(citationTrackerSubscriptions).omit({
  id: true, created_at: true,
});
export type InsertCitationTrackerSubscription = z.infer<typeof insertCitationTrackerSubscriptionSchema>;
export type CitationTrackerSubscription = typeof citationTrackerSubscriptions.$inferSelect;

/* ═══════════════════════════════════════════
   Listings (one row per directory per subscription)
   ═══════════════════════════════════════════ */

export const citationTrackerListings = pgTable("citation_tracker_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  subscription_id: uuid("subscription_id").notNull().references(() => citationTrackerSubscriptions.id, { onDelete: "cascade" }),
  directory_name: text("directory_name").notNull(),
  directory_url: text("directory_url").notNull(),
  /** Direct URL to the listing on the directory, when known. */
  listing_url: text("listing_url"),
  /** {phone, address, name, website} — what we last observed on this listing */
  current_nap: jsonb("current_nap"),
  last_checked_at: timestamp("last_checked_at"),
  /** "active" | "missing" | "inconsistent" */
  status: varchar("status", { length: 20 }).notNull().default("active"),
  first_seen_at: timestamp("first_seen_at").notNull().defaultNow(),
}, (table) => ({
  subIdx: index("idx_citation_tracker_listings_sub").on(table.subscription_id),
  statusIdx: index("idx_citation_tracker_listings_status").on(table.status),
}));

export const insertCitationTrackerListingSchema = createInsertSchema(citationTrackerListings).omit({
  id: true, first_seen_at: true,
});
export type InsertCitationTrackerListing = z.infer<typeof insertCitationTrackerListingSchema>;
export type CitationTrackerListing = typeof citationTrackerListings.$inferSelect;

/* ═══════════════════════════════════════════
   Alerts
   ═══════════════════════════════════════════ */

export const citationTrackerAlerts = pgTable("citation_tracker_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  subscription_id: uuid("subscription_id").notNull().references(() => citationTrackerSubscriptions.id, { onDelete: "cascade" }),
  listing_id: uuid("listing_id").references(() => citationTrackerListings.id, { onDelete: "set null" }),
  /** "nap_change" | "new_listing" | "removed_listing" | "inconsistency" */
  alert_type: varchar("alert_type", { length: 30 }).notNull(),
  old_value: jsonb("old_value"),
  new_value: jsonb("new_value"),
  /** "low" | "medium" | "high" */
  severity: varchar("severity", { length: 10 }).notNull().default("medium"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  read_at: timestamp("read_at"),
}, (table) => ({
  subIdx: index("idx_citation_tracker_alerts_sub").on(table.subscription_id),
  unreadIdx: index("idx_citation_tracker_alerts_unread")
    .on(table.subscription_id, table.read_at)
    .where(sql`${table.read_at} IS NULL`),
}));

export const insertCitationTrackerAlertSchema = createInsertSchema(citationTrackerAlerts).omit({
  id: true, created_at: true,
});
export type InsertCitationTrackerAlert = z.infer<typeof insertCitationTrackerAlertSchema>;
export type CitationTrackerAlert = typeof citationTrackerAlerts.$inferSelect;

/* ═══════════════════════════════════════════
   Lookup keys (Stripe)
   ═══════════════════════════════════════════ */

export const CITATION_TRACKER_LOOKUP_KEYS = {
  STANDALONE_MONTHLY: "citation_tracker_standalone_monthly",
  STANDALONE_YEARLY: "citation_tracker_standalone_yearly",
  BUNDLE_MONTHLY: "citation_tracker_bundle_monthly",
  BUNDLE_YEARLY: "citation_tracker_bundle_yearly",
} as const;

export type CitationTrackerLookupKey = typeof CITATION_TRACKER_LOOKUP_KEYS[keyof typeof CITATION_TRACKER_LOOKUP_KEYS];

export const CITATION_TRACKER_PRICING = {
  standalone_monthly_cents: 1900,
  standalone_yearly_cents: 19000,
  bundle_monthly_cents: 500,
  bundle_yearly_cents: 5000,
} as const;
