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
  offers_packages: z.boolean().default(false),
  price_factors: z.array(z.string()).default([]),
  price_factors_other: z.string().optional(),
  price_range_min: z.number().optional(),
  price_range_max: z.number().optional(),
  output_preference: z.enum(['exact_price', 'price_range', 'call_for_quote']).default('exact_price'),
  short_description: z.string().optional(),
});

export type CustomTradeData = z.infer<typeof customTradeDataSchema>;

export const stage2DataSchema = z.object({
  hourly_rate: z.number().optional(),
  crew_size: z.number().optional(),
  min_hours: z.number().optional(),
  max_hours: z.number().optional(),

  sqft_rate: z.number().optional(),
  materials_included: z.boolean().optional(),
  setup_fee: z.number().optional(),

  unit_name: z.string().optional(),
  unit_rate: z.number().optional(),
  base_fee: z.number().optional(),

  packages: z.array(z.object({
    label: z.string(),
    price: z.number(),
  })).optional(),

  materials_markup_pct: z.number().optional(),
  materials_markup_custom: z.boolean().optional(),

  distance_mode: z.enum(['multiplier', 'flat']).optional(),
  distance_value: z.number().optional(),

  difficulty_tiers: z.array(z.object({
    label: z.string(),
    multiplier: z.number(),
  })).optional(),

  after_hours_multiplier: z.number().optional(),
});

export type Stage2Data = z.infer<typeof stage2DataSchema>;

export const sampleQuoteSchema = z.object({
  label: z.enum(['small', 'typical', 'big']),
  inputs: z.object({
    qty: z.number().min(0),
    notes_optional: z.string().optional(),
  }),
  final_price: z.number().min(0),
});

export type SampleQuote = z.infer<typeof sampleQuoteSchema>;

export const pricingIntakeSchema = z.object({
  version: z.literal(1).default(1),
  stage1: customTradeDataSchema,
  stage2: stage2DataSchema.default({}),
  sample_quotes: z.array(sampleQuoteSchema).max(3).optional(),
});

export type PricingIntake = z.infer<typeof pricingIntakeSchema>;

export const aiDraftRequestSchema = z.object({
  pricing_intake: pricingIntakeSchema,
  sample_quotes: z.array(sampleQuoteSchema).max(3).optional(),
  constraints: z.object({
    allowed_pricing_types: z.array(z.string()),
    allowed_ops: z.array(z.string()),
    no_other_math: z.literal(true),
  }),
});

export type AIDraftRequest = z.infer<typeof aiDraftRequestSchema>;

export const aiDraftResponseSchema = z.object({
  pricing_config: z.record(z.any()),
  confidence_score: z.number().min(0).max(100),
  assumptions: z.array(z.string()).max(12),
  needs_human_review: z.boolean(),
});

export type AIDraftResponse = z.infer<typeof aiDraftResponseSchema>;

export const pricingDraftSchema = z.object({
  pricing_config: z.record(z.any()),
  assumptions: z.array(z.string()).default([]),
  confidence_score: z.number().default(50),
  needs_human_review: z.boolean().default(true),
  status: z.enum(['pending', 'generating', 'ready', 'failed']).default('pending'),
  pricing_audit: z.object({
    source: z.string().optional(),
    derivation_attempted: z.boolean().optional(),
    derivation_result: z.record(z.any()).optional(),
    timestamp: z.number().optional(),
  }).optional(),
}).optional();

export type PricingDraft = z.infer<typeof pricingDraftSchema>;

export const pricingDraftJobSchema = z.object({
  job_id: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  result: pricingDraftSchema.unwrap().optional(),
  error: z.string().optional(),
  created_at: z.number(),
});

export type PricingDraftJob = z.infer<typeof pricingDraftJobSchema>;

export const pricingAuditLogSchema = z.object({
  pricing_intake: pricingIntakeSchema.optional(),
  sample_quotes: z.array(sampleQuoteSchema).optional(),
  ai_raw_output: z.record(z.any()).optional(),
  ai_validated_output: z.record(z.any()).optional(),
  derivation_attempted: z.boolean().optional(),
  derivation_result: z.record(z.any()).optional(),
  final_config: z.record(z.any()).optional(),
  source: z.enum(['deterministic', 'derivation', 'ai', 'fallback']).optional(),
  timestamp: z.number().optional(),
});

export type PricingAuditLog = z.infer<typeof pricingAuditLogSchema>;

