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

import { pgTable, bigserial, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const smsOptOuts = pgTable(
  "sms_opt_outs",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    /** E.164-formatted phone number, e.g. "+19156153280". Unique. */
    phone_e164: text("phone_e164").notNull().unique(),
    /** 'stop_keyword' | 'manual' | 'hard_bounce' | free-form. */
    opt_out_reason: text("opt_out_reason"),
    opt_out_at: timestamp("opt_out_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    phoneIdx: index("idx_sms_opt_outs_phone").on(table.phone_e164),
  }),
);

export const insertSmsOptOutSchema = createInsertSchema(smsOptOuts).omit({
  id: true,
  opt_out_at: true,
});
export type InsertSmsOptOut = z.infer<typeof insertSmsOptOutSchema>;
export type SmsOptOut = typeof smsOptOuts.$inferSelect;
