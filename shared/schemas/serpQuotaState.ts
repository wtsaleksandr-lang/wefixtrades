/**
 * SERP provider quota state — Wave 6.5.
 *
 * Persists the monthly call count and reset timestamp for each provider
 * in the multi-provider SERP orchestrator. Mirrors the in-memory map in
 * `server/lib/serpQuotaTracker.ts` so a process restart doesn't reset a
 * provider's quota mid-month and silently over-spend the free tier.
 *
 * One row per provider id (unique). Counts roll over the first time a
 * call lands in a new calendar month — the tracker compares `reset_at`
 * against the current month and zeroes the counter automatically.
 */
import { pgTable, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const serpQuotaState = pgTable(
  "serp_quota_state",
  {
    id: text("id").primaryKey(),                  // provider id, e.g. "googleCse"
    monthly_count: integer("monthly_count").notNull().default(0),
    monthly_limit: integer("monthly_limit").notNull().default(0),
    reset_at: timestamp("reset_at").notNull().defaultNow(),
    last_used_at: timestamp("last_used_at"),
    last_error: text("last_error"),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    idUq: uniqueIndex("serp_quota_state_id_uq").on(t.id),
  }),
);

export type SerpQuotaStateRow = typeof serpQuotaState.$inferSelect;
