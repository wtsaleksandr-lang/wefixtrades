import { pgTable, text, varchar, serial, integer, timestamp, date, jsonb, json, boolean, uuid, index, uniqueIndex, numeric } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
  /**
   * Google account subject ID — the stable `sub` claim from Google's
   * OpenID token. Set when a user signs in via "Continue with Google".
   * Null for password-only accounts. Google-created users get a random
   * unusable password_hash and can claim a real password later via the
   * standard forgot-password flow.
   */
  google_sub: text("google_sub").unique(),
  /**
   * Microsoft (Entra ID) account subject ID — the stable `sub` (or `oid`)
   * claim from Microsoft's OpenID token. Set when a user signs in via
   * "Sign in with Microsoft". Same semantics as `google_sub`. See
   * migration 0045_social_login_subs.sql.
   */
  microsoft_sub: text("microsoft_sub").unique(),
  /**
   * Facebook account ID — the stable `id` field from the Facebook Graph
   * `/me` endpoint. Set when a user signs in via "Sign in with Facebook".
   * Same semantics as `google_sub`. See migration 0045_social_login_subs.sql.
   */
  facebook_sub: text("facebook_sub").unique(),
  // Phase 3e-ii: how the AI escalates to this user. "dashboard" = an agenda
  // notice only; "sms" / "whatsapp" also ping ai_contact_phone via Twilio.
  ai_contact_method: varchar("ai_contact_method", { length: 20 }).notNull().default("dashboard"),
  ai_contact_phone: text("ai_contact_phone"),
  // Wave K — cumulative AI spend (USD) + lifetime vision-image count. The
  // QuoteQuick editor's AI assistant decrements against these; the admin
  // /admin/crm/ai-budget page resets them. NUMERIC(10,4) → reads as string
  // through pg-node so the service casts to number on read.
  ai_spend_usd: numeric("ai_spend_usd", { precision: 10, scale: 4 }).notNull().default("0"),
  ai_images_used: integer("ai_images_used").notNull().default(0),
  // Account-lockout state (migration 0052). `failed_login_attempts` is a
  // running counter incremented on every wrong-password attempt across
  // /api/auth/login, /api/auth/token-login and /api/auth/checkout-login,
  // reset to 0 on first successful auth. `locked_until` is set 15 minutes
  // ahead once the counter hits 5; login routes 423 while it's in the
  // future. NULL = not locked.
  failed_login_attempts: integer("failed_login_attempts").notNull().default(0),
  locked_until: timestamp("locked_until", { withTimezone: true }),
  created_at: timestamp("created_at").defaultNow(),
}, (table) => ({
  // Partial UNIQUE index from migrations/0045_social_login_subs.sql.
  // The migration creates `CREATE UNIQUE INDEX ... WHERE microsoft_sub IS NOT NULL`.
  // The column-level `.unique()` above creates an additional unrelated
  // constraint on the live DB (legacy), but this declaration is what
  // satisfies the schema-drift parity check and matches the migration.
  microsoftSubIdx: uniqueIndex("users_microsoft_sub_idx")
    .on(table.microsoft_sub)
    .where(sql`${table.microsoft_sub} IS NOT NULL`),
  facebookSubIdx: uniqueIndex("users_facebook_sub_idx")
    .on(table.facebook_sub)
    .where(sql`${table.facebook_sub} IS NOT NULL`),
}));

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

/* ─── Admin impersonation audit (0039) ───
 * Every "view as customer" session is logged here. Active sessions have
 * ended_at IS NULL; the session middleware enforces a 60-minute cap from
 * started_at. Used by the banner + the cross-cutting audit log reader. */
export const adminImpersonations = pgTable(
  "admin_impersonations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Migration 0039 uses ON DELETE RESTRICT — match it so drizzle-kit push
    // doesn't propose to drop+recreate the FK constraint with NO ACTION.
    admin_user_id: integer("admin_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    target_user_id: integer("target_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    started_at: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    ended_at: timestamp("ended_at", { withTimezone: true }),
    admin_ip: text("admin_ip"),
    reason: text("reason"),
  },
  (t) => ({
    // Names + shape must match migrations/0039_admin_impersonations.sql.
    // Without these declarations drizzle-kit push proposes DROP INDEX for
    // indexes the migration created but the schema doesn't know about.
    adminIdx: index("admin_impersonations_admin_idx").on(t.admin_user_id),
    targetIdx: index("admin_impersonations_target_idx").on(t.target_user_id),
    activeIdx: index("admin_impersonations_active_idx")
      .on(t.ended_at)
      .where(sql`${t.ended_at} IS NULL`),
  }),
);
export type AdminImpersonation = typeof adminImpersonations.$inferSelect;

