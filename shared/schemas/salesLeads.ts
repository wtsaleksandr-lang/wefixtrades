import { pgTable, text, varchar, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * Sales leads — lightweight outbound pipeline for pilot acquisition.
 */
export const salesLeads = pgTable("sales_leads", {
  id: serial("id").primaryKey(),
  business_name: text("business_name").notNull(),
  contact_name: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  google_maps_url: text("google_maps_url"),
  source: varchar("source", { length: 30 }).notNull().default("manual"),
  // google_maps | referral | manual | inbound | audit
  status: varchar("status", { length: 30 }).notNull().default("new"),
  // new | contacted | replied | demo_booked | closed_won | closed_lost
  notes: text("notes"),
  last_contacted_at: timestamp("last_contacted_at"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertSalesLeadSchema = createInsertSchema(salesLeads).omit({ id: true, created_at: true, updated_at: true });
export type InsertSalesLead = z.infer<typeof insertSalesLeadSchema>;
export type SalesLead = typeof salesLeads.$inferSelect;
