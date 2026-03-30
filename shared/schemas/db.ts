import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ─── Users ─── */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password_hash: text("password_hash").notNull(),
  name: text("name"),
  role: text("role").notNull().default("client"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, created_at: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

/* ─── Calculators ─── */
export const calculators = pgTable("calculators", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id),
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
  plan_tier: text("plan_tier").default("free"),
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
  consent_timestamp: timestamp("consent_timestamp"),
  consent_text_version: varchar("consent_text_version", { length: 50 }),
  ai_paused: boolean("ai_paused").default(false),
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

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  calculator_id: integer("calculator_id").notNull().references(() => calculators.id),
  lead_id: integer("lead_id").references(() => leads.id),
  customer_name: text("customer_name").notNull(),
  customer_email: text("customer_email"),
  customer_phone: text("customer_phone"),
  date: varchar("date", { length: 10 }).notNull(),
  time: varchar("time", { length: 5 }).notNull(),
  duration_minutes: integer("duration_minutes").notNull().default(60),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  deposit_amount: integer("deposit_amount").default(0),
  deposit_paid: boolean("deposit_paid").default(false),
  stripe_payment_intent_id: text("stripe_payment_intent_id"),
  stripe_checkout_session_id: text("stripe_checkout_session_id"),
  quote_amount: integer("quote_amount"),
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertBookingSchema = createInsertSchema(bookings).omit({
  id: true,
  created_at: true,
});

export const aiConversations = pgTable("ai_conversations", {
  id: serial("id").primaryKey(),
  agent_type: varchar("agent_type", { length: 30 }).notNull(),
  account_id: integer("account_id").references(() => calculators.id),
  calculator_id: integer("calculator_id").references(() => calculators.id),
  session_id: varchar("session_id", { length: 100 }).notNull(),
  messages_json: jsonb("messages_json").notNull().default([]),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const supportTickets = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  calculator_id: integer("calculator_id").references(() => calculators.id),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  description: text("description").notNull(),
  transcript_json: jsonb("transcript_json").default([]),
  admin_notified: boolean("admin_notified").default(false),
  created_at: timestamp("created_at").defaultNow(),
  resolved_at: timestamp("resolved_at"),
});

export const insertAiConversationSchema = createInsertSchema(aiConversations).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({
  id: true,
  created_at: true,
  resolved_at: true,
});

export const smsMessages = pgTable("sms_messages", {
  id: serial("id").primaryKey(),
  lead_id: integer("lead_id").references(() => leads.id),
  calculator_id: integer("calculator_id").references(() => calculators.id),
  direction: varchar("direction", { length: 10 }).notNull(),
  channel: varchar("channel", { length: 15 }).notNull().default("sms"),
  body: text("body").notNull(),
  from_number: varchar("from_number", { length: 30 }),
  to_number: varchar("to_number", { length: 30 }),
  twilio_sid: varchar("twilio_sid", { length: 60 }),
  is_ai: boolean("is_ai").default(true),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertSmsMessageSchema = createInsertSchema(smsMessages).omit({
  id: true,
  created_at: true,
});

/* ─── Inferred Select Types ─── */

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
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookings.$inferSelect;
export type InsertAiConversation = z.infer<typeof insertAiConversationSchema>;
export type AiConversation = typeof aiConversations.$inferSelect;
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSmsMessage = z.infer<typeof insertSmsMessageSchema>;
export type SmsMessage = typeof smsMessages.$inferSelect;

/* ─── Audit Submissions ─── */
export const auditSubmissions = pgTable("audit_submissions", {
  id: serial("id").primaryKey(),
  business_name: text("business_name"),
  place_id: text("place_id"),
  email: text("email").notNull(),
  phone: text("phone"),
  name: text("name"),
  wants_help: boolean("wants_help").default(false),
  local_visibility_score: integer("local_visibility_score"),
  mobile_speed_score: integer("mobile_speed_score"),
  desktop_speed_score: integer("desktop_speed_score"),
  issue_count: integer("issue_count").default(0),
  report_json: jsonb("report_json"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertAuditSubmissionSchema = createInsertSchema(auditSubmissions).omit({
  id: true,
  created_at: true,
});
export type InsertAuditSubmission = z.infer<typeof insertAuditSubmissionSchema>;
export type AuditSubmission = typeof auditSubmissions.$inferSelect;

/* ─── Audit Reports ─── */
export const auditReports = pgTable("audit_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  created_at: timestamp("created_at").defaultNow(),
  business_name: text("business_name").notNull(),
  business_place_id: text("business_place_id"),
  audit_data: jsonb("audit_data").notNull(),
  ai_narrative: jsonb("ai_narrative"),
  view_count: integer("view_count").notNull().default(0),
});

export const insertAuditReportSchema = createInsertSchema(auditReports).omit({ id: true, created_at: true, view_count: true });
export type InsertAuditReport = z.infer<typeof insertAuditReportSchema>;
export type AuditReport = typeof auditReports.$inferSelect;

/* ─── Chat Memory ─── */
export const chatMemory = pgTable("chat_memory", {
  id: serial("id").primaryKey(),
  session_id: varchar("session_id", { length: 100 }).notNull(),
  user_id: integer("user_id").references(() => users.id),
  surface: varchar("surface", { length: 30 }).notNull().default("website"),
  report_id: uuid("report_id"),
  user_name: text("user_name"),
  business_type: text("business_type"),
  service_area: text("service_area"),
  website_url: text("website_url"),
  previous_topics: jsonb("previous_topics").default([]),
  interested_in_pricing: boolean("interested_in_pricing").default(false),
  interested_in_booking: boolean("interested_in_booking").default(false),
  messages_json: jsonb("messages_json").notNull().default([]),
  expires_at: timestamp("expires_at").notNull(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const insertChatMemorySchema = createInsertSchema(chatMemory).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertChatMemory = z.infer<typeof insertChatMemorySchema>;
export type ChatMemory = typeof chatMemory.$inferSelect;
