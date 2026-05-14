import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./db";

/* ─── Service Catalog ─── */
export const serviceCatalog = pgTable("service_catalog", {
  id: varchar("id", { length: 100 }).primaryKey(),       // e.g. "tradeline", "mapguard-setup"
  name: text("name").notNull(),                           // e.g. "24/7 TradeLine™"
  tagline: text("tagline"),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull(), // visibility | leads | reputation | automation | website
  default_price: integer("default_price"),                 // cents
  billing_period: varchar("billing_period", { length: 20 }).notNull().default("monthly"), // monthly | one-time
  delivery_pattern: varchar("delivery_pattern", { length: 20 }).notNull().default("one_time"),
  // one_time | recurring | always_on
  is_active: boolean("is_active").notNull().default(true),
  stripe_product_id: text("stripe_product_id"),
  stripe_price_id: text("stripe_price_id"),              // monthly or one-time price
  stripe_yearly_price_id: text("stripe_yearly_price_id"), // yearly price (monthly services only)
  cost_amount: integer("cost_amount"),                    // internal cost in cents
  cost_type: text("cost_type"),                           // "per_delivery" | "monthly" | "one_time"
  sort_order: integer("sort_order").notNull().default(0),
  /* Q28a: per-product pricing tiers (Starter/Growth/Pro etc). Optional —
     products with a single price use default_price + billing_period and leave
     this null. Shape validated by tiersSchema in shared/tiers.ts. */
  tiers: jsonb("tiers"),
  /* Q28b: product-level "what's included" bullets — string[]. Used by audit
     recommendations, marketing pages, and portal product cards. Null falls
     back to the hardcoded SERVICES array in shared/services.ts. */
  features: jsonb("features"),
  /* Q28f: AI workflow / cron config shared across this product's per-product
     config tables (mapguardConfig, tradelineConfig, etc). Shape validated
     by automationConfigSchema in shared/automationConfig.ts. Free-form jsonb
     so new keys can be added without migration. */
  automation_config: jsonb("automation_config"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertServiceCatalogSchema = createInsertSchema(serviceCatalog).omit({ created_at: true, updated_at: true });
export type InsertServiceCatalog = z.infer<typeof insertServiceCatalogSchema>;
export type ServiceCatalogRow = typeof serviceCatalog.$inferSelect;

/* ─── Product Drafts (Q28) ─── */
/* Admin-authored pending edits to serviceCatalog rows. The customer-facing
   surfaces (website, /portal/catalog, /pricing, etc.) continue reading from
   serviceCatalog directly — drafts only become customer-visible after an
   admin explicitly clicks "Approve & Publish" which copies draft_data into
   the matching serviceCatalog row and stamps published_at. Audit log entry
   is written on save + publish + reject. */
export const productDrafts = pgTable("product_drafts", {
  id: serial("id").primaryKey(),
  service_id: varchar("service_id", { length: 100 }).notNull().references(() => serviceCatalog.id),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  // draft | published | rejected
  draft_data: jsonb("draft_data").notNull(),
  // { name?, tagline?, description?, default_price?, billing_period?, category? }
  // Only fields the admin actually changed. Unchanged keys are omitted.
  notes: text("notes"),
  created_by: integer("created_by").references(() => users.id),
  created_by_email: text("created_by_email"),
  /* Multi-approver workflow (cycle 22). Array of approval entries:
     [{ user_id: number, email: string, approved_at: ISOString }]
     Required threshold is PUBLISH_APPROVAL_COUNT env (default 1).
     Empty / null behaves the same as pre-launch where the first publish
     click succeeds. */
  approvers: jsonb("approvers").default(sql`'[]'::jsonb`),
  published_by: integer("published_by").references(() => users.id),
  published_at: timestamp("published_at"),
  rejected_by: integer("rejected_by").references(() => users.id),
  rejected_at: timestamp("rejected_at"),
  rejection_reason: text("rejection_reason"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export type ProductDraft = typeof productDrafts.$inferSelect;
export const insertProductDraftSchema = createInsertSchema(productDrafts).omit({ id: true, created_at: true, updated_at: true });
export type InsertProductDraft = z.infer<typeof insertProductDraftSchema>;

/* ─── Clients ─── */
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id),  // optional link to auth user
  business_name: text("business_name").notNull(),
  contact_name: text("contact_name"),
  contact_email: text("contact_email"),
  contact_phone: text("contact_phone"),
  website_url: text("website_url"),
  logo_url: text("logo_url"),
  google_place_id: text("google_place_id"),
  facebook_page_url: text("facebook_page_url"),
  google_credentials: jsonb("google_credentials"), // OAuth tokens for Google Business API
  widget_token: varchar("widget_token", { length: 64 }).unique(),
  last_review_sync_at: timestamp("last_review_sync_at"),
  trade_type: varchar("trade_type", { length: 100 }),
  status: varchar("status", { length: 30 }).notNull().default("lead"),
  // lead | onboarding | active | paused | churned
  source: varchar("source", { length: 50 }),
  // audit | referral | inbound | manual | website
  stripe_customer_id: text("stripe_customer_id"),
  automation_enabled: boolean("automation_enabled").notNull().default(true),
  human_override: boolean("human_override").notNull().default(false),
  demo_mode: boolean("demo_mode").notNull().default(false),
  metadata: jsonb("metadata"),                             // flexible extra data
  journey_summary: text("journey_summary"),                 // pre-signup website chat summary
  // 14-day trial of Pro-tier features at signup. trial_pro_features_enabled gates
  // any Pro-only feature for self-serve trials regardless of subscription state.
  // Daily cron (trialProExpiryWorker) flips the flag false when trial_pro_expires_at
  // passes and emails the trade.
  trial_pro_expires_at: timestamp("trial_pro_expires_at", { withTimezone: true }),
  trial_pro_features_enabled: boolean("trial_pro_features_enabled").notNull().default(false),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertClientSchema = createInsertSchema(clients).omit({ id: true, created_at: true, updated_at: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

/* ─── Client Services ─── */
export const clientServices = pgTable("client_services", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  service_id: varchar("service_id", { length: 100 }).notNull().references(() => serviceCatalog.id),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  // pending | onboarding | active | paused | cancelled | completed
  enabled: boolean("enabled").notNull().default(true),
  fulfillment_mode: varchar("fulfillment_mode", { length: 30 }),
  // internal | fiverr | freelancer | automation | white_label
  price_cents: integer("price_cents"),                     // override or actual price charged
  cost_cents: integer("cost_cents"),                       // cost to deliver
  billing_period: varchar("billing_period", { length: 20 }),
  started_at: timestamp("started_at"),
  completed_at: timestamp("completed_at"),
  cancelled_at: timestamp("cancelled_at"),
  automation_enabled: boolean("automation_enabled").notNull().default(true),
  human_review_required: boolean("human_review_required").notNull().default(false),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertClientServiceSchema = createInsertSchema(clientServices).omit({ id: true, created_at: true, updated_at: true });
export type InsertClientService = z.infer<typeof insertClientServiceSchema>;
export type ClientService = typeof clientServices.$inferSelect;

/* ─── Orders ─── */
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  status: varchar("status", { length: 30 }).notNull().default("draft"),
  // draft | pending_payment | paid | partial | cancelled | refunded
  total_cents: integer("total_cents").notNull().default(0),
  notes: text("notes"),
  created_by: integer("created_by").references(() => users.id),
  actor_type: varchar("actor_type", { length: 20 }).notNull().default("human"),
  // human | ai_agent | system
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, created_at: true, updated_at: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

/* ─── Order Items ─── */
export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  order_id: integer("order_id").notNull().references(() => orders.id),
  service_id: varchar("service_id", { length: 100 }).references(() => serviceCatalog.id),
  client_service_id: integer("client_service_id").references(() => clientServices.id),
  description: text("description"),
  quantity: integer("quantity").notNull().default(1),
  unit_price_cents: integer("unit_price_cents").notNull().default(0),
  total_cents: integer("total_cents").notNull().default(0),
  created_at: timestamp("created_at").defaultNow(),
});
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true, created_at: true });
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;

/* ─── Suppliers ─── */
export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: varchar("type", { length: 30 }).notNull(),
  // fiverr | freelancer | white_label | automation | internal
  supplier_type: text("supplier_type").notNull().default("email"),
  // "email" | "api" | "fiverr" | "manual"
  contact_name: text("contact_name"),
  contact_email: text("contact_email"),
  contact_phone: text("contact_phone"),
  platform_url: text("platform_url"),
  fiverr_profile_url: text("fiverr_profile_url"),
  api_endpoint: text("api_endpoint"),
  api_key: text("api_key"),
  supported_services: jsonb("supported_services"),         // string[] of service_ids
  cost_rate: integer("cost_rate"),                          // cost in cents per task/order
  cost_type: text("cost_type").default("per_task"),         // "per_task" | "monthly" | "hourly" | "per_project"
  currency: text("currency").default("usd"),
  /* Q28h: per-service cost overrides. When a supplier supports multiple
     products with different per-unit costs, this map overrides cost_rate
     for the matching service id. Shape: { [service_id]: { cost_cents:
     number, cost_type?: string } }. Null/missing key = use cost_rate. */
  service_cost_overrides: jsonb("service_cost_overrides"),
  notes: text("notes"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  // active | inactive
  is_active: boolean("is_active").notNull().default(true),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertSupplierSchema = createInsertSchema(suppliers).omit({ id: true, created_at: true, updated_at: true });
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliers.$inferSelect;

/* ─── Fulfillment Tasks ─── */
export const fulfillmentTasks = pgTable("fulfillment_tasks", {
  id: serial("id").primaryKey(),
  client_service_id: integer("client_service_id").notNull().references(() => clientServices.id),
  client_id: integer("client_id").notNull().references(() => clients.id),
  supplier_id: integer("supplier_id").references(() => suppliers.id),
  title: text("title").notNull(),
  description: text("description"),
  status: varchar("status", { length: 30 }).notNull().default("not_started"),
  // not_started | submitted | in_progress | waiting | blocked | qa_review | revision_required | delivered | cancelled
  priority: varchar("priority", { length: 20 }).notNull().default("normal"),
  // low | normal | high | urgent
  sort_order: integer("sort_order").notNull().default(0),
  waiting_on: varchar("waiting_on", { length: 20 }),
  // client | supplier | internal (null = not waiting)
  handled_by: varchar("handled_by", { length: 20 }),
  // internal | supplier | automation (null = unassigned)
  automation_status: varchar("automation_status", { length: 20 }),
  // idle | running | completed | failed (null = not automated)
  last_action: text("last_action"),
  next_action: text("next_action"),
  last_action_at: timestamp("last_action_at"),
  cost_cents: integer("cost_cents"),
  due_at: timestamp("due_at"),
  completed_at: timestamp("completed_at"),
  escalation_flag: boolean("escalation_flag").notNull().default(false),
  human_review_required: boolean("human_review_required").notNull().default(false),
  actor_type: varchar("actor_type", { length: 20 }).notNull().default("human"),
  deliverables: jsonb("deliverables").default([]),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertFulfillmentTaskSchema = createInsertSchema(fulfillmentTasks).omit({ id: true, created_at: true, updated_at: true });
export type InsertFulfillmentTask = z.infer<typeof insertFulfillmentTaskSchema>;
export type FulfillmentTask = typeof fulfillmentTasks.$inferSelect;

/** A single deliverable/asset attached to a fulfillment task. */
export interface Deliverable {
  kind: string;
  url: string;
  label: string;
  uploaded_by: string;
  uploaded_at: string;
}

/* ─── Service Task Templates ─── */
export const serviceTaskTemplates = pgTable("service_task_templates", {
  id: serial("id").primaryKey(),
  service_id: varchar("service_id", { length: 100 }).notNull().references(() => serviceCatalog.id),
  title: text("title").notNull(),
  description: text("description"),
  sort_order: integer("sort_order").notNull().default(0),
  default_priority: varchar("default_priority", { length: 20 }).notNull().default("normal"),
  default_handled_by: varchar("default_handled_by", { length: 20 }),
  default_waiting_on: varchar("default_waiting_on", { length: 20 }),
  human_review_required: boolean("human_review_required").notNull().default(false),
  is_recurring: boolean("is_recurring").notNull().default(true),
  // true = included in monthly generation; false = setup-only (first provision only)
  sla_days: integer("sla_days"),
  // number of days from task creation until due_at; null = no SLA
  created_at: timestamp("created_at").defaultNow(),
});
export const insertServiceTaskTemplateSchema = createInsertSchema(serviceTaskTemplates).omit({ id: true, created_at: true });
export type InsertServiceTaskTemplate = z.infer<typeof insertServiceTaskTemplateSchema>;
export type ServiceTaskTemplate = typeof serviceTaskTemplates.$inferSelect;

/* ─── Onboarding Templates ─── */
export const onboardingTemplates = pgTable("onboarding_templates", {
  id: serial("id").primaryKey(),
  service_id: varchar("service_id", { length: 100 }).references(() => serviceCatalog.id),
  name: text("name").notNull(),
  steps: jsonb("steps").notNull(),
  // Array<{ key: string; label: string; type: 'checkbox'|'text'|'upload'|'form'; required: boolean; }>
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertOnboardingTemplateSchema = createInsertSchema(onboardingTemplates).omit({ id: true, created_at: true, updated_at: true });
export type InsertOnboardingTemplate = z.infer<typeof insertOnboardingTemplateSchema>;
export type OnboardingTemplate = typeof onboardingTemplates.$inferSelect;

/* ─── Onboarding Submissions ─── */
export const onboardingSubmissions = pgTable("onboarding_submissions", {
  id: serial("id").primaryKey(),
  client_service_id: integer("client_service_id").notNull().references(() => clientServices.id),
  client_id: integer("client_id").notNull().references(() => clients.id),
  template_id: integer("template_id").references(() => onboardingTemplates.id),
  access_token: varchar("access_token", { length: 64 }).unique(),
  status: varchar("status", { length: 30 }).notNull().default("not_sent"),
  // not_sent | sent | viewed | submitted | approved | needs_followup
  responses: jsonb("responses"),
  // Record<stepKey, { value: any; completed_at: string; }>
  sent_at: timestamp("sent_at"),
  submitted_at: timestamp("submitted_at"),
  approved_at: timestamp("approved_at"),
  approved_by: integer("approved_by").references(() => users.id),
  actor_type: varchar("actor_type", { length: 20 }).notNull().default("human"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertOnboardingSubmissionSchema = createInsertSchema(onboardingSubmissions).omit({ id: true, created_at: true, updated_at: true });
export type InsertOnboardingSubmission = z.infer<typeof insertOnboardingSubmissionSchema>;
export type OnboardingSubmission = typeof onboardingSubmissions.$inferSelect;

/* ─── Client Payments ─── */
export const clientPayments = pgTable("client_payments", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  client_service_id: integer("client_service_id").references(() => clientServices.id),
  order_id: integer("order_id").references(() => orders.id),
  type: varchar("type", { length: 20 }).notNull().default("invoice"),
  // invoice | payment | refund | credit
  amount_cents: integer("amount_cents").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // pending | paid | failed | partial | refunded
  description: text("description"),
  stripe_invoice_id: text("stripe_invoice_id"),
  stripe_payment_intent_id: text("stripe_payment_intent_id"),
  period_start: timestamp("period_start"),
  period_end: timestamp("period_end"),
  due_at: timestamp("due_at"),
  paid_at: timestamp("paid_at"),
  actor_type: varchar("actor_type", { length: 20 }).notNull().default("human"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertClientPaymentSchema = createInsertSchema(clientPayments).omit({ id: true, created_at: true, updated_at: true });
export type InsertClientPayment = z.infer<typeof insertClientPaymentSchema>;
export type ClientPayment = typeof clientPayments.$inferSelect;

/* ─── Internal Notes ─── */
export const internalNotes = pgTable("internal_notes", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  author_id: integer("author_id").references(() => users.id),
  actor_type: varchar("actor_type", { length: 20 }).notNull().default("human"),
  // human | ai_agent | system
  content: text("content").notNull(),
  pinned: boolean("pinned").notNull().default(false),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
});
export const insertInternalNoteSchema = createInsertSchema(internalNotes).omit({ id: true, created_at: true });
export type InsertInternalNote = z.infer<typeof insertInternalNoteSchema>;
export type InternalNote = typeof internalNotes.$inferSelect;

/* ─── Ops Snapshots ─── */
// Stores the output of each Background AI Ops Engine run.
// raw_signals: the deterministic detector output (OpsSignal[]) — system truth.
// ai_output:   the AI summarization of those signals — explanation layer only.
// Both are stored separately so signals remain reusable by future routing engines.
export const opsSnapshots = pgTable("ops_snapshots", {
  id: serial("id").primaryKey(),
  snapshot_type: varchar("snapshot_type", { length: 50 }).notNull(),
  // daily_summary | onboarding_scan | task_triage | ticket_triage
  generated_at: timestamp("generated_at").defaultNow().notNull(),
  period_start: timestamp("period_start"),
  period_end: timestamp("period_end"),
  raw_signals: jsonb("raw_signals").notNull(),     // OpsSignal[] — deterministic, no AI
  ai_output: jsonb("ai_output"),                   // DailyOpsSummaryOutput — AI explanation only
  prompt_version: varchar("prompt_version", { length: 30 }),
  detector_version: varchar("detector_version", { length: 30 }),
  model_used: varchar("model_used", { length: 80 }),
  input_tokens: integer("input_tokens"),
  output_tokens: integer("output_tokens"),
  estimated_cost_usd: integer("estimated_cost_usd"), // micro-cents (same as aiUsageLogs)
  signal_count: integer("signal_count").notNull().default(0),
  metadata: jsonb("metadata"),
});
export type OpsSnapshot = typeof opsSnapshots.$inferSelect;
export type InsertOpsSnapshot = typeof opsSnapshots.$inferInsert;

/* ─── Admin Activity Log ─── */
export const adminActivityLog = pgTable("admin_activity_log", {
  id: serial("id").primaryKey(),
  actor_type: varchar("actor_type", { length: 20 }).notNull(),
  // human | ai_agent | system
  actor_id: integer("actor_id"),                           // user id if human
  actor_name: text("actor_name"),                          // display name or agent name
  action: varchar("action", { length: 100 }).notNull(),
  // e.g. "client.created", "service.activated", "fulfillment.assigned"
  entity_type: varchar("entity_type", { length: 50 }).notNull(),
  // client | client_service | order | fulfillment_task | supplier | payment | onboarding
  entity_id: integer("entity_id"),
  summary: text("summary"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
});
export const insertAdminActivityLogSchema = createInsertSchema(adminActivityLog).omit({ id: true, created_at: true });
export type InsertAdminActivityLog = z.infer<typeof insertAdminActivityLogSchema>;
export type AdminActivityLog = typeof adminActivityLog.$inferSelect;

/* ─── Monitored Reviews ─── */
export const monitoredReviews = pgTable("monitored_reviews", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").references(() => clients.id),
  google_place_id: text("google_place_id").notNull(),

  // Platform: "google" (extensible to yelp, facebook, etc.)
  platform: varchar("platform", { length: 30 }).notNull().default("google"),

  // Dedup key: "placeId:externalId" or "placeId:reviewer:rating:date"
  dedup_key: varchar("dedup_key", { length: 512 }).notNull().unique(),

  // External identifiers
  external_review_id: text("external_review_id"),
  google_review_name: text("google_review_name"), // Google API resource name for reply posting

  // Review content
  reviewer_name: text("reviewer_name").notNull(),
  rating: integer("rating").notNull(),
  review_text: text("review_text"),
  published_at: timestamp("published_at"),

  // Owner response
  response_text: text("response_text"),
  response_date: timestamp("response_date"),

  // Tracking
  raw_payload: jsonb("raw_payload"),
  first_seen_at: timestamp("first_seen_at").defaultNow(),
  last_synced_at: timestamp("last_synced_at").defaultNow(),

  // Change detection flags
  is_new: boolean("is_new").notNull().default(true),           // true until admin acknowledges
  response_added: boolean("response_added").notNull().default(false), // set when response_text first appears

  // AI draft response
  draft_response: text("draft_response"),
  draft_generated_at: timestamp("draft_generated_at"),
  draft_model: varchar("draft_model", { length: 60 }),

  // Response posting tracking
  posted_via: varchar("posted_via", { length: 30 }), // "reputationshield" | "manual" | null
  posted_at: timestamp("posted_at"),

  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertMonitoredReviewSchema = createInsertSchema(monitoredReviews).omit({
  id: true, created_at: true, updated_at: true, first_seen_at: true, last_synced_at: true,
});
export type InsertMonitoredReview = z.infer<typeof insertMonitoredReviewSchema>;
export type MonitoredReview = typeof monitoredReviews.$inferSelect;

/* ─── TradeLine Config (stored in client_services.metadata) ─── */
export const tradelineConfigSchema = z.object({
  variant: z.enum(["call_backup", "chat", "complete"]).default("call_backup"),
  currentMode: z.enum(["available", "on_the_job", "after_hours"]).default("available"),
  setupStage: z.enum([
    "not_started",
    "onboarding",
    "configuring",
    "awaiting_website_access",
    "awaiting_client_action",
    "port_in_progress",
    "ready_for_testing",
    "live",
  ]).default("not_started"),
  channels: z.object({
    voice: z.boolean().default(true),
    websiteChat: z.boolean().default(false),
    websiteVoice: z.boolean().default(false),
    sms: z.boolean().default(true),
    hostedFallback: z.boolean().default(false),
  }).default({}),
  businessHours: z.object({
    timezone: z.string().default("America/Toronto"),
    schedule: z.record(z.any()).default({}),
  }).default({}),
  phoneRouting: z.object({
    primaryBusinessNumber: z.string().default(""),
    forwardingMode: z.enum(["no_answer", "immediate", "after_hours_only"]).default("no_answer"),
    ringTimeoutSeconds: z.number().default(20),
  }).default({}),
  notifications: z.object({
    sms: z.array(z.string()).default([]),
    email: z.array(z.string()).default([]),
  }).default({}),
  website: z.object({
    embedMode: z.enum(["none", "direct_embed", "hosted_fallback"]).default("none"),
    domainStatus: z.enum(["not_needed", "pending", "connected", "live"]).default("not_needed"),
    hostedUrl: z.string().default(""),
    accessAvailable: z.boolean().nullable().default(null),
  }).default({}),
  booking: z.object({
    enabled: z.boolean().default(true),
    mode: z.enum(["request_only", "book_if_available"]).default("request_only"),
  }).default({}),
  assistant: z.object({
    status: z.enum(["not_built", "building", "built", "failed"]).default("not_built"),
    templateId: z.string().default(""),
    inputHash: z.string().default(""),
    vapiAssistantId: z.string().default(""),
    lastBuiltAt: z.string().default(""),
    lastBuildError: z.string().default(""),
    manualOverride: z.boolean().default(false),
  }).default({}),
  voice: z.object({
    presetId: z.string().default("professional-female"),
    label: z.string().default("Professional Female"),
    provider: z.string().default("11labs"),
    voiceId: z.string().default("21m00Tcm4TlvDq8ikWAM"),
    language: z.string().default("en"),
  }).default({}),
  personality: z.object({
    tone: z.enum(["friendly", "professional", "direct"]).default("friendly"),
    humor: z.enum(["off", "light"]).default("off"),
    profanity: z.boolean().default(false),
    language: z.enum(["en", "es", "fr"]).default("en"),
  }).default({}),
  widgetStyle: z.object({
    preset: z.enum(["clean", "bold", "minimal"]).default("clean"),
    bubbleLabel: z.string().default("Need help? Ask us"),
    accentMode: z.enum(["default", "brand"]).default("default"),
  }).default({}),
}).default({});
export type TradelineConfig = z.infer<typeof tradelineConfigSchema>;

/**
 * Returns default TradeLine config for a given service_id variant.
 * Returns null if the service_id is not a TradeLine variant.
 */
export function getTradeLineDefaultConfig(serviceId: string): TradelineConfig | null {
  switch (serviceId) {
    case "tradeline-call-backup":
      return tradelineConfigSchema.parse({
        variant: "call_backup",
        currentMode: "available",
        channels: { voice: true, websiteChat: false, websiteVoice: false, sms: true, hostedFallback: false },
        website: { embedMode: "none" },
      });
    case "tradeline-chat":
      return tradelineConfigSchema.parse({
        variant: "chat",
        currentMode: "available",
        channels: { voice: false, websiteChat: true, websiteVoice: true, sms: false, hostedFallback: false },
        website: { embedMode: "direct_embed" },
      });
    case "tradeline-complete":
      return tradelineConfigSchema.parse({
        variant: "complete",
        currentMode: "available",
        channels: { voice: true, websiteChat: true, websiteVoice: true, sms: true, hostedFallback: false },
        website: { embedMode: "direct_embed" },
      });
    default:
      // Legacy "tradeline" or tier-based IDs (tradeline-starter, tradeline-pro, etc.)
      if (serviceId === "tradeline" || serviceId.startsWith("tradeline-")) {
        return tradelineConfigSchema.parse({
          variant: "complete",
          currentMode: "available",
        });
      }
      return null;
  }
}

/**
 * Check whether a TradeLine config is ready for go-live.
 * Pure logic — no DB calls.
 */
export function getTradeLineReadiness(config: TradelineConfig): { ready: boolean; issues: string[] } {
  const issues: string[] = [];
  const needsVoice = config.variant === "call_backup" || config.variant === "complete";
  const needsWebsite = config.variant === "chat" || config.variant === "complete";

  // Stage check
  if (config.setupStage !== "ready_for_testing" && config.setupStage !== "live") {
    issues.push(`Setup stage is "${config.setupStage}" — must be "ready_for_testing" or "live"`);
  }

  // Voice checks
  if (needsVoice && !config.phoneRouting.primaryBusinessNumber) {
    issues.push("Primary business phone number is required");
  }

  // Website checks
  if (needsWebsite) {
    if (config.website.embedMode === "none") {
      issues.push("Website embed mode not set — choose direct embed or hosted fallback");
    } else if (config.website.embedMode === "hosted_fallback") {
      if (!config.website.hostedUrl) {
        issues.push("Hosted fallback URL is required");
      }
      if (config.website.domainStatus !== "connected" && config.website.domainStatus !== "live") {
        issues.push(`Hosted domain status is "${config.website.domainStatus}" — must be "connected" or "live"`);
      }
    }
    // direct_embed: no extra check — admin confirms install via fulfillment task
  }

  // Assistant check
  if (config.assistant.status !== "built") {
    issues.push(`Assistant is "${config.assistant.status}" — must be "built"`);
  }

  return { ready: issues.length === 0, issues };
}

/**
 * Extract TradeLine config updates from onboarding form responses.
 * Returns a partial TradelineConfig that can be deep-merged into the existing config.
 * Only maps fields that directly reduce manual setup work.
 */
export function mapOnboardingToTradeLineConfig(
  responses: Record<string, any>,
  variant: "call_backup" | "chat" | "complete",
): Partial<TradelineConfig> {
  const config: Record<string, any> = {};

  // Phone routing (call_backup + complete)
  if (variant === "call_backup" || variant === "complete") {
    const phoneRouting: Record<string, any> = {};
    if (responses.primary_phone) phoneRouting.primaryBusinessNumber = responses.primary_phone;
    if (responses.forwarding_preference) {
      const fwdMap: Record<string, string> = {
        "no-answer": "no_answer", "no_answer": "no_answer",
        "immediate": "immediate",
        "after-hours only": "after_hours_only", "after_hours_only": "after_hours_only", "after-hours-only": "after_hours_only",
      };
      const mapped = fwdMap[responses.forwarding_preference.toLowerCase()];
      if (mapped) phoneRouting.forwardingMode = mapped;
    }
    if (responses.ring_timeout) {
      const timeout = parseInt(responses.ring_timeout);
      if (!isNaN(timeout) && timeout > 0) phoneRouting.ringTimeoutSeconds = timeout;
    }
    if (Object.keys(phoneRouting).length) config.phoneRouting = phoneRouting;
  }

  // Website (chat + complete)
  if (variant === "chat" || variant === "complete") {
    const website: Record<string, any> = {};
    if (responses.website_access != null) {
      const raw = String(responses.website_access).toLowerCase();
      website.accessAvailable = raw === "yes" || raw === "true";
    }
    if (responses.install_mode) {
      const modeRaw = String(responses.install_mode).toLowerCase().replace(/\s+/g, "_");
      if (modeRaw.includes("direct") || modeRaw.includes("embed")) {
        website.embedMode = "direct_embed";
      } else if (modeRaw.includes("hosted") || modeRaw.includes("fallback")) {
        website.embedMode = "hosted_fallback";
      }
    }
    if (Object.keys(website).length) config.website = website;
  }

  // Booking
  if (responses.booking_enabled != null) {
    const raw = String(responses.booking_enabled).toLowerCase();
    config.booking = { enabled: raw === "yes" || raw === "true" || raw === "on" };
  }

  // Advance setupStage to "configuring" since onboarding is done
  config.setupStage = "configuring";

  return config as Partial<TradelineConfig>;
}

/**
 * Stage ordering for safe auto-advancement.
 * Only advances forward — never regresses.
 */
const STAGE_ORDER: TradelineConfig["setupStage"][] = [
  "not_started",
  "onboarding",
  "configuring",
  "awaiting_website_access",
  "awaiting_client_action",
  "ready_for_testing",
  "live",
];

/**
 * Advance setupStage forward only — never regresses.
 * Returns the new stage, or the current stage if target is behind.
 */
export function advanceSetupStage(
  current: TradelineConfig["setupStage"],
  target: TradelineConfig["setupStage"],
): TradelineConfig["setupStage"] {
  const currentIdx = STAGE_ORDER.indexOf(current);
  const targetIdx = STAGE_ORDER.indexOf(target);
  return targetIdx > currentIdx ? target : current;
}

/**
 * Compute the appropriate setupStage based on current config state.
 * Does not regress — only advances from the current stage.
 */
export function computeSetupStage(config: TradelineConfig): TradelineConfig["setupStage"] {
  let stage = config.setupStage;
  const needsWebsite = config.variant === "chat" || config.variant === "complete";

  // If we have an assistant built and config looks complete, suggest ready_for_testing
  if (config.assistant.status === "built") {
    const readiness = getTradeLineReadiness({
      ...config,
      // Temporarily override stage to avoid circular check
      setupStage: "ready_for_testing",
    });
    // Filter out assistant check since we just confirmed it's built
    const realIssues = readiness.issues.filter(i => !i.includes("Assistant is"));
    if (realIssues.length === 0) {
      stage = advanceSetupStage(stage, "ready_for_testing");
    }
  }

  // If website access is needed but not yet determined
  if (needsWebsite && config.website.accessAvailable === null && config.website.embedMode === "direct_embed") {
    stage = advanceSetupStage(stage, "awaiting_website_access");
  }

  return stage;
}

/* ─── TradeLine Usage ─── */
export const tradelineUsage = pgTable("tradeline_usage", {
  id: serial("id").primaryKey(),
  client_service_id: integer("client_service_id").notNull().references(() => clientServices.id),
  period_start: timestamp("period_start").notNull(),
  period_end: timestamp("period_end").notNull(),
  voice_minutes_used: integer("voice_minutes_used").notNull().default(0),
  sms_count: integer("sms_count").notNull().default(0),
  calls_count: integer("calls_count").notNull().default(0),
  included_minutes: integer("included_minutes").notNull().default(200),
  overage_minutes: integer("overage_minutes").notNull().default(0),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertTradelineUsageSchema = createInsertSchema(tradelineUsage).omit({ id: true, created_at: true, updated_at: true });
export type InsertTradelineUsage = z.infer<typeof insertTradelineUsageSchema>;
export type TradelineUsage = typeof tradelineUsage.$inferSelect;

/* ─── TradeLine Call Log ─── */
export const tradelineCallLog = pgTable("tradeline_call_log", {
  id: serial("id").primaryKey(),
  client_service_id: integer("client_service_id").notNull().references(() => clientServices.id),
  vapi_call_id: varchar("vapi_call_id", { length: 100 }).unique(),
  direction: varchar("direction", { length: 20 }).notNull().default("inbound"),
  // inbound | outbound
  caller_number: varchar("caller_number", { length: 30 }),
  duration_seconds: integer("duration_seconds").default(0),
  outcome: varchar("outcome", { length: 30 }).notNull().default("answered"),
  // answered | missed | voicemail | failed | transferred
  started_at: timestamp("started_at"),
  ended_at: timestamp("ended_at"),
  summary: text("summary"),
  transcript_json: jsonb("transcript_json"),
  recording_url: text("recording_url"),
  created_at: timestamp("created_at").defaultNow(),
});
export const insertTradelineCallLogSchema = createInsertSchema(tradelineCallLog).omit({ id: true, created_at: true });
export type InsertTradelineCallLog = z.infer<typeof insertTradelineCallLogSchema>;
export type TradelineCallLog = typeof tradelineCallLog.$inferSelect;

/* ─── TradeLine Lead Data (extracted from call transcripts) ─── */
export interface TradelineLeadData {
  caller_name?: string;
  caller_phone?: string;
  caller_address?: string;
  job_type?: string;
  urgency?: string;
  job_description?: string;
  preferred_date?: string;
}

/* ─── TradeLine Mode Log ─── */
export const tradelineModeLog = pgTable("tradeline_mode_log", {
  id: serial("id").primaryKey(),
  client_service_id: integer("client_service_id").notNull().references(() => clientServices.id),
  old_mode: varchar("old_mode", { length: 30 }).notNull(),
  new_mode: varchar("new_mode", { length: 30 }).notNull(),
  // available | on_the_job | after_hours
  changed_by: varchar("changed_by", { length: 30 }).notNull().default("client"),
  // client | admin | schedule | system
  reason: text("reason"),
  created_at: timestamp("created_at").defaultNow(),
});
export const insertTradelineModeLogSchema = createInsertSchema(tradelineModeLog).omit({ id: true, created_at: true });
export type InsertTradelineModeLog = z.infer<typeof insertTradelineModeLogSchema>;
export type TradelineModeLog = typeof tradelineModeLog.$inferSelect;

/* ─── Billing Dunning Events ───────────────────────────────────────────
 *
 * Premium failed-payment recovery sequence. One row per scheduled email
 * in the dunning lifecycle:
 *
 *   payment_failed (Day 0 covered by existing paymentFailedEmail.ts)
 *      → schedules day_2_reminder  (T+2 days)
 *      → schedules day_5_final     (T+5 days)
 *      → schedules day_7_warning   (T+7 days)  [warning only — Stripe drives suspension]
 *
 *   card_expiring   → standalone email, no sequence
 *   subscription_canceled → standalone confirmation, cancels pending rows
 *   payment_succeeded     → cancels pending rows (no email)
 *
 * Idempotency:
 *   - UNIQUE (stripe_subscription_id, trigger_event_id, kind) prevents
 *     scheduling the same email twice for the same Stripe event.
 *   - Worker also enforces a 24h resend guard per (subscription_id, kind)
 *     to prevent two of the same email kind landing within 24 hours even
 *     across different trigger events.
 *
 * ─────────────────────────────────────────────────────────────────── */
export const billingDunningEvents = pgTable("billing_dunning_events", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").references(() => clients.id),
  // Nullable — webhook may arrive before client is matched (e.g. Stripe
  // customer with no client row yet). Worker re-attempts match at send time.

  stripe_customer_id: text("stripe_customer_id").notNull(),
  stripe_subscription_id: text("stripe_subscription_id"),
  stripe_invoice_id: text("stripe_invoice_id"),
  // Subscription/invoice IDs may be null for card_expiring (which is
  // customer-level, not subscription-level).

  trigger_event: varchar("trigger_event", { length: 32 }).notNull(),
  // payment_failed | card_expiring | subscription_canceled
  trigger_event_id: text("trigger_event_id").notNull(),
  // Stripe Event.id — UNIQUE with kind below for duplicate-event safety

  kind: varchar("kind", { length: 24 }).notNull(),
  // day_2_reminder | day_5_final | day_7_warning
  // | card_expiring | subscription_canceled

  scheduled_for: timestamp("scheduled_for").notNull(),
  sent_at: timestamp("sent_at"),

  status: varchar("status", { length: 16 }).notNull().default("pending"),
  // pending | sent | cancelled | failed | skipped

  cancel_reason: varchar("cancel_reason", { length: 32 }),
  // payment_succeeded | subscription_canceled | manual | resend_guard

  amount_cents: integer("amount_cents"),
  currency: varchar("currency", { length: 8 }),

  metadata: jsonb("metadata"),
  // { last_error?, attempt_count?, recipient_email_at_send?, message_id? }

  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertBillingDunningEventSchema = createInsertSchema(billingDunningEvents).omit({
  id: true, created_at: true, updated_at: true,
});
export type InsertBillingDunningEvent = z.infer<typeof insertBillingDunningEventSchema>;
export type BillingDunningEvent = typeof billingDunningEvents.$inferSelect;

/* ─── Routing Events ─────────────────────────────────────────────────
 *
 * Phase 1 of the Rules & Routing Engine (see docs/rules-routing-engine-plan.md).
 *
 * Each row represents one routing decision: a specific entity was assigned
 * to a named work queue by a specific rule. Events have a lifecycle:
 *
 *   active -> system_resolved  (engine re-evaluates, condition no longer holds)
 *   active -> admin_acknowledged (admin marks event handled)
 *   active -> snoozed (admin snoozes; engine re-activates after snoozed_until)
 *   snoozed -> active (snooze expired + condition still holds)
 *   snoozed -> system_resolved (condition resolved while snoozed)
 *
 * admin_acknowledged and system_resolved are terminal for that event INSTANCE.
 * If the underlying condition persists past a per-queue requeue threshold,
 * the engine creates a NEW event with a fresh created_at.
 *
 * ─────────────────────────────────────────────────────────────────── */
export const routingEvents = pgTable("routing_events", {
  id: serial("id").primaryKey(),
  entity_type: text("entity_type").notNull(),
  // "client" | "client_service" | "fulfillment_task" | "support_ticket"
  // | "onboarding_submission" | "client_payment"
  entity_id: integer("entity_id").notNull(),
  queue: text("queue").notNull(),
  // e.g. "onboarding_stalled", "payment_at_risk", "task_blocked", "urgent_support"
  status: text("status").notNull().default("active"),
  // "active" | "snoozed" | "system_resolved" | "admin_acknowledged"
  rule_name: text("rule_name").notNull(),
  // which rule fired, e.g. "onboarding_stale", "payment_failed"
  priority: text("priority").notNull().default("normal"),
  // "low" | "normal" | "high" | "urgent"
  summary: text("summary").notNull(),
  // human-readable description of why this event was created
  metadata: jsonb("metadata"),
  // extra context: blocked_reason, current_status, owner_type, etc.
  snoozed_until: timestamp("snoozed_until"),
  acknowledged_by: integer("acknowledged_by"),
  // user ID of admin who acknowledged
  acknowledged_at: timestamp("acknowledged_at"),
  resolved_at: timestamp("resolved_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});
export const insertRoutingEventSchema = createInsertSchema(routingEvents).omit({
  id: true, created_at: true, updated_at: true,
});
export type InsertRoutingEvent = z.infer<typeof insertRoutingEventSchema>;
export type RoutingEvent = typeof routingEvents.$inferSelect;

/* ─── AdFlow Reports History ─── */
export const adflowReports = pgTable("adflow_reports", {
  id: serial("id").primaryKey(),
  client_service_id: integer("client_service_id").notNull(),
  client_id: integer("client_id").notNull(),
  period_label: text("period_label").notNull(), // "April 2026"
  period_start: timestamp("period_start").notNull(),
  period_end: timestamp("period_end").notNull(),
  metrics: jsonb("metrics").notNull(), // full AdFlowReportMetrics shape
  ai_summary: text("ai_summary"),
  recommendations: text("recommendations"),
  sent_at: timestamp("sent_at"),
  created_at: timestamp("created_at").defaultNow(),
});
export const insertAdflowReportSchema = createInsertSchema(adflowReports).omit({ id: true, created_at: true });
export type InsertAdflowReport = z.infer<typeof insertAdflowReportSchema>;
export type AdflowReport = typeof adflowReports.$inferSelect;


/* ─── Brand-availability + escalation singleton ────────────────────
   Single-row table holding the operating brand's "are we available"
   state. When `is_available = false` the AI assistant uses
   `away_message` instead of the standard greeting and creates a
   support ticket for every inbound contact (call or text).
   ─────────────────────────────────────────────────────────────── */

export const brandAvailability = pgTable("brand_availability", {
  id: serial("id").primaryKey(),
  is_available: boolean("is_available").notNull().default(true),
  away_message: text("away_message").notNull().default(
    "All of our team members are tied up at the moment. Leave your name and number and we'll get back to you within an hour."
  ),
  set_by_user_id: integer("set_by_user_id").references(() => users.id),
  set_at: timestamp("set_at").defaultNow(),
});
export const insertBrandAvailabilitySchema = createInsertSchema(brandAvailability).omit({ id: true, set_at: true });
export type InsertBrandAvailability = z.infer<typeof insertBrandAvailabilitySchema>;
export type BrandAvailability = typeof brandAvailability.$inferSelect;

