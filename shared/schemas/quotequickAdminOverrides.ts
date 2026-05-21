/**
 * QuoteQuick admin overrides — Wave W-AI-2.
 *
 * Sparse jsonb override tables that layer on top of the code-default
 * QuoteQuick template catalogue (`shared/templatePresets.ts`
 * `TEMPLATE_PRESETS`) and trade list (`client/src/data/trades.ts`
 * `TRADES`). The widget + wizard read merged results via the public
 * `/api/quotequick/templates` and `/api/quotequick/trades` endpoints.
 *
 * Merge precedence:
 *   code default ← admin override ← owner customization
 *
 * Owner customizations land on `calculator_settings.advanced` (the live
 * source for an individual calculator instance) and are not affected by
 * admin overrides — existing calculators stay frozen on their seeded
 * snapshot. Re-syncing a calculator to its template is an out-of-scope
 * future "Re-sync" button.
 *
 * Patterns mirrored from `tradelineTemplateOverrides.ts`.
 *
 * Two tables, both keyed by string id, both storing sparse jsonb patches:
 *   - `quotequick_template_overrides` — per-template patches. May also
 *     contain an admin-created template (no code default exists) — those
 *     rows carry `is_user_created: true` inside `overrides`.
 *   - `quotequick_trade_overrides` — per-trade patches: `label`,
 *     `categoryId`, `defaultIcon`. The `defaultIcon` override takes
 *     precedence over the template's `defaultIcon` when set, but
 *     `defaultIcon` still lives on the template itself for back-compat
 *     (see PR #391).
 *
 * Soft-archive: setting `archived: true` hides a template/trade from
 * non-archived listings and the public endpoints, but leaves existing
 * calculators that reference it untouched.
 */

import { pgTable, text, jsonb, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ─── Template overrides ─── */

export const quotequickTemplateOverrides = pgTable("quotequick_template_overrides", {
  /** Template id — matches `TEMPLATE_PRESETS[].id` for code-default-backed rows, or a UUID for admin-created templates. */
  template_id: text("template_id").primaryKey(),
  /** Sparse override blob — keys are `TemplateConfig` field names. */
  overrides: jsonb("overrides").$type<Record<string, unknown>>().notNull(),
  /** Soft-archive flag — when true, the template is hidden from non-archived listings + public endpoints. */
  archived: boolean("archived").notNull().default(false),
  /** Set when `archived` flips true; null otherwise. */
  archived_at: timestamp("archived_at", { withTimezone: true }),
  /** User id of admin who last touched this row. */
  updated_by: integer("updated_by"),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertQuoteQuickTemplateOverrideSchema = createInsertSchema(quotequickTemplateOverrides).omit({
  created_at: true,
  updated_at: true,
});

export type QuoteQuickTemplateOverride = typeof quotequickTemplateOverrides.$inferSelect;
export type InsertQuoteQuickTemplateOverride = z.infer<typeof insertQuoteQuickTemplateOverrideSchema>;

/* ─── Trade overrides ─── */

export const quotequickTradeOverrides = pgTable("quotequick_trade_overrides", {
  /** Trade id — matches `TRADES[].id` for code-default-backed rows, or a UUID for admin-created trades. */
  trade_id: text("trade_id").primaryKey(),
  /** Sparse override blob — supports `{ label?, categoryId?, defaultIcon? }`. */
  overrides: jsonb("overrides").$type<Record<string, unknown>>().notNull(),
  /** Soft-archive flag — when true, the trade is hidden from non-archived listings + public endpoints. */
  archived: boolean("archived").notNull().default(false),
  /** Set when `archived` flips true; null otherwise. */
  archived_at: timestamp("archived_at", { withTimezone: true }),
  /** User id of admin who last touched this row. */
  updated_by: integer("updated_by"),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertQuoteQuickTradeOverrideSchema = createInsertSchema(quotequickTradeOverrides).omit({
  created_at: true,
  updated_at: true,
});

export type QuoteQuickTradeOverride = typeof quotequickTradeOverrides.$inferSelect;
export type InsertQuoteQuickTradeOverride = z.infer<typeof insertQuoteQuickTradeOverrideSchema>;
