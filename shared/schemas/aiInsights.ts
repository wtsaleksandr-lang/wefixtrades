/**
 * AI Insights — Wave 7.
 *
 * Schema for the BrightLocal-style "AI Insights" feature bundled into
 * MapGuard ($99/$149/mo) plans. Two tables:
 *
 *   1. ai_insights_cache             — 24h-TTL cache of the LLM result per client
 *   2. ai_insights_dismissed_actions — actions the customer has X'd off
 *
 * Gated entirely by MapGuard subscription status (checked in the route
 * layer against client_services + service_catalog). NO separate Stripe
 * price — bundled with MapGuard per Alex Q2 (2026-05-25).
 *
 * Cache is per-client (not per-user); each row carries the LLM-produced
 * JSON blob plus the canonical generated_at + expires_at timestamps so
 * the route can answer "is the cached entry still fresh?" with a single
 * indexed lookup.
 */
import { pgTable, text, varchar, serial, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./adminCrm";

/* ─── Cache ─── */
export const aiInsightsCache = pgTable("ai_insights_cache", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  /** Full AiInsightsResult JSON blob (summary, actions[], generatedAt, cacheKey). */
  result_json: jsonb("result_json").notNull(),
  generated_at: timestamp("generated_at").notNull().defaultNow(),
  expires_at: timestamp("expires_at").notNull(),
  /** Model used (e.g. claude-sonnet-4-6 or claude-haiku-4-5-20251001) — useful
   *  for cost-tracking and for invalidating the cache if we change models. */
  model: varchar("model", { length: 60 }),
  created_at: timestamp("created_at").defaultNow(),
}, (table) => ({
  clientIdx: index("idx_ai_insights_cache_client").on(table.client_id),
  expiresIdx: index("idx_ai_insights_cache_expires").on(table.expires_at),
}));

export const insertAiInsightsCacheSchema = createInsertSchema(aiInsightsCache).omit({
  id: true, created_at: true,
});
export type InsertAiInsightsCache = z.infer<typeof insertAiInsightsCacheSchema>;
export type AiInsightsCacheRow = typeof aiInsightsCache.$inferSelect;

/* ─── Dismissed actions ─── */
export const aiInsightsDismissedActions = pgTable("ai_insights_dismissed_actions", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  /** SHA256 hash of the action title (stable across regenerations of the
   *  same underlying recommendation — e.g. "Fix missing phone number"). */
  action_title_hash: varchar("action_title_hash", { length: 64 }).notNull(),
  /** Plain-text title at time of dismissal — kept for debugging only. */
  action_title: text("action_title"),
  dismissed_at: timestamp("dismissed_at").notNull().defaultNow(),
}, (table) => ({
  clientHashIdx: index("idx_ai_insights_dismissed_client_hash").on(table.client_id, table.action_title_hash),
}));

export const insertAiInsightsDismissedActionSchema = createInsertSchema(aiInsightsDismissedActions).omit({
  id: true, dismissed_at: true,
});
export type InsertAiInsightsDismissedAction = z.infer<typeof insertAiInsightsDismissedActionSchema>;
export type AiInsightsDismissedAction = typeof aiInsightsDismissedActions.$inferSelect;
