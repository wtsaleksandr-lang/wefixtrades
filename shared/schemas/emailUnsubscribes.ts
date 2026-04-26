import { pgTable, varchar, serial, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * Email unsubscribe registry.
 *
 * One row per opted-out email address. Marketing senders MUST consult this
 * table before dispatching (see server/lib/unsubscribeStorage.ts).
 *
 * Auto-created at startup via db.execute(CREATE TABLE IF NOT EXISTS) — no
 * separate migration needed; safe to drop in mid-flight.
 */
export const emailUnsubscribes = pgTable("email_unsubscribes", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  unsubscribed_at: timestamp("unsubscribed_at").defaultNow().notNull(),
  /** Email type that triggered the unsubscribe (audit_report, mapguard_monthly, ...). */
  source: varchar("source", { length: 64 }),
  ip_address: varchar("ip_address", { length: 45 }),
  user_agent: varchar("user_agent", { length: 500 }),
}, (table) => ({
  emailIdx: index("idx_email_unsub_email").on(table.email),
}));

export const insertEmailUnsubscribeSchema = createInsertSchema(emailUnsubscribes);
export type InsertEmailUnsubscribe = z.infer<typeof insertEmailUnsubscribeSchema>;
export type EmailUnsubscribe = typeof emailUnsubscribes.$inferSelect;
