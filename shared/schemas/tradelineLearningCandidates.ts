/**
 * tradeline_learning_candidates
 *
 * Queue of proposed updates to niche AI templates. Sources:
 *   - kind='research' — output of the Researcher AI scanning whitelisted
 *     authoritative sources (NFPA, EPA, OSHA, state licensing boards…)
 *   - kind='conversation' — V2 of the pipeline: summarizer extracts
 *     domain knowledge from real (non-PII) call transcripts. Not built yet.
 *   - kind='manual' — admin-added candidate (paste-from-source workflow).
 *
 * Lifecycle: pending → approved | rejected.
 * Approved candidates can be applied to a template via the
 * /admin/tradeline/templates editor (PR #137). The candidate row
 * preserves the original suggestion + source URL for audit even
 * after the template is updated.
 */

import { pgTable, serial, varchar, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const LEARNING_CANDIDATE_KINDS = ["research", "conversation", "manual"] as const;
export const LEARNING_CANDIDATE_STATUSES = ["pending", "approved", "rejected"] as const;
export const TEMPLATE_KIND_VALUES_LC = ["tradeline", "concierge"] as const;

export const tradelineLearningCandidates = pgTable(
  "tradeline_learning_candidates",
  {
    id: serial("id").primaryKey(),
    /** Which niche this candidate belongs to (matches template_id) */
    niche: varchar("niche", { length: 64 }).notNull(),
    /** Which AI brain the suggestion targets */
    template_kind: varchar("template_kind", { length: 16 }).notNull(), // 'tradeline' | 'concierge'
    /** Where the candidate came from */
    kind: varchar("kind", { length: 20 }).notNull(),
    /** Source URL (research / conversation_id / null if manual) */
    source_url: text("source_url"),
    /** Short title for the queue list */
    title: text("title").notNull(),
    /** Body — the actual suggested addition / change */
    body: text("body").notNull(),
    /** Optional structured proposed-field-updates blob, mergeable into TemplateOverride */
    proposed_field_updates: jsonb("proposed_field_updates").$type<Record<string, unknown>>(),
    /** Status enum */
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    /** Admin user who reviewed (assigned to approve/reject) */
    reviewed_by: integer("reviewed_by"),
    /** When reviewed */
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
    /** Optional reason for rejection */
    rejection_reason: text("rejection_reason"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("tradeline_learning_candidates_status_idx").on(table.status),
    nicheIdx: index("tradeline_learning_candidates_niche_idx").on(table.niche),
  }),
);

export const insertTradelineLearningCandidateSchema = createInsertSchema(tradelineLearningCandidates).omit({
  id: true,
  created_at: true,
});
export type TradelineLearningCandidate = typeof tradelineLearningCandidates.$inferSelect;
export type InsertTradelineLearningCandidate = z.infer<typeof insertTradelineLearningCandidateSchema>;