/* ─── Calculators ─── */
export const calculators = pgTable("calculators", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id),
  // Wave P-E — slug becomes nullable so the slug-release cron can null
  // the column without orphaning the calculator row. Uniqueness is still
  // enforced for non-null values. A null slug = released-back-to-pool.
  slug: varchar("slug", { length: 255 }).unique(),
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
  stripe_subscription_id: text("stripe_subscription_id"),
  created_at: timestamp("created_at").defaultNow(),
  // Wave P — slug lifecycle. Every edit / public view bumps `updated_at`.
  // The slug-release cron compares this against now() to decide whether
  // a free-tier calculator has been abandoned long enough to release its
  // subdomain back to the pool. Paid tiers are excluded by the cron.
  // `slug_release_warned_at` records when we sent the 7-day-warning email
  // so we don't spam the owner every cron tick.
  updated_at: timestamp("updated_at").defaultNow(),
  slug_release_warned_at: timestamp("slug_release_warned_at"),
}, (table) => ({
  // migrations/0051_jsonb_gin_indexes.sql: partial GIN on the JSONB path
  // (calculator_settings -> '_slug_redirects') with jsonb_path_ops, used
  // by getCalculatorByOldSlug containment lookup. Declared by SQL
  // expression because Drizzle's column-typed GIN doesn't directly model
  // an expression index; the schema-drift parity check only matches on
  // the index name string, so this satisfies the guard. drizzle-kit push
  // is never executed against prod (start-prod.sh strips drizzle-kit).
  slugRedirectsGinIdx: index("idx_calculators_slug_redirects_gin")
    .using("gin", sql`(${table.calculator_settings} -> '_slug_redirects') jsonb_path_ops`)
    .where(sql`jsonb_typeof(${table.calculator_settings} -> '_slug_redirects') = 'array'`),
}));

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
  // Wave 79 — TCPA audit trail. Populated forward-only by leadRoutes.
  consent_url: text("consent_url"),
  consent_ip_hash: text("consent_ip_hash"),
  consent_user_agent: text("consent_user_agent"),
  consent_method: varchar("consent_method", { length: 20 }),
  ai_paused: boolean("ai_paused").default(false),
  replied_at: timestamp("replied_at"),
  // UTM / source attribution (P1-4)
  landing_page: text("landing_page"),
  referrer: text("referrer"),
  utm_source: text("utm_source"),
  utm_medium: text("utm_medium"),
  utm_campaign: text("utm_campaign"),
  // Won-value tracking (P1-3)
  won_value: integer("won_value"),   // cents
  won_at: timestamp("won_at"),
  created_date: timestamp("created_date").defaultNow(),
}, (table) => ({
  // migrations/0050_perf_indexes.sql: (calculator_id, created_date DESC).
  // `.desc().nullsFirst()` pins NULL ordering to Postgres's default for
  // DESC so drizzle-kit push doesn't propose drop+recreate.
  calculatorCreatedIdx: index("idx_leads_calculator_created").on(
    table.calculator_id,
    table.created_date.desc().nullsFirst(),
  ),
  // migrations/0069_tcpa_consent_audit_trail.sql — partial index for the
  // reverse "show all consents for phone X" lookup needed to defend a
  // TCPA challenge. WHERE sms_consent = true keeps it lean.
  consentPhoneIdx: index("idx_leads_consent_phone")
    .on(table.phone, table.consent_timestamp.desc().nullsFirst())
    .where(sql`${table.sms_consent} = true`),
}));

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
}, (table) => ({
  // migrations/0050_perf_indexes.sql: partial index on (created_at)
  // WHERE status = 'pending'. Worker poll query.
  pendingIdx: index("idx_notification_queue_pending")
    .on(table.created_at)
    .where(sql`${table.status} = 'pending'`),
}));

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
}, (table) => ({
  // migrations/0050_perf_indexes.sql: partial index on (run_at)
  // WHERE status = 'pending'. Worker poll query.
  pendingIdx: index("idx_followup_jobs_pending")
    .on(table.run_at)
    .where(sql`${table.status} = 'pending'`),
}));

