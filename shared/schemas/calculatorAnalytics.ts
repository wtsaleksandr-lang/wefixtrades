/**
 * Wave W-BB-4 — per-calculator conversion analytics.
 *
 * Two tables back the customer-facing portal dashboard:
 *
 *   calculator_analytics_events  — append-only raw event stream. Written by
 *                                  the public widget POST endpoint. One row
 *                                  per (view | start | field_change |
 *                                  submit | abandon).
 *   calculator_analytics_daily   — per-(calculator,date) rollup the portal
 *                                  reads. Computed nightly by the rollup
 *                                  worker so the dashboard never has to scan
 *                                  the events table on read.
 */
import {
  pgTable,
  text,
  integer,
  bigserial,
  timestamp,
  jsonb,
  date,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { calculators } from "./db";

export const calculatorAnalyticsEvents = pgTable(
  "calculator_analytics_events",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    calculator_id: integer("calculator_id")
      .notNull()
      .references(() => calculators.id, { onDelete: "cascade" }),
    /** Anonymous browser session id (uuid in localStorage). */
    session_id: text("session_id").notNull(),
    /** 'view' | 'start' | 'field_change' | 'submit' | 'abandon'. */
    event_type: text("event_type").notNull(),
    /** Only populated for `field_change` rows. */
    field_id: text("field_id"),
    /** Optional change-event metadata (e.g. { from, to }). */
    value_meta: jsonb("value_meta"),
    /** Anonymous visitor context: user_agent, referrer, utm_*, ip_hash. */
    visitor_meta: jsonb("visitor_meta"),
    occurred_at: timestamp("occurred_at").notNull().defaultNow(),
  },
  (table) => ({
    calcTimeIdx: index("calculator_analytics_calc_time_idx").on(
      table.calculator_id,
      table.occurred_at,
    ),
    sessionIdx: index("calculator_analytics_session_idx").on(
      table.session_id,
      table.occurred_at,
    ),
  }),
);

export type CalculatorAnalyticsEvent =
  typeof calculatorAnalyticsEvents.$inferSelect;

export const calculatorAnalyticsDaily = pgTable(
  "calculator_analytics_daily",
  {
    calculator_id: integer("calculator_id")
      .notNull()
      .references(() => calculators.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    views: integer("views").notNull().default(0),
    starts: integer("starts").notNull().default(0),
    completions: integer("completions").notNull().default(0),
    abandonments: integer("abandonments").notNull().default(0),
    avg_completion_seconds: integer("avg_completion_seconds"),
    /** { field_id: count } — most-changed-field tally. */
    field_change_counts: jsonb("field_change_counts")
      .notNull()
      .default({} as Record<string, number>),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.calculator_id, table.date] }),
    dateIdx: index("calculator_analytics_daily_date_idx").on(table.date),
  }),
);

export type CalculatorAnalyticsDaily =
  typeof calculatorAnalyticsDaily.$inferSelect;
