import { pgTable, text, varchar, serial, integer, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./adminCrm";
import { users } from "./db";

/**
 * Per-client review-request DNC list. Mirror of prospects.do_not_contact
 * but scoped to the reputation surface. A customer who has been listed
 * here for a client will not receive review requests from that client
 * through any channel.
 *
 * Lookup pattern: by (client_id, lower(customer_email)) or (client_id, customer_phone).
 * Both are unique. One of email or phone must be present (DB constraint).
 */
export const reviewRequestSuppression = pgTable(
  "review_request_suppression",
  {
    id: serial("id").primaryKey(),
    client_id: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    customer_email: text("customer_email"),
    customer_phone: varchar("customer_phone", { length: 30 }),
    reason: text("reason"),
    source: varchar("source", { length: 40 }).notNull().default("manual"),
    // manual | customer_unsubscribe | bounce | complaint | admin_block
    suppressed_by: integer("suppressed_by").references(() => users.id, { onDelete: "set null" }),
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    emailUq: uniqueIndex("idx_review_suppression_email")
      .on(t.client_id, sql`lower(${t.customer_email})`)
      .where(sql`${t.customer_email} IS NOT NULL`),
    phoneUq: uniqueIndex("idx_review_suppression_phone")
      .on(t.client_id, t.customer_phone)
      .where(sql`${t.customer_phone} IS NOT NULL`),
  }),
);

export const insertReviewRequestSuppressionSchema = createInsertSchema(reviewRequestSuppression).omit({
  id: true,
  created_at: true,
});
export type InsertReviewRequestSuppression = z.infer<typeof insertReviewRequestSuppressionSchema>;
export type ReviewRequestSuppression = typeof reviewRequestSuppression.$inferSelect;

/* ───────────────────────────────────────────────────────────────────
 * Response edit audit — every change to monitored_reviews.draft_response
 * (AI generation, human edit, approval, rejection, publish) is logged
 * here. Drives a "history" panel in the admin reply UI and protects us
 * if a customer disputes a published response.
 * ─────────────────────────────────────────────────────────────────── */
export const reviewResponseEdits = pgTable("review_response_edits", {
  id: serial("id").primaryKey(),
  monitored_review_id: integer("monitored_review_id").notNull(),
  edited_by: integer("edited_by").references(() => users.id, { onDelete: "set null" }),
  edit_kind: varchar("edit_kind", { length: 30 }).notNull(),
  // ai_generated | human_edit | human_replace | approval | rejection | post_published
  old_text: text("old_text"),
  new_text: text("new_text"),
  reason: text("reason"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export const insertReviewResponseEditSchema = createInsertSchema(reviewResponseEdits).omit({
  id: true,
  created_at: true,
});
export type InsertReviewResponseEdit = z.infer<typeof insertReviewResponseEditSchema>;
export type ReviewResponseEdit = typeof reviewResponseEdits.$inferSelect;