export const analyticsEvents = pgTable("analytics_events", {
  id: serial("id").primaryKey(),
  calculator_id: integer("calculator_id").notNull().references(() => calculators.id),
  event_type: varchar("event_type", { length: 50 }).notNull(),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
}, (table) => ({
  // migrations/0050_perf_indexes.sql: (calculator_id, created_at DESC).
  calculatorCreatedIdx: index("idx_analytics_events_calc_created").on(
    table.calculator_id,
    table.created_at.desc().nullsFirst(),
  ),
}));

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

/* ─── Widget Deposits (Wave R-2) ──────────────────────────────────
   Stripe Checkout deposits initiated from the QuoteQuick widget's
   post-quote "Secure your slot" panel. Money flows via Stripe Connect
   to the calculator owner's connected account; the row tracks the
   session lifecycle (pending → paid / failed / refunded). See
   migrations/0016_widget_deposits.sql for the canonical DDL. */
export const widgetDeposits = pgTable("widget_deposits", {
  id: serial("id").primaryKey(),
  calculator_id: integer("calculator_id").notNull().references(() => calculators.id),
  lead_id: integer("lead_id").references(() => leads.id),
  amount_cents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  stripe_session_id: text("stripe_session_id"),
  stripe_payment_intent_id: text("stripe_payment_intent_id"),
  // pending | paid | failed | refunded
  status: text("status").notNull().default("pending"),
  customer_email: text("customer_email"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
  paid_at: timestamp("paid_at"),
}, (table) => ({
  calcIdx: index("idx_widget_deposits_calc").on(table.calculator_id, table.created_at),
  sessionIdx: index("idx_widget_deposits_session").on(table.stripe_session_id),
}));

export const insertWidgetDepositSchema = createInsertSchema(widgetDeposits).omit({
  id: true,
  created_at: true,
  paid_at: true,
});
export type InsertWidgetDeposit = z.infer<typeof insertWidgetDepositSchema>;
export type WidgetDeposit = typeof widgetDeposits.$inferSelect;

/* ─── Widget Scheduling (Wave R-1) ─── */
// One row per calculator. Drives the Calendly-style picker on the widget.
export const availabilityRules = pgTable("availability_rules", {
  id: serial("id").primaryKey(),
  calculator_id: integer("calculator_id").notNull().references(() => calculators.id),
  enabled: boolean("enabled").notNull().default(false),
  // 0=Sun..6=Sat
  working_days: jsonb("working_days").notNull().default([1, 2, 3, 4, 5]),
  working_hours_start: text("working_hours_start").notNull().default("09:00"),
  working_hours_end: text("working_hours_end").notNull().default("17:00"),
  timezone: text("timezone").notNull().default("America/Toronto"),
  slot_duration_minutes: integer("slot_duration_minutes").notNull().default(30),
  buffer_minutes: integer("buffer_minutes").notNull().default(0),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const scheduledAppointments = pgTable("scheduled_appointments", {
  id: serial("id").primaryKey(),
  calculator_id: integer("calculator_id").notNull().references(() => calculators.id),
  lead_id: integer("lead_id").references(() => leads.id),
  customer_name: text("customer_name"),
  customer_email: text("customer_email"),
  customer_phone: text("customer_phone"),
  scheduled_for: timestamp("scheduled_for").notNull(),
  duration_minutes: integer("duration_minutes").notNull().default(30),
  notes: text("notes"),
  status: text("status").notNull().default("confirmed"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertAvailabilityRuleSchema = createInsertSchema(availabilityRules).omit({
  id: true,
  updated_at: true,
});
export const insertScheduledAppointmentSchema = createInsertSchema(scheduledAppointments).omit({
  id: true,
  created_at: true,
});
export type AvailabilityRule = typeof availabilityRules.$inferSelect;
export type InsertAvailabilityRule = z.infer<typeof insertAvailabilityRuleSchema>;
export type ScheduledAppointment = typeof scheduledAppointments.$inferSelect;
export type InsertScheduledAppointment = z.infer<typeof insertScheduledAppointmentSchema>;

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
  // manual | ai_escalation | admin_created | inbound_email
  assigned_to: integer("assigned_to").references(() => users.id),
  ai_summary: text("ai_summary"),
  ai_priority_hint: varchar("ai_priority_hint", { length: 20 }),
  transcript_json: jsonb("transcript_json").default([]),
  admin_notified: boolean("admin_notified").default(false),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at"),
  resolved_at: timestamp("resolved_at"),
  closed_at: timestamp("closed_at"),
}, (table) => ({
  // migrations/0050_perf_indexes.sql: (client_id, status, created_at DESC).
  clientStatusIdx: index("idx_support_tickets_client_status").on(
    table.client_id,
    table.status,
    table.created_at.desc().nullsFirst(),
  ),
}));

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
}, (table) => ({
  // migrations/0050_perf_indexes.sql: (ticket_id, created_at) — ASC.
  ticketCreatedIdx: index("idx_ticket_messages_ticket_created").on(
    table.ticket_id,
    table.created_at,
  ),
}));

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
}, (table) => ({
  // migrations/0050_perf_indexes.sql: (ticket_id, created_at) — ASC.
  ticketCreatedIdx: index("idx_ticket_events_ticket_created").on(
    table.ticket_id,
    table.created_at,
  ),
}));

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
  // Wave 78 — Twilio delivery-status visibility. `status` mirrors the
  // Twilio `MessageStatus` callback values: queued | sending | sent |
  // delivered | undelivered | failed. Nullable until first callback fires.
  // error_code/error_message are populated only on failure paths
  // (Twilio sends them with `undelivered` and `failed`). delivered_at is
  // set once when status === 'delivered'. updated_at tracks the last
  // callback write.
  status: varchar("status", { length: 20 }),
  error_code: integer("error_code"),
  error_message: text("error_message"),
  delivered_at: timestamp("delivered_at", { withTimezone: true }),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  created_at: timestamp("created_at").defaultNow(),
}, (table) => ({
  // migrations/0050_perf_indexes.sql: two separate (col, created_at DESC)
  // indexes — Twilio rate-limit check by calculator_id vs by lead_id.
  calcCreatedIdx: index("idx_sms_messages_calc_created").on(
    table.calculator_id,
    table.created_at.desc().nullsFirst(),
  ),
  leadCreatedIdx: index("idx_sms_messages_lead_created").on(
    table.lead_id,
    table.created_at.desc().nullsFirst(),
  ),
  // Wave 78 — status-callback lookups by Twilio MessageSid.
  twilioSidIdx: index("idx_sms_messages_twilio_sid").on(table.twilio_sid),
}));

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
  // Wave 79 — TCPA audit trail. Populated forward-only by demoLeadRoutes.
  consent_captured_at: timestamp("consent_captured_at"),
  consent_text_version: varchar("consent_text_version", { length: 50 }),
  consent_url: text("consent_url"),
  consent_ip_hash: text("consent_ip_hash"),
  consent_user_agent: text("consent_user_agent"),
  consent_method: varchar("consent_method", { length: 20 }),
  source: varchar("source", { length: 50 }).default("quote_demo"),
  page: varchar("page", { length: 100 }).default("quote-demo"),
  source_tool: varchar("source_tool", { length: 50 }),
  source_page: text("source_page"),
  created_at: timestamp("created_at").defaultNow(),
}, (table) => ({
  // migrations/0069_tcpa_consent_audit_trail.sql — partial index for the
  // reverse "show all consents for phone X" lookup needed to defend a
  // TCPA challenge. WHERE sms_consent = true keeps it lean.
  consentPhoneIdx: index("idx_demo_quote_leads_consent_phone")
    .on(table.phone, table.consent_captured_at.desc().nullsFirst())
    .where(sql`${table.sms_consent} = true`),
}));

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
  /** W-BA-0 — UUID linking every Anthropic call inside one agent loop run. */
  loop_run_id: text("loop_run_id"),
  /** W-BA-0 — 0-based ordinal of the call within its loop run. */
  step_index: integer("step_index"),
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
  // Image references for multimodal user turns from the mobile Ask tab.
  // Shape: Array<{ assetId, mimeType, sizeBytes }>. Null when no images.
  // See migration 0005_assistant_message_attachments.sql.
  attachments: jsonb("attachments"),
  // Soft-delete stamp from the shared-files retention sweep (BA-7,
  // migration 0033). Only attachment-bearing rows are candidates.
  deleted_at: timestamp("deleted_at"),
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

