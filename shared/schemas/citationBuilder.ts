/**
 * Citation Builder — one-time submission service tables.
 *
 * Distinct from Citation Tracker (recurring monitoring subscription,
 * see citationTracker.ts). Citation Builder is a one-shot $79–$299
 * service that submits a customer's NAP to 25/50/100+ directories.
 *
 * One table:
 *   citation_builder_submissions — one row per paid order, tracks tier,
 *     business info, status, and per-submission directory progress.
 *
 * Wave 3.5 launch-wiring closeout (2026-05-25). Surfaced by the cross-
 * cutting audit that flagged the marketing page (PR #815) had no
 * Stripe/portal backing.
 */
import { pgTable, text, varchar, integer, timestamp, jsonb, uuid, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./db";

export const citationBuilderSubmissions = pgTable("citation_builder_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  customer_id: integer("customer_id").notNull().references(() => users.id),
  /** "starter" | "pro" | "premium" — matches CITATIONBUILDER tier ids (sans prefix) */
  tier: varchar("tier", { length: 20 }).notNull(),
  /** {name, address, phone, website, categories[]} — intake payload */
  business_info: jsonb("business_info").notNull(),
  /** "pending" | "in_progress" | "awaiting_info" | "completed" */
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  stripe_payment_intent_id: text("stripe_payment_intent_id"),
  stripe_session_id: text("stripe_session_id"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  completed_at: timestamp("completed_at"),
  directories_submitted_count: integer("directories_submitted_count").notNull().default(0),
  directories_total: integer("directories_total").notNull().default(0),
  /** Free-form notes for the ops team / customer service updates. */
  notes: text("notes"),
}, (table) => ({
  customerIdx: index("idx_citation_builder_subs_customer").on(table.customer_id),
  statusIdx: index("idx_citation_builder_subs_status").on(table.status),
  stripeSessionIdx: index("idx_citation_builder_subs_session").on(table.stripe_session_id),
}));

export const insertCitationBuilderSubmissionSchema = createInsertSchema(citationBuilderSubmissions).omit({
  id: true, created_at: true,
});
export type InsertCitationBuilderSubmission = z.infer<typeof insertCitationBuilderSubmissionSchema>;
export type CitationBuilderSubmission = typeof citationBuilderSubmissions.$inferSelect;

/**
 * Per-tier directory totals — used to populate `directories_total` at
 * order time so progress bars can render before the ops team starts.
 */
export const CITATION_BUILDER_TIER_DIRECTORIES: Record<string, number> = {
  starter: 25,
  pro: 50,
  premium: 100,
};

export const CITATION_BUILDER_TIER_PRICE_CENTS: Record<string, number> = {
  starter: 7900,
  pro: 17900,
  premium: 29900,
};
