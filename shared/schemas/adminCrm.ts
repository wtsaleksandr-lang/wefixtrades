import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean, uuid } from "drizzle-orm/pg-core";
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
  stripe_price_id: text("stripe_price_id"),
  sort_order: integer("sort_order").notNull().default(0),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertServiceCatalogSchema = createInsertSchema(serviceCatalog).omit({ created_at: true, updated_at: true });
export type InsertServiceCatalog = z.infer<typeof insertServiceCatalogSchema>;
export type ServiceCatalogRow = typeof serviceCatalog.$inferSelect;

/* ─── Clients ─── */
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id),  // optional link to auth user
  business_name: text("business_name").notNull(),
  contact_name: text("contact_name"),
  contact_email: text("contact_email"),
  contact_phone: text("contact_phone"),
  website_url: text("website_url"),
  trade_type: varchar("trade_type", { length: 100 }),
  status: varchar("status", { length: 30 }).notNull().default("lead"),
  // lead | onboarding | active | paused | churned
  source: varchar("source", { length: 50 }),
  // audit | referral | inbound | manual | website
  stripe_customer_id: text("stripe_customer_id"),
  automation_enabled: boolean("automation_enabled").notNull().default(true),
  human_override: boolean("human_override").notNull().default(false),
  metadata: jsonb("metadata"),                             // flexible extra data
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
  contact_name: text("contact_name"),
  contact_email: text("contact_email"),
  platform_url: text("platform_url"),
  supported_services: jsonb("supported_services"),         // string[] of service_ids
  notes: text("notes"),
  is_active: boolean("is_active").notNull().default(true),
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
  // not_started | submitted | in_progress | waiting | blocked | delivered | cancelled
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
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertFulfillmentTaskSchema = createInsertSchema(fulfillmentTasks).omit({ id: true, created_at: true, updated_at: true });
export type InsertFulfillmentTask = z.infer<typeof insertFulfillmentTaskSchema>;
export type FulfillmentTask = typeof fulfillmentTasks.$inferSelect;

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
