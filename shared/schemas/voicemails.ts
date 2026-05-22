/**
 * voicemails
 *
 * One row per voicemail captured on a tradesperson's mobile/business
 * number. Populated by the Twilio recording-completed webhook
 * (see server/routes/voicemailRoutes.ts) and surfaced to the mobile
 * app at /api/mobile/voicemails for the inbox list.
 *
 * Keyed by call_sid (Twilio's CA... identifier) so retried webhook
 * deliveries are idempotent — Twilio retries on non-2xx.
 *
 * Transcription + summarization run asynchronously after the
 * synchronous insert, populating `transcript`, `summary`, and
 * `sentiment` on success. Failures leave the corresponding field
 * NULL — the UI degrades gracefully.
 */

import { pgTable, serial, integer, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users, leads } from "./db";

export const voicemails = pgTable(
  "voicemails",
  {
    id: serial("id").primaryKey(),
    /** Twilio CA... call SID. Unique. */
    call_sid: varchar("call_sid", { length: 50 }).notNull().unique(),
    /** Owner of the voicemail — the mobile user whose number was dialled. */
    user_id: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Lead match (if the From number resolves to a known lead). */
    lead_id: integer("lead_id").references(() => leads.id, { onDelete: "set null" }),
    /** PSTN caller number. */
    from_number: varchar("from_number", { length: 32 }).notNull(),
    /** Raw Twilio recording URL (api.twilio.com/.../Recordings/RE...). Proxy-fetched. */
    recording_url: text("recording_url").notNull(),
    /** Seconds, as reported by Twilio. */
    recording_duration: integer("recording_duration"),
    /** Whisper transcription. Null while pending or on failure. */
    transcript: text("transcript"),
    /** Claude-generated short summary. Null while pending or on failure. */
    summary: text("summary"),
    /** Claude-generated sentiment label: urgent|positive|neutral|negative. */
    sentiment: varchar("sentiment", { length: 16 }),
    /** Set when the user marks the voicemail as heard. */
    acknowledged_at: timestamp("acknowledged_at"),
    /** Soft-delete stamp from the shared-files retention sweep (BA-7). */
    deleted_at: timestamp("deleted_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_voicemails_user").on(table.user_id),
    createdIdx: index("idx_voicemails_created").on(table.created_at),
  }),
);

export const insertVoicemailSchema = createInsertSchema(voicemails).omit({
  id: true,
  created_at: true,
  acknowledged_at: true,
});
export type InsertVoicemail = z.infer<typeof insertVoicemailSchema>;
export type Voicemail = typeof voicemails.$inferSelect;

export const voicemailSentimentSchema = z.enum(["urgent", "positive", "neutral", "negative"]);
export type VoicemailSentiment = z.infer<typeof voicemailSentimentSchema>;
