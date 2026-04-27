import crypto from "crypto";
import { hashPassword } from "./auth";
import { db } from "./db";
import {
calculators, leads, analyticsEvents, deploymentStatus,
  calculatorAnalyticsSummary, jobLogs,
  notificationQueue, followupJobs, bookings,
  aiConversations, supportTickets, smsMessages,
  ticketMessages, ticketEvents,
  users, auditSubmissions, auditFollowupEmails, demoQuoteLeads, missedCallLeads,
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
  type TicketMessage, type InsertTicketMessage,
  type TicketEvent, type InsertTicketEvent,
  type SmsMessage,
type User, type InsertUser,
  type AuditSubmission, type InsertAuditSubmission,
  type AuditFollowupEmail, type InsertAuditFollowupEmail,
  type MissedCallLead, type InsertMissedCallLead,
  type DemoQuoteLead, type InsertDemoQuoteLead,
  // Admin CRM
  clients, clientServices, serviceCatalog, orders, orderItems,
  suppliers, fulfillmentTasks, onboardingSubmissions, onboardingTemplates,
  clientPayments, internalNotes, adminActivityLog,
  serviceTaskTemplates,
  // TradeLine
  tradelineUsage, tradelineCallLog, tradelineModeLog,
  tradelineConfigSchema,
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
  // RankFlow
  rankflowProfiles, rankflowMonthlyPlans, rankflowTasks, rankflowQaChecks, rankflowProgress,
  rankflowVendorBatches, rankflowKeywords, rankflowRankings, rankflowPages, rankflowSignals,
  type RankflowProfile, type InsertRankflowProfile,
  type RankflowMonthlyPlan, type InsertRankflowMonthlyPlan,
  type RankflowTask, type InsertRankflowTask,
  type RankflowQaCheck, type InsertRankflowQaCheck,
  type RankflowProgress, type InsertRankflowProgress,
  type RankflowVendorBatch, type InsertRankflowVendorBatch,
  type RankflowKeyword, type InsertRankflowKeyword,
  type RankflowRanking, type InsertRankflowRanking,
  type RankflowPage, type InsertRankflowPage,
  type RankflowSignal, type InsertRankflowSignal,
  reviewRequests,
  type ReviewRequest, type InsertReviewRequest,
  monitoredReviews,
  type MonitoredReview, type InsertMonitoredReview,
  type TradelineConfig,
  type TradelineUsage, type InsertTradelineUsage,
  type TradelineCallLog, type InsertTradelineCallLog,
  type TradelineModeLog, type InsertTradelineModeLog,
  socialsyncProfiles, socialsyncTopics, socialsyncPosts,
  socialsyncPublishQueue, socialsyncActivityLogs, socialsyncPlatformConnections,
  type SocialSyncProfile, type InsertSocialSyncProfile,
  type SocialSyncTopic, type InsertSocialSyncTopic,
  type SocialSyncPost, type InsertSocialSyncPost,
  type SocialSyncQueueItem, type InsertSocialSyncQueueItem,
  type SocialSyncActivityLog, type InsertSocialSyncActivityLog,
  type SocialSyncConnection, type InsertSocialSyncConnection,
  reviews as reviewsTable, reviewSyncLogs,
  type Review, type InsertReview,
  type ReviewSyncLog, type InsertReviewSyncLog,
  serviceCostLogs,
  type ServiceCostLog, type InsertServiceCostLog,
  salesLeads,
  type SalesLead, type InsertSalesLead,
  // ContentFlow
  contentDrafts, contentApprovals, contentAssets,
  type ContentDraft, type InsertContentDraft,
  type ContentApproval, type InsertContentApproval,
  type ContentAsset, type InsertContentAsset,
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
  getAllCalculatorsForAdmin(): Promise<any[]>;
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

  createSupportTicket(data: Partial<InsertSupportTicket> & { description: string; subject: string; client_id: number }): Promise<SupportTicket>;
  updateSupportTicket(id: number, updates: Record<string, any>): Promise<SupportTicket | undefined>;
  getSupportTicketById(id: number): Promise<SupportTicket | undefined>;
  listSupportTickets(opts?: { clientId?: number; status?: string; priority?: string; category?: string; search?: string; limit?: number; offset?: number }): Promise<(SupportTicket & { client_name?: string | null })[]>;
  getSupportTicketCounts(clientId?: number): Promise<Record<string, number>>;

  // Ticket messages
  createTicketMessage(data: InsertTicketMessage): Promise<TicketMessage>;
  listTicketMessages(ticketId: number, visibility?: "customer" | "all"): Promise<(TicketMessage & { author_name?: string | null })[]>;

  // Ticket events
  createTicketEvent(data: InsertTicketEvent): Promise<TicketEvent>;

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

  enqueueAuditFollowups(data: InsertAuditFollowupEmail[]): Promise<AuditFollowupEmail[]>;
  fetchDueAuditFollowups(limit?: number): Promise<AuditFollowupEmail[]>;
  updateAuditFollowup(id: number, updates: Record<string, any>): Promise<void>;

  createMissedCallLead(data: InsertMissedCallLead): Promise<MissedCallLead>;
  createDemoQuoteLead(data: InsertDemoQuoteLead): Promise<DemoQuoteLead>;

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
  listFulfillmentTasks(opts?: { clientId?: number; status?: string; limit?: number; offset?: number }): Promise<(FulfillmentTask & { client_name?: string; supplier_name?: string; service_name?: string })[]>;
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

  // ─── Review Requests ───
  createReviewRequest(data: InsertReviewRequest): Promise<ReviewRequest>;
  findReviewRequestByIdempotencyKey(key: string): Promise<ReviewRequest | undefined>;
  getReviewRequestByToken(token: string): Promise<ReviewRequest | undefined>;
  getReviewRequestById(id: number): Promise<ReviewRequest | undefined>;
  fetchDueReviewRequests(limit?: number): Promise<ReviewRequest[]>;
  fetchDueReviewFollowups(limit?: number): Promise<ReviewRequest[]>;
  updateReviewRequest(id: number, updates: Record<string, any>): Promise<ReviewRequest | undefined>;
  listReviewRequests(opts?: { clientId?: number; status?: string; triggerSource?: string; hasFeedback?: boolean; dueForFollowup?: boolean; limit?: number; offset?: number }): Promise<ReviewRequest[]>;
  countReviewRequests(opts?: { clientId?: number; status?: string; triggerSource?: string; hasFeedback?: boolean; dueForFollowup?: boolean }): Promise<number>;
  getReviewRequestStats(): Promise<{ total: number; pending: number; sent: number; clicked: number; routed_positive: number; routed_negative: number; feedback_captured: number; completed: number; failed: number; stopped: number; due_for_followup: number }>;
  stopReviewRequestsForBooking(bookingId: number): Promise<void>;
  findClientByUserId(userId: number): Promise<Client | undefined>;

  // ─── Monitored Reviews ───
  upsertMonitoredReview(data: InsertMonitoredReview): Promise<{ review: MonitoredReview; isNew: boolean }>;
  getMonitoredReviewById(id: number): Promise<MonitoredReview | undefined>;
  updateMonitoredReview(id: number, updates: Record<string, any>): Promise<MonitoredReview | undefined>;
  findMonitoredReviewByDedupKey(dedupKey: string): Promise<MonitoredReview | undefined>;
  listMonitoredReviews(opts?: { clientId?: number; platform?: string; isNew?: boolean; minRating?: number; maxRating?: number; limit?: number; offset?: number }): Promise<MonitoredReview[]>;
  countMonitoredReviews(opts?: { clientId?: number; isNew?: boolean }): Promise<number>;
  getMonitoredReviewStats(clientId?: number): Promise<{ total: number; averageRating: number; newCount: number; withResponse: number; byRating: Record<number, number> }>;
  markMonitoredReviewsAcknowledged(ids: number[]): Promise<void>;
  listClientsForReviewSync(limit?: number): Promise<Client[]>;
  getClientReputationService(clientId: number): Promise<{ serviceId: string; status: string; metadata: any } | null>;
  updateClientServiceMetadata(clientId: number, serviceId: string, metadata: Record<string, any>): Promise<void>;
  getClientByWidgetToken(token: string): Promise<Client | undefined>;
  ensureWidgetToken(clientId: number): Promise<string>;
  getWidgetReviews(clientId: number, minRating: number, limit: number): Promise<{ reviewer_name: string; rating: number; review_text: string | null; published_at: Date | null; platform: string }[]>;
  countReviewsMissingGoogleName(clientId?: number): Promise<number>;

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

  // Portal account
  ensurePortalAccount(clientId: number): Promise<{ user: User; created: boolean; tempPassword?: string }>;

  // Fulfillment helpers
  countPendingTasks(clientServiceId: number): Promise<number>;

  // Raw metadata
  updateClientServiceMetadata(clientServiceId: number, metadata: Record<string, any>): Promise<void>;

  // ─── TradeLine ───
  getTradeLineConfig(clientServiceId: number): Promise<TradelineConfig | undefined>;
  updateTradeLineConfig(clientServiceId: number, partialConfig: Partial<TradelineConfig>): Promise<TradelineConfig>;
  setTradeLineMode(clientServiceId: number, newMode: string, changedBy: string): Promise<TradelineModeLog>;
  createTradeLineCallLog(data: InsertTradelineCallLog): Promise<TradelineCallLog | null>;
  listTradeLineCalls(clientServiceId: number, limit?: number): Promise<TradelineCallLog[]>;
  upsertTradeLineUsage(clientServiceId: number, periodStart: Date, periodEnd: Date): Promise<TradelineUsage>;
  getTradeLineUsage(clientServiceId: number, periodStart?: Date): Promise<TradelineUsage | undefined>;
  listTradeLineModeChanges(clientServiceId: number, limit?: number): Promise<TradelineModeLog[]>;
  incrementTradeLineUsage(clientServiceId: number, periodStart: Date, periodEnd: Date, increments: { voiceMinutes?: number; calls?: number; sms?: number }): Promise<TradelineUsage>;

  // ─── SocialSync ───
  upsertSocialSyncProfile(data: InsertSocialSyncProfile): Promise<SocialSyncProfile>;
  getSocialSyncProfile(clientId: number): Promise<SocialSyncProfile | undefined>;

  createSocialSyncTopic(data: InsertSocialSyncTopic): Promise<SocialSyncTopic>;
  createSocialSyncTopics(data: InsertSocialSyncTopic[]): Promise<SocialSyncTopic[]>;
  listSocialSyncTopics(clientId: number, status?: string): Promise<SocialSyncTopic[]>;
  updateSocialSyncTopic(id: number, updates: Partial<InsertSocialSyncTopic>): Promise<SocialSyncTopic | undefined>;

  createSocialSyncPost(data: InsertSocialSyncPost): Promise<SocialSyncPost>;
  listSocialSyncPosts(clientId: number, opts?: { status?: string; platform?: string; limit?: number; offset?: number }): Promise<SocialSyncPost[]>;
  getSocialSyncPostById(id: number): Promise<SocialSyncPost | undefined>;
  updateSocialSyncPost(id: number, updates: Partial<InsertSocialSyncPost>): Promise<SocialSyncPost | undefined>;

  enqueueSocialSyncJob(data: InsertSocialSyncQueueItem): Promise<SocialSyncQueueItem>;
  fetchDueSocialSyncJobs(limit?: number): Promise<SocialSyncQueueItem[]>;
  updateSocialSyncQueueItem(id: number, updates: Record<string, any>): Promise<void>;
  listSocialSyncQueue(clientId: number): Promise<SocialSyncQueueItem[]>;

  createSocialSyncLog(data: InsertSocialSyncActivityLog): Promise<SocialSyncActivityLog>;
  listSocialSyncLogs(clientId: number, limit?: number): Promise<SocialSyncActivityLog[]>;

  upsertSocialSyncConnection(data: InsertSocialSyncConnection): Promise<SocialSyncConnection>;
  listSocialSyncConnections(clientId: number): Promise<SocialSyncConnection[]>;
  listEnabledSocialSyncProfiles(): Promise<SocialSyncProfile[]>;
  listRecentSocialSyncPosts(clientId: number, limit?: number): Promise<SocialSyncPost[]>;
  fetchStaleSocialSyncLocks(thresholdMs: number): Promise<SocialSyncQueueItem[]>;
  listAllSocialSyncConnections(): Promise<SocialSyncConnection[]>;

  // ─── Reviews ───
  upsertReview(data: InsertReview): Promise<Review>;
  listReviews(clientId: number, opts?: { platform?: string; needsReply?: boolean; limit?: number }): Promise<Review[]>;
  getReviewByExternalId(clientId: number, platform: string, externalId: string): Promise<Review | undefined>;
  updateReview(id: number, updates: Partial<InsertReview>): Promise<Review | undefined>;
  createReviewSyncLog(data: InsertReviewSyncLog): Promise<ReviewSyncLog>;

  // ─── Review Requests ───

  // ─── Service Costs ───
  logServiceCost(data: InsertServiceCostLog): Promise<ServiceCostLog>;
  getServiceCosts(clientId: number, sinceDaysAgo?: number): Promise<ServiceCostLog[]>;

  // ─── Sales Leads ───
  createSalesLead(data: InsertSalesLead): Promise<SalesLead>;
  listSalesLeads(status?: string): Promise<SalesLead[]>;
  updateSalesLead(id: number, updates: Partial<InsertSalesLead>): Promise<SalesLead | undefined>;
  getSalesLeadById(id: number): Promise<SalesLead | undefined>;
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
      user_id: original.user_id,
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
      plan_tier: original.plan_tier,
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

  async getAllCalculatorsForAdmin(): Promise<any[]> {
    const allCalcs = await db.select({
      id: calculators.id,
      user_id: calculators.user_id,
      business_name: calculators.business_name,
      trade_type: calculators.trade_type,
      slug: calculators.slug,
      owner_email: calculators.owner_email,
      plan_tier: calculators.plan_tier,
      total_views: calculators.total_views,
      created_at: calculators.created_at,
    }).from(calculators).orderBy(desc(calculators.created_at));

    const PLAN_REVENUE: Record<string, number> = { 'free': 0, 'starter': 4900, 'business': 9900 };
    const QQ_COST_CENTS = 500;

    const results = [];
    for (const calc of allCalcs) {
      const deploy = await this.getDeploymentStatus(calc.id);
      const [leadRow] = await db.select({ count: sql<number>`count(*)::int` })
        .from(leads).where(eq(leads.calculator_id, calc.id));
      const tier = (calc.plan_tier as string) ?? 'free';
      results.push({
        ...calc,
        total_leads: leadRow?.count ?? 0,
        status: deploy?.status ?? 'draft',
        price_cents: PLAN_REVENUE[tier] ?? 0,
        cost_cents: tier === 'free' ? 0 : QQ_COST_CENTS,
      });
    }
    return results;
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

    // Auto-trigger review request when booking is completed
    if (booking && status === "completed") {
      this.triggerReviewRequestForBooking(booking).catch((err) => {
        console.error(`[storage] Review request trigger failed for booking ${id}:`, err.message);
      });
    }

    return booking;
  }

  /**
   * Non-blocking trigger: enqueue a review request for a completed booking.
   * Resolves client_id from the booking's calculator owner.
   * All dedup/cooldown/eligibility checks happen inside enqueueFromBooking.
   */
  private async triggerReviewRequestForBooking(booking: any): Promise<void> {
    // We need to resolve the client_id from the calculator
    // Calculators are linked to users, and users may be linked to clients
    const calc = await this.getCalculatorById(booking.calculator_id);
    if (!calc) return;

    // Try to find a client via the calculator's user_id
    let clientId: number | null = null;
    if (calc.user_id) {
      const clientRows = await db.select({ id: clients.id }).from(clients)
        .where(eq(clients.user_id, calc.user_id))
        .limit(1);
      clientId = clientRows[0]?.id || null;
    }

    if (!clientId) return; // No linked client — can't send review request

    const { enqueueFromBooking } = await import("./services/reputation/reviewRequestService");
    await enqueueFromBooking(
      clientId,
      booking.id,
      booking.customer_name || null,
      booking.customer_phone || null,
      booking.customer_email || null,
    );
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

  async createSupportTicket(data: Partial<InsertSupportTicket> & { description: string; subject: string; client_id: number }): Promise<SupportTicket> {
    const [ticket] = await db.insert(supportTickets).values({
      client_id: data.client_id,
      subject: data.subject,
      description: data.description,
      status: data.status || "open",
      priority: data.priority || "normal",
      category: data.category || "general",
      source: data.source || "manual",
      assigned_to: data.assigned_to ?? null,
      calculator_id: data.calculator_id ?? null,
      ai_summary: data.ai_summary ?? null,
      ai_priority_hint: data.ai_priority_hint ?? null,
      transcript_json: data.transcript_json ?? [],
      admin_notified: data.admin_notified ?? false,
    }).returning();
    return ticket;
  }

  async updateSupportTicket(id: number, updates: Record<string, any>): Promise<SupportTicket | undefined> {
    const [ticket] = await db.update(supportTickets).set({ ...updates, updated_at: new Date() }).where(eq(supportTickets.id, id)).returning();
    return ticket;
  }

  async getSupportTicketById(id: number): Promise<SupportTicket | undefined> {
    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
    return ticket;
  }

  async listSupportTickets(opts?: { clientId?: number; status?: string; priority?: string; category?: string; search?: string; limit?: number; offset?: number }): Promise<(SupportTicket & { client_name?: string | null })[]> {
    const conditions: any[] = [];
    if (opts?.clientId) conditions.push(eq(supportTickets.client_id, opts.clientId));
    if (opts?.status) conditions.push(eq(supportTickets.status, opts.status));
    if (opts?.priority) conditions.push(eq(supportTickets.priority, opts.priority));
    if (opts?.category) conditions.push(eq(supportTickets.category, opts.category));
    if (opts?.search) {
      conditions.push(
        or(
          ilike(supportTickets.subject, `%${opts.search}%`),
          ilike(supportTickets.description, `%${opts.search}%`),
        )
      );
    }

    const rows = await db
      .select({
        id: supportTickets.id,
        calculator_id: supportTickets.calculator_id,
        client_id: supportTickets.client_id,
        subject: supportTickets.subject,
        description: supportTickets.description,
        status: supportTickets.status,
        priority: supportTickets.priority,
        category: supportTickets.category,
        source: supportTickets.source,
        assigned_to: supportTickets.assigned_to,
        ai_summary: supportTickets.ai_summary,
        ai_priority_hint: supportTickets.ai_priority_hint,
        transcript_json: supportTickets.transcript_json,
        admin_notified: supportTickets.admin_notified,
        created_at: supportTickets.created_at,
        updated_at: supportTickets.updated_at,
        resolved_at: supportTickets.resolved_at,
        closed_at: supportTickets.closed_at,
        client_name: clients.business_name,
        last_message_preview: sql<string | null>`(
          SELECT substring(${ticketMessages.content} from 1 for 120)
          FROM ${ticketMessages}
          WHERE ${ticketMessages.ticket_id} = ${supportTickets.id}
          ORDER BY ${ticketMessages.created_at} DESC
          LIMIT 1
        )`,
        last_message_at: sql<string | null>`(
          SELECT ${ticketMessages.created_at}::text
          FROM ${ticketMessages}
          WHERE ${ticketMessages.ticket_id} = ${supportTickets.id}
          ORDER BY ${ticketMessages.created_at} DESC
          LIMIT 1
        )`,
        last_message_author: sql<string | null>`(
          SELECT ${ticketMessages.author_type}
          FROM ${ticketMessages}
          WHERE ${ticketMessages.ticket_id} = ${supportTickets.id}
          ORDER BY ${ticketMessages.created_at} DESC
          LIMIT 1
        )`,
      })
      .from(supportTickets)
      .leftJoin(clients, eq(supportTickets.client_id, clients.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(supportTickets.created_at))
      .limit(opts?.limit ?? 100)
      .offset(opts?.offset ?? 0);

    return rows;
  }

  async getSupportTicketCounts(clientId?: number): Promise<Record<string, number>> {
    const condition = clientId ? eq(supportTickets.client_id, clientId) : undefined;
    const rows = await db
      .select({
        status: supportTickets.status,
        count: sql<number>`count(*)::int`,
      })
      .from(supportTickets)
      .where(condition)
      .groupBy(supportTickets.status);

    const counts: Record<string, number> = { total: 0, open: 0, in_progress: 0, waiting_on_customer: 0, resolved: 0, closed: 0 };
    for (const row of rows) {
      counts[row.status] = row.count;
      counts.total += row.count;
    }
    return counts;
  }

  async createTicketMessage(data: InsertTicketMessage): Promise<TicketMessage> {
    const [msg] = await db.insert(ticketMessages).values(data).returning();
    return msg;
  }

  async listTicketMessages(ticketId: number, visibility?: "customer" | "all"): Promise<(TicketMessage & { author_name?: string | null })[]> {
    const conditions: any[] = [eq(ticketMessages.ticket_id, ticketId)];
    if (visibility === "customer") {
      conditions.push(eq(ticketMessages.visibility, "customer"));
    }

    const rows = await db
      .select({
        id: ticketMessages.id,
        ticket_id: ticketMessages.ticket_id,
        author_id: ticketMessages.author_id,
        author_type: ticketMessages.author_type,
        visibility: ticketMessages.visibility,
        content: ticketMessages.content,
        metadata: ticketMessages.metadata,
        created_at: ticketMessages.created_at,
        author_name: users.name,
      })
      .from(ticketMessages)
      .leftJoin(users, eq(ticketMessages.author_id, users.id))
      .where(and(...conditions))
      .orderBy(ticketMessages.created_at);

    return rows;
  }

  async createTicketEvent(data: InsertTicketEvent): Promise<TicketEvent> {
    const [event] = await db.insert(ticketEvents).values(data).returning();
    return event;
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

  /**
   * Ensure the client has a portal login. If one already exists, returns it.
   * Otherwise creates a user record with a temp password and links it.
   * Returns { user, created, tempPassword? }.
   */
  async ensurePortalAccount(clientId: number): Promise<{ user: User; created: boolean; tempPassword?: string }> {
    const client = await this.getClientById(clientId);
    if (!client) throw new Error(`Client ${clientId} not found`);

    // Already linked
    if (client.user_id) {
      const existing = await this.getUserById(client.user_id);
      if (existing) return { user: existing, created: false };
    }

    const email = client.contact_email;
    if (!email) throw new Error(`Client ${clientId} has no contact email`);

    // Check if user with this email already exists
    const existingByEmail = await this.getUserByEmail(email.toLowerCase().trim());
    if (existingByEmail) {
      if (existingByEmail.role === "client") {
        await this.updateClient(clientId, { user_id: existingByEmail.id });
        return { user: existingByEmail, created: false };
      }
      // Non-client role — don't overwrite, skip silently
      throw new Error(`User with email ${email} exists with role "${existingByEmail.role}"`);
    }

    // Create new portal user
    const tempPassword = crypto.randomBytes(6).toString("base64url");
    const user = await this.createUser({
      email: email.toLowerCase().trim(),
      password_hash: hashPassword(tempPassword),
      name: client.contact_name || client.business_name,
      role: "client",
    });
    await this.updateClient(clientId, { user_id: user.id });

    return { user, created: true, tempPassword };
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

  async enqueueAuditFollowups(data: InsertAuditFollowupEmail[]): Promise<AuditFollowupEmail[]> {
    if (data.length === 0) return [];
    return db.insert(auditFollowupEmails).values(data).returning();
  }

  async fetchDueAuditFollowups(limit = 20): Promise<AuditFollowupEmail[]> {
    const now = new Date();
    return db.select().from(auditFollowupEmails)
      .where(and(
        eq(auditFollowupEmails.status, 'pending'),
        lte(auditFollowupEmails.run_at, now),
      ))
      .orderBy(auditFollowupEmails.run_at)
      .limit(limit);
  }

  async updateAuditFollowup(id: number, updates: Record<string, any>): Promise<void> {
    await db.update(auditFollowupEmails).set(updates).where(eq(auditFollowupEmails.id, id));
  }

  async createMissedCallLead(data: InsertMissedCallLead): Promise<MissedCallLead> {
    const [row] = await db.insert(missedCallLeads).values(data).returning();
    return row;
  }

  async createDemoQuoteLead(data: InsertDemoQuoteLead): Promise<DemoQuoteLead> {
    const [row] = await db.insert(demoQuoteLeads).values(data).returning();
    return row;
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
    return rows as any;
  }

  async createClientService(data: InsertClientService): Promise<ClientService> {
    const [row] = await db.insert(clientServices).values(data).returning();
    return row;
  }

  async updateClientService(id: number, updates: Partial<InsertClientService>): Promise<ClientService | undefined> {
    const [row] = await db.update(clientServices).set({ ...updates, updated_at: new Date() }).where(eq(clientServices.id, id)).returning();
    return row;
  }

  /**
   * Update the raw metadata JSONB for a client service.
   * Unlike updateTradeLineConfig (which deep-merges the tradeline sub-key),
   * this replaces the entire metadata object.
   */
  async updateClientServiceMetadata(clientServiceId: number, metadata: Record<string, any>): Promise<void>;
  async updateClientServiceMetadata(clientId: number, serviceId: string, metadata: Record<string, any>): Promise<void>;
  async updateClientServiceMetadata(
    clientOrServiceId: number,
    serviceIdOrMetadata: string | Record<string, any>,
    maybeMetadata?: Record<string, any>,
  ): Promise<void> {
    if (typeof serviceIdOrMetadata === "string") {
      await db.update(clientServices)
        .set({ metadata: maybeMetadata ?? {}, updated_at: new Date() })
        .where(and(
          eq(clientServices.client_id, clientOrServiceId),
          eq(clientServices.service_id, serviceIdOrMetadata),
        ));
      return;
    }

    await db.update(clientServices)
      .set({ metadata: serviceIdOrMetadata, updated_at: new Date() })
      .where(eq(clientServices.id, clientOrServiceId));
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
  async listFulfillmentTasks(opts: { clientId?: number; status?: string; limit?: number; offset?: number } = {}): Promise<(FulfillmentTask & { client_name?: string; supplier_name?: string; service_name?: string })[]> {
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
      service_name: serviceCatalog.name,
    })
    .from(fulfillmentTasks)
    .leftJoin(clients, eq(fulfillmentTasks.client_id, clients.id))
    .leftJoin(suppliers, eq(fulfillmentTasks.supplier_id, suppliers.id))
    .leftJoin(clientServices, eq(fulfillmentTasks.client_service_id, clientServices.id))
    .leftJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .where(where)
    .orderBy(fulfillmentTasks.sort_order, fulfillmentTasks.created_at)
    .limit(limit)
    .offset(offset);
    return rows as any;
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
    // Auto-generate access token if not provided
    if (!data.access_token) {
      data.access_token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    }
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
    .limit(limit).offset(offset) as any;
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

  async findClientServiceByServiceId(clientId: number, serviceId: string): Promise<ClientService | undefined> {
    const [row] = await db.select().from(clientServices)
      .where(and(
        eq(clientServices.client_id, clientId),
        eq(clientServices.service_id, serviceId),
        sql`${clientServices.status} NOT IN ('cancelled')`,
      ))
      .limit(1);
    return row;
  }

  async findClientByStripeCustomerId(stripeCustomerId: string): Promise<Client | undefined> {
    const [row] = await db.select().from(clients)
      .where(eq(clients.stripe_customer_id, stripeCustomerId))
      .limit(1);
    return row;
  }

  async findClientByEmail(email: string): Promise<Client | undefined> {
    const [row] = await db.select().from(clients)
      .where(sql`lower(${clients.contact_email}) = lower(${email})`)
      .limit(1);
    return row;
  }

  async findPaymentByStripeSession(sessionId: string): Promise<ClientPayment | undefined> {
    const [row] = await db.select().from(clientPayments)
      .where(eq(clientPayments.stripe_payment_intent_id, sessionId))
      .limit(1);
    return row;
  }

  async getOnboardingByToken(token: string): Promise<{
    submission: OnboardingSubmission;
    template: OnboardingTemplate | null;
    clientName: string;
    serviceName: string;
  } | undefined> {
    const [sub] = await db.select().from(onboardingSubmissions)
      .where(eq(onboardingSubmissions.access_token, token))
      .limit(1);
    if (!sub) return undefined;

    const template = sub.template_id
      ? (await db.select().from(onboardingTemplates).where(eq(onboardingTemplates.id, sub.template_id)).limit(1))[0] ?? null
      : null;

    const [client] = await db.select({ business_name: clients.business_name }).from(clients).where(eq(clients.id, sub.client_id)).limit(1);
    const [cs] = await db.select({ service_id: clientServices.service_id }).from(clientServices).where(eq(clientServices.id, sub.client_service_id)).limit(1);
    const [svc] = cs ? await db.select({ name: serviceCatalog.name }).from(serviceCatalog).where(eq(serviceCatalog.id, cs.service_id)).limit(1) : [null];

    return {
      submission: sub,
      template,
      clientName: client?.business_name ?? "Unknown",
      serviceName: svc?.name ?? "Unknown Service",
    };
  }

  async findPendingPaymentForClientService(clientServiceId: number): Promise<ClientPayment | undefined> {
    const [row] = await db.select().from(clientPayments)
      .where(and(
        eq(clientPayments.client_service_id, clientServiceId),
        eq(clientPayments.status, "pending"),
      ))
      .orderBy(desc(clientPayments.created_at))
      .limit(1);
    return row;
  }

  async getServiceById(serviceId: string): Promise<ServiceCatalogRow | undefined> {
    const [row] = await db.select().from(serviceCatalog).where(eq(serviceCatalog.id, serviceId)).limit(1);
    return row;
  }

  /**
   * Count non-delivered, non-cancelled tasks for a client service.
   * Used by go-live validation to ensure setup tasks are complete.
   */
  async countPendingTasks(clientServiceId: number): Promise<number> {
    const [row] = await db.select({ total: sql<number>`count(*)::int` })
      .from(fulfillmentTasks)
      .where(and(
        eq(fulfillmentTasks.client_service_id, clientServiceId),
        sql`${fulfillmentTasks.status} NOT IN ('delivered', 'cancelled')`,
      ));
    return row?.total ?? 0;
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
        // For recurring services: if still in pending/onboarding, check if all
        // setup tasks are done (tasks that have no monthly equivalent).
        // If service is already active, monthly batches complete silently.
        if (cs.status === "pending" || cs.status === "onboarding") {
          newStatus = "active";
          serviceActivated = true;
          break;
        }
        // Already active — monthly batch completed, no status change needed
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

  /* ═══════════════════════════════════════════
     RankFlow
     ═══════════════════════════════════════════ */

  async getRankFlowProfile(clientId: number): Promise<RankflowProfile | undefined> {
    const [row] = await db.select().from(rankflowProfiles).where(eq(rankflowProfiles.client_id, clientId)).limit(1);
    return row;
  }

  async upsertRankFlowProfile(clientId: number, data: Partial<InsertRankflowProfile>): Promise<RankflowProfile> {
    const existing = await this.getRankFlowProfile(clientId);
    if (existing) {
      const [updated] = await db.update(rankflowProfiles)
        .set({ ...data, updated_at: new Date() })
        .where(eq(rankflowProfiles.client_id, clientId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(rankflowProfiles)
      .values({ ...data, client_id: clientId } as InsertRankflowProfile)
      .returning();
    return created;
  }

  async listEnabledRankFlowProfiles(): Promise<RankflowProfile[]> {
    return db.select().from(rankflowProfiles).where(eq(rankflowProfiles.enabled, true));
  }

  async createMonthlyPlan(data: InsertRankflowMonthlyPlan): Promise<RankflowMonthlyPlan> {
    const [row] = await db.insert(rankflowMonthlyPlans).values(data).returning();
    return row;
  }

  async getMonthlyPlan(clientId: number, month: string): Promise<RankflowMonthlyPlan | undefined> {
    const [row] = await db.select().from(rankflowMonthlyPlans)
      .where(and(eq(rankflowMonthlyPlans.client_id, clientId), eq(rankflowMonthlyPlans.month, month)))
      .limit(1);
    return row;
  }

  async updateMonthlyPlanStatus(planId: number, status: string): Promise<void> {
    await db.update(rankflowMonthlyPlans).set({ status }).where(eq(rankflowMonthlyPlans.id, planId));
  }

  async createRankFlowTask(data: InsertRankflowTask): Promise<RankflowTask> {
    const [row] = await db.insert(rankflowTasks).values(data).returning();
    return row;
  }

  async listTasksByClient(clientId: number): Promise<RankflowTask[]> {
    return db.select().from(rankflowTasks)
      .where(eq(rankflowTasks.client_id, clientId))
      .orderBy(desc(rankflowTasks.created_at));
  }

  async listTasksByPlan(planId: number): Promise<RankflowTask[]> {
    return db.select().from(rankflowTasks)
      .where(eq(rankflowTasks.plan_id, planId))
      .orderBy(rankflowTasks.priority);
  }

  async updateRankFlowTaskStatus(taskId: number, status: string): Promise<RankflowTask | undefined> {
    const updates: Record<string, any> = { status };
    if (status === "done") updates.completed_at = new Date();
    const [row] = await db.update(rankflowTasks).set(updates).where(eq(rankflowTasks.id, taskId)).returning();
    return row;
  }

  async createQACheck(data: InsertRankflowQaCheck): Promise<RankflowQaCheck> {
    const [row] = await db.insert(rankflowQaChecks).values(data).returning();
    return row;
  }

  async listQAChecks(taskId: number): Promise<RankflowQaCheck[]> {
    return db.select().from(rankflowQaChecks).where(eq(rankflowQaChecks.task_id, taskId));
  }

  async getRankFlowTaskById(taskId: number): Promise<RankflowTask | undefined> {
    const [row] = await db.select().from(rankflowTasks).where(eq(rankflowTasks.id, taskId)).limit(1);
    return row;
  }

  async assignRankflowTask(taskId: number, assignedTo: string): Promise<RankflowTask | undefined> {
    const [row] = await db.update(rankflowTasks).set({
      status: "assigned",
      assigned_to: assignedTo,
      assigned_at: new Date(),
    }).where(eq(rankflowTasks.id, taskId)).returning();
    return row;
  }

  async startRankflowTask(taskId: number): Promise<RankflowTask | undefined> {
    const [row] = await db.update(rankflowTasks).set({
      status: "in_progress",
    }).where(eq(rankflowTasks.id, taskId)).returning();
    return row;
  }

  async submitRankflowTask(taskId: number, proofData: any): Promise<RankflowTask | undefined> {
    const [row] = await db.update(rankflowTasks).set({
      status: "submitted",
      submitted_at: new Date(),
      proof_data: proofData,
    }).where(eq(rankflowTasks.id, taskId)).returning();
    return row;
  }

  async updateRankflowTaskQA(taskId: number, qaStatus: string, qaNotes: string | null): Promise<RankflowTask | undefined> {
    const [row] = await db.update(rankflowTasks).set({
      status: "qa_review",
      qa_status: qaStatus,
      qa_notes: qaNotes,
    }).where(eq(rankflowTasks.id, taskId)).returning();
    return row;
  }

  async approveRankflowTask(taskId: number, actualCost?: string): Promise<RankflowTask | undefined> {
    const updates: Record<string, any> = {
      status: "done",
      qa_status: "passed",
      completed_at: new Date(),
    };
    if (actualCost !== undefined) updates.actual_cost = actualCost;
    const [row] = await db.update(rankflowTasks).set(updates).where(eq(rankflowTasks.id, taskId)).returning();
    return row;
  }

  async rejectRankflowTask(taskId: number, rejectionReason: string): Promise<RankflowTask | undefined> {
    const [row] = await db.update(rankflowTasks).set({
      status: "assigned",
      qa_status: "failed",
      rejection_reason: rejectionReason,
      submitted_at: null,
      proof_data: null,
    }).where(eq(rankflowTasks.id, taskId)).returning();
    return row;
  }

  async listPendingAITasks(planId: number): Promise<RankflowTask[]> {
    return db.select().from(rankflowTasks).where(
      and(
        eq(rankflowTasks.plan_id, planId),
        eq(rankflowTasks.execution_mode, "ai"),
        eq(rankflowTasks.status, "pending"),
      )
    );
  }

  async upsertMonthlyProgress(clientId: number, month: string, data: Partial<InsertRankflowProgress>): Promise<RankflowProgress> {
    const [existing] = await db.select().from(rankflowProgress)
      .where(and(eq(rankflowProgress.client_id, clientId), eq(rankflowProgress.month, month)))
      .limit(1);
    if (existing) {
      const [updated] = await db.update(rankflowProgress)
        .set(data)
        .where(eq(rankflowProgress.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(rankflowProgress)
      .values({ client_id: clientId, month, ...data } as InsertRankflowProgress)
      .returning();
    return created;
  }

  async getMonthlyProgress(clientId: number, month: string): Promise<RankflowProgress | undefined> {
    const [row] = await db.select().from(rankflowProgress)
      .where(and(eq(rankflowProgress.client_id, clientId), eq(rankflowProgress.month, month)))
      .limit(1);
    return row;
  }

  // ─── TradeLine ───

  async getTradeLineConfig(clientServiceId: number): Promise<TradelineConfig | undefined> {
    const cs = await this.getClientServiceById(clientServiceId);
    if (!cs) return undefined;
    const raw = (cs.metadata as Record<string, any>)?.tradeline;
    if (!raw) return undefined;
    return tradelineConfigSchema.parse(raw);
  }

  async updateTradeLineConfig(clientServiceId: number, partialConfig: Partial<TradelineConfig>): Promise<TradelineConfig> {
    const cs = await this.getClientServiceById(clientServiceId);
    const existing = (cs?.metadata as Record<string, any>) ?? {};
    const current = existing.tradeline
      ? tradelineConfigSchema.parse(existing.tradeline)
      : tradelineConfigSchema.parse({});

    // Deep merge: for plain-object sub-keys (channels, website, phoneRouting, etc.)
    // spread-merge instead of overwriting, so partial updates don't wipe sibling fields.
    const merged: Record<string, any> = { ...current };
    for (const [key, value] of Object.entries(partialConfig)) {
      const cur = (current as Record<string, any>)[key];
      if (value != null && typeof value === "object" && !Array.isArray(value) && cur && typeof cur === "object" && !Array.isArray(cur)) {
        merged[key] = { ...cur, ...value };
      } else {
        merged[key] = value;
      }
    }

    const updated = { ...existing, tradeline: merged };
    await db.update(clientServices)
      .set({ metadata: updated, updated_at: new Date() })
      .where(eq(clientServices.id, clientServiceId));
    return tradelineConfigSchema.parse(merged);
  }

  async setTradeLineMode(clientServiceId: number, newMode: string, changedBy: string): Promise<TradelineModeLog> {
    const config = await this.getTradeLineConfig(clientServiceId) ?? tradelineConfigSchema.parse({});
    const oldMode = config.currentMode;

    // Update the config
    await this.updateTradeLineConfig(clientServiceId, { currentMode: newMode as TradelineConfig["currentMode"] });

    // Log the change
    const [log] = await db.insert(tradelineModeLog).values({
      client_service_id: clientServiceId,
      old_mode: oldMode,
      new_mode: newMode,
      changed_by: changedBy,
    }).returning();
    return log;
  }

  async createTradeLineCallLog(data: InsertTradelineCallLog): Promise<TradelineCallLog | null> {
    // Idempotent: skip if a row with the same vapi_call_id already exists
    const rows = await db.insert(tradelineCallLog).values(data)
      .onConflictDoNothing({ target: tradelineCallLog.vapi_call_id })
      .returning();
    return rows[0] ?? null;
  }

  async listTradeLineCalls(clientServiceId: number, limit = 50): Promise<TradelineCallLog[]> {
    return db.select().from(tradelineCallLog)
      .where(eq(tradelineCallLog.client_service_id, clientServiceId))
      .orderBy(desc(tradelineCallLog.created_at))
      .limit(limit);
  }

  async upsertTradeLineUsage(clientServiceId: number, periodStart: Date, periodEnd: Date): Promise<TradelineUsage> {
    // Try to find existing usage row for this period
    const [existing] = await db.select().from(tradelineUsage)
      .where(and(
        eq(tradelineUsage.client_service_id, clientServiceId),
        eq(tradelineUsage.period_start, periodStart),
      ))
      .limit(1);

    if (existing) {
      const [updated] = await db.update(tradelineUsage)
        .set({ updated_at: new Date() })
        .where(eq(tradelineUsage.id, existing.id))
        .returning();
      return updated;
    }

    const [row] = await db.insert(tradelineUsage).values({
      client_service_id: clientServiceId,
      period_start: periodStart,
      period_end: periodEnd,
    }).returning();
    return row;
  }

  async getTradeLineUsage(clientServiceId: number, periodStart?: Date): Promise<TradelineUsage | undefined> {
    if (periodStart) {
      const [row] = await db.select().from(tradelineUsage)
        .where(and(
          eq(tradelineUsage.client_service_id, clientServiceId),
          eq(tradelineUsage.period_start, periodStart),
        ))
        .limit(1);
      return row;
    }
    // Default: most recent period
    const [row] = await db.select().from(tradelineUsage)
      .where(eq(tradelineUsage.client_service_id, clientServiceId))
      .orderBy(desc(tradelineUsage.period_start))
      .limit(1);
    return row;
  }

  /* ═══════════════════════════════════════════
     RankFlow Vendor Batches
     ═══════════════════════════════════════════ */

  async createRankflowVendorBatch(data: InsertRankflowVendorBatch): Promise<RankflowVendorBatch> {
    const [row] = await db.insert(rankflowVendorBatches).values(data).returning();
    return row;
  }

  async getRankflowVendorBatch(batchId: number): Promise<RankflowVendorBatch | undefined> {
    const [row] = await db.select().from(rankflowVendorBatches).where(eq(rankflowVendorBatches.id, batchId)).limit(1);
    return row;
  }

  async listRankflowVendorBatches(filters?: { status?: string; vendor_type?: string }): Promise<RankflowVendorBatch[]> {
    const conditions = [];
    if (filters?.status) conditions.push(eq(rankflowVendorBatches.status, filters.status));
    if (filters?.vendor_type) conditions.push(eq(rankflowVendorBatches.vendor_type, filters.vendor_type));
    if (conditions.length > 0) {
      return db.select().from(rankflowVendorBatches)
        .where(and(...conditions))
        .orderBy(desc(rankflowVendorBatches.created_at));
    }
    return db.select().from(rankflowVendorBatches).orderBy(desc(rankflowVendorBatches.created_at));
  }

  async updateRankflowVendorBatchStatus(batchId: number, status: string, extra?: Record<string, any>): Promise<RankflowVendorBatch | undefined> {
    const updates: Record<string, any> = { status, updated_at: new Date(), ...extra };
    const [row] = await db.update(rankflowVendorBatches).set(updates).where(eq(rankflowVendorBatches.id, batchId)).returning();
    return row;
  }

  async submitRankflowVendorBatch(batchId: number, proofData: any): Promise<RankflowVendorBatch | undefined> {
    const [row] = await db.update(rankflowVendorBatches).set({
      status: "submitted",
      proof_data: proofData,
      submitted_at: new Date(),
      updated_at: new Date(),
    }).where(eq(rankflowVendorBatches.id, batchId)).returning();
    return row;
  }

  async linkTaskToBatch(taskId: number, batchId: number): Promise<void> {
    await db.update(rankflowTasks).set({ batch_id: batchId }).where(eq(rankflowTasks.id, taskId));
  }

  async listTasksByBatch(batchId: number): Promise<RankflowTask[]> {
    return db.select().from(rankflowTasks)
      .where(eq(rankflowTasks.batch_id, batchId))
      .orderBy(rankflowTasks.id);
  }

  async completeRankflowVendorBatch(batchId: number, actualCost?: string): Promise<RankflowVendorBatch | undefined> {
    const updates: Record<string, any> = {
      status: "completed",
      qa_status: "passed",
      completed_at: new Date(),
      updated_at: new Date(),
    };
    if (actualCost !== undefined) updates.actual_cost = actualCost;
    const [row] = await db.update(rankflowVendorBatches).set(updates).where(eq(rankflowVendorBatches.id, batchId)).returning();
    return row;
  }

  async listUnbatchedOutsourcedTasks(): Promise<RankflowTask[]> {
    return db.select().from(rankflowTasks).where(
      and(
        eq(rankflowTasks.execution_mode, "outsourced"),
        eq(rankflowTasks.status, "pending"),
        sql`${rankflowTasks.batch_id} IS NULL`,
      )
    );
  }

  async getVendorStats(vendorType?: string): Promise<{
    vendor_type: string;
    total_batches: number;
    completed: number;
    failed: number;
    avg_cost: number | null;
  }[]> {
    const rows = await db.select({
      vendor_type: rankflowVendorBatches.vendor_type,
      total_batches: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${rankflowVendorBatches.status} = 'completed')::int`,
      failed: sql<number>`count(*) filter (where ${rankflowVendorBatches.status} = 'failed')::int`,
      avg_cost: sql<number>`avg(${rankflowVendorBatches.actual_cost}::numeric)`,
    }).from(rankflowVendorBatches)
      .groupBy(rankflowVendorBatches.vendor_type);
    return rows.map(r => ({
      vendor_type: r.vendor_type,
      total_batches: r.total_batches,
      completed: r.completed,
      failed: r.failed,
      avg_cost: r.avg_cost ? Number(r.avg_cost) : null,
    }));
  }

  /* ═══════════════════════════════════════════
     RankFlow Tracking
     ═══════════════════════════════════════════ */

  async createKeywords(data: InsertRankflowKeyword[]): Promise<RankflowKeyword[]> {
    if (data.length === 0) return [];
    const rows = await db.insert(rankflowKeywords).values(data).returning();
    return rows;
  }

  async listKeywordsByClient(clientId: number): Promise<RankflowKeyword[]> {
    return db.select().from(rankflowKeywords)
      .where(eq(rankflowKeywords.client_id, clientId))
      .orderBy(desc(rankflowKeywords.priority));
  }

  async insertRankingRecord(data: InsertRankflowRanking): Promise<RankflowRanking> {
    const [row] = await db.insert(rankflowRankings).values(data).returning();
    return row;
  }

  async getLastRankingForKeyword(keywordId: number): Promise<RankflowRanking | undefined> {
    const [row] = await db.select().from(rankflowRankings)
      .where(eq(rankflowRankings.keyword_id, keywordId))
      .orderBy(desc(rankflowRankings.checked_at))
      .limit(1);
    return row;
  }

  async upsertPage(clientId: number, url: string, data: Partial<InsertRankflowPage>): Promise<RankflowPage> {
    const [existing] = await db.select().from(rankflowPages)
      .where(and(eq(rankflowPages.client_id, clientId), eq(rankflowPages.url, url)))
      .limit(1);
    if (existing) {
      const [updated] = await db.update(rankflowPages)
        .set(data)
        .where(eq(rankflowPages.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(rankflowPages)
      .values({ client_id: clientId, url, ...data } as InsertRankflowPage)
      .returning();
    return created;
  }

  async listPagesByClient(clientId: number): Promise<RankflowPage[]> {
    return db.select().from(rankflowPages)
      .where(eq(rankflowPages.client_id, clientId))
      .orderBy(desc(rankflowPages.created_at));
  }

  async updatePageIndexStatus(pageId: number, indexed: boolean): Promise<void> {
    await db.update(rankflowPages).set({ indexed, last_checked_at: new Date() }).where(eq(rankflowPages.id, pageId));
  }

  async upsertSignalSummary(clientId: number, data: Partial<InsertRankflowSignal>): Promise<RankflowSignal> {
    const [existing] = await db.select().from(rankflowSignals)
      .where(eq(rankflowSignals.client_id, clientId))
      .limit(1);
    if (existing) {
      const [updated] = await db.update(rankflowSignals)
        .set({ ...data, last_updated: new Date() })
        .where(eq(rankflowSignals.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(rankflowSignals)
      .values({ client_id: clientId, ...data } as InsertRankflowSignal)
      .returning();
    return created;
  }

  async getSignalSummary(clientId: number): Promise<RankflowSignal | undefined> {
    const [row] = await db.select().from(rankflowSignals)
      .where(eq(rankflowSignals.client_id, clientId))
      .limit(1);
    return row;
  }
  async listTradeLineModeChanges(clientServiceId: number, limit = 50): Promise<TradelineModeLog[]> {
    return db.select().from(tradelineModeLog)
      .where(eq(tradelineModeLog.client_service_id, clientServiceId))
      .orderBy(desc(tradelineModeLog.created_at))
      .limit(limit);
  }

  async incrementTradeLineUsage(
    clientServiceId: number,
    periodStart: Date,
    periodEnd: Date,
    increments: { voiceMinutes?: number; calls?: number; sms?: number },
  ): Promise<TradelineUsage> {
    // Ensure usage row exists
    const usage = await this.upsertTradeLineUsage(clientServiceId, periodStart, periodEnd);

    const newVoiceMinutes = (usage.voice_minutes_used ?? 0) + (increments.voiceMinutes ?? 0);
    const newCalls = (usage.calls_count ?? 0) + (increments.calls ?? 0);
    const newSms = (usage.sms_count ?? 0) + (increments.sms ?? 0);
    const includedMinutes = usage.included_minutes ?? 200;
    const overage = Math.max(0, newVoiceMinutes - includedMinutes);

    const [updated] = await db.update(tradelineUsage)
      .set({
        voice_minutes_used: newVoiceMinutes,
        calls_count: newCalls,
        sms_count: newSms,
        overage_minutes: overage,
        updated_at: new Date(),
      })
      .where(eq(tradelineUsage.id, usage.id))
      .returning();

    return updated;
  }

  /**
   * Calculate TradeLine profitability for a client service.
   * Uses current period usage data + service price.
   *
   * Cost rates (internal, not exposed to clients):
   *   Voice: $0.08/min  (Vapi + ElevenLabs + Deepgram blended)
   *   SMS:   $0.02/msg  (Twilio outbound)
   *   AI:    estimated from call count at ~$0.03/call (LLM tokens)
   */
  async getTradeLineProfitability(clientServiceId: number): Promise<{
    revenue: number;
    voiceCost: number;
    smsCost: number;
    aiCost: number;
    totalCost: number;
    profit: number;
    margin: number;
  }> {
    const COST_PER_VOICE_MINUTE = 8;   // cents
    const COST_PER_SMS = 2;            // cents
    const COST_PER_CALL_AI = 3;        // cents (avg LLM cost per call)

    const cs = await this.getClientServiceById(clientServiceId);
    const revenue = cs?.price_cents ?? 0;

    const usage = await this.getTradeLineUsage(clientServiceId);
    if (!usage) {
      return { revenue, voiceCost: 0, smsCost: 0, aiCost: 0, totalCost: 0, profit: revenue, margin: revenue > 0 ? 100 : 0 };
    }

    const voiceCost = (usage.voice_minutes_used ?? 0) * COST_PER_VOICE_MINUTE;
    const smsCost = (usage.sms_count ?? 0) * COST_PER_SMS;
    const aiCost = (usage.calls_count ?? 0) * COST_PER_CALL_AI;
    const totalCost = voiceCost + smsCost + aiCost;
    const profit = revenue - totalCost;
    const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;

      return { revenue, voiceCost, smsCost, aiCost, totalCost, profit, margin };
  }

  // ─── SocialSync ───

  async upsertSocialSyncProfile(data: InsertSocialSyncProfile): Promise<SocialSyncProfile> {
    const [row] = await db.insert(socialsyncProfiles).values(data)
      .onConflictDoUpdate({ target: socialsyncProfiles.client_id, set: { ...data, updated_at: new Date() } })
      .returning();
    return row;
  }

  async getSocialSyncProfile(clientId: number): Promise<SocialSyncProfile | undefined> {
    const [row] = await db.select().from(socialsyncProfiles)
      .where(eq(socialsyncProfiles.client_id, clientId))
      .limit(1);
    return row;
  }

  async createSocialSyncTopic(data: InsertSocialSyncTopic): Promise<SocialSyncTopic> {
    const [row] = await db.insert(socialsyncTopics).values(data).returning();
    return row;
  }

  async createSocialSyncTopics(data: InsertSocialSyncTopic[]): Promise<SocialSyncTopic[]> {
    if (data.length === 0) return [];
    return db.insert(socialsyncTopics).values(data).returning();
  }

  async listSocialSyncTopics(clientId: number, status?: string): Promise<SocialSyncTopic[]> {
    const conditions = [eq(socialsyncTopics.client_id, clientId)];
    if (status) conditions.push(eq(socialsyncTopics.status, status));
    return db.select().from(socialsyncTopics)
      .where(and(...conditions))
      .orderBy(desc(socialsyncTopics.created_at));
  }

  async updateSocialSyncTopic(id: number, updates: Partial<InsertSocialSyncTopic>): Promise<SocialSyncTopic | undefined> {
    const [row] = await db.update(socialsyncTopics)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(socialsyncTopics.id, id))
      .returning();
    return row;
  }

  async createSocialSyncPost(data: InsertSocialSyncPost): Promise<SocialSyncPost> {
    const [row] = await db.insert(socialsyncPosts).values(data).returning();
    return row;
  }

  async listSocialSyncPosts(clientId: number, opts: { status?: string; platform?: string; limit?: number; offset?: number } = {}): Promise<SocialSyncPost[]> {
    const { status, platform, limit = 50, offset = 0 } = opts;
    const conditions = [eq(socialsyncPosts.client_id, clientId)];
    if (status) conditions.push(eq(socialsyncPosts.status, status));
    if (platform) conditions.push(eq(socialsyncPosts.platform, platform));
    return db.select().from(socialsyncPosts)
      .where(and(...conditions))
      .orderBy(desc(socialsyncPosts.created_at))
      .limit(limit)
      .offset(offset);
  }

  async getSocialSyncPostById(id: number): Promise<SocialSyncPost | undefined> {
    const [row] = await db.select().from(socialsyncPosts)
      .where(eq(socialsyncPosts.id, id))
      .limit(1);
    return row;
  }

  async updateSocialSyncPost(id: number, updates: Partial<InsertSocialSyncPost>): Promise<SocialSyncPost | undefined> {
    const [row] = await db.update(socialsyncPosts)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(socialsyncPosts.id, id))
      .returning();
    return row;
  }

  async enqueueSocialSyncJob(data: InsertSocialSyncQueueItem): Promise<SocialSyncQueueItem> {
    const [row] = await db.insert(socialsyncPublishQueue).values(data).returning();
    return row;
  }

  async fetchDueSocialSyncJobs(limit = 20): Promise<SocialSyncQueueItem[]> {
    const now = new Date();
    return db.select().from(socialsyncPublishQueue)
      .where(and(
        eq(socialsyncPublishQueue.status, "pending"),
        lte(socialsyncPublishQueue.run_at, now),
        sql`${socialsyncPublishQueue.attempts} < ${socialsyncPublishQueue.max_attempts}`,
        sql`${socialsyncPublishQueue.locked_at} IS NULL`,
      ))
      .orderBy(socialsyncPublishQueue.run_at)
      .limit(limit);
  }

  async updateSocialSyncQueueItem(id: number, updates: Record<string, any>): Promise<void> {
    await db.update(socialsyncPublishQueue).set(updates).where(eq(socialsyncPublishQueue.id, id));
  }

  async listSocialSyncQueue(clientId: number): Promise<SocialSyncQueueItem[]> {
    return db.select().from(socialsyncPublishQueue)
      .where(eq(socialsyncPublishQueue.client_id, clientId))
      .orderBy(desc(socialsyncPublishQueue.created_at));
  }

  async createSocialSyncLog(data: InsertSocialSyncActivityLog): Promise<SocialSyncActivityLog> {
    const [row] = await db.insert(socialsyncActivityLogs).values(data).returning();
    return row;
  }

  async listSocialSyncLogs(clientId: number, limit = 50): Promise<SocialSyncActivityLog[]> {
    return db.select().from(socialsyncActivityLogs)
      .where(eq(socialsyncActivityLogs.client_id, clientId))
      .orderBy(desc(socialsyncActivityLogs.created_at))
      .limit(limit);
  }

  async upsertSocialSyncConnection(data: InsertSocialSyncConnection): Promise<SocialSyncConnection> {
    const existing = await db.select().from(socialsyncPlatformConnections)
      .where(and(
        eq(socialsyncPlatformConnections.client_id, data.client_id),
        eq(socialsyncPlatformConnections.platform, data.platform),
      ))
      .limit(1);
    if (existing.length > 0) {
      const [row] = await db.update(socialsyncPlatformConnections)
        .set({ ...data, updated_at: new Date() })
        .where(eq(socialsyncPlatformConnections.id, existing[0].id))
        .returning();
      return row;
    }
    const [row] = await db.insert(socialsyncPlatformConnections).values(data).returning();
    return row;
  }

  async listSocialSyncConnections(clientId: number): Promise<SocialSyncConnection[]> {
    return db.select().from(socialsyncPlatformConnections)
      .where(eq(socialsyncPlatformConnections.client_id, clientId))
      .orderBy(socialsyncPlatformConnections.platform);
  }

  async listEnabledSocialSyncProfiles(): Promise<SocialSyncProfile[]> {
    return db.select().from(socialsyncProfiles)
      .where(eq(socialsyncProfiles.enabled, true));
  }

  async listRecentSocialSyncPosts(clientId: number, limit = 30): Promise<SocialSyncPost[]> {
    return db.select().from(socialsyncPosts)
      .where(eq(socialsyncPosts.client_id, clientId))
      .orderBy(desc(socialsyncPosts.created_at))
      .limit(limit);
  }

  async listAllSocialSyncConnections(): Promise<SocialSyncConnection[]> {
    return db.select().from(socialsyncPlatformConnections)
      .where(sql`${socialsyncPlatformConnections.connection_status} IN ('connected', 'expiring_soon')`)
      .orderBy(socialsyncPlatformConnections.token_expires_at);
  }

  async fetchStaleSocialSyncLocks(thresholdMs: number): Promise<SocialSyncQueueItem[]> {
    const cutoff = new Date(Date.now() - thresholdMs);
    return db.select().from(socialsyncPublishQueue)
      .where(and(
        eq(socialsyncPublishQueue.status, "locked"),
        lte(socialsyncPublishQueue.locked_at, cutoff),
      ))
      .orderBy(socialsyncPublishQueue.locked_at)
      .limit(50);
  }

  // ─── Reviews ───

  async upsertReview(data: InsertReview): Promise<Review> {
    const existing = await this.getReviewByExternalId(data.client_id, data.platform, data.external_review_id);
    if (existing) {
      const [row] = await db.update(reviewsTable)
        .set({ ...data, updated_at: new Date() })
        .where(eq(reviewsTable.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(reviewsTable).values(data).returning();
    return row;
  }

  async listReviews(clientId: number, opts: { platform?: string; needsReply?: boolean; limit?: number } = {}): Promise<Review[]> {
    const { platform, needsReply, limit = 50 } = opts;
    const conditions = [eq(reviewsTable.client_id, clientId)];
    if (platform) conditions.push(eq(reviewsTable.platform, platform));
    if (needsReply !== undefined) conditions.push(eq(reviewsTable.needs_reply, needsReply));
    return db.select().from(reviewsTable)
      .where(and(...conditions))
      .orderBy(desc(reviewsTable.review_time))
      .limit(limit);
  }

  async getReviewByExternalId(clientId: number, platform: string, externalId: string): Promise<Review | undefined> {
    const [row] = await db.select().from(reviewsTable)
      .where(and(
        eq(reviewsTable.client_id, clientId),
        eq(reviewsTable.platform, platform),
        eq(reviewsTable.external_review_id, externalId),
      ))
      .limit(1);
    return row;
  }

  async updateReview(id: number, updates: Partial<InsertReview>): Promise<Review | undefined> {
    const [row] = await db.update(reviewsTable)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(reviewsTable.id, id))
      .returning();
    return row;
  }

  async createReviewSyncLog(data: InsertReviewSyncLog): Promise<ReviewSyncLog> {
    const [row] = await db.insert(reviewSyncLogs).values(data).returning();
    return row;
  }

  // ─── Review Requests ───

  async createReviewRequest(data: InsertReviewRequest): Promise<ReviewRequest> {
    const [row] = await db.insert(reviewRequests).values(data).returning();
    return row;
  }

  async findReviewRequestByIdempotencyKey(key: string): Promise<ReviewRequest | undefined> {
    const [row] = await db.select().from(reviewRequests)
      .where(eq(reviewRequests.idempotency_key, key))
      .limit(1);
    return row;
  }

  async getReviewRequestByDedupKey(key: string): Promise<ReviewRequest | undefined> {
    const [row] = await db.select().from(reviewRequests)
      .where(eq(reviewRequests.dedup_key, key))
      .limit(1);
    return row;
  }

  async getReviewRequestByToken(token: string): Promise<ReviewRequest | undefined> {
    const [row] = await db.select().from(reviewRequests)
      .where(eq(reviewRequests.access_token, token))
      .limit(1);
    return row;
  }

  async getReviewRequestById(id: number): Promise<ReviewRequest | undefined> {
    const [row] = await db.select().from(reviewRequests)
      .where(eq(reviewRequests.id, id))
      .limit(1);
    return row;
  }

  async fetchDueReviewRequests(limit = 20): Promise<ReviewRequest[]> {
    const now = new Date();
    return db.select().from(reviewRequests)
      .where(and(
        eq(reviewRequests.status, "pending"),
        lte(reviewRequests.run_at, now),
        sql`${reviewRequests.attempts} < ${reviewRequests.max_attempts}`,
      ))
      .orderBy(reviewRequests.run_at)
      .limit(limit);
  }

  async fetchDueReviewFollowups(limit = 20): Promise<ReviewRequest[]> {
    const now = new Date();
    return db.select().from(reviewRequests)
      .where(and(
        eq(reviewRequests.status, "sent"),
        sql`${reviewRequests.next_followup_at} IS NOT NULL`,
        lte(reviewRequests.next_followup_at, now),
        sql`${reviewRequests.sequence_step} < 2`,
      ))
      .orderBy(reviewRequests.next_followup_at)
      .limit(limit);
  }

  async updateReviewRequest(id: number, updates: Record<string, any>): Promise<ReviewRequest | undefined> {
    const [row] = await db.update(reviewRequests)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(reviewRequests.id, id))
      .returning();
    return row;
  }

  private buildReviewRequestConditions(opts: { clientId?: number; status?: string; triggerSource?: string; hasFeedback?: boolean; dueForFollowup?: boolean }) {
    const conditions = [];
    if (opts.clientId) conditions.push(eq(reviewRequests.client_id, opts.clientId));
    if (opts.status) conditions.push(eq(reviewRequests.status, opts.status));
    if (opts.triggerSource) conditions.push(eq(reviewRequests.trigger_source, opts.triggerSource));
    if (opts.hasFeedback === true) conditions.push(sql`${reviewRequests.internal_feedback} IS NOT NULL`);
    if (opts.hasFeedback === false) conditions.push(sql`${reviewRequests.internal_feedback} IS NULL`);
    if (opts.dueForFollowup) {
      conditions.push(eq(reviewRequests.status, "sent"));
      conditions.push(sql`${reviewRequests.next_followup_at} IS NOT NULL`);
      conditions.push(lte(reviewRequests.next_followup_at, new Date()));
      conditions.push(sql`${reviewRequests.sequence_step} < 2`);
    }
    return conditions.length ? and(...conditions) : undefined;
  }

  async listReviewRequests(clientId: number, limit?: number): Promise<ReviewRequest[]>;
  async listReviewRequests(opts?: { clientId?: number; status?: string; triggerSource?: string; hasFeedback?: boolean; dueForFollowup?: boolean; limit?: number; offset?: number }): Promise<ReviewRequest[]>;
  async listReviewRequests(
    clientIdOrOpts: number | { clientId?: number; status?: string; triggerSource?: string; hasFeedback?: boolean; dueForFollowup?: boolean; limit?: number; offset?: number } = {},
    limitArg?: number,
  ): Promise<ReviewRequest[]> {
    const opts = typeof clientIdOrOpts === "number"
      ? { clientId: clientIdOrOpts, limit: limitArg }
      : clientIdOrOpts;
    const { limit = 50, offset = 0 } = opts;
    const where = this.buildReviewRequestConditions(opts);
    return db.select().from(reviewRequests)
      .where(where)
      .orderBy(desc(reviewRequests.created_at))
      .limit(limit)
      .offset(offset);
  }

  async countReviewRequests(opts: { clientId?: number; status?: string; triggerSource?: string; hasFeedback?: boolean; dueForFollowup?: boolean } = {}): Promise<number> {
    const where = this.buildReviewRequestConditions(opts);
    const [row] = await db.select({ count: sql<number>`count(*)::int` })
      .from(reviewRequests)
      .where(where);
    return row?.count ?? 0;
  }

  async getReviewRequestStats(): Promise<{ total: number; pending: number; sent: number; clicked: number; routed_positive: number; routed_negative: number; feedback_captured: number; completed: number; failed: number; stopped: number; due_for_followup: number }> {
    const now = new Date();
    const [row] = await db.select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${reviewRequests.status} = 'pending')::int`,
      sent: sql<number>`count(*) filter (where ${reviewRequests.status} = 'sent')::int`,
      clicked: sql<number>`count(*) filter (where ${reviewRequests.status} = 'clicked')::int`,
      routed_positive: sql<number>`count(*) filter (where ${reviewRequests.status} = 'routed_positive')::int`,
      routed_negative: sql<number>`count(*) filter (where ${reviewRequests.status} = 'routed_negative')::int`,
      feedback_captured: sql<number>`count(*) filter (where ${reviewRequests.status} = 'feedback_captured')::int`,
      completed: sql<number>`count(*) filter (where ${reviewRequests.status} = 'completed')::int`,
      failed: sql<number>`count(*) filter (where ${reviewRequests.status} = 'failed')::int`,
      stopped: sql<number>`count(*) filter (where ${reviewRequests.status} = 'stopped')::int`,
      due_for_followup: sql<number>`count(*) filter (where ${reviewRequests.status} = 'sent' and ${reviewRequests.next_followup_at} is not null and ${reviewRequests.next_followup_at} <= ${now} and ${reviewRequests.sequence_step} < 2)::int`,
    }).from(reviewRequests);
    return row || { total: 0, pending: 0, sent: 0, clicked: 0, routed_positive: 0, routed_negative: 0, feedback_captured: 0, completed: 0, failed: 0, stopped: 0, due_for_followup: 0 };
  }

  async stopReviewRequestsForBooking(bookingId: number): Promise<void> {
    await db.update(reviewRequests)
      .set({ status: "stopped", updated_at: new Date() })
      .where(and(
        eq(reviewRequests.booking_id, bookingId),
        sql`${reviewRequests.status} IN ('pending', 'sent')`,
      ));
  }

  async findClientByUserId(userId: number): Promise<Client | undefined> {
    const [row] = await db.select().from(clients)
      .where(eq(clients.user_id, userId))
      .limit(1);
    return row;
  }

  // ═══════════════════════════════════════════════
  // Monitored Reviews
  // ═══════════════════════════════════════════════

  async upsertMonitoredReview(data: InsertMonitoredReview): Promise<{ review: MonitoredReview; isNew: boolean }> {
    // Check if already exists
    const existing = await this.findMonitoredReviewByDedupKey(data.dedup_key);
    if (existing) {
      // Update if response was added or review text changed
      const updates: Record<string, any> = { last_synced_at: new Date(), updated_at: new Date() };
      let changed = false;

      if (data.response_text && !existing.response_text) {
        updates.response_text = data.response_text;
        updates.response_date = data.response_date;
        updates.response_added = true;
        changed = true;
      }
      if (data.review_text && data.review_text !== existing.review_text) {
        updates.review_text = data.review_text;
        changed = true;
      }
      if (data.raw_payload) {
        updates.raw_payload = data.raw_payload;
      }
      // Backfill google_review_name if we now have it but didn't before
      if (data.google_review_name && !existing.google_review_name) {
        updates.google_review_name = data.google_review_name;
      }

      const [updated] = await db.update(monitoredReviews)
        .set(updates)
        .where(eq(monitoredReviews.id, existing.id))
        .returning();
      return { review: updated, isNew: false };
    }

    // Insert new
    const [row] = await db.insert(monitoredReviews).values(data).returning();
    return { review: row, isNew: true };
  }

  async getMonitoredReviewById(id: number): Promise<MonitoredReview | undefined> {
    const [row] = await db.select().from(monitoredReviews)
      .where(eq(monitoredReviews.id, id))
      .limit(1);
    return row;
  }

  async updateMonitoredReview(id: number, updates: Record<string, any>): Promise<MonitoredReview | undefined> {
    const [row] = await db.update(monitoredReviews)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(monitoredReviews.id, id))
      .returning();
    return row;
  }

  async findMonitoredReviewByDedupKey(dedupKey: string): Promise<MonitoredReview | undefined> {
    const [row] = await db.select().from(monitoredReviews)
      .where(eq(monitoredReviews.dedup_key, dedupKey))
      .limit(1);
    return row;
  }

  async listMonitoredReviews(opts: { clientId?: number; platform?: string; isNew?: boolean; minRating?: number; maxRating?: number; limit?: number; offset?: number } = {}): Promise<MonitoredReview[]> {
    const { clientId, platform, isNew, minRating, maxRating, limit = 50, offset = 0 } = opts;
    const conditions = [];
    if (clientId) conditions.push(eq(monitoredReviews.client_id, clientId));
    if (platform) conditions.push(eq(monitoredReviews.platform, platform));
    if (isNew !== undefined) conditions.push(eq(monitoredReviews.is_new, isNew));
    if (minRating) conditions.push(sql`${monitoredReviews.rating} >= ${minRating}`);
    if (maxRating) conditions.push(sql`${monitoredReviews.rating} <= ${maxRating}`);
    const where = conditions.length ? and(...conditions) : undefined;
    return db.select().from(monitoredReviews)
      .where(where)
      .orderBy(desc(monitoredReviews.published_at))
      .limit(limit).offset(offset);
  }

  async countMonitoredReviews(opts: { clientId?: number; isNew?: boolean } = {}): Promise<number> {
    const conditions = [];
    if (opts.clientId) conditions.push(eq(monitoredReviews.client_id, opts.clientId));
    if (opts.isNew !== undefined) conditions.push(eq(monitoredReviews.is_new, opts.isNew));
    const where = conditions.length ? and(...conditions) : undefined;
    const [row] = await db.select({ count: sql<number>`count(*)::int` })
      .from(monitoredReviews).where(where);
    return row?.count ?? 0;
  }

  async getMonitoredReviewStats(clientId?: number): Promise<{ total: number; averageRating: number; newCount: number; withResponse: number; byRating: Record<number, number> }> {
    const cond = clientId ? eq(monitoredReviews.client_id, clientId) : undefined;
    const [row] = await db.select({
      total: sql<number>`count(*)::int`,
      averageRating: sql<number>`coalesce(round(avg(${monitoredReviews.rating})::numeric, 2), 0)::float`,
      newCount: sql<number>`count(*) filter (where ${monitoredReviews.is_new} = true)::int`,
      withResponse: sql<number>`count(*) filter (where ${monitoredReviews.response_text} is not null)::int`,
      r1: sql<number>`count(*) filter (where ${monitoredReviews.rating} = 1)::int`,
      r2: sql<number>`count(*) filter (where ${monitoredReviews.rating} = 2)::int`,
      r3: sql<number>`count(*) filter (where ${monitoredReviews.rating} = 3)::int`,
      r4: sql<number>`count(*) filter (where ${monitoredReviews.rating} = 4)::int`,
      r5: sql<number>`count(*) filter (where ${monitoredReviews.rating} = 5)::int`,
    }).from(monitoredReviews).where(cond);
    return {
      total: row?.total ?? 0,
      averageRating: row?.averageRating ?? 0,
      newCount: row?.newCount ?? 0,
      withResponse: row?.withResponse ?? 0,
      byRating: { 1: row?.r1 ?? 0, 2: row?.r2 ?? 0, 3: row?.r3 ?? 0, 4: row?.r4 ?? 0, 5: row?.r5 ?? 0 },
    };
  }

  async markMonitoredReviewsAcknowledged(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await db.update(monitoredReviews)
      .set({ is_new: false, updated_at: new Date() })
      .where(sql`${monitoredReviews.id} = ANY(ARRAY[${sql.raw(ids.join(","))}]::int[])`);
  }

  async listClientsForReviewSync(limit = 20): Promise<Client[]> {
    return db.select().from(clients)
      .where(and(
        sql`(${clients.google_place_id} IS NOT NULL OR ${clients.facebook_page_url} IS NOT NULL)`,
        sql`${clients.status} IN ('active', 'onboarding')`,
      ))
      .orderBy(sql`${clients.last_review_sync_at} ASC NULLS FIRST`)
      .limit(limit);
  }

  async getClientReputationService(clientId: number): Promise<{ serviceId: string; status: string; metadata: any } | null> {
    const [row] = await db.select({
      serviceId: clientServices.service_id,
      status: clientServices.status,
      metadata: clientServices.metadata,
    }).from(clientServices)
      .where(and(
        eq(clientServices.client_id, clientId),
        sql`${clientServices.service_id} LIKE 'reputationshield-%'`,
        sql`${clientServices.status} IN ('active', 'onboarding', 'pending')`,
      ))
      .limit(1);
    return row ?? null;
  }

  async getClientByWidgetToken(token: string): Promise<Client | undefined> {
    const [row] = await db.select().from(clients)
      .where(eq(clients.widget_token, token))
      .limit(1);
    return row;
  }

  async ensureWidgetToken(clientId: number): Promise<string> {
    const [existing] = await db.select({ widget_token: clients.widget_token })
      .from(clients).where(eq(clients.id, clientId)).limit(1);
    if (existing?.widget_token) return existing.widget_token;
    const token = crypto.randomUUID().replace(/-/g, "");
    await db.update(clients).set({ widget_token: token, updated_at: new Date() })
      .where(eq(clients.id, clientId));
    return token;
  }

  async getWidgetReviews(clientId: number, minRating: number, limit: number): Promise<{ reviewer_name: string; rating: number; review_text: string | null; published_at: Date | null; platform: string }[]> {
    return db.select({
      reviewer_name: monitoredReviews.reviewer_name,
      rating: monitoredReviews.rating,
      review_text: monitoredReviews.review_text,
      published_at: monitoredReviews.published_at,
      platform: monitoredReviews.platform,
    }).from(monitoredReviews)
      .where(and(
        eq(monitoredReviews.client_id, clientId),
        sql`${monitoredReviews.rating} >= ${minRating}`,
        sql`${monitoredReviews.review_text} IS NOT NULL`,
        sql`length(${monitoredReviews.review_text}) > 10`,
      ))
      .orderBy(desc(monitoredReviews.published_at))
      .limit(limit);
  }

  async countReviewsMissingGoogleName(clientId?: number): Promise<number> {
    const conditions = [
      eq(monitoredReviews.platform, "google"),
      sql`${monitoredReviews.google_review_name} IS NULL`,
      sql`${monitoredReviews.response_text} IS NULL`,
    ];
    if (clientId) conditions.push(eq(monitoredReviews.client_id, clientId));
    const [row] = await db.select({ count: sql<number>`count(*)::int` })
      .from(monitoredReviews).where(and(...conditions));
    return row?.count ?? 0;
  }

  // ─── Service Costs ───

  async logServiceCost(data: InsertServiceCostLog): Promise<ServiceCostLog> {
    const [row] = await db.insert(serviceCostLogs).values(data).returning();
    return row;
  }

  async getServiceCosts(clientId: number, sinceDaysAgo = 30): Promise<ServiceCostLog[]> {
    const since = new Date(Date.now() - sinceDaysAgo * 24 * 60 * 60 * 1000);
    return db.select().from(serviceCostLogs)
      .where(and(
        eq(serviceCostLogs.client_id, clientId),
        gte(serviceCostLogs.created_at, since),
      ))
      .orderBy(desc(serviceCostLogs.created_at));
  }

  // ─── Sales Leads ───

  async createSalesLead(data: InsertSalesLead): Promise<SalesLead> {
    const [row] = await db.insert(salesLeads).values(data).returning();
    return row;
  }

  async listSalesLeads(status?: string): Promise<SalesLead[]> {
    const conditions = [];
    if (status) conditions.push(eq(salesLeads.status, status));
    const where = conditions.length ? and(...conditions) : undefined;
    return db.select().from(salesLeads).where(where).orderBy(desc(salesLeads.updated_at));
  }

  async updateSalesLead(id: number, updates: Partial<InsertSalesLead>): Promise<SalesLead | undefined> {
    const [row] = await db.update(salesLeads).set({ ...updates, updated_at: new Date() }).where(eq(salesLeads.id, id)).returning();
    return row;
  }

  async getSalesLeadById(id: number): Promise<SalesLead | undefined> {
    const [row] = await db.select().from(salesLeads).where(eq(salesLeads.id, id)).limit(1);
    return row;
  }

  // ─── ContentFlow: Drafts ───

  async createContentDraft(data: InsertContentDraft): Promise<ContentDraft> {
    const [row] = await db.insert(contentDrafts).values(data).returning();
    return row;
  }

  async getContentDraftById(id: number): Promise<ContentDraft | undefined> {
    const [row] = await db.select().from(contentDrafts).where(eq(contentDrafts.id, id)).limit(1);
    return row;
  }

  async getContentDraftBySocialPostId(postId: number): Promise<ContentDraft | undefined> {
    const [row] = await db.select().from(contentDrafts)
      .where(eq(contentDrafts.linked_social_post_id, postId))
      .limit(1);
    return row;
  }

  async getContentDraftByTaskId(taskId: number): Promise<ContentDraft | undefined> {
    const [row] = await db.select().from(contentDrafts)
      .where(eq(contentDrafts.linked_task_id, taskId))
      .limit(1);
    return row;
  }

  async listContentDrafts(opts: {
    client_id?: number;
    status?: string;
    surface?: string;
    kind?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ContentDraft[]> {
    const { client_id, status, surface, kind, limit = 50, offset = 0 } = opts;
    const conditions = [];
    if (client_id !== undefined) conditions.push(eq(contentDrafts.client_id, client_id));
    if (status) conditions.push(eq(contentDrafts.status, status));
    if (surface) conditions.push(eq(contentDrafts.surface, surface));
    if (kind) conditions.push(eq(contentDrafts.kind, kind));
    const where = conditions.length ? and(...conditions) : undefined;
    return db.select().from(contentDrafts)
      .where(where)
      .orderBy(desc(contentDrafts.created_at))
      .limit(limit)
      .offset(offset);
  }

  async updateContentDraft(id: number, updates: Partial<InsertContentDraft>): Promise<ContentDraft | undefined> {
    const [row] = await db.update(contentDrafts)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(contentDrafts.id, id))
      .returning();
    return row;
  }

  /**
   * Sprint 5: find approved RankFlow article drafts whose
   * metadata.wordpress.queue_status = 'queued' and whose scheduled_for
   * is null OR has elapsed. Ordered by scheduled_for ASC NULLS FIRST so
   * un-scheduled drafts (immediate publish) drain before timed ones.
   *
   * Drafts already containing a wordpress.post_id are excluded as a
   * defence-in-depth against duplicate publishes — the worker also
   * self-checks, but pre-filtering at the SQL layer is cheaper.
   */
  async findQueuedWordpressDrafts(opts: { limit?: number; now?: Date } = {}): Promise<ContentDraft[]> {
    const { limit = 10, now = new Date() } = opts;
    return db.select().from(contentDrafts)
      .where(and(
        eq(contentDrafts.status, "approved"),
        eq(contentDrafts.kind, "article"),
        eq(contentDrafts.surface, "rankflow"),
        sql`${contentDrafts.metadata}->'wordpress'->>'queue_status' = 'queued'`,
        sql`(${contentDrafts.metadata}->'wordpress'->>'scheduled_for' IS NULL
             OR (${contentDrafts.metadata}->'wordpress'->>'scheduled_for')::timestamptz <= ${now.toISOString()}::timestamptz)`,
        sql`${contentDrafts.metadata}->'wordpress'->>'post_id' IS NULL`,
      ))
      .orderBy(sql`(${contentDrafts.metadata}->'wordpress'->>'scheduled_for')::timestamptz ASC NULLS FIRST`)
      .limit(limit);
  }

  /**
   * Sprint 8: atomic claim. Picks the next eligible draft, marks it
   * `publishing` + stamps `locked_at`/`locked_by`, all in a single
   * row-locked statement. SKIP LOCKED so concurrent workers never
   * pick the same row.
   *
   * Eligibility:
   *   - status='approved', kind='article', surface='rankflow'
   *   - metadata.wordpress.queue_status='queued'
   *   - scheduled_for IS NULL or elapsed
   *   - post_id IS NULL (defence-in-depth — never re-publish)
   *   - locked_at IS NULL OR older than the stale threshold (10 min)
   *     so a crashed worker's claim auto-recovers.
   *
   * Returns the claimed row (now in `publishing` state) or null if
   * the queue is empty or every eligible row is locked by another
   * worker.
   */
  async claimNextPublishJob(workerId: string, opts: { now?: Date; staleLockMs?: number } = {}): Promise<ContentDraft | null> {
    const now = opts.now ?? new Date();
    const staleMs = opts.staleLockMs ?? 10 * 60_000;
    const staleCutoff = new Date(now.getTime() - staleMs).toISOString();
    const result: any = await db.execute(sql`
      UPDATE content_drafts
      SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'wordpress',
            COALESCE(metadata->'wordpress', '{}'::jsonb) || jsonb_build_object(
              'queue_status', 'publishing',
              'locked_at',    ${now.toISOString()}::text,
              'locked_by',    ${workerId}::text,
              'last_attempt_at', ${now.toISOString()}::text
            )
          ),
          updated_at = NOW()
      WHERE id = (
        SELECT id FROM content_drafts
        WHERE status = 'approved'
          AND kind = 'article'
          AND surface = 'rankflow'
          AND metadata->'wordpress'->>'queue_status' = 'queued'
          AND (metadata->'wordpress'->>'scheduled_for' IS NULL
               OR (metadata->'wordpress'->>'scheduled_for')::timestamptz <= ${now.toISOString()}::timestamptz)
          AND metadata->'wordpress'->>'post_id' IS NULL
          AND (metadata->'wordpress'->>'locked_at' IS NULL
               OR (metadata->'wordpress'->>'locked_at')::timestamptz < ${staleCutoff}::timestamptz)
        ORDER BY (metadata->'wordpress'->>'scheduled_for')::timestamptz ASC NULLS FIRST, id ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);
    const rows: ContentDraft[] = (result?.rows ?? result) as ContentDraft[];
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  /**
   * Sprint 8: recover claims abandoned by a crashed worker. Returns
   * `publishing` rows whose `locked_at` is older than the stale
   * threshold back to `queued` so the next tick can re-claim. Bumps
   * attempts (so genuinely-broken jobs still hit the dead-letter
   * ceiling). Idempotent — safe to call every tick.
   */
  async recoverStalePublishClaims(opts: { now?: Date; staleLockMs?: number } = {}): Promise<number> {
    const now = opts.now ?? new Date();
    const staleMs = opts.staleLockMs ?? 10 * 60_000;
    const staleCutoff = new Date(now.getTime() - staleMs).toISOString();
    const result: any = await db.execute(sql`
      UPDATE content_drafts
      SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'wordpress',
            COALESCE(metadata->'wordpress', '{}'::jsonb) || jsonb_build_object(
              'queue_status', 'queued',
              'locked_at',  NULL::text,
              'locked_by',  NULL::text,
              'attempts',   COALESCE((metadata->'wordpress'->>'attempts')::int, 0) + 1,
              'last_error', 'recovered from stale lock'
            )
          ),
          updated_at = NOW()
      WHERE status = 'approved'
        AND kind = 'article'
        AND surface = 'rankflow'
        AND metadata->'wordpress'->>'queue_status' = 'publishing'
        AND metadata->'wordpress'->>'locked_at' IS NOT NULL
        AND (metadata->'wordpress'->>'locked_at')::timestamptz < ${staleCutoff}::timestamptz
      RETURNING id
    `);
    const rows: any[] = (result?.rows ?? result) as any[];
    return Array.isArray(rows) ? rows.length : 0;
  }

  // ─── ContentFlow: Approvals ───

  async createContentApproval(data: InsertContentApproval): Promise<ContentApproval> {
    const [row] = await db.insert(contentApprovals).values(data).returning();
    return row;
  }

  async listContentApprovals(draftId: number): Promise<ContentApproval[]> {
    return db.select().from(contentApprovals)
      .where(eq(contentApprovals.draft_id, draftId))
      .orderBy(desc(contentApprovals.created_at));
  }

  // ─── ContentFlow: Assets ───

  async createContentAsset(data: InsertContentAsset): Promise<ContentAsset> {
    const [row] = await db.insert(contentAssets).values(data).returning();
    return row;
  }

  async getContentAssetById(id: number): Promise<ContentAsset | undefined> {
    const [row] = await db.select().from(contentAssets).where(eq(contentAssets.id, id)).limit(1);
    return row;
  }

  async listContentAssets(clientId: number): Promise<ContentAsset[]> {
    return db.select().from(contentAssets)
      .where(eq(contentAssets.client_id, clientId))
      .orderBy(desc(contentAssets.created_at));
  }

  /**
   * Test/dev only — hard-delete a ContentFlow draft + its approvals and
   * optionally the linked SocialSync post. Intended for Sprint 1
   * verification scripts; never call from product code.
   *
   * Order is explicit: approvals → draft → post. The socialsync_posts
   * FK to content_drafts is ON DELETE SET NULL so the draft can be
   * removed before the post without a constraint violation.
   */
  async deleteContentDraftCascade(
    draftId: number,
    postId?: number,
  ): Promise<{ deleted_draft: boolean; deleted_approvals: number; deleted_post: boolean }> {
    const draft = await this.getContentDraftById(draftId);
    const approvalsBefore = draft ? await this.listContentApprovals(draftId) : [];

    if (approvalsBefore.length > 0) {
      await db.delete(contentApprovals).where(eq(contentApprovals.draft_id, draftId));
    }

    let deleted_draft = false;
    if (draft) {
      await db.delete(contentDrafts).where(eq(contentDrafts.id, draftId));
      deleted_draft = true;
    }

    const targetPostId = postId ?? draft?.linked_social_post_id ?? null;
    let deleted_post = false;
    if (targetPostId) {
      await db.delete(socialsyncPosts).where(eq(socialsyncPosts.id, targetPostId));
      deleted_post = true;
    }

    return {
      deleted_draft,
      deleted_approvals: approvalsBefore.length,
      deleted_post,
    };
  }
}

export const storage = new DatabaseStorage();
