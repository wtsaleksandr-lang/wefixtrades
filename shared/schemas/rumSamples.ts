/**
 * SEO Wave D — RUM Web Vitals samples.
 *
 * Single append-only table holding one row per (page-load, metric)
 * captured from the public client via `navigator.sendBeacon`. Backs
 * the eventual admin "Web Vitals" panel and lets us correlate the
 * real-user 75th-percentile against the synthetic PageSpeed numbers
 * the Wave C audit tools produce.
 *
 * Schema mirrors the column ordering in
 * migrations/0046_rum_web_vitals.sql — keep them in sync.
 */

import {
  pgTable,
  text,
  bigserial,
  timestamp,
  doublePrecision,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const rumWebVitalsSamples = pgTable(
  "rum_web_vitals_samples",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    /** Full URL the metric was captured on (path + querystring). */
    url: text("url").notNull(),
    /** 'LCP' | 'CLS' | 'INP' | 'FCP' | 'TTFB'. */
    metric_name: text("metric_name").notNull(),
    /** Raw numeric — ms for time-based, unitless for CLS. */
    value: doublePrecision("value").notNull(),
    /** GA-standard bucket: 'good' | 'needs-improvement' | 'poor'. */
    rating: text("rating"),
    /** Client-side metric id (web-vitals lib style) for dedupe. */
    metric_id: text("metric_id"),
    /** 'navigate' | 'reload' | 'back-forward' | 'prerender'. */
    navigation_type: text("navigation_type"),
    /** sha256(ua + ip).slice(0,32) — no PII at rest. */
    user_agent_hash: text("user_agent_hash"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Direction must match migrations/0046_rum_web_vitals.sql.
    urlMetricTimeIdx: index("rum_web_vitals_url_metric_time_idx").on(
      table.url,
      table.metric_name,
      table.created_at.desc(),
    ),
    metricTimeIdx: index("rum_web_vitals_metric_time_idx").on(
      table.metric_name,
      table.created_at.desc(),
    ),
  }),
);

export const insertRumWebVitalsSampleSchema = createInsertSchema(
  rumWebVitalsSamples,
).omit({
  id: true,
  created_at: true,
});
export type InsertRumWebVitalsSample = z.infer<
  typeof insertRumWebVitalsSampleSchema
>;
export type RumWebVitalsSampleRow = typeof rumWebVitalsSamples.$inferSelect;
