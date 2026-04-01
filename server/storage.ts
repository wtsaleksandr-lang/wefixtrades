import { db } from "./db";
import {
  calculators, leads, analyticsEvents, deploymentStatus,
  calculatorAnalyticsSummary, jobLogs,
  notificationQueue, followupJobs, bookings,
  aiConversations, supportTickets, smsMessages,
  users, auditSubmissions,
  type Calculator, type InsertCalculator,
  type Lead, type InsertLead,
  type AnalyticsEvent, type InsertAnalyticsEvent,
  type DeploymentStatus, type InsertDeploymentStatus,
  type AnalyticsSummary, type InsertAnalyticsSummary,
  type JobLog, type InsertJobLog,
  type NotificationQueue, type InsertNotificationQueue,
  type FollowupJob, type InsertFollowupJob,
  type Booking, type InsertBooking,
  type AiConversation, type InsertAiConversation,
  type SupportTicket, type InsertSupportTicket,
  type SmsMessage,
  type User, type InsertUser,
  type AuditSubmission, type InsertAuditSubmission,
  // Admin CRM
  clients, clientServices, serviceCatalog, orders, orderItems,
  suppliers, fulfillmentTasks, onboardingSubmissions, onboardingTemplates,
  clientPayments, internalNotes, adminActivityLog,
  serviceTaskTemplates,
  type Client, type InsertClient,
  type ClientService, type InsertClientService,
  type ServiceCatalogRow, type InsertServiceCatalog,
  type Order, type InsertOrder,
  type OrderItem, type InsertOrderItem,
  type Supplier, type InsertSupplier,
  type FulfillmentTask, type InsertFulfillmentTask,
  type OnboardingSubmission, type InsertOnboardingSubmission,
  type ClientPayment, type InsertClientPayment,
  type InternalNote, type InsertInternalNote,
  type AdminActivityLog, type InsertAdminActivityLog,
  type ServiceTaskTemplate,
  type OnboardingTemplate,
} from "@shared/schema";
import { eq, desc, sql, and, gte, lte, ilike, or, isNotNull, count } from "drizzle-orm";

export interface IStorage {
  createCalculator(data: InsertCalculator): Promise<Calculator>;
  getCalculatorById(id: number): Promise<Calculator | undefined>;
  getCalculatorBySlug(slug: string): Promise<Calculator | undefined>;
  getCalculatorByToken(token: string): Promise<Calculator | undefined>;
  updateCalculator(id: number, updates: Partial<InsertCalculator>): Promise<Calculator | undefined>;
  duplicateCalculator(id: number, newSlug: string, newToken: string, newExpiry: Date): Promise<Calculator | undefined>;
  deleteCalculator(id: number): Promise<void>;
  incrementViews(id: number): Promise<void>;

  createLead(data: InsertLead): Promise<Lead>;
  getLeadsByCalculatorId(calculatorId: number): Promise<Lead[]>;
  searchLeads(calculatorId: number, query: string): Promise<Lead[]>;
  deleteLead(id: number, calculatorId: number): Promise<void>;
  getLeadCountSince(calculatorId: number, since: Date): Promise<number>;

  trackEvent(data: InsertAnalyticsEvent): Promise<AnalyticsEvent>;
  getEventCounts(calculatorId: number, since: Date): Promise<{ views: number; leads: number; quotes: number }>;
  getWeeklyTrend(calculatorId: number): Promise<{ week: string; views: number; leads: number }[]>;
  getAvgQuoteAmount(calculatorId: number): Promise<number>;

  getDeploymentStatus(calculatorId: number): Promise<DeploymentStatus | undefined>;
  upsertDeploymentStatus(data: InsertDeploymentStatus): Promise<DeploymentStatus>;

  getAllCalculatorsWithEmail(): Promise<Calculator[]>;
  upsertAnalyticsSummary(data: InsertAnalyticsSummary): Promise<AnalyticsSummary>;
  getAnalyticsSummary(calculatorId: number): Promise<AnalyticsSummary | undefined>;
  getDailyEventCounts(calculatorId: number, date: Date): Promise<{ views: number; leads: number; quotes: number }>;
  getBestDay(calculatorId: number, since: Date): Promise<string | null>;

  createJobLog(data: InsertJobLog): Promise<JobLog>;
  updateJobLog(id: number, updates: Partial<InsertJobLog>): Promise<void>;

  getLeadById(id: number): Promise<Lead | undefined>;
  updateLeadStatus(id: number, status: string): Promise<Lead | undefined>;

  enqueueNotification(data: InsertNotificationQueue): Promise<NotificationQueue>;
  fetchDueNotifications(limit?: number): Promise<NotificationQueue[]>;
  updateNotification(id: number, updates: Record<string, any>): Promise<void>;
  getNotificationLogs(calculatorId: number, limit?: number): Promise<NotificationQueue[]>;
  getRecentNotificationCount(calculatorId: number, windowMinutes: number): Promise<number>;

  enqueueFollowupJobs(data: InsertFollowupJob[]): Promise<FollowupJob[]>;
  fetchDueFollowups(limit?: number): Promise<FollowupJob[]>;
  updateFollowupJob(id: number, updates: Record<string, any>): Promise<void>;
  getFollowupLogs(calculatorId: number, limit?: number): Promise<FollowupJob[]>;
  cancelFollowupsForLead(leadId: number): Promise<void>;

  createBooking(data: InsertBooking): Promise<Booking>;
  getBookingsByCalculatorId(calculatorId: number): Promise<Booking[]>;
  getBookingById(id: number): Promise<Booking | undefined>;
  updateBookingStatus(id: number, status: string): Promise<Booking | undefined>;
  updateBooking(id: number, updates: Partial<InsertBooking>): Promise<Booking | undefined>;
  getConfirmedBookingsForDate(calculatorId: number, date: string): Promise<Booking[]>;
  getBookingStats(calculatorId: number): Promise<{ bookings_total: number; bookings_confirmed: number; payments_completed: number }>;

  incrementCouponUsage(calculatorId: number, couponCode: string): Promise<void>;

