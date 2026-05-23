/**
 * contacts — admin Communications address book.
 *
 * One row per saved phone number. Lets the admin attach a display
 * name and optional links to an existing user (client) and/or
 * supplier so the Twilio-driven SMS / Phone views can show the name
 * instead of a bare number and surface a "View profile" chip.
 *
 * The Communications page joins on phone_e164 at query time — it
 * never writes back to Twilio's records.
 *
 * See migrations/0036_comms_contacts_and_links.sql.
 */

import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./db";
import { suppliers } from "./adminCrm";

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    display_name: text("display_name").notNull(),
    phone_e164: text("phone_e164").notNull().unique(),
    email: text("email"),
    notes: text("notes"),
    linked_user_id: integer("linked_user_id").references(() => users.id, { onDelete: "set null" }),
    linked_supplier_id: integer("linked_supplier_id").references(
      () => suppliers.id,
      { onDelete: "set null" },
    ),
    // 0042 — billing address fields used by Invoice Phase A. Set when a
    // contact is linked to an invoice so the invoice header auto-fills.
    billing_street: text("billing_street"),
    billing_city: text("billing_city"),
    billing_region: text("billing_region"),
    billing_postal: text("billing_postal"),
    billing_country: text("billing_country").default("US"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    phoneIdx: index("contacts_phone_idx").on(table.phone_e164),
    userIdx: index("contacts_linked_user_idx").on(table.linked_user_id),
    supplierIdx: index("contacts_linked_supplier_idx").on(table.linked_supplier_id),
  }),
);

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;
