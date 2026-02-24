import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const customTradeDataSchema = z.object({
  charge_method: z.enum(['per_hour', 'per_sqft', 'per_linear_ft', 'per_item', 'fixed_project', 'base_plus_variable', 'not_sure']).default('not_sure'),
  has_minimum_charge: z.boolean().default(false),
  minimum_charge_amount: z.number().optional(),
  has_trip_fee: z.boolean().default(false),
  trip_fee_amount: z.number().optional(),
  price_factors: z.array(z.string()).default([]),
  price_factors_other: z.string().optional(),
  price_range_min: z.number().optional(),
  price_range_max: z.number().optional(),
  short_description: z.string().optional(),
});

export type CustomTradeData = z.infer<typeof customTradeDataSchema>;

export const pricingDraftSchema = z.object({
  pricing_config: z.record(z.any()),
  assumptions: z.array(z.string()).default([]),
  confidence_score: z.number().default(0.5),
  needs_human_review: z.boolean().default(true),
  status: z.enum(['pending', 'generating', 'ready', 'failed']).default('pending'),
}).optional();

export type PricingDraft = z.infer<typeof pricingDraftSchema>;

export const calculatorSettingsSchema = z.object({
  settings_version: z.number().default(1),

  pricing_draft: pricingDraftSchema,

  appearance: z.object({
    color_theme: z.enum(['graphite', 'navy', 'emerald', 'slate', 'custom']).default('emerald'),
    accent_color: z.string().default('#2D6A4F'),
    button_style: z.enum(['soft-rounded', 'sharp', 'pill']).default('soft-rounded'),
    border_radius: z.enum(['compact', 'medium', 'large']).default('medium'),
    surface_style: z.enum(['solid', 'glassmorphic', 'elevated']).default('solid'),
    font: z.enum(['inter', 'georgia', 'montserrat', 'merriweather', 'roboto-mono']).default('inter'),
    logo_url: z.string().optional(),
    hover_effect: z.enum(['subtle-lift', 'glow', 'color-shift', 'none']).default('subtle-lift'),
    click_animation: z.boolean().default(true),
    gradient_buttons: z.boolean().default(false),
    button_size: z.enum(['compact', 'standard', 'large']).default('standard'),
    cta_text: z.string().default('Get My Estimate'),
    trust_badge: z.boolean().default(false),
    trust_badge_text: z.string().default('No obligation'),
    company_phone: z.string().optional(),
    show_powered_by: z.boolean().default(true),
  }).default({}),

  layout: z.object({
    card_spacing: z.enum(['tight', 'normal', 'airy']).default('normal'),
    input_style: z.enum(['outlined', 'filled', 'minimal']).default('outlined'),
    progress_style: z.enum(['numbers', 'dots', 'bar', 'hidden']).default('bar'),
    columns: z.enum(['single', 'two-column']).default('single'),
    sticky_summary: z.boolean().default(false),
  }).default({}),

  conversion: z.object({
    price_display: z.enum(['range', 'exact']).default('range'),
    disclaimer_text: z.string().default('Prices are estimates and may vary based on specific requirements.'),
    show_breakdown: z.boolean().default(true),
    show_upsell: z.boolean().default(false),
    upsell_text: z.string().optional(),
    booking_button: z.boolean().default(false),
    booking_url: z.string().optional(),
    redirect_url: z.string().optional(),
    require_email: z.boolean().default(false),
    require_phone: z.enum(['optional', 'required', 'hidden']).default('optional'),
    show_starting_price: z.boolean().default(false),
    urgency_message: z.string().optional(),
    delay_result: z.boolean().default(false),
  }).default({}),

  integrations: z.object({
    gtm_id: z.string().optional(),
    facebook_pixel_id: z.string().optional(),
    webhook_url: z.string().optional(),
    crm_enabled: z.boolean().default(false),
    email_template: z.string().optional(),
    custom_css: z.string().optional(),
    custom_js: z.string().optional(),
    language: z.string().default('en'),
    currency: z.string().default('USD'),
    dark_mode: z.boolean().default(false),
    animation_speed: z.enum(['slow', 'normal', 'fast']).default('normal'),
  }).default({}),
}).default({});

export type CalculatorSettings = z.infer<typeof calculatorSettingsSchema>;

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
  calculator_settings: jsonb("calculator_settings"),
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
