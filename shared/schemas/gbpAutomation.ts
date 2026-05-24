/**
 * Google Business Profile (GBP) daily automation — drizzle schema.
 *
 * Backs three crons registered in server/jobs/scheduler.ts:
 *   - daily_post       (server/cron/gbpAutomation.ts :: runDailyPostTick)
 *   - review_monitor   (server/cron/gbpAutomation.ts :: runReviewMonitorTick)
 *   - hours_sync       (server/cron/gbpAutomation.ts :: runHoursSyncTick)
 *
 * See migrations/0047_gbp_automation_log.sql for column-level docs.
 *
 * All three tables are scaffolded ahead of the OAuth connect. Once Alex
 * clicks "Connect Google Business" in admin and a row lands in
 * `oauth_tokens` with provider='gbp', the crons stop no-op'ing and start
 * writing here.
 */

import { pgTable, uuid, text, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ─── gbp_post_queue ────────────────────────────────────────────────── */

export const gbpPostQueue = pgTable(
  "gbp_post_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    summary: text("summary").notNull(),
    topic_type: text("topic_type").notNull().default("STANDARD"),
    language_code: text("language_code").notNull().default("en"),
    call_to_action: jsonb("call_to_action"),
    media: jsonb("media"),
    status: text("status").notNull().default("pending"),
    scheduled_for: timestamp("scheduled_for", { withTimezone: true }),
    posted_at: timestamp("posted_at", { withTimezone: true }),
    remote_post_id: text("remote_post_id"),
    error: text("error"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusScheduledIdx: index("gbp_post_queue_status_scheduled_idx").on(
      table.status,
      table.scheduled_for,
    ),
  }),
);

export const insertGbpPostQueueSchema = createInsertSchema(gbpPostQueue).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertGbpPostQueue = z.infer<typeof insertGbpPostQueueSchema>;
export type GbpPostQueueRow = typeof gbpPostQueue.$inferSelect;

/* ─── gbp_automation_log ────────────────────────────────────────────── */

export const gbpAutomationLog = pgTable(
  "gbp_automation_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    job: text("job").notNull(), // 'daily_post' | 'review_monitor' | 'hours_sync'
    event_type: text("event_type").notNull(),
    status: text("status"),
    reference_id: text("reference_id"),
    http_status: integer("http_status"),
    message: text("message"),
    payload: jsonb("payload"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    jobCreatedIdx: index("gbp_automation_log_job_created_idx").on(
      table.job,
      table.created_at.desc(),
    ),
  }),
);

export const insertGbpAutomationLogSchema = createInsertSchema(gbpAutomationLog).omit({
  id: true,
  created_at: true,
});
export type InsertGbpAutomationLog = z.infer<typeof insertGbpAutomationLogSchema>;
export type GbpAutomationLogRow = typeof gbpAutomationLog.$inferSelect;

/* ─── gbp_seen_reviews ──────────────────────────────────────────────── */

export const gbpSeenReviews = pgTable(
  "gbp_seen_reviews",
  {
    review_id: text("review_id").primaryKey(),
    location_name: text("location_name").notNull(),
    star_rating: integer("star_rating"),
    first_seen_at: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    locationIdx: index("gbp_seen_reviews_location_idx").on(
      table.location_name,
      table.first_seen_at.desc(),
    ),
  }),
);

export const insertGbpSeenReviewSchema = createInsertSchema(gbpSeenReviews).omit({
  first_seen_at: true,
});
export type InsertGbpSeenReview = z.infer<typeof insertGbpSeenReviewSchema>;
export type GbpSeenReviewRow = typeof gbpSeenReviews.$inferSelect;
