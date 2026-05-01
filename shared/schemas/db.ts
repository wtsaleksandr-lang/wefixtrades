import { pgTable, text, varchar, serial, integer, timestamp, jsonb, json, boolean, uuid, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ─── Sessions (managed by connect-pg-simple) ─── */
// This table is created/managed automatically by connect-pg-simple when
// `createTableIfMissing: true` is set on the PgStore. We declare it here
// so Drizzle push/migrate doesn't flag it as an unknown table and try to
// drop it. Do NOT modify these columns — they must match what
// connect-pg-simple expects.
export const session = pgTable("session", {
  sid: varchar("sid").primaryKey().notNull(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (table) => ({
  expireIdx: index("IDX_session_expire").on(table.expire),
}));

/* ─── Users ─── */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password_hash: text("password_hash").notNull(),
  name: text("name"),
  role: text("role").notNull().default("client"),
  totp_secret: text("totp_secret"),
  totp_enabled: boolean("totp_enabled").default(false),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, created_at: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

/* ─── Password Reset Tokens ─── */
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull().references(() => users.id),
  token: varchar("token", { length: 64 }).notNull().unique(),
  expires_at: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  created_at: timestamp("created_at").defaultNow(),
});

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

/* ─── Calendar Connections ─── */
export const calendarConnections = pgTable("calendar_connections", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull(),
  platform: text("platform").notNull(), // "google_calendar" | "cal_com" | "calendly" | "jobber" | "manual"
  credentials: jsonb("credentials"), // encrypted OAuth tokens or API keys
  calendar_id: text("calendar_id"), // specific calendar/event type ID
  booking_url: text("booking_url"), // for manual/external platforms
  slot_duration_minutes: integer("slot_duration_minutes").default(60),
  buffer_minutes: integer("buffer_minutes").default(15),
  working_hours: jsonb("working_hours"), // { monday: { start: "08:00", end: "17:00" }, ... }
  timezone: text("timezone").default("America/New_York"),
  is_active: boolean("is_active").default(true),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const insertCalendarConnectionSchema = createInsertSchema(calendarConnections).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertCalendarConnection = z.infer<typeof insertCalendarConnectionSchema>;
export type CalendarConnection = typeof calendarConnections.$inferSelect;

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
  client_id: integer("client_id").notNull(),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  status: varchar("status", { length: 30 }).notNull().default("open"),
  // open | in_progress | waiting_on_customer | resolved | closed
  priority: varchar("priority", { length: 20 }).notNull().default("normal"),
  // low | normal | high | urgent
  category: varchar("category", { length: 50 }).notNull().default("general"),
  // general | billing | service | onboarding | access | other
  source: varchar("source", { length: 30 }).notNull().default("manual"),
  // manual | ai_escalation | admin_created
  assigned_to: integer("assigned_to").references(() => users.id),
  ai_summary: text("ai_summary"),
  ai_priority_hint: varchar("ai_priority_hint", { length: 20 }),
  transcript_json: jsonb("transcript_json").default([]),
  admin_notified: boolean("admin_notified").default(false),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at"),
  resolved_at: timestamp("resolved_at"),
  closed_at: timestamp("closed_at"),
});

export const insertAiConversationSchema = createInsertSchema(aiConversations).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({
  id: true,
  created_at: true,
  updated_at: true,
  resolved_at: true,
  closed_at: true,
});