/* ─── BookFlow Settings ──────────────────────────────────────────────
 *
 * Per-client configuration for the BookFlow native booking platform.
 * Each client gets one row with their booking page config, working
 * hours, services offered, and customization options.
 *
 * Public booking page URL: /book/{slug}
 *
 * ─────────────────────────────────────────────────────────────────── */
export const bookflowSettings = pgTable("bookflow_settings", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().unique(),
  is_active: boolean("is_active").default(true),
  business_name: text("business_name"),
  slug: text("slug").unique(),
  timezone: text("timezone").default("America/New_York"),
  slot_duration_minutes: integer("slot_duration_minutes").default(60),
  buffer_minutes: integer("buffer_minutes").default(15),
  working_hours: jsonb("working_hours"), // { monday: { enabled: true, start: "08:00", end: "17:00" }, ... }
  services: jsonb("services"), // [{ id, name, duration_minutes, price_cents, description }]
  confirmation_message: text("confirmation_message"),
  auto_confirm: boolean("auto_confirm").default(true),
  accent_color: text("accent_color").default("#3B82F6"),
  invoicing_enabled: boolean("invoicing_enabled").default(true),
  dispatch_enabled: boolean("dispatch_enabled").default(true),
  payment_methods: jsonb("payment_methods"),
  // { stripe: true, paypal_email?: string, bank_details?: string, etransfer_email?: string, venmo_handle?: string, zelle_info?: string, cash_accepted?: boolean }
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const insertBookflowSettingsSchema = createInsertSchema(bookflowSettings).omit({
  id: true, created_at: true, updated_at: true,
});
export type InsertBookflowSettings = z.infer<typeof insertBookflowSettingsSchema>;
export type BookflowSettings = typeof bookflowSettings.$inferSelect;

/* ─── BookFlow Appointments ──────────────────────────────────────────
 *
 * Individual bookings created through BookFlow. These are the "native"
 * appointments stored directly in our DB — no external calendar dependency.
 *
 * source tracks where the booking originated:
 *   direct       — public /book/:slug page
 *   quotequick   — QuoteQuick widget booking flow
 *   tradeline_chat — TradeLine chat assistant
 *   tradeline_voice — TradeLine voice assistant
 *   whatsapp     — WhatsApp channel
 *   sms          — SMS channel
 *
 * ─────────────────────────────────────────────────────────────────── */
export const bookflowAppointments = pgTable("bookflow_appointments", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull(),
  customer_name: text("customer_name").notNull(),
  customer_email: text("customer_email"),
  customer_phone: text("customer_phone"),
  customer_address: text("customer_address"),
  service_name: text("service_name"),
  service_duration_minutes: integer("service_duration_minutes"),
  start_time: timestamp("start_time").notNull(),
  end_time: timestamp("end_time").notNull(),
  status: text("status").notNull().default("confirmed"),
  // "confirmed" | "pending" | "cancelled" | "completed" | "no_show"
  notes: text("notes"),
  source: text("source").default("direct"),
  // "direct" | "quotequick" | "tradeline_chat" | "tradeline_voice" | "whatsapp" | "sms"
  cancellation_reason: text("cancellation_reason"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // migrations/0050_perf_indexes.sql: (client_id, start_time) — ASC.
  clientStartIdx: index("idx_bookflow_appointments_client_start").on(
    table.client_id,
    table.start_time,
  ),
}));

