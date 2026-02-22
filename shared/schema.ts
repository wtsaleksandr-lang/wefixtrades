import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const calculators = pgTable("calculators", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  business_name: text("business_name").notNull(),
  trade_type: text("trade_type").notNull(),
  tagline: text("tagline"),
  logo_url: text("logo_url"),
  owner_email: text("owner_email"),
  owner_phone: text("owner_phone"),
  website_url: text("website_url"),
  primary_color: varchar("primary_color", { length: 20 }).default("#6366f1"),
  cta_button_text: text("cta_button_text").default("Get My Free Quote"),
  lead_thank_you_message: text("lead_thank_you_message").default("Thanks! We'll be in touch soon."),
  pricing_config: jsonb("pricing_config").notNull(),
  theme_overrides: jsonb("theme_overrides"),
  edit_token: varchar("edit_token", { length: 255 }).notNull(),
  token_expires_at: timestamp("token_expires_at").notNull(),
  is_duplicated: boolean("is_duplicated").default(false),
  total_views: integer("total_views").default(0),
  show_powered_by_badge: boolean("show_powered_by_badge").default(true),
  created_at: timestamp("created_at").defaultNow(),
});

export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  calculator_id: integer("calculator_id").notNull().references(() => calculators.id),
  name: text("name"),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  quote_amount: integer("quote_amount"),
  answers: jsonb("answers"),
  created_date: timestamp("created_date").defaultNow(),
});

export const insertCalculatorSchema = createInsertSchema(calculators).omit({
  id: true,
  created_at: true,
});

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  created_date: true,
});

export type InsertCalculator = z.infer<typeof insertCalculatorSchema>;
export type Calculator = typeof calculators.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;