export const calculatorSettingsSchema = z.object({
  settings_version: z.number().default(1),

  pricing_draft: pricingDraftSchema,
  pricing_intake: pricingIntakeSchema.optional(),
  pricing_audit: pricingAuditLogSchema.optional(),

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

  lead_form: z.object({
    version: z.number().default(1),
    mode: z.enum(['optional', 'gated', 'call_only']).default('optional'),
    fields: z.object({
      name: z.boolean().default(true),
      phone: z.boolean().default(true),
      email: z.boolean().default(true),
      address: z.boolean().default(false),
      city: z.boolean().default(false),
      postal_zip: z.boolean().default(false),
      preferred_datetime: z.boolean().default(false),
      job_notes: z.boolean().default(false),
      file_upload: z.boolean().default(false),
    }).default({}),
    consent: z.object({
      enabled: z.boolean().default(true),
      text: z.string().default('I agree to be contacted about my quote.'),
      sms_opt_in: z.boolean().default(false),
    }).default({}),
    cta: z.object({
      button_text: z.string().default('Get My Quote'),
      helper_text: z.string().default(''),
    }).default({}),
    delivery: z.object({
      primary_email: z.string().default(''),
      secondary_email: z.string().default(''),
      webhook_url: z.string().default(''),
    }).default({}),
    spam: z.object({
      honeypot: z.boolean().default(true),
      recaptcha: z.boolean().default(false),
    }).default({}),
  }).default({}),

  publish: z.object({
    version: z.number().default(1),
    status: z.enum(['draft', 'published']).default('draft'),
    slug: z.string().default(''),
    subdomain: z.string().default(''),
    published_at: z.number().nullable().default(null),
    embed_id: z.string().default(''),
    last_modified: z.number().nullable().default(null),
    custom_domain: z.string().default(''),
    custom_domain_status: z.enum(['none', 'pending_dns', 'dns_verified', 'ssl_provisioning', 'active', 'failed']).default('none'),
    ssl_status: z.enum(['none', 'pending', 'provisioning', 'active', 'failed']).default('none'),
    last_dns_check: z.number().nullable().default(null),
    hosting_domain: z.string().default('estimate.ai'),
  }).default({}),

  followup: z.object({
    version: z.number().default(1),
    enabled: z.boolean().default(false),
    channels: z.object({
      email: z.boolean().default(true),
      sms: z.boolean().default(false),
    }).default({}),
    schedule: z.array(z.object({
      offset_minutes: z.number().optional(),
      offset_hours: z.number().optional(),
      offset_days: z.number().optional(),
      type: z.string(),
    })).default([
      { offset_minutes: 2, type: "thank_you" },
      { offset_hours: 24, type: "reminder" },
      { offset_days: 3, type: "last_call" },
    ]),
    templates: z.object({
      thank_you: z.object({
        subject: z.string().default("Thanks for your quote request!"),
        body: z.string().default("Hi {{name}},\n\nThanks for requesting a quote from {{business_name}}. We received your request and will follow up shortly.\n\nYour estimated quote: {{quote_amount}}\n\nIf you'd like to discuss your project sooner, call us at {{phone}} or book a time: {{booking_link}}\n\nBest,\n{{business_name}}"),
        sms: z.string().default("Thanks for your quote request from {{business_name}}! We'll follow up soon. Questions? Call {{phone}}"),
      }).default({}),
      reminder: z.object({
        subject: z.string().default("Following up on your quote — {{business_name}}"),
        body: z.string().default("Hi {{name}},\n\nJust checking in on the quote you requested from {{business_name}}.\n\nYour estimate: {{quote_amount}}\n\nWe'd love to help get your project started. Call us at {{phone}} or book a time: {{booking_link}}\n\nBest,\n{{business_name}}"),
        sms: z.string().default("Hi {{name}}, just following up on your quote from {{business_name}}. Ready to get started? Call {{phone}}"),
      }).default({}),
      last_call: z.object({
        subject: z.string().default("Want to lock in a slot this week? — {{business_name}}"),
        body: z.string().default("Hi {{name}},\n\nWe wanted to reach out one last time about your quote from {{business_name}}.\n\nYour estimate: {{quote_amount}}\n\nOur schedule fills up fast — if you'd like to lock in a slot this week, give us a call at {{phone}} or book here: {{booking_link}}\n\nThanks,\n{{business_name}}"),
        sms: z.string().default("Hi {{name}}, last chance to lock in your slot with {{business_name}} this week! Call {{phone}}"),
      }).default({}),
    }).default({}),
    personalization: z.object({
      business_name: z.string().default(""),
      phone: z.string().default(""),
      booking_link: z.string().default(""),
      service_area: z.string().default(""),
    }).default({}),
    notifications: z.object({
      email_enabled: z.boolean().default(true),
      sms_enabled: z.boolean().default(false),
      webhook_enabled: z.boolean().default(false),
      webhook_url: z.string().default(""),
    }).default({}),
  }).default({}),

  test_history: z.object({
    scenarios: z.array(z.object({
      label: z.string(),
      inputs: z.record(z.any()),
      yourCharge: z.string(),
    })),
    accuracy_score: z.number(),
    confirmed: z.boolean(),
    advanced_adjustments: z.record(z.number()).nullable(),
    timestamp: z.number(),
    refinement: z.object({
      version: z.number(),
      last_tier: z.enum(['strong', 'close', 'needs_adjustment']),
      last_answers: z.object({
        q1: z.array(z.string()),
        q2: z.string(),
        q3: z.string(),
      }),
      tune_count: z.number(),
      last_tuned_at: z.number().nullable(),
    }).optional(),
  }).optional(),
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
  status: varchar("status", { length: 20 }).default("new").notNull(),
  sms_consent: boolean("sms_consent").default(false),
  created_date: timestamp("created_date").defaultNow(),
});

