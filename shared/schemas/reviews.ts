import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./adminCrm";

/**
 * Shared review infrastructure — usable by both SocialSync review automation
 * and future ReputationShield product features.
 */

/* ─── Reviews ─── */
export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  platform: varchar("platform", { length: 30 }).notNull(),
  // google_business | facebook | yelp | etc.
  external_review_id: text("external_review_id").notNull(),
  reviewer_name: text("reviewer_name"),
  star_rating: integer("star_rating"),                         // 1-5
  review_text: text("review_text"),
  review_time: timestamp("review_time"),                       // When review was posted on platform
  // Classification
  sentiment: varchar("sentiment", { length: 20 }),
  // positive | neutral | negative | urgent
  needs_reply: boolean("needs_reply").notNull().default(true),
  eligible_for_auto_reply: boolean("eligible_for_auto_reply").notNull().default(false),
  requires_human_attention: boolean("requires_human_attention").notNull().default(false),
  // Reply state
  reply_status: varchar("reply_status", { length: 30 }).notNull().default("pending"),
  // pending | draft_ready | auto_replied | manually_replied | skipped | failed
  reply_text: text("reply_text"),                              // Generated or manually written reply
  reply_posted_at: timestamp("reply_posted_at"),
  reply_result: jsonb("reply_result"),                         // API response from posting reply
  has_existing_owner_reply: boolean("has_existing_owner_reply").notNull().default(false),
  // Metadata
  escalation_flag: boolean("escalation_flag").notNull().default(false),
  metadata: jsonb("metadata"),                                 // Platform-specific raw data
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertReviewSchema = createInsertSchema(reviews).omit({ id: true, created_at: true, updated_at: true });
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviews.$inferSelect;

/* ─── Review Sync Log ─── */
export const reviewSyncLogs = pgTable("review_sync_logs", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  platform: varchar("platform", { length: 30 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  // success | failure
  reviews_fetched: integer("reviews_fetched").default(0),
  new_reviews: integer("new_reviews").default(0),
  replies_posted: integer("replies_posted").default(0),
  error: text("error"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
});
export const insertReviewSyncLogSchema = createInsertSchema(reviewSyncLogs).omit({ id: true, created_at: true });
export type InsertReviewSyncLog = z.infer<typeof insertReviewSyncLogSchema>;
export type ReviewSyncLog = typeof reviewSyncLogs.$inferSelect;
