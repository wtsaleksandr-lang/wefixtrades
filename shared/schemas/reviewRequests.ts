import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./adminCrm";

/**
 * Review request tracking — manages automated review solicitation
 * after completed jobs. Shared between ReputationShield and SocialSync.
 */
export const reviewRequests = pgTable("review_requests", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  source_type: varchar("source_type", { length: 30 }).notNull(),
  // booking | fulfillment_task | manual
  source_id: integer("source_id"),                             // FK to bookings.id or fulfillment_tasks.id
  customer_name: text("customer_name"),
  customer_phone: text("customer_phone"),
  customer_email: text("customer_email"),
  channel: varchar("channel", { length: 20 }).notNull(),
  // sms | email
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // pending | sent | delivered | failed | skipped | cancelled
  review_link: text("review_link").notNull(),
  message_text: text("message_text"),                          // The actual message sent
  run_at: timestamp("run_at").notNull(),                       // When to send
  sent_at: timestamp("sent_at"),
  delivery_result: jsonb("delivery_result"),                   // Response from SMS/email provider
  failure_reason: text("failure_reason"),
  dedup_key: varchar("dedup_key", { length: 128 }),            // Prevents duplicate sends
  // Attribution
  attributed_review_id: integer("attributed_review_id"),       // FK to reviews.id if matched
  attribution_confidence: varchar("attribution_confidence", { length: 20 }),
  // high | medium | low | null
  attribution_reason: text("attribution_reason"),              // e.g. "name_match + timing"
  attributed_at: timestamp("attributed_at"),
  attempts: integer("attempts").notNull().default(0),
  max_attempts: integer("max_attempts").notNull().default(2),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const insertReviewRequestSchema = createInsertSchema(reviewRequests).omit({ id: true, created_at: true, updated_at: true });
export type InsertReviewRequest = z.infer<typeof insertReviewRequestSchema>;
export type ReviewRequest = typeof reviewRequests.$inferSelect;