export const notificationQueue = pgTable("notification_queue", {
  id: serial("id").primaryKey(),
  calculator_id: integer("calculator_id").notNull().references(() => calculators.id),
  lead_id: integer("lead_id").notNull().references(() => leads.id),
  type: varchar("type", { length: 20 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  attempts: integer("attempts").default(0),
  max_attempts: integer("max_attempts").default(3),
  last_error: text("last_error"),
  payload: jsonb("payload"),
  created_at: timestamp("created_at").defaultNow(),
  processed_at: timestamp("processed_at"),
});

export const followupJobs = pgTable("followup_jobs", {
  id: serial("id").primaryKey(),
  lead_id: integer("lead_id").notNull().references(() => leads.id),
  calculator_id: integer("calculator_id").notNull().references(() => calculators.id),
  run_at: timestamp("run_at").notNull(),
  type: varchar("type", { length: 30 }).notNull(),
  channel: varchar("channel", { length: 20 }).notNull().default("email"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  attempts: integer("attempts").default(0),
  max_attempts: integer("max_attempts").default(3),
  last_error: text("last_error"),
  payload: jsonb("payload"),
  created_at: timestamp("created_at").defaultNow(),
  processed_at: timestamp("processed_at"),
});

export const analyticsEvents = pgTable("analytics_events", {
  id: serial("id").primaryKey(),
  calculator_id: integer("calculator_id").notNull().references(() => calculators.id),
  event_type: varchar("event_type", { length: 50 }).notNull(),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
});

export const deploymentStatus = pgTable("deployment_status", {
  id: serial("id").primaryKey(),
  calculator_id: integer("calculator_id").notNull().references(() => calculators.id).unique(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  last_published_at: timestamp("last_published_at"),
  auto_republish: boolean("auto_republish").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const insertCalculatorSchema = createInsertSchema(calculators).omit({
  id: true,
  created_at: true,
});

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  created_date: true,
});

export const insertNotificationQueueSchema = createInsertSchema(notificationQueue).omit({
  id: true,
  created_at: true,
  processed_at: true,
});

export const insertFollowupJobSchema = createInsertSchema(followupJobs).omit({
  id: true,
  created_at: true,
  processed_at: true,
});

export const insertAnalyticsEventSchema = createInsertSchema(analyticsEvents).omit({
  id: true,
  created_at: true,
});

export const insertDeploymentStatusSchema = createInsertSchema(deploymentStatus).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const calculatorAnalyticsSummary = pgTable("calculator_analytics_summary", {
  id: serial("id").primaryKey(),
  calculator_id: integer("calculator_id").notNull().references(() => calculators.id),
  period_date: timestamp("period_date").notNull(),
  total_views: integer("total_views").default(0),
  total_quotes: integer("total_quotes").default(0),
  total_leads: integer("total_leads").default(0),
  conversion_rate: integer("conversion_rate").default(0),
  avg_quote_value: integer("avg_quote_value").default(0),
  best_day: text("best_day"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
});

export const jobLogs = pgTable("job_logs", {
  id: serial("id").primaryKey(),
  job_name: varchar("job_name", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  started_at: timestamp("started_at").defaultNow(),
  finished_at: timestamp("finished_at"),
  error_message: text("error_message"),
  metadata: jsonb("metadata"),
});

export const insertAnalyticsSummarySchema = createInsertSchema(calculatorAnalyticsSummary).omit({
  id: true,
  created_at: true,
});

export const insertJobLogSchema = createInsertSchema(jobLogs).omit({
  id: true,
});

export type InsertCalculator = z.infer<typeof insertCalculatorSchema>;
export type Calculator = typeof calculators.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;
export type InsertAnalyticsEvent = z.infer<typeof insertAnalyticsEventSchema>;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type InsertDeploymentStatus = z.infer<typeof insertDeploymentStatusSchema>;
export type DeploymentStatus = typeof deploymentStatus.$inferSelect;
export type InsertAnalyticsSummary = z.infer<typeof insertAnalyticsSummarySchema>;
export type AnalyticsSummary = typeof calculatorAnalyticsSummary.$inferSelect;
export type InsertJobLog = z.infer<typeof insertJobLogSchema>;
export type JobLog = typeof jobLogs.$inferSelect;
export type InsertNotificationQueue = z.infer<typeof insertNotificationQueueSchema>;
export type NotificationQueue = typeof notificationQueue.$inferSelect;
export type InsertFollowupJob = z.infer<typeof insertFollowupJobSchema>;
export type FollowupJob = typeof followupJobs.$inferSelect;
