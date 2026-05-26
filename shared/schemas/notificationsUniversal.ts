/**
 * Wave 32 — Universal notifications schema.
 *
 * Three tables backing the central dispatcher + web-push channel:
 *   - customer_notification_preferences : per-customer × event opt-in row
 *   - customer_push_subscriptions       : Web Push subscriptions (one per
 *                                         browser × device)
 *   - notification_log                  : delivery audit / idempotency
 *
 * Persistence note: per-event opt-ins still primarily live inside
 * `clients.metadata.<product>_notifications` blobs (Waves 27-31). This
 * table is reserved for future flows that need indexed queries; no data
 * migration is required on rollout.
 */

import {
  pgTable,
  text,
  varchar,
  serial,
  integer,
  timestamp,
  jsonb,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const customerNotificationPreferences = pgTable(
  "customer_notification_preferences",
  {
    id: serial("id").primaryKey(),
    client_id: integer("client_id").notNull(),
    product: varchar("product", { length: 32 }).notNull(),
    event_key: varchar("event_key", { length: 64 }).notNull(),
    channels: jsonb("channels").notNull().default([]),
    enabled: boolean("enabled").notNull().default(true),
    quiet_hours_start: varchar("quiet_hours_start", { length: 5 }),
    quiet_hours_end: varchar("quiet_hours_end", { length: 5 }),
    timezone: varchar("timezone", { length: 64 })
      .notNull()
      .default("America/New_York"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_customer_notif_prefs_unique").on(
      table.client_id,
      table.product,
      table.event_key,
    ),
    index("idx_customer_notif_prefs_client").on(table.client_id),
  ],
);
export const insertCustomerNotificationPreferenceSchema = createInsertSchema(
  customerNotificationPreferences,
).omit({ id: true, created_at: true, updated_at: true });
export type InsertCustomerNotificationPreference = z.infer<
  typeof insertCustomerNotificationPreferenceSchema
>;
export type CustomerNotificationPreference =
  typeof customerNotificationPreferences.$inferSelect;

export const customerPushSubscriptions = pgTable(
  "customer_push_subscriptions",
  {
    id: serial("id").primaryKey(),
    client_id: integer("client_id").notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh_key: text("p256dh_key").notNull(),
    auth_key: text("auth_key").notNull(),
    user_agent: text("user_agent"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    last_used_at: timestamp("last_used_at"),
  },
  (table) => [
    uniqueIndex("idx_push_subs_endpoint").on(table.endpoint),
    index("idx_push_subs_client").on(table.client_id),
  ],
);
export const insertCustomerPushSubscriptionSchema = createInsertSchema(
  customerPushSubscriptions,
).omit({ id: true, created_at: true });
export type InsertCustomerPushSubscription = z.infer<
  typeof insertCustomerPushSubscriptionSchema
>;
export type CustomerPushSubscription =
  typeof customerPushSubscriptions.$inferSelect;

export const notificationLog = pgTable(
  "notification_log",
  {
    id: serial("id").primaryKey(),
    client_id: integer("client_id").notNull(),
    product: varchar("product", { length: 32 }).notNull(),
    event_key: varchar("event_key", { length: 64 }).notNull(),
    channel: varchar("channel", { length: 16 }).notNull(),
    // sent | failed | skipped_opt_out | skipped_quiet_hours | skipped_duplicate | skipped_no_subscription
    status: varchar("status", { length: 32 }).notNull(),
    day_bucket: varchar("day_bucket", { length: 10 }).notNull(),
    payload_summary: jsonb("payload_summary"),
    error_message: text("error_message"),
    recorded_at: timestamp("recorded_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_notif_log_client_recorded").on(
      table.client_id,
      table.recorded_at,
    ),
    index("idx_notif_log_idempotency").on(
      table.client_id,
      table.product,
      table.event_key,
      table.channel,
      table.day_bucket,
    ),
    index("idx_notif_log_status").on(table.status, table.recorded_at),
  ],
);
export const insertNotificationLogSchema = createInsertSchema(notificationLog).omit(
  { id: true, recorded_at: true },
);
export type InsertNotificationLog = z.infer<typeof insertNotificationLogSchema>;
export type NotificationLog = typeof notificationLog.$inferSelect;