export const insertBookflowAppointmentSchema = createInsertSchema(bookflowAppointments).omit({
  id: true, created_at: true, updated_at: true,
});
export type InsertBookflowAppointment = z.infer<typeof insertBookflowAppointmentSchema>;
export type BookflowAppointment = typeof bookflowAppointments.$inferSelect;

/* ─── BookFlow Invoices ──────────────────────────────────────────────
 *
 * Simple invoices that tradespeople send to their customers.
 * Supports Stripe Checkout for online payment via pay links.
 *
 * invoice_number is auto-generated per client: INV-001, INV-002, etc.
 * pay_link_token is a unique token for the public /pay/:token page.
 *
 * ─────────────────────────────────────────────────────────────────── */
export const bookflowInvoices = pgTable(
  "bookflow_invoices",
  {
    id: serial("id").primaryKey(),
    client_id: integer("client_id").notNull(),
    appointment_id: integer("appointment_id"),
    customer_name: text("customer_name").notNull(),
    customer_email: text("customer_email"),
    customer_phone: text("customer_phone"),
    line_items: jsonb("line_items").notNull(), // [{ description, quantity, unit_price_cents }]
    subtotal_cents: integer("subtotal_cents").notNull(),
    tax_cents: integer("tax_cents").default(0),
    total_cents: integer("total_cents").notNull(),
    status: text("status").default("draft"),
    // "draft" | "sent" | "viewed" | "paid" | "overdue" | "cancelled"
    due_date: timestamp("due_date"),
    paid_at: timestamp("paid_at"),
    payment_method: text("payment_method"),
    // "stripe" | "cash" | "check" | "other"
    stripe_payment_intent_id: text("stripe_payment_intent_id"),
    invoice_number: text("invoice_number"),
    notes: text("notes"),
    pay_link_token: text("pay_link_token").unique(),
    metadata: jsonb("metadata"),
    // 0042 — invoice template + currency (label-only) + issue_date + linked contact.
    currency: text("currency").notNull().default("USD"),
    // Migration declares this as DATE (not TIMESTAMP). Using `date()` column
    // type is required so drizzle-kit push doesn't propose ALTER COLUMN TYPE.
    issue_date: date("issue_date"),
    template_slug: text("template_slug"),
    // contact_id is a UUID FK to contacts(id). Migration creates as UUID with
    // REFERENCES contacts(id) ON DELETE SET NULL. Using `uuid()` to match the
    // physical column type so drizzle-kit push doesn't propose to alter it.
    contact_id: uuid("contact_id"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    // Must match migrations/0042_invoice_templates_and_contacts_billing.sql:
    //   CREATE INDEX bookflow_invoices_contact_idx ON bookflow_invoices(contact_id).
    contactIdx: index("bookflow_invoices_contact_idx").on(t.contact_id),
    // migrations/0050_perf_indexes.sql: (client_id, created_at DESC).
    clientCreatedIdx: index("idx_bookflow_invoices_client_created").on(
      t.client_id,
      t.created_at.desc().nullsFirst(),
    ),
  }),
);