/* ─── Ticket Messages ─── */
export const ticketMessages = pgTable("ticket_messages", {
  id: serial("id").primaryKey(),
  ticket_id: integer("ticket_id").notNull().references(() => supportTickets.id),
  author_id: integer("author_id").references(() => users.id),
  author_type: varchar("author_type", { length: 20 }).notNull(),
  // customer | admin | system
  visibility: varchar("visibility", { length: 20 }).notNull().default("customer"),
  // customer = visible to both sides; internal = admin-only
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertTicketMessageSchema = createInsertSchema(ticketMessages).omit({
  id: true,
  created_at: true,
});
export type InsertTicketMessage = z.infer<typeof insertTicketMessageSchema>;
export type TicketMessage = typeof ticketMessages.$inferSelect;

/* ─── Ticket Events (audit trail) ─── */
export const ticketEvents = pgTable("ticket_events", {
  id: serial("id").primaryKey(),
  ticket_id: integer("ticket_id").notNull().references(() => supportTickets.id),
  actor_id: integer("actor_id").references(() => users.id),
  actor_type: varchar("actor_type", { length: 20 }).notNull(),
  // human | system
  action: varchar("action", { length: 50 }).notNull(),
  // created | status_changed | priority_changed | assigned | reply_added | note_added | resolved | closed | reopened
  old_value: text("old_value"),
  new_value: text("new_value"),
  summary: text("summary"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertTicketEventSchema = createInsertSchema(ticketEvents).omit({
  id: true,
  created_at: true,
});
export type InsertTicketEvent = z.infer<typeof insertTicketEventSchema>;
export type TicketEvent = typeof ticketEvents.$inferSelect;

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
  source_tool: varchar("source_tool", { length: 50 }),
  source_page: text("source_page"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertAuditSubmissionSchema = createInsertSchema(auditSubmissions).omit({
  id: true,
  created_at: true,
});
export type InsertAuditSubmission = z.infer<typeof insertAuditSubmissionSchema>;
export type AuditSubmission = typeof auditSubmissions.$inferSelect;

/* ─── Audit Followup Emails ─── */
export const auditFollowupEmails = pgTable("audit_followup_emails", {
  id: serial("id").primaryKey(),
  audit_submission_id: integer("audit_submission_id").references(() => auditSubmissions.id),
  audit_report_id: uuid("audit_report_id").references(() => auditReports.id),
  missed_call_lead_id: integer("missed_call_lead_id"),
  demo_quote_lead_id: integer("demo_quote_lead_id"),
  email: text("email").notNull(),
  business_name: text("business_name"),
  run_at: timestamp("run_at").notNull(),
  step: varchar("step", { length: 30 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  attempts: integer("attempts").default(0),
  max_attempts: integer("max_attempts").default(3),
  last_error: text("last_error"),
  payload: jsonb("payload"),
  created_at: timestamp("created_at").defaultNow(),
  processed_at: timestamp("processed_at"),
});

export const insertAuditFollowupEmailSchema = createInsertSchema(auditFollowupEmails).omit({
  id: true,
  created_at: true,
});
export type InsertAuditFollowupEmail = z.infer<typeof insertAuditFollowupEmailSchema>;
export type AuditFollowupEmail = typeof auditFollowupEmails.$inferSelect;

/* ─── Demo Quote Leads ─── */
export const demoQuoteLeads = pgTable("demo_quote_leads", {
  id: serial("id").primaryKey(),
  email: text("email"),
  name: text("name"),
  phone: text("phone"),
  company: text("company"),
  trade: varchar("trade", { length: 50 }).notNull(),
  demo_business_name: text("demo_business_name"),
  quote_amount: integer("quote_amount"),
  answers: jsonb("answers"),
  sms_consent: boolean("sms_consent").default(false),
  source: varchar("source", { length: 50 }).default("quote_demo"),
  page: varchar("page", { length: 100 }).default("quote-demo"),
  source_tool: varchar("source_tool", { length: 50 }),
  source_page: text("source_page"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertDemoQuoteLeadSchema = createInsertSchema(demoQuoteLeads).omit({
  id: true,
  created_at: true,
});
export type InsertDemoQuoteLead = z.infer<typeof insertDemoQuoteLeadSchema>;
export type DemoQuoteLead = typeof demoQuoteLeads.$inferSelect;

/* ─── Missed Call Calculator Leads ─── */
export const missedCallLeads = pgTable("missed_call_leads", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  phone: text("phone"),
  trade: varchar("trade", { length: 50 }).notNull(),
  missed_calls_per_week: integer("missed_calls_per_week"),
  close_rate_percent: integer("close_rate_percent"),
  avg_job_value: integer("avg_job_value"),
  estimated_annual_loss: integer("estimated_annual_loss"),
  source_tool: varchar("source_tool", { length: 50 }),
  source_page: text("source_page"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertMissedCallLeadSchema = createInsertSchema(missedCallLeads).omit({
  id: true,
  created_at: true,
});
export type InsertMissedCallLead = z.infer<typeof insertMissedCallLeadSchema>;
export type MissedCallLead = typeof missedCallLeads.$inferSelect;

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

/* ─── AI Usage Logs ─── */
export const aiUsageLogs = pgTable("ai_usage_logs", {
  id: serial("id").primaryKey(),
  model: varchar("model", { length: 60 }).notNull(),
  surface: varchar("surface", { length: 30 }).notNull(),
  provider: varchar("provider", { length: 30 }),          // e.g. "anthropic", "vapi", "openai"
  channel: varchar("channel", { length: 30 }),             // e.g. "chat", "voice", "voice_demo"
  session_id: varchar("session_id", { length: 100 }),
  user_id: integer("user_id").references(() => users.id),
  report_id: uuid("report_id"),
  input_tokens: integer("input_tokens"),
  output_tokens: integer("output_tokens"),
  latency_ms: integer("latency_ms"),
  estimated_cost_usd: integer("estimated_cost_usd"),  // stored as micro-cents (× 1,000,000) for precision
  success: boolean("success").notNull().default(true),
  error_message: text("error_message"),
  metadata: jsonb("metadata"),                             // extensible: call_id, transcript ref, webhook event type, etc.
  created_at: timestamp("created_at").defaultNow(),
});

export const insertAiUsageLogSchema = createInsertSchema(aiUsageLogs).omit({
  id: true,
  created_at: true,
});
export type InsertAiUsageLog = z.infer<typeof insertAiUsageLogSchema>;
export type AiUsageLog = typeof aiUsageLogs.$inferSelect;

/* ─── AI Conversation Archive (admin repository) ─── */
export const aiConversationArchive = pgTable("ai_conversation_archive", {
  id: serial("id").primaryKey(),
  session_id: varchar("session_id", { length: 100 }).notNull(),
  user_id: integer("user_id").references(() => users.id),
  surface: varchar("surface", { length: 30 }).notNull(),
  report_id: uuid("report_id"),
  summary: text("summary").notNull(),
  context_note: text("context_note"),
  tags: jsonb("tags").default([]),
  primary_intent: varchar("primary_intent", { length: 40 }).notNull().default("general"),
  save_decision: varchar("save_decision", { length: 30 }).notNull().default("high_value"),
  message_count: integer("message_count").notNull().default(0),
  messages_json: jsonb("messages_json").default([]),
  total_input_tokens: integer("total_input_tokens").default(0),
  total_output_tokens: integer("total_output_tokens").default(0),
  estimated_cost_usd: integer("estimated_cost_usd").default(0),
  first_message_at: timestamp("first_message_at"),
  last_message_at: timestamp("last_message_at"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertAiConversationArchiveSchema = createInsertSchema(aiConversationArchive).omit({
  id: true,
  created_at: true,
});
export type InsertAiConversationArchive = z.infer<typeof insertAiConversationArchiveSchema>;
export type AiConversationArchive = typeof aiConversationArchive.$inferSelect;

/* ─── Assistant Threads ─── */
export const assistantThreads = pgTable("assistant_threads", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  surface: varchar("surface", { length: 30 }).notNull().default("portal"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  title: text("title"),
  page_context: varchar("page_context", { length: 60 }),
  metadata: jsonb("metadata").default({}),
  message_count: integer("message_count").notNull().default(0),
  last_message_at: timestamp("last_message_at"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const insertAssistantThreadSchema = createInsertSchema(assistantThreads).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertAssistantThread = z.infer<typeof insertAssistantThreadSchema>;
export type AssistantThread = typeof assistantThreads.$inferSelect;

/* ─── Assistant Messages ─── */
export const assistantMessages = pgTable("assistant_messages", {
  id: serial("id").primaryKey(),
  thread_id: integer("thread_id").references(() => assistantThreads.id).notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  content: text("content").notNull(),
  token_count: integer("token_count"),
  created_at: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_assistant_messages_thread_created").on(table.thread_id, table.created_at),
]);

export const insertAssistantMessageSchema = createInsertSchema(assistantMessages).omit({
  id: true,
  created_at: true,
});
export type InsertAssistantMessage = z.infer<typeof insertAssistantMessageSchema>;
export type AssistantMessage = typeof assistantMessages.$inferSelect;

/* ─── Email Tracking Events ───────────────────────────────────────────
 *
 * Lightweight open + click tracking for outbound transactional /
 * admin-alert emails. One row per pixel hit or link click.
 *
 * `email_id` is an opaque short ID generated per send (~22 base64url
 * chars from 16 random bytes). The same email_id can appear many
 * times — typically one `open` row plus N `click` rows as the
 * recipient interacts.
 *
 * `metadata` shape:
 *   - opens : { user_agent? }
 *   - clicks: { user_agent?, target_url }
 *
 * No PII beyond UA — IP intentionally omitted to limit GDPR exposure.
 *
 * ─────────────────────────────────────────────────────────────────── */
export const emailEvents = pgTable("email_events", {
  id: serial("id").primaryKey(),
  email_id: varchar("email_id", { length: 64 }).notNull(),
  type: varchar("type", { length: 16 }).notNull(),
  // open | click
  created_at: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata"),
}, (t) => ({
  byEmailId: index("email_events_email_id_idx").on(t.email_id),
}));
export const insertEmailEventSchema = createInsertSchema(emailEvents).omit({
  id: true,
  created_at: true,
});
export type InsertEmailEvent = z.infer<typeof insertEmailEventSchema>;
export type EmailEvent = typeof emailEvents.$inferSelect;

/* ─── Integration Error Logs ──────────────────────────────────────
 * Captures errors from outbound integrations (Stripe, Outscraper,
 * social APIs, etc.) for debugging and monitoring. Retention: 30 days.
 * ─────────────────────────────────────────────────────────────────── */
export const integrationErrorLogs = pgTable("integration_error_logs", {
  id: serial("id").primaryKey(),
  integration: varchar("integration", { length: 50 }).notNull(),
  // e.g. "stripe", "outscraper", "facebook", "google_business"
  operation: varchar("operation", { length: 100 }),
  error_message: text("error_message"),
  error_code: varchar("error_code", { length: 50 }),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
}, (t) => ({
  byCreatedAt: index("integration_error_logs_created_at_idx").on(t.created_at),
}));
export const insertIntegrationErrorLogSchema = createInsertSchema(integrationErrorLogs).omit({ id: true, created_at: true });
export type InsertIntegrationErrorLog = z.infer<typeof insertIntegrationErrorLogSchema>;
export type IntegrationErrorLog = typeof integrationErrorLogs.$inferSelect;

/* ─── Processed Stripe Events ─────────────────────────────────────
 * Idempotency guard: tracks Stripe webhook event IDs that have been
 * processed to prevent double-handling. Retention: 90 days.
 * ─────────────────────────────────────────────────────────────────── */
export const processedStripeEvents = pgTable("processed_stripe_events", {
  id: serial("id").primaryKey(),
  stripe_event_id: varchar("stripe_event_id", { length: 100 }).notNull(),
  event_type: varchar("event_type", { length: 100 }),
  processed_at: timestamp("processed_at").defaultNow(),
}, (t) => ({
  byStripeEventId: index("processed_stripe_events_event_id_idx").on(t.stripe_event_id),
  byProcessedAt: index("processed_stripe_events_processed_at_idx").on(t.processed_at),
}));
export const insertProcessedStripeEventSchema = createInsertSchema(processedStripeEvents).omit({ id: true, processed_at: true });
export type InsertProcessedStripeEvent = z.infer<typeof insertProcessedStripeEventSchema>;
export type ProcessedStripeEvent = typeof processedStripeEvents.$inferSelect;
