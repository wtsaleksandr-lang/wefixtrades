/**
 * tradeline_phone_setups
 *
 * Wizard-journey audit record for the three-option phone-number setup
 * (new / forward / port). Companion to the canonical runtime config in
 * client_services.metadata.tradelineConfig — the two are written
 * atomically inside db.transaction() by the wizard route handlers.
 *
 * Lifecycle: one row per client (uniqueness enforced by the FK + .unique()).
 * Inserted when the wizard starts. Updated as the user picks a mode and
 * works through the option-specific flow. Either completed_at OR
 * abandoned_at + last_step are set on terminal states.
 *
 * Phone-bill PDFs (Option C) live in Replit Object Storage encrypted at
 * the application layer; only the object key (port_bill_object_key) is
 * stored here. 90-day retention worker reads port_resolved_at to know
 * when to delete encrypted bills.
 *
 * No `metadata` JSONB column — every flag is a typed column. Add new
 * typed columns when needs arise; don't reintroduce a dumping ground.
 *
 * On client deletion (GDPR right-to-be-forgotten / account deletion),
 * this row is cascaded so PII references (customer_number, carrier)
 * don't get orphaned.
 */

import { pgTable, serial, integer, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./adminCrm";

export const tradelinePhoneSetups = pgTable(
  "tradeline_phone_setups",
  {
    id: serial("id").primaryKey(),
    client_id: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" })
      .unique(),

    /* ─── Wizard journey ─── */
    mode: varchar("mode", { length: 20 }), // 'new' | 'forward' | 'port'; null until chosen
    last_step: varchar("last_step", { length: 50 }), // analytics for abandonment funnel
    started_at: timestamp("started_at").notNull().defaultNow(),
    completed_at: timestamp("completed_at"),
    abandoned_at: timestamp("abandoned_at"),

    /* ─── Option A — new WeFixTrades number ─── */
    assigned_number: varchar("assigned_number", { length: 30 }),
    assigned_number_sid: varchar("assigned_number_sid", { length: 50 }),
    provisioning_status: varchar("provisioning_status", { length: 30 }),
    // 'pending' | 'queued' (Twilio admin not yet configured) | 'provisioned' | 'failed'
    provisioning_failed_reason: text("provisioning_failed_reason"),
    provisioned_at: timestamp("provisioned_at"),

    /* ─── Option B — forward existing number ─── */
    customer_number: varchar("customer_number", { length: 30 }),
    carrier: varchar("carrier", { length: 30 }), // CarrierKey from shared/api-types/carrierCodes
    carrier_country: varchar("carrier_country", { length: 2 }), // 'US' | 'CA'
    forwarding_activation_attempted_at: timestamp("forwarding_activation_attempted_at"),
    forwarding_test_call_sid: varchar("forwarding_test_call_sid", { length: 50 }),
    forwarding_verified_at: timestamp("forwarding_verified_at"),
    forwarding_verified_method: varchar("forwarding_verified_method", { length: 40 }),
    // 'twilio_test_call' (auto, our outbound test call detected forwarding) |
    // 'manual_user_confirmation' (after retry, user clicked "I confirm it's working")

    /* ─── Option C — port existing number ─── */
    port_request_id: varchar("port_request_id", { length: 100 }),
    port_status: varchar("port_status", { length: 30 }),
    // 'draft' | 'bill_uploaded' | 'loa_signed' | 'submitted' | 'in_progress' | 'approved' | 'rejected' | 'test_submitted'
    port_loa_object_key: text("port_loa_object_key"),
    port_bill_object_key: text("port_bill_object_key"),
    port_loa_signed_at: timestamp("port_loa_signed_at"),
    port_bill_uploaded_at: timestamp("port_bill_uploaded_at"),
    port_submitted_at: timestamp("port_submitted_at"),
    port_resolved_at: timestamp("port_resolved_at"), // approved or rejected → drives 90-day retention
    port_rejection_reason: text("port_rejection_reason"),

    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    /**
     * Retention-cron composite index: WHERE port_status IN ('approved', 'rejected')
     * AND port_resolved_at < now() - 90d. Single index serves both filters.
     */
    portStatusResolvedIdx: index("idx_tps_port_status_resolved").on(
      table.port_status,
      table.port_resolved_at,
    ),
    /** Analytics funnel queries (completed-at distribution, mode breakdown). */
    completedAtIdx: index("idx_tps_completed_at").on(table.completed_at),
  }),
);

export const insertTradelinePhoneSetupSchema = createInsertSchema(tradelinePhoneSetups).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertTradelinePhoneSetup = z.infer<typeof insertTradelinePhoneSetupSchema>;
export type TradelinePhoneSetup = typeof tradelinePhoneSetups.$inferSelect;

/* ─── Application-layer enums (NOT enforced at DB level) ─── */

export const tradelineSetupModeSchema = z.enum(["new", "forward", "port"]);
export type TradelineSetupMode = z.infer<typeof tradelineSetupModeSchema>;

export const portStatusSchema = z.enum([
  "draft",
  "bill_uploaded",
  "loa_signed",
  "submitted",
  "in_progress",
  "approved",
  "rejected",
  "test_submitted", // TRADELINE_SETUP_TEST_MODE bypass
]);
export type PortStatus = z.infer<typeof portStatusSchema>;

export const provisioningStatusSchema = z.enum([
  "pending",
  "queued", // Twilio admin not yet configured — re-run when ready
  "provisioned",
  "failed",
]);
export type ProvisioningStatus = z.infer<typeof provisioningStatusSchema>;

export const forwardingVerifiedMethodSchema = z.enum([
  "twilio_test_call",        // automatic — our outbound test call detected forwarding
  "manual_user_confirmation", // after retry — user clicked "I confirm it's working"
]);
export type ForwardingVerifiedMethod = z.infer<typeof forwardingVerifiedMethodSchema>;