export const insertBookflowInvoiceSchema = createInsertSchema(bookflowInvoices).omit({
  id: true, created_at: true, updated_at: true,
});
export type InsertBookflowInvoice = z.infer<typeof insertBookflowInvoiceSchema>;
export type BookflowInvoice = typeof bookflowInvoices.$inferSelect;

/* ─── Invoice Templates (0042) ──────────────────────────────────────────
 *
 * Holds builtin (client_id IS NULL) + per-client custom invoice templates.
 * Phase A ships 3 builtins seeded by the migration:
 *   classic-minimal | modern-bold | trade-service
 *
 * Phase B adds 7 more builtins plus the "Save as template" flow that
 * inserts client_id IS NOT NULL rows when a tradesperson promotes one of
 * their invoices into a reusable template.
 *
 * layout_config is data-driven: { accent, headerStyle, tableStyle, ... }.
 * Renderers consume the object so adding a Phase-B builtin is mostly JSON,
 * not new TSX files.
 * ─────────────────────────────────────────────────────────────────── */
export const invoiceTemplates = pgTable(
  "invoice_templates",
  {
    // Migration creates the column as UUID DEFAULT gen_random_uuid() — match
    // that exactly so drizzle-kit push doesn't propose ALTER COLUMN TYPE.
    id: uuid("id").primaryKey().defaultRandom(),
    // NULL for builtins (shared across all clients); NOT NULL for custom rows
    // owned by one client.
    client_id: integer("client_id"),
    // "builtin" | "custom"
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    layout_config: jsonb("layout_config").notNull().default({}),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Names + shape must match migrations/0042_invoice_templates_and_contacts_billing.sql.
    clientIdx: index("invoice_templates_client_idx").on(t.client_id),
    // Slug is globally unique for builtins only — partial unique index.
    builtinSlugIdx: uniqueIndex("invoice_templates_builtin_slug_idx")
      .on(t.slug)
      .where(sql`${t.client_id} IS NULL`),
  }),
);
export type InvoiceTemplate = typeof invoiceTemplates.$inferSelect;
export const insertInvoiceTemplateSchema = createInsertSchema(invoiceTemplates).omit({
  id: true, created_at: true, updated_at: true,
});
export type InsertInvoiceTemplate = z.infer<typeof insertInvoiceTemplateSchema>;

