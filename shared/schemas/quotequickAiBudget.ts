/**
 * Wave K — QuoteQuick AI assistant budget schema.
 *
 * Three tables back the per-user spend enforcement:
 *
 *  - `ai_spend_log`        — one row per AI call (model + tokens + cost).
 *  - `ai_budget_config`    — global + per-tier override rows; admin-editable.
 *  - `ai_budget_audit_log` — every config change captured for review.
 *
 * The corresponding `users.ai_spend_usd` + `users.ai_images_used` counters
 * live on the existing users table (see ./db.ts).
 */

import { pgTable, serial, integer, varchar, numeric, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./db";

/* ─── ai_spend_log ─── */
export const aiSpendLog = pgTable("ai_spend_log", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** UTC calendar day in YYYY-MM-DD form. */
  day: varchar("day", { length: 10 }).notNull(),
  /** Anthropic model id (e.g. `claude-haiku-4-5-20251001`). */
  model: varchar("model", { length: 64 }).notNull(),
  input_tokens: integer("input_tokens").notNull().default(0),
  output_tokens: integer("output_tokens").notNull().default(0),
  image_count: integer("image_count").notNull().default(0),
  cost_usd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userDayIdx: index("ai_spend_log_user_day_idx").on(table.user_id, table.day),
  createdAtIdx: index("ai_spend_log_created_at_idx").on(table.created_at),
}));

export type AiSpendLog = typeof aiSpendLog.$inferSelect;

/* ─── ai_budget_config ─── */
/** Recognised scope values. `global` is the fall-back; the rest override per plan_tier. */
export const AI_BUDGET_SCOPES = ["global", "tier_free", "tier_starter", "tier_pro", "tier_agency"] as const;
export type AiBudgetScope = typeof AI_BUDGET_SCOPES[number];

export const aiBudgetConfig = pgTable("ai_budget_config", {
  id: serial("id").primaryKey(),
  scope: varchar("scope", { length: 32 }).notNull().unique(),
  cap_lifetime_usd: numeric("cap_lifetime_usd", { precision: 10, scale: 4 }).notNull(),
  /** Soft-warning threshold expressed as a percentage of the lifetime cap (0-100). */
  soft_warn_pct: integer("soft_warn_pct").notNull(),
  per_call_max_usd: numeric("per_call_max_usd", { precision: 10, scale: 4 }).notNull(),
  daily_ceiling_usd: numeric("daily_ceiling_usd", { precision: 10, scale: 4 }).notNull(),
  image_lifetime_cap: integer("image_lifetime_cap").notNull(),
  updated_by: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AiBudgetConfig = typeof aiBudgetConfig.$inferSelect;

/**
 * Shape returned to clients / consumed by the admin save endpoint. The DB
 * stores `NUMERIC` columns as strings; this Zod schema is what the
 * front-end POSTs and what the service uses internally (numbers).
 */
export const aiBudgetConfigValuesSchema = z.object({
  cap_lifetime_usd: z.number().nonnegative().max(1000),
  soft_warn_pct: z.number().int().min(0).max(100),
  per_call_max_usd: z.number().nonnegative().max(1000),
  daily_ceiling_usd: z.number().nonnegative().max(1000),
  image_lifetime_cap: z.number().int().nonnegative().max(10000),
});
export type AiBudgetConfigValues = z.infer<typeof aiBudgetConfigValuesSchema>;

/** Default values seeded into the `global` row. Matches migration 0012. */
export const DEFAULT_AI_BUDGET_CONFIG: AiBudgetConfigValues = {
  cap_lifetime_usd: 0.5,
  soft_warn_pct: 80,
  per_call_max_usd: 0.15,
  daily_ceiling_usd: 0.2,
  image_lifetime_cap: 10,
};

/* ─── ai_budget_audit_log ─── */
export const aiBudgetAuditLog = pgTable("ai_budget_audit_log", {
  id: serial("id").primaryKey(),
  scope: varchar("scope", { length: 32 }).notNull(),
  admin_id: integer("admin_id").references(() => users.id, { onDelete: "set null" }),
  old_values: jsonb("old_values"),
  new_values: jsonb("new_values").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AiBudgetAuditLog = typeof aiBudgetAuditLog.$inferSelect;
