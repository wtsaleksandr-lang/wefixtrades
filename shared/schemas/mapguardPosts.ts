/**
 * mapguard_posts
 *
 * Tracks every Google Business Profile post MapGuard publishes on behalf
 * of a customer. Lives as a first-class table (not buried in task
 * result_data) so the customer portal can render a post calendar, the
 * admin dashboard can show posts-published metrics, and the team can
 * audit what shipped + what failed.
 *
 * Lifecycle: scheduled → drafted → published | failed | skipped
 *   scheduled — row created by the monthly post-fanout cron (quota per tier)
 *   drafted   — daily drainer ran the AI content generator + populated text
 *   published — drainer called the SocialSync GBP publisher and got a
 *               remote post id back
 *   failed    — generator or publisher errored; latest error stored
 *   skipped   — customer has no GBP connection / disabled posts / paused service
 *
 * Quota: tier-driven monthly counts (Basic=2, Pro=4). Fanout cron
 * inserts that many rows on the 1st of each month with `scheduled_for`
 * evenly spaced across the month. The drainer picks up rows whose
 * scheduled_for has passed and whose status is "scheduled".
 */

import { pgTable, serial, integer, varchar, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./adminCrm";

export const MAPGUARD_POST_STATUSES = ["scheduled", "drafted", "published", "failed", "skipped"] as const;
export type MapguardPostStatus = (typeof MAPGUARD_POST_STATUSES)[number];

export const MAPGUARD_POST_THEMES = [
  "promotion",
  "tip",
  "service_highlight",
  "seasonal",
  "review_response",
  "company_update",
] as const;

export const mapguardPosts = pgTable(
  "mapguard_posts",
  {
    id: serial("id").primaryKey(),
    client_id: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Which client_service this post counts against — used to enforce quota + tier */
    client_service_id: integer("client_service_id").notNull(),
    /** The month this post belongs to in YYYY-MM, used for quota accounting */
    quota_period: varchar("quota_period", { length: 7 }).notNull(),
    /** Lifecycle */
    status: varchar("status", { length: 16 }).notNull().default("scheduled"),
    /** Optional theme hint passed into the AI prompt; varies by week */
    theme: varchar("theme", { length: 32 }),
    /** When the drainer should publish this row (UTC) */
    scheduled_for: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    /** When the AI drafted content (status → drafted) */
    drafted_at: timestamp("drafted_at", { withTimezone: true }),
    /** When publish succeeded (status → published) */
    published_at: timestamp("published_at", { withTimezone: true }),
    /** AI-generated post body */
    content: text("content"),
    /** Optional image URL (Google requires hosted image; populated from brand assets when available) */
    media_url: text("media_url"),
    /** Stripe/AI model + prompt version stamp for traceability */
    generator_metadata: jsonb("generator_metadata").$type<{ model?: string; prompt_version?: string; tokens?: number; cost_cents?: number }>(),
    /** ID returned by Google Business Profile localPosts API */
    gbp_post_id: text("gbp_post_id"),
    /** Last error encountered (failed status) */
    last_error: text("last_error"),
    /** Retry counter — drainer respects max retries before marking failed */
    retry_count: integer("retry_count").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("mapguard_posts_status_idx").on(table.status),
    scheduledForIdx: index("mapguard_posts_scheduled_for_idx").on(table.scheduled_for),
    clientPeriodIdx: index("mapguard_posts_client_period_idx").on(table.client_id, table.quota_period),
  }),
);

export const insertMapguardPostSchema = createInsertSchema(mapguardPosts).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type MapguardPost = typeof mapguardPosts.$inferSelect;
export type InsertMapguardPost = z.infer<typeof insertMapguardPostSchema>;
