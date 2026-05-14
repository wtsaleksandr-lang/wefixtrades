/**
 * mobile_call_records
 *
 * One row per call placed or received through the mobile softphone.
 * Populated by Twilio status callbacks on the outbound TwiML flow
 * (see server/routes/twilioVoiceCallbackRoutes.ts) and surfaced to
 * the mobile app at /api/mobile/calls for the history list.
 *
 * Keyed by call_sid (Twilio's CA... identifier) so status updates
 * are idempotent — Twilio retries on non-2xx and may resend events.
 */

import { pgTable, serial, integer, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./db";

export const mobileCallRecords = pgTable(
  "mobile_call_records",
  {
    id: serial("id").primaryKey(),
    /** Twilio CA... call SID. Unique. */
    call_sid: varchar("call_sid", { length: 50 }).notNull().unique(),
    /** Owner of the call — the mobile user. Inferred from `From` (client:user_N). */
    user_id: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    /** 'outbound' (mobile placed) | 'inbound' (mobile received via push). */
    direction: varchar("direction", { length: 16 }).notNull(),
    /** Caller identifier — for outbound this is the mobile identity; for inbound it's the PSTN caller. */
    from_number: varchar("from_number", { length: 32 }),
    /** Destination number — for outbound this is the PSTN destination. */
    to_number: varchar("to_number", { length: 32 }),
    /**
     * Twilio call status — most recent value seen.
     * Common: 'queued', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled'.
     */
    status: varchar("status", { length: 24 }).notNull(),
    /** Seconds, populated when status becomes 'completed'. */
    duration_sec: integer("duration_sec"),
    /** Optional notes — error code/message when status indicates failure. */
    notes: text("notes"),
    started_at: timestamp("started_at").notNull().defaultNow(),
    /** Set when status becomes a terminal one. */
    ended_at: timestamp("ended_at"),
  },
  (table) => ({
    userIdx: index("idx_mobile_call_records_user").on(table.user_id),
    startedIdx: index("idx_mobile_call_records_started").on(table.started_at),
  }),
);

export const insertMobileCallRecordSchema = createInsertSchema(mobileCallRecords).omit({
  id: true,
  started_at: true,
  ended_at: true,
});
export type InsertMobileCallRecord = z.infer<typeof insertMobileCallRecordSchema>;
export type MobileCallRecord = typeof mobileCallRecords.$inferSelect;

export const callDirectionSchema = z.enum(["outbound", "inbound"]);
export type CallDirection = z.infer<typeof callDirectionSchema>;
