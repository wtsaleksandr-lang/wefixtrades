/**
 * Wave W-BA-2 (Phase 3b) — per-client AI cost ledger + model pricing.
 *
 * Three tables back the budget dial (§4) and the client-detail cost & profit
 * view (§5):
 *
 *   ai_model_pricing                — single source of truth for token →
 *                                     cost, with a tier used to route
 *                                     between cheap / standard / premium
 *                                     models inside the current budget band.
 *   client_variable_costs           — per-client current-month + lifetime
 *                                     totals (AI, SMS, voice, revenue) with
 *                                     two stored generated profit columns.
 *   client_variable_costs_history   — one row per client per month for the
 *                                     6-month trend chart.
 */
import { pgTable, text, integer, boolean, timestamp, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./adminCrm";

export const aiModelPricing = pgTable("ai_model_pricing", {
  model: text("model").primaryKey(),
  provider: text("provider").notNull(),
  input_per_million_cents: integer("input_per_million_cents").notNull(),
  output_per_million_cents: integer("output_per_million_cents").notNull(),
  /** 'cheap' | 'standard' | 'premium' — see aiBudgetRouter.ts. */
  tier: text("tier").notNull(),
  active: boolean("active").notNull().default(true),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAiModelPricingSchema = createInsertSchema(aiModelPricing).omit({
  updated_at: true,
});
export type InsertAiModelPricing = z.infer<typeof insertAiModelPricingSchema>;
export type AiModelPricing = typeof aiModelPricing.$inferSelect;

export const clientVariableCosts = pgTable(
  "client_variable_costs",
  {
    client_id: integer("client_id")
      .primaryKey()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** '2026-05' format (YYYY-MM). */
    current_month: text("current_month").notNull(),
    ai_cost_cents_month: integer("ai_cost_cents_month").notNull().default(0),
    ai_cost_cents_lifetime: integer("ai_cost_cents_lifetime").notNull().default(0),
    sms_cost_cents_month: integer("sms_cost_cents_month").notNull().default(0),
    sms_cost_cents_lifetime: integer("sms_cost_cents_lifetime").notNull().default(0),
    voice_cost_cents_month: integer("voice_cost_cents_month").notNull().default(0),
    voice_cost_cents_lifetime: integer("voice_cost_cents_lifetime").notNull().default(0),
    revenue_cents_month: integer("revenue_cents_month").notNull().default(0),
    revenue_cents_lifetime: integer("revenue_cents_lifetime").notNull().default(0),
    /** Stored generated column — never written by the application. */
    profit_cents_month: integer("profit_cents_month").generatedAlwaysAs(
      sql`(revenue_cents_month - ai_cost_cents_month - sms_cost_cents_month - voice_cost_cents_month)`,
    ),
    profit_cents_lifetime: integer("profit_cents_lifetime").generatedAlwaysAs(
      sql`(revenue_cents_lifetime - ai_cost_cents_lifetime - sms_cost_cents_lifetime - voice_cost_cents_lifetime)`,
    ),
    /** Per-client monthly AI budget (cents). Defaults to $10 ($1000c). */
    default_budget_cents: integer("default_budget_cents").notNull().default(1000),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    monthIdx: index("client_variable_costs_month_idx").on(table.current_month),
  }),
);

export type ClientVariableCosts = typeof clientVariableCosts.$inferSelect;

export const clientVariableCostsHistory = pgTable(
  "client_variable_costs_history",
  {
    client_id: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    ai_cost_cents: integer("ai_cost_cents").notNull().default(0),
    sms_cost_cents: integer("sms_cost_cents").notNull().default(0),
    voice_cost_cents: integer("voice_cost_cents").notNull().default(0),
    revenue_cents: integer("revenue_cents").notNull().default(0),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.client_id, table.month] }),
  }),
);

export type ClientVariableCostsHistory = typeof clientVariableCostsHistory.$inferSelect;