/* ─── System Alerts ─── */
export const systemAlerts = pgTable("system_alerts", {
  id: serial("id").primaryKey(),
  severity: text("severity").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  details: text("details"),
  acknowledged: boolean("acknowledged").default(false),
  acknowledged_by: integer("acknowledged_by"),
  acknowledged_at: timestamp("acknowledged_at"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
});
export const insertSystemAlertSchema = createInsertSchema(systemAlerts).omit({ id: true, created_at: true });
export type InsertSystemAlert = z.infer<typeof insertSystemAlertSchema>;
export type SystemAlert = typeof systemAlerts.$inferSelect;

/* ─── Alert Actions Log (Wave 12D — Admin AI Diagnosis Panel) ───
 *
 * Every "Run fix" button press from the System Alerts page is recorded here
 * for audit purposes. Action names come from a server-side whitelist
 * (see server/services/alertFixActions.ts); the AI Copilot can SUGGEST
 * fixes but the admin operator clicks the button explicitly — no LLM-
 * driven writes in Phase 1.
 */
export const alertActionsLog = pgTable("alert_actions_log", {
  id: serial("id").primaryKey(),
  alert_id: integer("alert_id").notNull(),
  admin_user_id: integer("admin_user_id"),
  action: text("action").notNull(),
  params: jsonb("params"),
  result: jsonb("result"),
  success: boolean("success").notNull().default(false),
  error_message: text("error_message"),
  executed_at: timestamp("executed_at").defaultNow(),
}, (t) => ({
  // Names must match migrations/0062_alert_actions_log.sql so drizzle-kit
  // push doesn't propose to DROP them on the next deploy.
  alertIdIdx: index("idx_alert_actions_log_alert_id").on(t.alert_id),
  executedAtIdx: index("idx_alert_actions_log_executed_at").on(t.executed_at),
}));
export const insertAlertActionLogSchema = createInsertSchema(alertActionsLog).omit({ id: true, executed_at: true });
export type InsertAlertActionLog = z.infer<typeof insertAlertActionLogSchema>;
export type AlertActionLog = typeof alertActionsLog.$inferSelect;

/* ─── Email Queue ─── */
export const emailQueue = pgTable("email_queue", {
  id: serial("id").primaryKey(),
  to_email: text("to_email").notNull(),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  text_body: text("text_body"),
  status: text("status").default("pending"),
  attempts: integer("attempts").default(0),
  max_attempts: integer("max_attempts").default(3),
  last_error: text("last_error"),
  sent_at: timestamp("sent_at"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
});
export const insertEmailQueueSchema = createInsertSchema(emailQueue).omit({ id: true, created_at: true });
export type InsertEmailQueue = z.infer<typeof insertEmailQueueSchema>;
export type EmailQueueItem = typeof emailQueue.$inferSelect;

/* ─── AI Channel Settings (global kill switches, Phase 3a) ─── */
// Singleton config row (id = 1). Each boolean gates whether the AI responds
// on that customer-facing channel; the founder toggles them from the admin
// Settings page. All default ON.
export const aiChannelSettings = pgTable("ai_channel_settings", {
  id: integer("id").primaryKey(),
  chat_enabled: boolean("chat_enabled").notNull().default(true),
  email_enabled: boolean("email_enabled").notNull().default(true),
  sms_enabled: boolean("sms_enabled").notNull().default(true),
  voice_enabled: boolean("voice_enabled").notNull().default(true),
  // Phase 3b-iii: founder-set monthly AI budget per client (cents). Feeds the
  // budget dial — a model-selection control, never an off-switch. $5 default.
  default_ai_budget_cents: integer("default_ai_budget_cents").notNull().default(500),
  updated_at: timestamp("updated_at").defaultNow(),
  updated_by: integer("updated_by"),
});
export type AiChannelSettings = typeof aiChannelSettings.$inferSelect;

/* ─── AI Channel Gates (per-channel runtime kill switches, W-BA-1) ─── */
// One row per customer-facing channel ('email' | 'sms' | 'voice' | 'chat').
// This is the runtime emergency safety net — distinct from the older
// aiChannelSettings governance config. Default OFF: the founder explicitly
// enables each channel when AI autonomy is ready. Channel handlers must
// check aiChannelGateOn(channel) BEFORE invoking AI. See migration 0030.
export const aiChannelGates = pgTable("ai_channel_gates", {
  channel: text("channel").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  emergency_disabled_by: integer("emergency_disabled_by"),
  emergency_disabled_at: timestamp("emergency_disabled_at"),
  notes: text("notes"),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
  updated_by: integer("updated_by"),
  created_at: timestamp("created_at").notNull().defaultNow(),
});
export type AiChannelGate = typeof aiChannelGates.$inferSelect;

/* ─── Admin Notices — the founder's AI agenda (Phase 3e-ii) ─── */
// A durable record of every AI escalation to the founder. Always written;
// the founder's users.ai_contact_method decides whether an SMS / WhatsApp
// ping also fires. Read from the admin dashboard agenda view.
export const adminNotices = pgTable("admin_notices", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 40 }).notNull(),
  // e.g. inbound_email_uncertain
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  entity_type: varchar("entity_type", { length: 40 }),  // support_ticket | client | …
  entity_id: integer("entity_id"),
  status: varchar("status", { length: 20 }).notNull().default("unread"),
  // unread | read | actioned
  created_at: timestamp("created_at").defaultNow(),
  read_at: timestamp("read_at"),
});
export const insertAdminNoticeSchema = createInsertSchema(adminNotices).omit({ id: true, created_at: true });
export type InsertAdminNotice = z.infer<typeof insertAdminNoticeSchema>;
export type AdminNotice = typeof adminNotices.$inferSelect;

