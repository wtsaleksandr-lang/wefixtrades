import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./adminCrm";

/* ─── SocialSync Profiles (per-client automation config) ─── */
export const socialsyncProfiles = pgTable("socialsync_profiles", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id).unique(),
  enabled: boolean("enabled").notNull().default(false),
  niche: varchar("niche", { length: 100 }),                   // plumbing | electrical | roofing | hvac | cleaning | etc.
  location: text("location"),                                  // service area description
  services: jsonb("services"),                                 // string[] of services offered
  tone: varchar("tone", { length: 50 }).default("professional"),
  // professional | casual | friendly | authoritative
  frequency: varchar("frequency", { length: 30 }).default("3_per_week"),
  // daily | 3_per_week | 2_per_week | weekly
  autopilot: boolean("autopilot").notNull().default(false),
  platform_preferences: jsonb("platform_preferences"),         // string[] e.g. ["facebook","instagram"]
  service_focus: jsonb("service_focus"),                        // string[] subset of services to emphasize
  runtime_state: jsonb("runtime_state"),                        // per-platform cooldown & health tracking (managed by worker)
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertSocialSyncProfileSchema = createInsertSchema(socialsyncProfiles).omit({ id: true, created_at: true, updated_at: true });
export type InsertSocialSyncProfile = z.infer<typeof insertSocialSyncProfileSchema>;
export type SocialSyncProfile = typeof socialsyncProfiles.$inferSelect;

/* ─── SocialSync Topics (topic bank) ─── */
export const socialsyncTopics = pgTable("socialsync_topics", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  title: text("title").notNull(),
  type: varchar("type", { length: 30 }).notNull(),
  // tip | before_after | testimonial | seasonal | promo | educational | behind_the_scenes
  angle: text("angle"),                                        // specific hook/angle for the topic
  target_service: varchar("target_service", { length: 100 }),  // which service this promotes
  target_location: text("target_location"),                    // location tie-in
  source_type: varchar("source_type", { length: 30 }).notNull().default("ai_generated"),
  // ai_generated | manual | template
  status: varchar("status", { length: 30 }).notNull().default("active"),
  // active | used | archived | rejected
  generation_context: jsonb("generation_context"),             // metadata about how/why generated
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertSocialSyncTopicSchema = createInsertSchema(socialsyncTopics).omit({ id: true, created_at: true, updated_at: true });
export type InsertSocialSyncTopic = z.infer<typeof insertSocialSyncTopicSchema>;
export type SocialSyncTopic = typeof socialsyncTopics.$inferSelect;

/* ─── SocialSync Posts (generated content) ─── */
export const socialsyncPosts = pgTable("socialsync_posts", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  topic_id: integer("topic_id").references(() => socialsyncTopics.id),
  platform: varchar("platform", { length: 30 }).notNull(),
  // facebook | instagram | google_business | linkedin
  post_text: text("post_text").notNull(),
  caption: text("caption"),                                    // shorter caption variant
  hashtags: jsonb("hashtags"),                                 // string[]
  media_plan: jsonb("media_plan"),                             // { type, prompt, notes }
  status: varchar("status", { length: 30 }).notNull().default("draft"),
  // draft | ready | queued | publishing | published | failed | cancelled
  quality_score: integer("quality_score"),                     // 0-100
  duplicate_hash: varchar("duplicate_hash", { length: 64 }),   // SHA-256 of normalized post_text
  scheduled_for: timestamp("scheduled_for"),
  published_at: timestamp("published_at"),
  publish_result: jsonb("publish_result"),                     // response from publishing API (future)
  failure_reason: text("failure_reason"),
  created_by_system: boolean("created_by_system").notNull().default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertSocialSyncPostSchema = createInsertSchema(socialsyncPosts).omit({ id: true, created_at: true, updated_at: true });
export type InsertSocialSyncPost = z.infer<typeof insertSocialSyncPostSchema>;
export type SocialSyncPost = typeof socialsyncPosts.$inferSelect;

/* ─── SocialSync Publish Queue (job queue) ─── */
export const socialsyncPublishQueue = pgTable("socialsync_publish_queue", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  post_id: integer("post_id").notNull().references(() => socialsyncPosts.id),
  platform: varchar("platform", { length: 30 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  // pending | locked | completed | failed | cancelled
  run_at: timestamp("run_at").notNull(),
  locked_at: timestamp("locked_at"),                           // set when worker picks it up
  attempts: integer("attempts").notNull().default(0),
  max_attempts: integer("max_attempts").notNull().default(3),
  last_error: text("last_error"),
  worker_note: text("worker_note"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertSocialSyncQueueItemSchema = createInsertSchema(socialsyncPublishQueue).omit({ id: true, created_at: true, updated_at: true });
export type InsertSocialSyncQueueItem = z.infer<typeof insertSocialSyncQueueItemSchema>;
export type SocialSyncQueueItem = typeof socialsyncPublishQueue.$inferSelect;

/* ─── SocialSync Activity Logs (audit trail) ─── */
export const socialsyncActivityLogs = pgTable("socialsync_activity_logs", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  entity_type: varchar("entity_type", { length: 50 }).notNull(),
  // profile | topic | post | queue | connection
  entity_id: integer("entity_id"),
  action: varchar("action", { length: 100 }).notNull(),
  // e.g. "profile.updated", "topic.generated", "post.created", "queue.completed"
  status: varchar("status", { length: 30 }),
  // success | failure | info
  details: jsonb("details"),
  created_at: timestamp("created_at").defaultNow(),
});
export const insertSocialSyncActivityLogSchema = createInsertSchema(socialsyncActivityLogs).omit({ id: true, created_at: true });
export type InsertSocialSyncActivityLog = z.infer<typeof insertSocialSyncActivityLogSchema>;
export type SocialSyncActivityLog = typeof socialsyncActivityLogs.$inferSelect;

/* ─── SocialSync Platform Connections (OAuth stubs) ─── */
export const socialsyncPlatformConnections = pgTable("socialsync_platform_connections", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  platform: varchar("platform", { length: 30 }).notNull(),
  // facebook | instagram | google_business | linkedin
  connection_status: varchar("connection_status", { length: 30 }).notNull().default("not_connected"),
  // not_connected | pending | connected | expired | revoked | error
  external_account_id: text("external_account_id"),
  external_page_id: text("external_page_id"),
  token_ref: text("token_ref"),                                // reference to encrypted token, NOT raw secret
  token_expires_at: timestamp("token_expires_at"),
  last_validated_at: timestamp("last_validated_at"),
  metadata: jsonb("metadata"),                                 // platform-specific config (page name, etc.)
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertSocialSyncConnectionSchema = createInsertSchema(socialsyncPlatformConnections).omit({ id: true, created_at: true, updated_at: true });
export type InsertSocialSyncConnection = z.infer<typeof insertSocialSyncConnectionSchema>;
export type SocialSyncConnection = typeof socialsyncPlatformConnections.$inferSelect;
