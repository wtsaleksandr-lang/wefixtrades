/**
 * tradeline_template_overrides
 *
 * Admin-editable overrides for the niche-specific AI templates that live
 * in source (server/services/tradelineTemplates.ts and
 * server/services/portalConciergeTemplates.ts).
 *
 * Templates ship with code-default content per niche. Admins can override
 * any subset of fields per (kind, template_id). Overrides are stored
 * sparsely as a jsonb blob — fields not present in `overrides` keep their
 * code defaults. Reset by deleting the row.
 *
 * The matching live read-path layers this jsonb on top of the code default
 * via server/lib/applyTemplateOverrides.ts.
 */

import { pgTable, serial, varchar, jsonb, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const tradelineTemplateOverrides = pgTable(
  "tradeline_template_overrides",
  {
    id: serial("id").primaryKey(),
    /** 'tradeline' = customer-facing receptionist, 'concierge' = trade-facing assistant */
    kind: varchar("kind", { length: 16 }).notNull(),
    /** Template slug, e.g. 'plumbing', 'hvac' */
    template_id: varchar("template_id", { length: 64 }).notNull(),
    /** Sparse override blob — keys are TradeTemplate/ConciergeTemplate field names */
    overrides: jsonb("overrides").$type<Record<string, unknown>>().notNull(),
    /** User id of admin who last touched this row */
    updated_by: integer("updated_by"),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqKindId: unique("tradeline_template_overrides_kind_template_id_key").on(table.kind, table.template_id),
  }),
);

export const insertTradelineTemplateOverrideSchema = createInsertSchema(tradelineTemplateOverrides).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type TradelineTemplateOverride = typeof tradelineTemplateOverrides.$inferSelect;
export type InsertTradelineTemplateOverride = z.infer<typeof insertTradelineTemplateOverrideSchema>;

export const TEMPLATE_KIND_VALUES = ["tradeline", "concierge"] as const;
export type TemplateKind = (typeof TEMPLATE_KIND_VALUES)[number];
