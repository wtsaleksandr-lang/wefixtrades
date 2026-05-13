/**
 * mobile_devices
 *
 * One row per logged-in mobile installation. Stores the push token so
 * we can target VoIP push (iOS) / FCM (Android) when an incoming call
 * arrives for that user.
 *
 * A single user can have multiple devices (phone + tablet). When a
 * user logs out / signs out everywhere, the matching rows are deleted.
 *
 * Phase 4 wires:
 *   - POST /api/mobile/push/register   inserts/updates a row
 *   - DELETE /api/mobile/push/unregister deletes a row
 *   - inbound webhook router reads active rows for the user being called
 */

import { pgTable, serial, integer, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./db";

export const mobileDevices = pgTable(
  "mobile_devices",
  {
    id: serial("id").primaryKey(),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Client-generated UUID, stable across re-logins. Lets us upsert on (user_id, device_id). */
    device_id: varchar("device_id", { length: 64 }).notNull(),
    platform: varchar("platform", { length: 16 }).notNull(), // 'ios' | 'android'
    /** APNs voipToken (iOS) or FCM registration token (Android). */
    push_token: text("push_token").notNull(),
    /** Twilio Binding SID after we upload the push token to Twilio. Null until that succeeds. */
    twilio_binding_sid: varchar("twilio_binding_sid", { length: 50 }),
    /** Human-readable device label (model name, OS version) for the "active devices" UI. */
    device_label: varchar("device_label", { length: 200 }),
    /** App version string for compatibility checks. */
    app_version: varchar("app_version", { length: 32 }),
    created_at: timestamp("created_at").notNull().defaultNow(),
    /** Bumped on every successful access-token issue. */
    last_seen_at: timestamp("last_seen_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_mobile_devices_user").on(table.user_id),
    /** Upsert key: a given device only has one active row per user. */
    userDeviceIdx: index("idx_mobile_devices_user_device").on(table.user_id, table.device_id),
  }),
);

export const insertMobileDeviceSchema = createInsertSchema(mobileDevices).omit({
  id: true,
  created_at: true,
  last_seen_at: true,
});
export type InsertMobileDevice = z.infer<typeof insertMobileDeviceSchema>;
export type MobileDevice = typeof mobileDevices.$inferSelect;

export const mobilePlatformSchema = z.enum(["ios", "android"]);
export type MobilePlatform = z.infer<typeof mobilePlatformSchema>;
