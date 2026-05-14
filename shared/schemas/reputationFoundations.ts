import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./adminCrm";
import { users } from "./db";

/**
 * Async retry queue for reply posts. Replaces the synchronous "click
 * Post → either succeeds or fails immediately" flow with a durable
 * queue: post failures land here and a worker retries with exponential
 * backoff, escalating to `dead_letter` after `max_attempts`. Operators
 * get Slack alerts for dead letters; the existing post-to-google
 * endpoint still attempts a synchronous post first for the common
 * success case (no UX regression).
 */
export const reviewReplyPostQueue = pgTable("review_reply_post_queue", {
  id: serial("id").primaryKey(),
  monitored_review_id: integer("monitored_review_id").notNull(),
  client_id: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 30 }).notNull().default("google"),
  reply_text: text("reply_text").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // pending | in_flight | succeeded | failed | dead_letter
  attempts: integer("attempts").notNull().default(0),
  max_attempts: integer("max_attempts").notNull().default(5),
  next_attempt_at: timestamp("next_attempt_at").notNull().defaultNow(),
  last_error: text("last_error"),
  last_attempt_at: timestamp("last_attempt_at"),
  succeeded_at: timestamp("succeeded_at"),
  metadata: jsonb("metadata"),
  created_by: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const insertReplyQueueSchema = createInsertSchema(reviewReplyPostQueue).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertReplyQueueItem = z.infer<typeof insertReplyQueueSchema>;
export type ReplyQueueItem = typeof reviewReplyPostQueue.$inferSelect;

/**
 * Multi-location Google Business Profile mapping. `clients.google_place_id`
 * remains as the "primary" pointer for single-location code paths;
 * additional locations are tracked here.
 *
 * Partial unique index `idx_gbl_one_primary_per_client` enforces that
 * a client has at most one primary location.
 */
export const googleBusinessLocations = pgTable(
  "google_business_locations",
  {
    id: serial("id").primaryKey(),
    client_id: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    place_id: text("place_id").notNull(),
    location_name: text("location_name").notNull(),
    address: text("address"),
    is_primary: boolean("is_primary").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    clientPlaceUq: uniqueIndex("idx_gbl_client_place").on(t.client_id, t.place_id),
    onePrimaryPerClient: uniqueIndex("idx_gbl_one_primary_per_client")
      .on(t.client_id)
      .where(sql`${t.is_primary} = TRUE`),
  }),
);

export const insertGoogleLocationSchema = createInsertSchema(googleBusinessLocations).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertGoogleLocation = z.infer<typeof insertGoogleLocationSchema>;
export type GoogleLocation = typeof googleBusinessLocations.$inferSelect;
