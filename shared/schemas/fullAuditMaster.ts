/**
 * Full Audit Master — $9.80 one-time paid audit ordered from the free
 * tool pages. Distinct from the per-tool free audits (no DB), this is
 * a paid combined-audit deliverable produced after Stripe checkout.
 *
 * Wave 3.5 launch-wiring closeout (2026-05-25).
 */
import { pgTable, text, varchar, timestamp, jsonb, uuid, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const fullAuditMasterOrders = pgTable("full_audit_master_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  customer_email: text("customer_email").notNull(),
  business_url: text("business_url").notNull(),
  /** "pending" | "running" | "completed" | "failed" */
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  stripe_payment_intent_id: text("stripe_payment_intent_id"),
  stripe_session_id: text("stripe_session_id"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  completed_at: timestamp("completed_at"),
  /** Cached audit result for portal/email rendering — MasterAuditReport JSON. */
  result_payload: jsonb("result_payload"),
  result_pdf_url: text("result_pdf_url"),
  // ─── Wave 3.6 pipeline bookkeeping ───
  /** URL-safe secret paired with id in the public report-view route. */
  report_share_token: text("report_share_token"),
  /** Pipeline start timestamp — surfaces orders that hang in "running". */
  started_at: timestamp("started_at"),
  /** Set when status transitions to "failed". */
  failed_at: timestamp("failed_at"),
  /** Short reason string for support triage on failed orders. */
  error_message: text("error_message"),
}, (table) => ({
  emailIdx: index("idx_full_audit_master_orders_email").on(table.customer_email),
  sessionIdx: index("idx_full_audit_master_orders_session").on(table.stripe_session_id),
  statusIdx: index("idx_full_audit_master_orders_status").on(table.status),
  tokenIdx: index("idx_full_audit_master_orders_token").on(table.report_share_token),
}));

export const insertFullAuditMasterOrderSchema = createInsertSchema(fullAuditMasterOrders).omit({
  id: true, created_at: true,
});
export type InsertFullAuditMasterOrder = z.infer<typeof insertFullAuditMasterOrderSchema>;
export type FullAuditMasterOrder = typeof fullAuditMasterOrders.$inferSelect;