  createAiConversation(data: InsertAiConversation): Promise<AiConversation>;
  updateAiConversation(id: number, updates: Partial<InsertAiConversation>): Promise<void>;
  getAiConversationBySession(sessionId: string): Promise<AiConversation | undefined>;

  createSupportTicket(data: Partial<InsertSupportTicket> & { description: string }): Promise<SupportTicket>;
  updateSupportTicket(id: number, updates: Record<string, any>): Promise<void>;

  getSmsThreads(calculatorId: number): Promise<{ lead: Lead; messages: SmsMessage[] }[]>;
  updateLeadAiPaused(leadId: number, calculatorId: number, paused: boolean): Promise<void>;

  createUser(data: InsertUser): Promise<User>;
  getUserById(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  updateUser(id: number, updates: Partial<Pick<InsertUser, 'name' | 'role'>>): Promise<User | undefined>;
  listUsers(limit?: number, offset?: number): Promise<User[]>;
  getUserCount(): Promise<number>;
  getCalculatorsByUserId(userId: number): Promise<Calculator[]>;

  createAuditSubmission(data: InsertAuditSubmission): Promise<AuditSubmission>;
  listAuditSubmissions(limit?: number, offset?: number): Promise<AuditSubmission[]>;
  getAuditSubmissionCount(): Promise<number>;

  // ─── Admin CRM ───
  // Clients
  listClients(opts?: { search?: string; status?: string; limit?: number; offset?: number }): Promise<Client[]>;
  getClientById(id: number): Promise<Client | undefined>;
  createClient(data: InsertClient): Promise<Client>;
  updateClient(id: number, updates: Partial<InsertClient>): Promise<Client | undefined>;
  getClientCount(status?: string): Promise<number>;

  // Service catalog
  listServiceCatalog(): Promise<ServiceCatalogRow[]>;
  upsertServiceCatalog(data: InsertServiceCatalog): Promise<ServiceCatalogRow>;

  // Client services
  listClientServices(clientId: number): Promise<(ClientService & { service_name?: string })[]>;
  createClientService(data: InsertClientService): Promise<ClientService>;
  updateClientService(id: number, updates: Partial<InsertClientService>): Promise<ClientService | undefined>;
  getActiveServiceCount(): Promise<number>;

  // Orders
  listOrders(clientId?: number, limit?: number, offset?: number): Promise<Order[]>;
  createOrder(data: InsertOrder): Promise<Order>;
  createOrderItem(data: InsertOrderItem): Promise<OrderItem>;

  // Suppliers
  listSuppliers(): Promise<Supplier[]>;
  createSupplier(data: InsertSupplier): Promise<Supplier>;
  updateSupplier(id: number, updates: Partial<InsertSupplier>): Promise<Supplier | undefined>;

  // Fulfillment
  listFulfillmentTasks(opts?: { clientId?: number; status?: string; limit?: number; offset?: number }): Promise<(FulfillmentTask & { client_name?: string; supplier_name?: string })[]>;
  createFulfillmentTask(data: InsertFulfillmentTask): Promise<FulfillmentTask>;
  updateFulfillmentTask(id: number, updates: Partial<InsertFulfillmentTask>): Promise<FulfillmentTask | undefined>;
  getOpenFulfillmentCount(): Promise<number>;

  // Onboarding
  listOnboardingSubmissions(clientId: number): Promise<OnboardingSubmission[]>;
  createOnboardingSubmission(data: InsertOnboardingSubmission): Promise<OnboardingSubmission>;
  updateOnboardingSubmission(id: number, updates: Partial<InsertOnboardingSubmission>): Promise<OnboardingSubmission | undefined>;
  getPendingOnboardingCount(): Promise<number>;

  // Payments
  listClientPayments(clientId: number): Promise<ClientPayment[]>;
  createClientPayment(data: InsertClientPayment): Promise<ClientPayment>;
  updateClientPayment(id: number, updates: Partial<InsertClientPayment>): Promise<ClientPayment | undefined>;
  getUnpaidTotal(): Promise<number>;
  getMonthlyRevenue(): Promise<number>;

  // Notes
  listInternalNotes(clientId: number): Promise<InternalNote[]>;
  createInternalNote(data: InsertInternalNote): Promise<InternalNote>;

  // Activity log
  logAdminActivity(data: InsertAdminActivityLog): Promise<AdminActivityLog>;
  listAdminActivity(opts?: { entityType?: string; entityId?: number; limit?: number }): Promise<AdminActivityLog[]>;

  // CRM Overview
  getCrmOverview(): Promise<{
    totalClients: number;
    activeServices: number;
    pendingOnboarding: number;
    openFulfillment: number;
    unpaidAmount: number;
    monthlyRevenue: number;
    recentClients: { id: number; business_name: string; status: string; created_at: Date | null }[];
    recentTasks: { id: number; title: string; status: string; priority: string; client_id: number; client_name: string | null; due_at: Date | null }[];
  }>;
}

export class DatabaseStorage implements IStorage {
  async createCalculator(data: InsertCalculator): Promise<Calculator> {
    const [calc] = await db.insert(calculators).values(data).returning();
    return calc;
  }

  async getCalculatorBySlug(slug: string): Promise<Calculator | undefined> {
    const [calc] = await db.select().from(calculators).where(eq(calculators.slug, slug)).limit(1);
    return calc;
  }

  async getCalculatorByToken(token: string): Promise<Calculator | undefined> {
    const [calc] = await db.select().from(calculators).where(eq(calculators.edit_token, token)).limit(1);
    return calc;
  }

  async updateCalculator(id: number, updates: Partial<InsertCalculator>): Promise<Calculator | undefined> {
    const [calc] = await db.update(calculators).set(updates).where(eq(calculators.id, id)).returning();
    return calc;
  }