/* ─── Vapi Webhook Events (diagnostic log) ─── */
export const vapiWebhookEvents = pgTable("vapi_webhook_events", {
  id: serial("id").primaryKey(),
  event_type: text("event_type").notNull(),
  call_id: text("call_id"),
  client_service_id: integer("client_service_id"),
  payload_summary: text("payload_summary"),
  status: text("status").default("processed"),
  error: text("error"),
  created_at: timestamp("created_at").defaultNow(),
});
export const insertVapiWebhookEventSchema = createInsertSchema(vapiWebhookEvents).omit({ id: true, created_at: true });
export type InsertVapiWebhookEvent = z.infer<typeof insertVapiWebhookEventSchema>;
export type VapiWebhookEventRow = typeof vapiWebhookEvents.$inferSelect;

/* ─── Quote Snapshots (Wave R3 — shareable quote URLs) ─── */
//
// One row per saved quote. Created from PriceRevealStep when the customer
// (or contractor) clicks "Save + share". Reachable at /q/:snapshot_slug.
// The owner_edit_token is the contractor's proof-of-ownership for PATCH /
// DELETE; it's stored in localStorage on the creating device only and is
// NEVER returned by the public GET endpoint.
export const quoteSnapshots = pgTable("quote_snapshots", {
  id: serial("id").primaryKey(),
  snapshot_slug: varchar("snapshot_slug", { length: 16 }).notNull().unique(),
  calculator_id: integer("calculator_id").notNull().references(() => calculators.id),
  lead_id: integer("lead_id").references(() => leads.id),
  owner_edit_token: varchar("owner_edit_token", { length: 64 }),
  inputs: jsonb("inputs").notNull(),
  computed: jsonb("computed").notNull(),
  customer_name: text("customer_name"),
  customer_email: text("customer_email"),
  view_count: integer("view_count").notNull().default(0),
  created_at: timestamp("created_at").defaultNow(),
  last_viewed_at: timestamp("last_viewed_at"),
  last_edited_at: timestamp("last_edited_at"),
  expires_at: timestamp("expires_at"),
});

export const insertQuoteSnapshotSchema = createInsertSchema(quoteSnapshots).omit({
  id: true,
  created_at: true,
  last_viewed_at: true,
  last_edited_at: true,
  view_count: true,
});
export type InsertQuoteSnapshot = z.infer<typeof insertQuoteSnapshotSchema>;
export type QuoteSnapshot = typeof quoteSnapshots.$inferSelect;

/* ─── AI System Gates (W-AX-1) ───
 * System-scoped equivalent of contentflow_settings — one row per AI surface
 * across the whole product, each with its own kill switch + monthly budget
 * cap. The aiSystemGate.ts service reads from this table on every gated AI
 * call. See aiSurfaces.ts for the registry of valid surface names. */
export const aiSystemGates = pgTable("ai_system_gates", {
  surface: varchar("surface", { length: 40 }).primaryKey(),
  kill_switch_on: boolean("kill_switch_on").notNull().default(false),
  monthly_budget_cents: integer("monthly_budget_cents"),
  monthly_spent_cents: integer("monthly_spent_cents").notNull().default(0),
  monthly_reset_at: timestamp("monthly_reset_at").defaultNow(),
  alert_threshold_pct: integer("alert_threshold_pct").notNull().default(80),
  alerts_sent: jsonb("alerts_sent").notNull().default([]),
  updated_at: timestamp("updated_at").defaultNow(),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertAiSystemGateSchema = createInsertSchema(aiSystemGates).omit({
  created_at: true,
  updated_at: true,
});
export type InsertAiSystemGate = z.infer<typeof insertAiSystemGateSchema>;
export type AiSystemGate = typeof aiSystemGates.$inferSelect;
