/**
 * tradeline_chat_install_requests
 *
 * Service-delivery queue for the "Install my chat widget for me" upsell.
 *
 * Flow:
 *   Starter tier → Stripe Checkout for $79 one-time → onboarding form
 *     → row created with paid_at = now()
 *   Pro tier → onboarding form directly → row created with paid_at = NULL,
 *     priority flag implicit via client_services lookup
 *
 * Admin queue (/admin/install-queue) lists rows in PENDING_STATUSES,
 * supports assign + status updates.
 */

import { pgTable, serial, integer, varchar, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./adminCrm";

export const INSTALL_REQUEST_STATUSES = [
  "awaiting_payment",  // Stripe Checkout opened but not yet completed (Starter only)
  "awaiting_form",     // Paid (or Pro tier) — needs to fill onboarding form
  "form_submitted",    // Form complete, waiting for admin pickup
  "in_progress",       // Admin assigned + actively working
  "completed",         // Snippet installed, customer notified
  "cancelled",         // Customer withdrew or refund issued
] as const;

export type InstallRequestStatus = (typeof INSTALL_REQUEST_STATUSES)[number];

export const WEBSITE_PLATFORMS = [
  "wordpress",
  "wix",
  "squarespace",
  "shopify",
  "custom",
  "unknown",
] as const;

export const ACCESS_METHODS = [
  "credentials",   // Login credentials supplied via secure form
  "collaborator",  // Trade added our installer email as admin/collaborator
  "other",
] as const;

export const tradelineChatInstallRequests = pgTable(
  "tradeline_chat_install_requests",
  {
    id: serial("id").primaryKey(),
    client_id: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),

    /** Stripe session id for Starter-tier flow; NULL for Pro tier (free) */
    stripe_session_id: varchar("stripe_session_id", { length: 200 }),
    /** Set on successful checkout; NULL for Pro tier or unpaid Starter */
    paid_at: timestamp("paid_at", { withTimezone: true }),
    /** Status enum — see INSTALL_REQUEST_STATUSES */
    status: varchar("status", { length: 30 }).notNull().default("awaiting_payment"),

    /** Form fields — captured after payment (Starter) or directly (Pro) */
    website_url: text("website_url"),
    website_platform: varchar("website_platform", { length: 30 }),
    access_method: varchar("access_method", { length: 30 }),
    /** If access_method='credentials' — encrypted blob with login/password */
    access_credentials_encrypted: text("access_credentials_encrypted"),
    widget_position: varchar("widget_position", { length: 30 }),
    greeting_message: text("greeting_message"),
    /** Pages where the widget should NOT show — array of URL patterns */
    excluded_pages: jsonb("excluded_pages").$type<string[]>(),
    /** Free-form notes from the trade */
    customer_notes: text("customer_notes"),
    /** Was Pro at time of request (skipped Stripe) */
    is_pro_at_request: integer("is_pro_at_request").default(0).notNull(),

    /** Admin user id if assigned; NULL = unassigned */
    assigned_to: integer("assigned_to"),
    /** Admin notes / changelog */
    admin_notes: text("admin_notes"),

    /** When form was submitted (status → form_submitted) */
    form_submitted_at: timestamp("form_submitted_at", { withTimezone: true }),
    /** When admin assigned (status → in_progress) */
    started_at: timestamp("started_at", { withTimezone: true }),
    /** When install completed (status → completed) */
    completed_at: timestamp("completed_at", { withTimezone: true }),

    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("tradeline_chat_install_requests_status_idx").on(table.status),
    clientIdx: index("tradeline_chat_install_requests_client_idx").on(table.client_id),
  }),
);

export const insertTradelineChatInstallRequestSchema = createInsertSchema(tradelineChatInstallRequests).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type TradelineChatInstallRequest = typeof tradelineChatInstallRequests.$inferSelect;
export type InsertTradelineChatInstallRequest = z.infer<typeof insertTradelineChatInstallRequestSchema>;
