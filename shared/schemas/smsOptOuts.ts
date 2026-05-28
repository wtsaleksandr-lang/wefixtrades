/**
 * SMS opt-out registry.
 *
 * One row per opted-out phone number (E.164). Every outbound SMS path MUST
 * consult this table before dispatch — the canonical check is wired into
 * `sendSMS()` in server/twilioClient.ts so all callers inherit it.
 *
 * Writes:
 *   - Twilio inbound webhook on STOP / STOPALL / UNSUBSCRIBE / CANCEL / END /
 *     QUIT keywords (server/routes/twilioRoutes.ts) — reason 'stop_keyword'.
 *   - Manual admin action — reason 'manual'.
 *   - Carrier hard-bounce processing — reason 'hard_bounce'.
 *
 * Backed by migration 0054_sms_opt_outs.sql.
 */

import { pgTable, bigserial, integer, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const smsOptOuts = pgTable(
  "sms_opt_outs",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    /** E.164-formatted phone number, e.g. "+19156153280". */
    phone_e164: text("phone_e164").notNull(),
    /**
     * Wave 77 — per-tenant SMS routing. NULL ⇒ global opt-out (STOP texted
     * to the shared WeFixTrades brand line, applies to every tenant). When
     * set, the opt-out applies ONLY to outbound SMS sent on behalf of that
     * client (i.e. via `sendSmsAsClient({ clientId, ... })`). A homeowner
     * who texts STOP to "John's Plumbing" gets a row with John's client_id
     * — Mary's Roofing can still text them. See migration
     * 0068_sms_opt_outs_scope.sql for the index strategy.
     */
    scope_client_id: integer("scope_client_id"),
    /** 'stop_keyword' | 'manual' | 'hard_bounce' | free-form. */
    opt_out_reason: text("opt_out_reason"),
    opt_out_at: timestamp("opt_out_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    phoneIdx: index("idx_sms_opt_outs_phone").on(table.phone_e164),
    phoneScopeIdx: index("idx_sms_opt_outs_phone_scope").on(
      table.phone_e164,
      table.scope_client_id,
    ),
    // Wave 77 — partial unique indexes from migration 0068. Together they
    // allow one global opt-out per phone PLUS one per-client opt-out per
    // (phone, client) pair. The WHERE predicates must match the SQL
    // exactly for the schema-drift guard.
    uniqPhoneGlobal: uniqueIndex("uniq_sms_opt_outs_phone_global")
      .on(table.phone_e164)
      .where(sql`scope_client_id IS NULL`),
    uniqPhoneScope: uniqueIndex("uniq_sms_opt_outs_phone_scope")
      .on(table.phone_e164, table.scope_client_id)
      .where(sql`scope_client_id IS NOT NULL`),
  }),
);

export const insertSmsOptOutSchema = createInsertSchema(smsOptOuts).omit({
  id: true,
  opt_out_at: true,
});
export type InsertSmsOptOut = z.infer<typeof insertSmsOptOutSchema>;
export type SmsOptOut = typeof smsOptOuts.$inferSelect;
