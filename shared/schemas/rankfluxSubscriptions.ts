/**
 * Rankflux alert subscriptions — Wave 6B.
 *
 * Free-tool email subscription for /tools/local-rankflux. Visitors enter
 * an email + pick which alert cadences they want (daily digest, weekly
 * digest, urgent-only). The daily cron in
 * server/jobs/rankfluxAlertWorker.ts reads this table and dispatches
 * MozCast-driven volatility emails:
 *
 *   - daily   → every morning if subscribed
 *   - weekly  → every Monday morning if subscribed (digest of last 7d)
 *   - urgent  → whenever MozCast score is HIGH (≥ 8.0 on Moz's 10-pt scale)
 *
 * Subscriptions are opt-in only (no auth required to subscribe — public
 * marketing surface). The dispatch worker respects email_unsubscribes +
 * one-click unsubscribe per the existing patterns. The same email may
 * appear at most once (upsert on the unique index).
 */
import { pgTable, text, bigserial, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const rankfluxSubscriptions = pgTable(
  "rankflux_subscriptions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    email: text("email").notNull(),
    /** Daily digest of yesterday's MozCast score. */
    daily: boolean("daily").notNull().default(false),
    /** Monday-morning rollup of the past 7 days. */
    weekly: boolean("weekly").notNull().default(false),
    /** Fire when score is HIGH (≥ 8.0 on Moz's 10-pt scale). */
    urgent: boolean("urgent").notNull().default(false),
    source: text("source"),
    confirmed_at: timestamp("confirmed_at"),
    unsubscribed_at: timestamp("unsubscribed_at"),
    last_daily_sent_at: timestamp("last_daily_sent_at"),
    last_weekly_sent_at: timestamp("last_weekly_sent_at"),
    last_urgent_sent_at: timestamp("last_urgent_sent_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    emailUq: uniqueIndex("rankflux_subscriptions_email_uq").on(t.email),
    createdIdx: index("rankflux_subscriptions_created_idx").on(t.created_at),
  }),
);

export const insertRankfluxSubscriptionSchema = createInsertSchema(rankfluxSubscriptions).omit({
  id: true,
  created_at: true,
  confirmed_at: true,
  unsubscribed_at: true,
  last_daily_sent_at: true,
  last_weekly_sent_at: true,
  last_urgent_sent_at: true,
});
export type InsertRankfluxSubscription = z.infer<typeof insertRankfluxSubscriptionSchema>;
export type RankfluxSubscription = typeof rankfluxSubscriptions.$inferSelect;