  async duplicateCalculator(id: number, newSlug: string, newToken: string, newExpiry: Date): Promise<Calculator | undefined> {
    const original = await this.getCalculatorById(id);
    if (!original) return undefined;

    await db.update(calculators).set({ is_duplicated: true }).where(eq(calculators.id, id));

    const [newCalc] = await db.insert(calculators).values({
      slug: newSlug,
      business_name: original.business_name,
      trade_type: original.trade_type,
      tagline: original.tagline,
      logo_url: original.logo_url,
      owner_email: original.owner_email,
      owner_phone: original.owner_phone,
      website_url: original.website_url,
      primary_color: original.primary_color,
      cta_button_text: original.cta_button_text,
      lead_thank_you_message: original.lead_thank_you_message,
      pricing_config: original.pricing_config,
      theme_overrides: original.theme_overrides,
      calculator_settings: original.calculator_settings,
      edit_token: newToken,
      token_expires_at: newExpiry,
      is_duplicated: false,
      total_views: 0,
      show_powered_by_badge: original.show_powered_by_badge,
    }).returning();
    return newCalc;
  }

  async deleteCalculator(id: number): Promise<void> {
    await db.delete(analyticsEvents).where(eq(analyticsEvents.calculator_id, id));
    await db.delete(deploymentStatus).where(eq(deploymentStatus.calculator_id, id));
    await db.delete(leads).where(eq(leads.calculator_id, id));
    await db.delete(calculators).where(eq(calculators.id, id));
  }

  async incrementViews(id: number): Promise<void> {
    await db.update(calculators).set({ total_views: sql`${calculators.total_views} + 1` }).where(eq(calculators.id, id));
  }

  async createLead(data: InsertLead): Promise<Lead> {
    const [lead] = await db.insert(leads).values(data).returning();
    return lead;
  }

  async getLeadsByCalculatorId(calculatorId: number): Promise<Lead[]> {
    return db.select().from(leads).where(eq(leads.calculator_id, calculatorId)).orderBy(desc(leads.created_date));
  }

  async searchLeads(calculatorId: number, query: string): Promise<Lead[]> {
    const pattern = `%${query}%`;
    return db.select().from(leads).where(
      and(
        eq(leads.calculator_id, calculatorId),
        or(
          ilike(leads.name, pattern),
          ilike(leads.email, pattern),
          ilike(leads.phone, pattern),
        )
      )
    ).orderBy(desc(leads.created_date));
  }

  async deleteLead(id: number, calculatorId: number): Promise<void> {
    await db.delete(leads).where(and(eq(leads.id, id), eq(leads.calculator_id, calculatorId)));
  }

