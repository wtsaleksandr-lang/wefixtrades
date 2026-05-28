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

import { pgTable, serial, integer, varchar, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
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

    /* ─── Wave 86 — AI-assisted porting automation ─── */
    // Claude vision bill OCR result + per-field confidence. Structured fields
    // also surface in the wizard for user review/edit before submit.
    port_extraction_json: jsonb("port_extraction_json"),
    port_extraction_at: timestamp("port_extraction_at"),
    // Generated LOA PDF (encrypted object key). Distinct from the raw
    // signature PNG below — the PDF is what Twilio receives, the PNG is
    // retained as an audit artefact of which canvas bytes were embedded.
    port_loa_pdf_object_key: text("port_loa_pdf_object_key"),
    port_signature_object_key: text("port_signature_object_key"),
    port_signature_method: varchar("port_signature_method", { length: 40 }),
    port_signature_ip_hash: varchar("port_signature_ip_hash", { length: 64 }),
    port_signature_user_agent: varchar("port_signature_user_agent", { length: 255 }),
    // Twilio porting API integration (Layer 4).
    port_twilio_order_sid: varchar("port_twilio_order_sid", { length: 64 }),
    port_twilio_target_date: timestamp("port_twilio_target_date"),
    port_estimated_completion: timestamp("port_estimated_completion"),
    // Status poller (Layer 5) + rejection translator (Layer 6).
    port_last_polled_at: timestamp("port_last_polled_at"),
    port_rejection_code: varchar("port_rejection_code", { length: 64 }),
    // Cancellation tracking — customer can cancel via portal, admin via panel,
    // or carrier denies (port_canceled_by='twilio_rejection').
    port_canceled_at: timestamp("port_canceled_at"),
    port_canceled_by: varchar("port_canceled_by", { length: 24 }),

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
    /** Wave 86 — Status poller sweeps every 4h on (status, last_polled_at). */
    portPollingIdx: index("idx_tps_port_polling").on(
      table.port_status,
      table.port_last_polled_at,
    ),
    /** Wave 86 — Twilio order SID lookups (webhook + admin search). */
    portTwilioOrderSidIdx: index("idx_tps_port_twilio_order_sid").on(
      table.port_twilio_order_sid,
    ),
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
  // Wave 86 — bill OCR ran successfully but user hasn't confirmed yet.
  "bill_extracted",
  "bill_uploaded",
  "loa_signed",
  "submitted",
  // Wave 86 — Twilio porting order accepted by Twilio + losing carrier
  // acknowledged. Polling for milestone updates.
  "pending_carrier_action",
  // Wave 86 — Twilio asked for additional docs. Rare; usually means LOA was
  // rejected for a fixable reason.
  "pending_loa",
  "in_progress",
  "approved",
  // Wave 86 — terminal: port completed and number is live on Twilio.
  "port_complete",
  "rejected",
  // Wave 86 — terminal: port failed; rejection translator has a fix.
  "port_failed",
  // Wave 86 — terminal: customer or admin canceled mid-flight.
  "canceled",
  "test_submitted", // TRADELINE_SETUP_TEST_MODE bypass
]);
export type PortStatus = z.infer<typeof portStatusSchema>;

/**
 * Wave 86 — In-transit statuses the poller should keep checking.
 * Terminal statuses (port_complete, port_failed, rejected, approved,
 * canceled) are excluded so the worker query stays small.
 */
export const PORT_IN_TRANSIT_STATUSES: PortStatus[] = [
  "submitted",
  "pending_carrier_action",
  "pending_loa",
  "in_progress",
];

/**
 * Wave 86 — Terminal statuses (no further polling, drives retention).
 */
export const PORT_TERMINAL_STATUSES: PortStatus[] = [
  "approved",
  "port_complete",
  "rejected",
  "port_failed",
  "canceled",
];

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
