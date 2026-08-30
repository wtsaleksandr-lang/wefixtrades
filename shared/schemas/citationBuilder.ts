/**
 * Citation Builder — one-time submission service tables.
 *
 * Distinct from Citation Tracker (recurring monitoring subscription,
 * see citationTracker.ts). Citation Builder is a one-shot $79–$299
 * service in which a HUMAN operator submits a customer's NAP to a set
 * of directories.
 *
 * Two tables:
 *   citation_builder_submissions      — one row per paid order.
 *   citation_builder_directory_tasks  — one row per (order × directory).
 *     This is the ONLY record of work performed. Nothing else in the
 *     product may assert that a directory was submitted to.
 *
 * WHY THE SECOND TABLE EXISTS
 * ---------------------------
 * Until 2026-08-29 this product took $79–$299, inserted a submission row
 * at status='pending', and stopped. No admin route, worker or cron ever
 * moved a row off 'pending'; the two written progress/completion email
 * helpers had zero callers. The customer paid and nothing happened.
 *
 * The naive fix — let an admin PATCH `status` and
 * `directories_submitted_count` directly — reintroduces the defect class
 * this repo has spent several PRs removing (rankflowWorker's canned
 * "[AI-generated] Task completed", AdFlow's synthetic metrics,
 * sitelaunch's setTimeout SSL "activation"): a number a human types is
 * indistinguishable from a number a human earned.
 *
 * So progress is DERIVED, never asserted. `directories_submitted_count`
 * and `directories_total` are mirrors recomputed from the task rows
 * (see server/services/citationBuilder/fulfilment.ts); no route accepts
 * them from a client. A customer can only ever be told "listed on X"
 * because an operator recorded a row saying so, with a URL.
 */
import { pgTable, text, varchar, integer, timestamp, jsonb, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
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
  /**
   * MIRROR of `count(citation_builder_directory_tasks WHERE status IN
   * ('submitted','live'))`. Recomputed by recountSubmission() after every
   * task write. Never accepted from a request body — see the guard
   * `npm run check:citation-builder-fulfilment`.
   */
  directories_submitted_count: integer("directories_submitted_count").notNull().default(0),
  /**
   * MIRROR of `count(citation_builder_directory_tasks)` for this order —
   * i.e. how many directories the operator was actually assigned, which
   * is the tier's real registry size, not a marketing number.
   */
  directories_total: integer("directories_total").notNull().default(0),
  /** Free-form notes for the ops team / customer service updates. */
  notes: text("notes"),
  /** Stamped when an operator opens the order and the task rows are cut. */
  started_at: timestamp("started_at"),
  /**
   * Idempotency stamps. Each email may be sent at most once per order, and
   * only from the fulfilment service, and only off recorded task rows.
   */
  progress_email_sent_at: timestamp("progress_email_sent_at"),
  completion_email_sent_at: timestamp("completion_email_sent_at"),
}, (table) => ({
  customerIdx: index("idx_citation_builder_subs_customer").on(table.customer_id),
  statusIdx: index("idx_citation_builder_subs_status").on(table.status),
  stripeSessionIdx: uniqueIndex("uq_cb_subs_stripe_session").on(table.stripe_session_id),
}));

/**
 * One row per (order × directory). Created when an operator STARTS an
 * order — never at purchase time, because an unstarted order has had no
 * work done on it and must not render as a checklist of pending promises.
 *
 * `status` is the operator's record of what they did:
 *   not_started    — assigned, nothing done yet.
 *   submitted      — the form was filled and sent; awaiting the directory.
 *   live           — the listing was verified live. REQUIRES listing_url.
 *   rejected       — the directory refused it. REQUIRES a note.
 *   not_applicable — out of scope for this business (wrong country,
 *                    wrong trade, duplicate of an existing listing).
 *                    REQUIRES a note.
 *
 * Only `live` may ever be described to a customer as a listing.
 */
export const citationBuilderDirectoryTasks = pgTable("citation_builder_directory_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  submission_id: uuid("submission_id").notNull().references(() => citationBuilderSubmissions.id),
  /** Slug from CITATION_BUILDER_DIRECTORIES (server/services/citationBuilder/directories.ts). */
  directory_id: varchar("directory_id", { length: 64 }).notNull(),
  /** Display name snapshotted at assignment so a registry edit can't rewrite history. */
  directory_name: varchar("directory_name", { length: 160 }).notNull(),
  /** not_started | submitted | live | rejected | not_applicable */
  status: varchar("status", { length: 20 }).notNull().default("not_started"),
  /** The live listing URL. Required before a task may be marked `live`. */
  listing_url: text("listing_url"),
  /** Operator note. Required for `rejected` and `not_applicable`. */
  note: text("note"),
  submitted_at: timestamp("submitted_at"),
  live_at: timestamp("live_at"),
  /**
   * users.id of the operator who last wrote this row. Deliberately NOT a
   * foreign key: this is an audit stamp about staff, and deleting a former
   * operator's account must never block or rewrite a customer's fulfilment
   * record. Same reasoning as audit_log.actor_id.
   */
  updated_by: integer("updated_by"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  submissionIdx: index("idx_cb_dir_tasks_submission").on(table.submission_id),
  statusIdx: index("idx_cb_dir_tasks_status").on(table.status),
  uniqPerDirectory: uniqueIndex("uq_cb_dir_tasks_submission_directory").on(
    table.submission_id,
    table.directory_id,
  ),
}));

export const insertCitationBuilderSubmissionSchema = createInsertSchema(citationBuilderSubmissions).omit({
  id: true, created_at: true,
});
export type InsertCitationBuilderSubmission = z.infer<typeof insertCitationBuilderSubmissionSchema>;
export type CitationBuilderSubmission = typeof citationBuilderSubmissions.$inferSelect;
export type CitationBuilderDirectoryTask = typeof citationBuilderDirectoryTasks.$inferSelect;

/** Every state an operator may record against one directory. */
export const CITATION_BUILDER_TASK_STATUSES = [
  "not_started",
  "submitted",
  "live",
  "rejected",
  "not_applicable",
] as const;
export type CitationBuilderTaskStatus = (typeof CITATION_BUILDER_TASK_STATUSES)[number];

/** Order lifecycle. `completed` is reachable only via the fulfilment service. */
export const CITATION_BUILDER_SUBMISSION_STATUSES = [
  "pending",
  "in_progress",
  "awaiting_info",
  "completed",
] as const;
export type CitationBuilderSubmissionStatus = (typeof CITATION_BUILDER_SUBMISSION_STATUSES)[number];

/**
 * A task in one of these states needs no further operator action — the
 * outcome is recorded either way. An order can only be completed when
 * every one of its tasks is terminal.
 */
export const CITATION_BUILDER_TERMINAL_TASK_STATUSES: readonly CitationBuilderTaskStatus[] = [
  "live",
  "rejected",
  "not_applicable",
];

export const CITATION_BUILDER_TIER_PRICE_CENTS: Record<string, number> = {
  starter: 7900,
  pro: 17900,
  premium: 29900,
};