  async getLeadCountSince(calculatorId: number, since: Date): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(eq(leads.calculator_id, calculatorId), gte(leads.created_date, since)));
    return result?.count || 0;
  }

  async trackEvent(data: InsertAnalyticsEvent): Promise<AnalyticsEvent> {
    const [event] = await db.insert(analyticsEvents).values(data).returning();
    return event;
  }

  async getEventCounts(calculatorId: number, since: Date): Promise<{ views: number; leads: number; quotes: number }> {
    const rows = await db.select({
      event_type: analyticsEvents.event_type,
      count: sql<number>`count(*)::int`,
    })
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.calculator_id, calculatorId), gte(analyticsEvents.created_at, since)))
      .groupBy(analyticsEvents.event_type);

    const counts = { views: 0, leads: 0, quotes: 0 };
    for (const r of rows) {
      if (r.event_type === 'view') counts.views = r.count;
      else if (r.event_type === 'lead') counts.leads = r.count;
      else if (r.event_type === 'quote_generated') counts.quotes = r.count;
    }
    return counts;
  }

  async getWeeklyTrend(calculatorId: number): Promise<{ week: string; views: number; leads: number }[]> {
    const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000);
    const rows = await db.select({
      week: sql<string>`to_char(date_trunc('week', ${analyticsEvents.created_at}), 'YYYY-MM-DD')`,
      event_type: analyticsEvents.event_type,
      count: sql<number>`count(*)::int`,
    })
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.calculator_id, calculatorId), gte(analyticsEvents.created_at, eightWeeksAgo)))
      .groupBy(sql`date_trunc('week', ${analyticsEvents.created_at})`, analyticsEvents.event_type)
      .orderBy(sql`date_trunc('week', ${analyticsEvents.created_at})`);

    const weekMap = new Map<string, { views: number; leads: number }>();
    for (const r of rows) {
      const existing = weekMap.get(r.week) || { views: 0, leads: 0 };
      if (r.event_type === 'view') existing.views = r.count;
      else if (r.event_type === 'lead') existing.leads = r.count;
      weekMap.set(r.week, existing);
    }
    return Array.from(weekMap.entries()).map(([week, data]) => ({ week, ...data }));
  }

  async getAvgQuoteAmount(calculatorId: number): Promise<number> {
    const [result] = await db.select({ avg: sql<number>`coalesce(avg(${leads.quote_amount}), 0)::int` })
      .from(leads)
      .where(and(eq(leads.calculator_id, calculatorId), sql`${leads.quote_amount} is not null`));
    return result?.avg || 0;
  }

  async getDeploymentStatus(calculatorId: number): Promise<DeploymentStatus | undefined> {
    const [ds] = await db.select().from(deploymentStatus).where(eq(deploymentStatus.calculator_id, calculatorId)).limit(1);
    return ds;
  }

  async upsertDeploymentStatus(data: InsertDeploymentStatus): Promise<DeploymentStatus> {
    const existing = await this.getDeploymentStatus(data.calculator_id);
    if (existing) {
      const [updated] = await db.update(deploymentStatus)
        .set({ ...data, updated_at: new Date() })
        .where(eq(deploymentStatus.calculator_id, data.calculator_id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(deploymentStatus).values(data).returning();
    return created;
  }

  async getAllCalculatorsWithEmail(): Promise<Calculator[]> {
    return db.select().from(calculators).where(isNotNull(calculators.owner_email));
  }

  async upsertAnalyticsSummary(data: InsertAnalyticsSummary): Promise<AnalyticsSummary> {
    const existing = await this.getAnalyticsSummary(data.calculator_id);
    if (existing) {
      const [updated] = await db.update(calculatorAnalyticsSummary)
        .set({ ...data })
        .where(eq(calculatorAnalyticsSummary.calculator_id, data.calculator_id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(calculatorAnalyticsSummary).values(data).returning();
    return created;
  }

  async getAnalyticsSummary(calculatorId: number): Promise<AnalyticsSummary | undefined> {
    const [summary] = await db.select().from(calculatorAnalyticsSummary)
      .where(eq(calculatorAnalyticsSummary.calculator_id, calculatorId))
      .orderBy(desc(calculatorAnalyticsSummary.period_date))
      .limit(1);
    return summary;
  }

  async getDailyEventCounts(calculatorId: number, date: Date): Promise<{ views: number; leads: number; quotes: number }> {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const rows = await db.select({
      event_type: analyticsEvents.event_type,
      count: sql<number>`count(*)::int`,
    })
      .from(analyticsEvents)
      .where(and(
        eq(analyticsEvents.calculator_id, calculatorId),
        gte(analyticsEvents.created_at, dayStart),
        sql`${analyticsEvents.created_at} <= ${dayEnd}`,
      ))
      .groupBy(analyticsEvents.event_type);

    const counts = { views: 0, leads: 0, quotes: 0 };
    for (const r of rows) {
      if (r.event_type === 'view') counts.views = r.count;
      else if (r.event_type === 'lead') counts.leads = r.count;
      else if (r.event_type === 'quote_generated') counts.quotes = r.count;
    }
    return counts;
  }

  async getBestDay(calculatorId: number, since: Date): Promise<string | null> {
    const rows = await db.select({
      day: sql<string>`to_char(${analyticsEvents.created_at}::date, 'Day')`,
      count: sql<number>`count(*)::int`,
    })
      .from(analyticsEvents)
      .where(and(
        eq(analyticsEvents.calculator_id, calculatorId),
        gte(analyticsEvents.created_at, since),
        eq(analyticsEvents.event_type, 'lead'),
      ))
      .groupBy(sql`${analyticsEvents.created_at}::date, to_char(${analyticsEvents.created_at}::date, 'Day')`)
      .orderBy(sql`count(*) desc`)
      .limit(1);

    return rows.length > 0 ? rows[0].day.trim() : null;
  }

  async createJobLog(data: InsertJobLog): Promise<JobLog> {
    const [log] = await db.insert(jobLogs).values(data).returning();
    return log;
  }

  async updateJobLog(id: number, updates: Partial<InsertJobLog>): Promise<void> {
    await db.update(jobLogs).set(updates).where(eq(jobLogs.id, id));
  }

  async getLeadById(id: number): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
    return lead;
  }

  async updateLeadStatus(id: number, status: string): Promise<Lead | undefined> {
    const [lead] = await db.update(leads).set({ status }).where(eq(leads.id, id)).returning();
    return lead;
  }

  async enqueueNotification(data: InsertNotificationQueue): Promise<NotificationQueue> {
    const [notif] = await db.insert(notificationQueue).values(data).returning();
    return notif;
  }

  async fetchDueNotifications(limit = 20): Promise<NotificationQueue[]> {
    return db.select().from(notificationQueue)
      .where(and(
        eq(notificationQueue.status, 'pending'),
        sql`${notificationQueue.attempts} < ${notificationQueue.max_attempts}`,
      ))
      .orderBy(notificationQueue.created_at)
      .limit(limit);
  }

  async updateNotification(id: number, updates: Record<string, any>): Promise<void> {
    await db.update(notificationQueue).set(updates).where(eq(notificationQueue.id, id));
  }

  async getNotificationLogs(calculatorId: number, limit = 50): Promise<NotificationQueue[]> {
    return db.select().from(notificationQueue)
      .where(eq(notificationQueue.calculator_id, calculatorId))
      .orderBy(desc(notificationQueue.created_at))
      .limit(limit);
  }

  async getRecentNotificationCount(calculatorId: number, windowMinutes: number): Promise<number> {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(notificationQueue)
      .where(and(
        eq(notificationQueue.calculator_id, calculatorId),
        gte(notificationQueue.created_at, since),
      ));
    return result?.count || 0;
  }

  async enqueueFollowupJobs(data: InsertFollowupJob[]): Promise<FollowupJob[]> {
    if (data.length === 0) return [];
    return db.insert(followupJobs).values(data).returning();
  }

  async fetchDueFollowups(limit = 20): Promise<FollowupJob[]> {
    const now = new Date();
    return db.select().from(followupJobs)
      .where(and(
        eq(followupJobs.status, 'pending'),
        lte(followupJobs.run_at, now),
        sql`${followupJobs.attempts} < ${followupJobs.max_attempts}`,
      ))
      .orderBy(followupJobs.run_at)
      .limit(limit);
  }

  async updateFollowupJob(id: number, updates: Record<string, any>): Promise<void> {
    await db.update(followupJobs).set(updates).where(eq(followupJobs.id, id));
  }

  async getFollowupLogs(calculatorId: number, limit = 50): Promise<FollowupJob[]> {
    return db.select().from(followupJobs)
      .where(eq(followupJobs.calculator_id, calculatorId))
      .orderBy(desc(followupJobs.created_at))
      .limit(limit);
  }

  async cancelFollowupsForLead(leadId: number): Promise<void> {
    await db.update(followupJobs)
      .set({ status: 'cancelled' })
      .where(and(eq(followupJobs.lead_id, leadId), eq(followupJobs.status, 'pending')));
  }

  async getCalculatorById(id: number): Promise<Calculator | undefined> {
    const [calc] = await db.select().from(calculators).where(eq(calculators.id, id)).limit(1);
    return calc;
  }

  async createBooking(data: InsertBooking): Promise<Booking> {
    const [booking] = await db.insert(bookings).values(data).returning();
    return booking;
  }

  async getBookingsByCalculatorId(calculatorId: number): Promise<Booking[]> {
    return db.select().from(bookings)
      .where(eq(bookings.calculator_id, calculatorId))
      .orderBy(desc(bookings.created_at));
  }

  async getBookingById(id: number): Promise<Booking | undefined> {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
    return booking;
  }

  async updateBookingStatus(id: number, status: string): Promise<Booking | undefined> {
    const [booking] = await db.update(bookings).set({ status }).where(eq(bookings.id, id)).returning();
    return booking;
  }

  async updateBooking(id: number, updates: Partial<InsertBooking>): Promise<Booking | undefined> {
    const [booking] = await db.update(bookings).set(updates).where(eq(bookings.id, id)).returning();
    return booking;
  }

  async getConfirmedBookingsForDate(calculatorId: number, date: string): Promise<Booking[]> {
    return db.select().from(bookings)
      .where(and(
        eq(bookings.calculator_id, calculatorId),
        eq(bookings.date, date),
        sql`${bookings.status} IN ('pending', 'confirmed')`,
      ))
      .orderBy(bookings.time);
  }

  async getBookingStats(calculatorId: number): Promise<{ bookings_total: number; bookings_confirmed: number; payments_completed: number }> {
    const [totals] = await db.select({
      bookings_total: sql<number>`count(*)::int`,
      bookings_confirmed: sql<number>`count(*) filter (where ${bookings.status} in ('confirmed', 'completed'))::int`,
      payments_completed: sql<number>`count(*) filter (where ${bookings.deposit_paid} = true)::int`,
    }).from(bookings).where(eq(bookings.calculator_id, calculatorId));
    return totals || { bookings_total: 0, bookings_confirmed: 0, payments_completed: 0 };
  }

  async createAiConversation(data: InsertAiConversation): Promise<AiConversation> {
    const [conv] = await db.insert(aiConversations).values(data).returning();
    return conv;
  }

  async updateAiConversation(id: number, updates: Partial<InsertAiConversation>): Promise<void> {
    await db.update(aiConversations).set(updates).where(eq(aiConversations.id, id));
  }

  async getAiConversationBySession(sessionId: string): Promise<AiConversation | undefined> {
    const [conv] = await db.select().from(aiConversations).where(eq(aiConversations.session_id, sessionId)).limit(1);
    return conv;
  }

  async createSupportTicket(data: Partial<InsertSupportTicket> & { description: string }): Promise<SupportTicket> {
    const [ticket] = await db.insert(supportTickets).values({
      description: data.description,
      calculator_id: data.calculator_id ?? null,
      status: data.status || "open",
      transcript_json: data.transcript_json ?? [],
      admin_notified: data.admin_notified ?? false,
    }).returning();
    return ticket;
  }

  async updateSupportTicket(id: number, updates: Record<string, any>): Promise<void> {
    await db.update(supportTickets).set(updates).where(eq(supportTickets.id, id));
  }

  async getSmsThreads(calculatorId: number): Promise<{ lead: Lead; messages: SmsMessage[] }[]> {
    const threadLeads = await db
      .selectDistinct({ leadId: smsMessages.lead_id })
      .from(smsMessages)
      .where(eq(smsMessages.calculator_id, calculatorId));

    const leadIds = threadLeads.map(t => t.leadId).filter((id): id is number => !!id);
    if (leadIds.length === 0) return [];

    const leadRows = await db
      .select()
      .from(leads)
      .where(and(eq(leads.calculator_id, calculatorId), sql`${leads.id} = ANY(${leadIds})`));

    const leadById = new Map<number, Lead>();
    for (const lead of leadRows) {
      leadById.set(lead.id, lead);
    }

    const messages = await db
      .select()
      .from(smsMessages)
      .where(and(eq(smsMessages.calculator_id, calculatorId), sql`${smsMessages.lead_id} = ANY(${leadIds})`))
      .orderBy(smsMessages.created_at);

    const messagesByLead = new Map<number, SmsMessage[]>();
    for (const msg of messages) {
      if (!msg.lead_id) continue;
      const arr = messagesByLead.get(msg.lead_id) || [];
      arr.push(msg);
      messagesByLead.set(msg.lead_id, arr);
    }

    const threads: { lead: Lead; messages: SmsMessage[] }[] = [];
    for (const leadId of leadIds) {
      const lead = leadById.get(leadId);
      if (!lead) continue;
      const msgs = messagesByLead.get(leadId) || [];
      threads.push({ lead, messages: msgs });
    }

    return threads;
  }

  async updateLeadAiPaused(leadId: number, calculatorId: number, paused: boolean): Promise<void> {
    await db
      .update(leads)
      .set({ ai_paused: paused })
      .where(and(eq(leads.id, leadId), eq(leads.calculator_id, calculatorId)));
  }

  async incrementCouponUsage(calculatorId: number, couponCode: string): Promise<void> {
    const calc = await this.getCalculatorById(calculatorId);
    if (!calc) return;

    const settings = (calc.calculator_settings as any) || {};
    const promotions = settings.promotions || {};
    const coupons: any[] = promotions.coupons || [];

    const normalizedCode = couponCode.toUpperCase();
    const updatedCoupons = coupons.map((c: any) => {
      if (c.code.toUpperCase() === normalizedCode) {
        return { ...c, usage_count: (c.usage_count || 0) + 1 };
      }
      return c;
    });

    await this.updateCalculator(calculatorId, {
      calculator_settings: {
        ...settings,
        promotions: {
          ...promotions,
          coupons: updatedCoupons,
        },
      },
    });
  }

  /* ─── User methods ─── */
  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user;
  }

  async updateUser(id: number, updates: Partial<Pick<InsertUser, 'name' | 'role'>>): Promise<User | undefined> {
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return user;
  }

  async listUsers(limit = 50, offset = 0): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.created_at)).limit(limit).offset(offset);
  }

  async getUserCount(): Promise<number> {
    const [row] = await db.select({ total: sql<number>`count(*)::int` }).from(users);
    return row?.total ?? 0;
  }

  async getCalculatorsByUserId(userId: number): Promise<Calculator[]> {
    return db.select().from(calculators).where(eq(calculators.user_id, userId)).orderBy(desc(calculators.id));
  }

  async createAuditSubmission(data: InsertAuditSubmission): Promise<AuditSubmission> {
    const [row] = await db.insert(auditSubmissions).values(data).returning();
    return row;
  }

  async listAuditSubmissions(limit = 50, offset = 0): Promise<AuditSubmission[]> {
    return db.select().from(auditSubmissions).orderBy(desc(auditSubmissions.created_at)).limit(limit).offset(offset);
  }

  async getAuditSubmissionCount(): Promise<number> {
    const [row] = await db.select({ total: sql<number>`count(*)::int` }).from(auditSubmissions);
    return row?.total ?? 0;
  }

  // ═══════════════════════════════════════════════
  // Admin CRM Methods
  // ═══════════════════════════════════════════════

  // ─── Clients ───
  async listClients(opts: { search?: string; status?: string; limit?: number; offset?: number } = {}): Promise<Client[]> {
    const { search, status, limit = 50, offset = 0 } = opts;
    const conditions = [];
    if (status) conditions.push(eq(clients.status, status));
    if (search) {
      conditions.push(or(
        ilike(clients.business_name, `%${search}%`),
        ilike(clients.contact_name, `%${search}%`),
        ilike(clients.contact_email, `%${search}%`),
      ));
    }
    const where = conditions.length ? and(...conditions) : undefined;
    return db.select().from(clients).where(where).orderBy(desc(clients.created_at)).limit(limit).offset(offset);
  }

  async getClientById(id: number): Promise<Client | undefined> {
    const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
    return row;
  }

  async createClient(data: InsertClient): Promise<Client> {
    const [row] = await db.insert(clients).values(data).returning();
    return row;
  }

  async updateClient(id: number, updates: Partial<InsertClient>): Promise<Client | undefined> {
    const [row] = await db.update(clients).set({ ...updates, updated_at: new Date() }).where(eq(clients.id, id)).returning();
    return row;
  }

  async getClientCount(status?: string): Promise<number> {
    const where = status ? eq(clients.status, status) : undefined;
    const [row] = await db.select({ total: sql<number>`count(*)::int` }).from(clients).where(where);
    return row?.total ?? 0;
  }

  // ─── Service Catalog ───
  async listServiceCatalog(): Promise<ServiceCatalogRow[]> {
    return db.select().from(serviceCatalog).orderBy(serviceCatalog.sort_order);
  }

  async upsertServiceCatalog(data: InsertServiceCatalog): Promise<ServiceCatalogRow> {
    const [row] = await db.insert(serviceCatalog).values(data)
      .onConflictDoUpdate({ target: serviceCatalog.id, set: { ...data, updated_at: new Date() } })
      .returning();
    return row;
  }

  // ─── Client Services ───
  async listClientServices(clientId: number): Promise<(ClientService & { service_name?: string })[]> {
    const rows = await db.select({
      id: clientServices.id,
      client_id: clientServices.client_id,
      service_id: clientServices.service_id,
      status: clientServices.status,
      enabled: clientServices.enabled,
      fulfillment_mode: clientServices.fulfillment_mode,
      price_cents: clientServices.price_cents,
      cost_cents: clientServices.cost_cents,
      billing_period: clientServices.billing_period,
      started_at: clientServices.started_at,
      cancelled_at: clientServices.cancelled_at,
      automation_enabled: clientServices.automation_enabled,
      human_review_required: clientServices.human_review_required,
      metadata: clientServices.metadata,
      created_at: clientServices.created_at,
      updated_at: clientServices.updated_at,
      service_name: serviceCatalog.name,
    })
    .from(clientServices)
    .leftJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .where(eq(clientServices.client_id, clientId))
    .orderBy(desc(clientServices.created_at));
    return rows;
  }

  async createClientService(data: InsertClientService): Promise<ClientService> {
    const [row] = await db.insert(clientServices).values(data).returning();
    return row;
  }

  async updateClientService(id: number, updates: Partial<InsertClientService>): Promise<ClientService | undefined> {
    const [row] = await db.update(clientServices).set({ ...updates, updated_at: new Date() }).where(eq(clientServices.id, id)).returning();
    return row;
  }

  async getActiveServiceCount(): Promise<number> {
    const [row] = await db.select({ total: sql<number>`count(*)::int` }).from(clientServices).where(eq(clientServices.status, "active"));
    return row?.total ?? 0;
  }

  // ─── Orders ───
  async listOrders(clientId?: number, limit = 50, offset = 0): Promise<Order[]> {
    const where = clientId ? eq(orders.client_id, clientId) : undefined;
    return db.select().from(orders).where(where).orderBy(desc(orders.created_at)).limit(limit).offset(offset);
  }

  async createOrder(data: InsertOrder): Promise<Order> {
    const [row] = await db.insert(orders).values(data).returning();
    return row;
  }

  async createOrderItem(data: InsertOrderItem): Promise<OrderItem> {
    const [row] = await db.insert(orderItems).values(data).returning();
    return row;
  }

  // ─── Suppliers ───
  async listSuppliers(): Promise<Supplier[]> {
    return db.select().from(suppliers).orderBy(suppliers.name);
  }

  async createSupplier(data: InsertSupplier): Promise<Supplier> {
    const [row] = await db.insert(suppliers).values(data).returning();
    return row;
  }

  async updateSupplier(id: number, updates: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    const [row] = await db.update(suppliers).set({ ...updates, updated_at: new Date() }).where(eq(suppliers.id, id)).returning();
    return row;
  }

  // ─── Fulfillment ───
  async listFulfillmentTasks(opts: { clientId?: number; status?: string; limit?: number; offset?: number } = {}): Promise<(FulfillmentTask & { client_name?: string; supplier_name?: string })[]> {
    const { clientId, status, limit = 50, offset = 0 } = opts;
    const conditions = [];
    if (clientId) conditions.push(eq(fulfillmentTasks.client_id, clientId));
    if (status) conditions.push(eq(fulfillmentTasks.status, status));
    const where = conditions.length ? and(...conditions) : undefined;
    const rows = await db.select({
      id: fulfillmentTasks.id,
      client_service_id: fulfillmentTasks.client_service_id,
      client_id: fulfillmentTasks.client_id,
      supplier_id: fulfillmentTasks.supplier_id,
      title: fulfillmentTasks.title,
      description: fulfillmentTasks.description,
      status: fulfillmentTasks.status,
      priority: fulfillmentTasks.priority,
      sort_order: fulfillmentTasks.sort_order,
      waiting_on: fulfillmentTasks.waiting_on,
      handled_by: fulfillmentTasks.handled_by,
      automation_status: fulfillmentTasks.automation_status,
      last_action: fulfillmentTasks.last_action,
      next_action: fulfillmentTasks.next_action,
      last_action_at: fulfillmentTasks.last_action_at,
      cost_cents: fulfillmentTasks.cost_cents,
      due_at: fulfillmentTasks.due_at,
      completed_at: fulfillmentTasks.completed_at,
      escalation_flag: fulfillmentTasks.escalation_flag,
      human_review_required: fulfillmentTasks.human_review_required,
      actor_type: fulfillmentTasks.actor_type,
      metadata: fulfillmentTasks.metadata,
      created_at: fulfillmentTasks.created_at,
      updated_at: fulfillmentTasks.updated_at,
      client_name: clients.business_name,
      supplier_name: suppliers.name,
    })
    .from(fulfillmentTasks)
    .leftJoin(clients, eq(fulfillmentTasks.client_id, clients.id))
    .leftJoin(suppliers, eq(fulfillmentTasks.supplier_id, suppliers.id))
    .where(where)
    .orderBy(fulfillmentTasks.sort_order, fulfillmentTasks.created_at)
    .limit(limit)
    .offset(offset);
    return rows;
  }

  async createFulfillmentTask(data: InsertFulfillmentTask): Promise<FulfillmentTask> {
    const [row] = await db.insert(fulfillmentTasks).values(data).returning();
    return row;
  }

  async updateFulfillmentTask(id: number, updates: Partial<InsertFulfillmentTask>): Promise<FulfillmentTask | undefined> {
    const [row] = await db.update(fulfillmentTasks).set({ ...updates, updated_at: new Date() }).where(eq(fulfillmentTasks.id, id)).returning();
    return row;
  }

  async getOpenFulfillmentCount(): Promise<number> {
    const [row] = await db.select({ total: sql<number>`count(*)::int` }).from(fulfillmentTasks)
      .where(and(
        sql`${fulfillmentTasks.status} NOT IN ('delivered', 'cancelled')`,
      ));
    return row?.total ?? 0;
  }

  // ─── Onboarding ───
  async listOnboardingSubmissions(clientId: number): Promise<OnboardingSubmission[]> {
    return db.select().from(onboardingSubmissions).where(eq(onboardingSubmissions.client_id, clientId)).orderBy(desc(onboardingSubmissions.created_at));
  }

  async createOnboardingSubmission(data: InsertOnboardingSubmission): Promise<OnboardingSubmission> {
    const [row] = await db.insert(onboardingSubmissions).values(data).returning();
    return row;
  }

  async updateOnboardingSubmission(id: number, updates: Partial<InsertOnboardingSubmission>): Promise<OnboardingSubmission | undefined> {
    const [row] = await db.update(onboardingSubmissions).set({ ...updates, updated_at: new Date() }).where(eq(onboardingSubmissions.id, id)).returning();
    return row;
  }

  async getPendingOnboardingCount(): Promise<number> {
    const [row] = await db.select({ total: sql<number>`count(*)::int` }).from(onboardingSubmissions)
      .where(sql`${onboardingSubmissions.status} IN ('not_sent', 'sent', 'viewed', 'needs_followup')`);
    return row?.total ?? 0;
  }

  // ─── Payments ───
  async listClientPayments(clientId: number): Promise<ClientPayment[]> {
    return db.select().from(clientPayments).where(eq(clientPayments.client_id, clientId)).orderBy(desc(clientPayments.created_at));
  }

  async listAllPayments(opts: { status?: string; limit?: number; offset?: number } = {}): Promise<(ClientPayment & { client_name?: string })[]> {
    const { status, limit = 50, offset = 0 } = opts;
    const conditions = [];
    if (status) conditions.push(eq(clientPayments.status, status));
    const where = conditions.length ? and(...conditions) : undefined;
    return db.select({
      id: clientPayments.id, client_id: clientPayments.client_id,
      client_service_id: clientPayments.client_service_id, order_id: clientPayments.order_id,
      type: clientPayments.type, amount_cents: clientPayments.amount_cents,
      status: clientPayments.status, description: clientPayments.description,
      stripe_invoice_id: clientPayments.stripe_invoice_id,
      stripe_payment_intent_id: clientPayments.stripe_payment_intent_id,
      period_start: clientPayments.period_start, period_end: clientPayments.period_end,
      due_at: clientPayments.due_at, paid_at: clientPayments.paid_at,
      actor_type: clientPayments.actor_type, metadata: clientPayments.metadata,
      created_at: clientPayments.created_at, updated_at: clientPayments.updated_at,
      client_name: clients.business_name,
    })
    .from(clientPayments)
    .leftJoin(clients, eq(clientPayments.client_id, clients.id))
    .where(where)
    .orderBy(desc(clientPayments.created_at))
    .limit(limit).offset(offset);
  }

  async getActiveClientCountByService(): Promise<{ service_id: string; count: number }[]> {
    return db.select({
      service_id: clientServices.service_id,
      count: sql<number>`count(*)::int`,
    })
    .from(clientServices)
    .where(eq(clientServices.status, "active"))
    .groupBy(clientServices.service_id);
  }

  async createClientPayment(data: InsertClientPayment): Promise<ClientPayment> {
    const [row] = await db.insert(clientPayments).values(data).returning();
    return row;
  }

  async updateClientPayment(id: number, updates: Partial<InsertClientPayment>): Promise<ClientPayment | undefined> {
    const [row] = await db.update(clientPayments).set({ ...updates, updated_at: new Date() }).where(eq(clientPayments.id, id)).returning();
    return row;
  }

  async getUnpaidTotal(): Promise<number> {
    const [row] = await db.select({ total: sql<number>`coalesce(sum(amount_cents), 0)::int` }).from(clientPayments)
      .where(and(eq(clientPayments.type, "invoice"), eq(clientPayments.status, "pending")));
    return row?.total ?? 0;
  }

  async getMonthlyRevenue(): Promise<number> {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [row] = await db.select({ total: sql<number>`coalesce(sum(amount_cents), 0)::int` }).from(clientPayments)
      .where(and(eq(clientPayments.status, "paid"), gte(clientPayments.paid_at, monthStart)));
    return row?.total ?? 0;
  }

  // ─── Notes ───
  async listInternalNotes(clientId: number): Promise<InternalNote[]> {
    return db.select().from(internalNotes).where(eq(internalNotes.client_id, clientId)).orderBy(desc(internalNotes.created_at));
  }

  async createInternalNote(data: InsertInternalNote): Promise<InternalNote> {
    const [row] = await db.insert(internalNotes).values(data).returning();
    return row;
  }

  // ─── Activity Log ───
  async logAdminActivity(data: InsertAdminActivityLog): Promise<AdminActivityLog> {
    const [row] = await db.insert(adminActivityLog).values(data).returning();
    return row;
  }

  async listAdminActivity(opts: { entityType?: string; entityId?: number; limit?: number } = {}): Promise<AdminActivityLog[]> {
    const { entityType, entityId, limit = 50 } = opts;
    const conditions = [];
    if (entityType) conditions.push(eq(adminActivityLog.entity_type, entityType));
    if (entityId) conditions.push(eq(adminActivityLog.entity_id, entityId));
    const where = conditions.length ? and(...conditions) : undefined;
    return db.select().from(adminActivityLog).where(where).orderBy(desc(adminActivityLog.created_at)).limit(limit);
  }

  // ─── CRM Overview ───
  async getCrmOverview() {
    const [totalClients, activeServices, pendingOnboarding, openFulfillment, unpaidAmount, monthlyRevenue, recentClients, recentTaskRows] = await Promise.all([
      this.getClientCount(),
      this.getActiveServiceCount(),
      this.getPendingOnboardingCount(),
      this.getOpenFulfillmentCount(),
      this.getUnpaidTotal(),
      this.getMonthlyRevenue(),
      db.select({ id: clients.id, business_name: clients.business_name, status: clients.status, created_at: clients.created_at })
        .from(clients).orderBy(desc(clients.created_at)).limit(5),
      db.select({
        id: fulfillmentTasks.id, title: fulfillmentTasks.title, status: fulfillmentTasks.status,
        priority: fulfillmentTasks.priority, client_id: fulfillmentTasks.client_id,
        client_name: clients.business_name, due_at: fulfillmentTasks.due_at,
      })
      .from(fulfillmentTasks)
      .leftJoin(clients, eq(fulfillmentTasks.client_id, clients.id))
      .where(sql`${fulfillmentTasks.status} NOT IN ('delivered', 'cancelled')`)
      .orderBy(desc(fulfillmentTasks.created_at))
      .limit(5),
    ]);
    return { totalClients, activeServices, pendingOnboarding, openFulfillment, unpaidAmount, monthlyRevenue, recentClients, recentTasks: recentTaskRows };
  }

  // ─── Task Templates ───
  async getTaskTemplates(serviceId: string): Promise<ServiceTaskTemplate[]> {
    return db.select().from(serviceTaskTemplates).where(eq(serviceTaskTemplates.service_id, serviceId)).orderBy(serviceTaskTemplates.sort_order);
  }

  // ─── Onboarding Templates ───
  async getOnboardingTemplate(serviceId: string): Promise<OnboardingTemplate | undefined> {
    const [row] = await db.select().from(onboardingTemplates)
      .where(and(eq(onboardingTemplates.service_id, serviceId), eq(onboardingTemplates.is_active, true)))
      .limit(1);
    return row;
  }

  // ─── Service Catalog lookup ───
  async getClientServiceById(id: number): Promise<ClientService | undefined> {
    const [row] = await db.select().from(clientServices).where(eq(clientServices.id, id)).limit(1);
    return row;
  }

  async getServiceById(serviceId: string): Promise<ServiceCatalogRow | undefined> {
    const [row] = await db.select().from(serviceCatalog).where(eq(serviceCatalog.id, serviceId)).limit(1);
    return row;
  }

  // ─── Check completion cascade ───
  async checkAndCompleteService(clientServiceId: number): Promise<{ serviceCompleted: boolean; serviceActivated: boolean; clientActivated: boolean }> {
    // Count non-delivered tasks for this client_service
    const [pending] = await db.select({ total: sql<number>`count(*)::int` })
      .from(fulfillmentTasks)
      .where(and(
        eq(fulfillmentTasks.client_service_id, clientServiceId),
        sql`${fulfillmentTasks.status} NOT IN ('delivered', 'cancelled')`,
      ));

    if ((pending?.total ?? 1) > 0) return { serviceCompleted: false, serviceActivated: false, clientActivated: false };

    // All tasks delivered — look up the service's delivery_pattern
    const cs = await this.getClientServiceById(clientServiceId);
    if (!cs) return { serviceCompleted: false, serviceActivated: false, clientActivated: false };

    const catalog = await this.getServiceById(cs.service_id);
    const pattern = catalog?.delivery_pattern || "one_time";

    let newStatus: string;
    let serviceCompleted = false;
    let serviceActivated = false;

    switch (pattern) {
      case "one_time":
        // Sprint complete — mark as completed
        newStatus = "completed";
        serviceCompleted = true;
        break;
      case "always_on":
        // Setup done — system goes live, mark as active
        newStatus = "active";
        serviceActivated = true;
        break;
      case "recurring":
        // Monthly batch done — service stays active, don't change status
        return { serviceCompleted: false, serviceActivated: false, clientActivated: false };
      default:
        newStatus = "completed";
        serviceCompleted = true;
    }

    await db.update(clientServices)
      .set({ status: newStatus, completed_at: serviceCompleted ? new Date() : undefined, updated_at: new Date() })
      .where(eq(clientServices.id, clientServiceId));

    // Check if client should be moved to "active"
    // (only if they're still in "onboarding" and have no pending/onboarding services left)
    let clientActivated = false;
    const [client] = await db.select({ status: clients.status, id: clients.id }).from(clients).where(eq(clients.id, cs.client_id)).limit(1);
    if (client && (client.status === "onboarding" || client.status === "lead")) {
      const [stillPending] = await db.select({ total: sql<number>`count(*)::int` })
        .from(clientServices)
        .where(and(
          eq(clientServices.client_id, cs.client_id),
          sql`${clientServices.status} IN ('pending', 'onboarding')`,
        ));
      if ((stillPending?.total ?? 0) === 0) {
        await db.update(clients).set({ status: "active", updated_at: new Date() }).where(eq(clients.id, cs.client_id));
        clientActivated = true;
      }
    }

    return { serviceCompleted, serviceActivated, clientActivated };
  }
}

export const storage = new DatabaseStorage();
