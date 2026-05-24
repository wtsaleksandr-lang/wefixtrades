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
  systemAlerts, emailQueue,
  type SystemAlert, type InsertSystemAlert,
  type EmailQueueItem, type InsertEmailQueue,
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
  reviewRequestSuppression, reviewResponseEdits,
  googleBusinessLocations,
  type GoogleLocation, type InsertGoogleLocation,
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
  contentflowSettings,
  type ContentflowSettings,
  // Routing Events
  routingEvents,
  type RoutingEvent, type InsertRoutingEvent,
  // AdFlow Reports
  adflowReports,
  type AdflowReport, type InsertAdflowReport,
  // Calendar Connections
  calendarConnections,
  type CalendarConnection, type InsertCalendarConnection,
  // Vapi Webhook Events
  vapiWebhookEvents,
  type VapiWebhookEventRow, type InsertVapiWebhookEvent,
  // Brand-availability singleton (operating-brand "are we available" toggle)
  brandAvailability,
  type BrandAvailability,
  // Product drafts (Q28)
  productDrafts,
  type ProductDraft, type InsertProductDraft,
} from "@shared/schema";
import { eq, desc, sql, and, gte, lte, ilike, or, isNotNull, count } from "drizzle-orm";
import { QUOTEQUICK_PLAN_REVENUE_CENTS } from "@shared/pricing";
import { createLogger } from "./lib/logger";
import { kickoffMapguardService } from "./services/mapguardTaskEngine";
import { extractPlaceId } from "@shared/utils/googlePlaceId";
import { fireSetupCompletionUpsell } from "./services/mapguardUpsell";

/**
 * Normalise a client write that may set google_place_id from a pasted
 * Google Maps URL. Mutates a shallow copy and never throws.
 *  - Clean ChIJ id → kept verbatim
 *  - Maps URL with `place_id:` param or data-segment hex pair → cleaned
 *  - Short / CID / unrecognised URLs → kept as-is so the value isn't
 *    silently dropped; downstream API calls will surface the error.
 */
function sanitizeClientPlaceId<T extends { google_place_id?: string | null }>(data: T): T {
  if (!data || typeof data.google_place_id !== "string") return data;
  const { placeId, reason } = extractPlaceId(data.google_place_id);
  if (placeId && placeId !== data.google_place_id) {
    return { ...data, google_place_id: placeId };
  }
  if (!placeId && reason && reason !== "already_clean" && reason !== "empty") {
    log.warn(`[storage] google_place_id appears malformed (reason=${reason}); storing as-provided`);
  }
  return data;
}

const log = createLogger("Storage");

/**
 * Phase-2.1: fire MapGuard kickoff whenever a MapGuard client_service
 * becomes active, regardless of which code path got it there. The kickoff
 * itself is idempotent via clientServices.metadata.mapguard_kickoff_at,
 * so safe to call multiple times. Never throws.
 */
async function fireMapguardKickoffIfActive(
  clientServiceId: number,
): Promise<void> {
  try {
    const [cs] = await db.select({
      id: clientServices.id,
      client_id: clientServices.client_id,
      service_id: clientServices.service_id,
      status: clientServices.status,
      enabled: clientServices.enabled,
    }).from(clientServices).where(eq(clientServices.id, clientServiceId)).limit(1);
    if (!cs) return;
    if (!cs.service_id?.startsWith("mapguard")) return;
    if (cs.status !== "active" || cs.enabled !== true) return;
    await kickoffMapguardService(cs.client_id, cs.id, cs.service_id);
  } catch (err: any) {
    log.warn("MapGuard kickoff hook failed", { clientServiceId, error: err.message });
  }
}

/**
 * WebCareOpsRow — one row per active WebCare client_service, surfaced on
 * the admin /admin/crm/webcare/ops page. Composes data already written by
 * the webcare workers (health worker writes uptime_history + last
 * downtime alert; maintenance worker writes last_plugin_update, last
 * health report, monthly_report, uptime_percent). Read-only.
 */
export interface WebCareOpsRow {
  client_service_id: number;
  client_id: number;
  business_name: string;
  website_url: string | null;
  service_id: string;                      // webcare-basic | webcare-pro
  plan_tier: "basic" | "pro" | "unknown";
  cs_status: string;                       // active | paused | …
  /** Last uptime check from uptime_history (null if no checks yet). */
  last_uptime_check: { ts: string; status: "up" | "down"; http_status: number | null } | null;
  /** Rolling uptime percent over the last 30 days of checks (null if no history). */
  uptime_percent_30d: number | null;
  /** Last successful monthly plugin-update sweep timestamp. */
  last_plugin_update_at: string | null;
  /** Last monthly health check timestamp (from maintenance worker). */
  last_health_check_at: string | null;
  /** Content automation status — Pro tier only, null otherwise. */
  content_automation: { last_published_at: string | null; published_this_month: number } | null;
  /** Last downtime alert sent (4h cooldown marker from health worker). */
  last_downtime_alert_at: string | null;
}

/* Q-shell: per-product KPI rollup returned by getProductStats(). Drives the
   4-card KPI strip on <AdminProductPageShell>. Aggregations come from
   client_services rows filtered by service_id. churn_rate_30d is
   cancellations / (active + cancellations) over the last 30 days. */
export interface ProductStats {
  mrr_cents: number;
  active_subs: number;
  paused_subs: number;
  cancelled_30d: number;
  new_subs_30d: number;
  churn_rate_30d: number;
}

export interface IStorage {
  createCalculator(data: InsertCalculator): Promise<Calculator>;
  getCalculatorById(id: number): Promise<Calculator | undefined>;
  getCalculatorBySlug(slug: string): Promise<Calculator | undefined>;
  getCalculatorByToken(token: string): Promise<Calculator | undefined>;
  updateCalculator(id: number, updates: Partial<InsertCalculator>): Promise<Calculator | undefined>;
  duplicateCalculator(id: number, newSlug: string, newToken: string, newExpiry: Date): Promise<Calculator | undefined>;
  getCalculatorByOldSlug(oldSlug: string): Promise<Calculator | undefined>;
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
  getQuoteQuickLeadTrend(days: number): Promise<Array<{ date: string; count: number }>>;
  findCalculatorByStripeSubscriptionId(subscriptionId: string): Promise<Calculator | undefined>;
  markLeadReplied(leadId: number): Promise<Lead | undefined>;
  upsertAnalyticsSummary(data: InsertAnalyticsSummary): Promise<AnalyticsSummary>;
  getAnalyticsSummary(calculatorId: number): Promise<AnalyticsSummary | undefined>;
  getDailyEventCounts(calculatorId: number, date: Date): Promise<{ views: number; leads: number; quotes: number }>;
  getBestDay(calculatorId: number, since: Date): Promise<string | null>;

  createJobLog(data: InsertJobLog): Promise<JobLog>;
  updateJobLog(id: number, updates: Partial<InsertJobLog>): Promise<void>;

  getLeadById(id: number): Promise<Lead | undefined>;
  updateLeadStatus(id: number, status: string): Promise<Lead | undefined>;
  updateLead(id: number, updates: Record<string, any>): Promise<Lead | undefined>;

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
  listRecentBookings(limit?: number): Promise<Booking[]>;
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
  getUserByGoogleSub(googleSub: string): Promise<User | undefined>;
  updateUser(id: number, updates: Partial<Pick<InsertUser, 'name' | 'email' | 'role'>>): Promise<User | undefined>;
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
  getServiceById(serviceId: string): Promise<ServiceCatalogRow | undefined>;
  updateServiceCatalog(id: string, updates: Partial<InsertServiceCatalog>): Promise<ServiceCatalogRow | undefined>;
  listServicesWithClientCounts(): Promise<(ServiceCatalogRow & { active_client_count: number })[]>;
  /* Q-shell: per-product KPI rollup for <AdminProductPageShell>. */
  getProductStats(serviceId: string): Promise<ProductStats>;

  // Product drafts (Q28)
  getLatestProductDraft(serviceId: string): Promise<ProductDraft | undefined>;
  upsertProductDraft(data: Omit<InsertProductDraft, "status">): Promise<ProductDraft>;
  publishProductDraft(draftId: number, serviceId: string, draftData: Record<string, any>, publishedBy: number | null): Promise<ServiceCatalogRow>;
  addProductDraftApprover(draftId: number, userId: number, email: string | null): Promise<ProductDraft | undefined>;
  rejectProductDraft(draftId: number, rejectedBy: number | null, reason: string | null): Promise<ProductDraft>;

  // Client services
  listClientServices(clientId: number): Promise<(ClientService & { service_name?: string })[]>;
  listSubscribersForService(serviceId: string): Promise<Array<ClientService & { client_name: string; contact_email: string | null }>>;
  createClientService(data: InsertClientService): Promise<ClientService>;
  updateClientService(id: number, updates: Partial<InsertClientService>): Promise<ClientService | undefined>;
  deleteClientService(id: number): Promise<ClientService | undefined>;
  getActiveServiceCount(): Promise<number>;

  // WebCare admin oversight — read-only per-client roll-up of WebCare state
  listWebCareOpsRows(): Promise<WebCareOpsRow[]>;

  // Orders
  listOrders(clientId?: number, limit?: number, offset?: number): Promise<Order[]>;
  createOrder(data: InsertOrder): Promise<Order>;
  createOrderItem(data: InsertOrderItem): Promise<OrderItem>;

  // Suppliers
  listSuppliers(): Promise<Supplier[]>;
  getSupplierById(id: number): Promise<Supplier | undefined>;
  getSupplierTasks(supplierId: number): Promise<FulfillmentTask[]>;
  createSupplier(data: InsertSupplier): Promise<Supplier>;
  updateSupplier(id: number, updates: Partial<InsertSupplier>): Promise<Supplier | undefined>;
  listSuppliersForService(serviceId: string): Promise<Supplier[]>;
  setSupplierServiceAssignment(supplierId: number, serviceId: string, assigned: boolean): Promise<Supplier | undefined>;
  setSupplierServiceCost(supplierId: number, serviceId: string, cost: { cost_cents: number; cost_type?: string } | null): Promise<Supplier | undefined>;

  // Fulfillment
  listFulfillmentTasks(opts?: { clientId?: number; status?: string; limit?: number; offset?: number }): Promise<(FulfillmentTask & { client_name?: string; supplier_name?: string; service_name?: string })[]>;
  listQaQueueTasks(): Promise<(FulfillmentTask & { client_name?: string; service_name?: string })[]>;
  getFulfillmentTask(id: number): Promise<(FulfillmentTask & { client_name?: string; supplier_name?: string; service_name?: string }) | undefined>;
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
  updateInternalNote(id: number, updates: Partial<InsertInternalNote>): Promise<InternalNote | undefined>;
  deleteInternalNote(id: number): Promise<boolean>;

  // Activity log
  logAdminActivity(data: InsertAdminActivityLog): Promise<AdminActivityLog>;
  listAdminActivity(opts?: {
    entityType?: string;
    entityId?: number;
    actorType?: string;
    actionLike?: string;
    q?: string;
    since?: Date;
    until?: Date;
    cursor?: number;
    limit?: number;
  }): Promise<AdminActivityLog[]>;

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

  // ─── Review-request suppression (DNC) ───
  isReviewRequestSuppressed(clientId: number, customerEmail: string | null, customerPhone: string | null): Promise<boolean>;
  addReviewRequestSuppression(data: {
    client_id: number;
    customer_email?: string | null;
    customer_phone?: string | null;
    reason?: string;
    source?: string;
    suppressed_by?: number | null;
    metadata?: any;
  }): Promise<{ id: number }>;
  listReviewRequestSuppression(clientId: number, opts?: { limit?: number; offset?: number }): Promise<Array<{
    id: number;
    customer_email: string | null;
    customer_phone: string | null;
    reason: string | null;
    source: string;
    created_at: Date | null;
  }>>;
  removeReviewRequestSuppression(clientId: number, id: number): Promise<boolean>;

  // ─── Rate-limit counters for review-request sends ───
  /**
   * Count successful review-request sends for this client today (UTC),
   * optionally filtered by channel. Used by the service layer to enforce
   * a per-client daily send cap (cost protection).
   */
  countReviewRequestSendsToday(clientId: number, channel?: "sms" | "email"): Promise<number>;

  // ─── Multi-location Google Business Profile ───
  listGoogleLocations(clientId: number): Promise<GoogleLocation[]>;
  addGoogleLocation(data: InsertGoogleLocation): Promise<GoogleLocation>;
  updateGoogleLocation(id: number, updates: Partial<InsertGoogleLocation>): Promise<GoogleLocation | undefined>;
  setPrimaryGoogleLocation(clientId: number, locationId: number): Promise<boolean>;
  removeGoogleLocation(clientId: number, locationId: number): Promise<boolean>;

  // ─── Response edit audit ───
  appendReviewResponseEdit(data: {
    monitored_review_id: number;
    edited_by?: number | null;
    edit_kind: string;
    old_text?: string | null;
    new_text?: string | null;
    reason?: string | null;
    metadata?: any;
  }): Promise<{ id: number }>;
  listReviewResponseEdits(monitoredReviewId: number): Promise<Array<{
    id: number;
    edited_by: number | null;
    edit_kind: string;
    old_text: string | null;
    new_text: string | null;
    reason: string | null;
    created_at: Date | null;
  }>>;

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
  setTradeLineMode(clientServiceId: number, newMode: string, changedBy: string, reason?: string): Promise<TradelineModeLog>;
  createTradeLineCallLog(data: InsertTradelineCallLog): Promise<TradelineCallLog | null>;
  listTradeLineCalls(clientServiceId: number, limit?: number): Promise<TradelineCallLog[]>;
  getTradeLineCallById(callId: number): Promise<TradelineCallLog | undefined>;
  listAllTradeLineCalls(filters: { clientId?: number; from?: Date; to?: Date; outcome?: string; limit?: number; offset?: number }): Promise<{ calls: (TradelineCallLog & { business_name: string; client_id: number })[]; total: number }>;
  listTradeLineFleet(): Promise<Array<{ clientServiceId: number; clientId: number; businessName: string; serviceId: string; status: string; variant: string; mode: string; assistantStatus: string; lastCallAt: string | null; periodMinutes: number; failedCalls24h: number }>>;
  upsertTradeLineUsage(clientServiceId: number, periodStart: Date, periodEnd: Date): Promise<TradelineUsage>;
  getTradeLineUsage(clientServiceId: number, periodStart?: Date): Promise<TradelineUsage | undefined>;
  listTradeLineModeChanges(clientServiceId: number, limit?: number): Promise<TradelineModeLog[]>;
  incrementTradeLineUsage(clientServiceId: number, periodStart: Date, periodEnd: Date, increments: { voiceMinutes?: number; calls?: number; sms?: number }): Promise<TradelineUsage>;
  findClientServiceByVapiPhoneNumberId(vapiPhoneNumberId: string): Promise<number | null>;
  findClientServiceByPrimaryBusinessNumber(phoneNumber: string): Promise<number | null>;
  updateTradeLineCallLeadData(callLogId: number, leadData: Record<string, unknown>): Promise<void>;

  // ─── Vapi Webhook Events ───
  createVapiWebhookEvent(data: InsertVapiWebhookEvent): Promise<VapiWebhookEventRow>;
  listVapiWebhookEvents(limit?: number): Promise<VapiWebhookEventRow[]>;

  // Brand-availability singleton
  getBrandAvailability(): Promise<BrandAvailability>;
  setBrandAvailability(input: { is_available: boolean; away_message?: string; set_by_user_id?: number | null }): Promise<BrandAvailability>;

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

  // ─── Routing Events (Phase 1) ───
  createRoutingEvent(data: InsertRoutingEvent): Promise<RoutingEvent>;
  /**
   * System-resolve active/snoozed events for an (entity, queue) key.
   * `ruleName` is optional — when set, only events created by that
   * rule are resolved. Necessary when multiple rules can write to the
   * same queue (e.g. mapguard_scan_failed and mapguard_serper_outage
   * both write to ops_attention) and we don't want one rule's
   * resolution to clear the other rule's still-valid event.
   */
  systemResolveRoutingEvent(entityType: string, entityId: number, queue: string, ruleName?: string): Promise<void>;
  adminAcknowledgeRoutingEvent(id: number, userId: number): Promise<RoutingEvent | undefined>;
  listQueueItems(queue: string, limit?: number): Promise<RoutingEvent[]>;
  /**
   * Most-recent admin_acknowledged event for an (entity, queue) key.
   * The routing worker uses this to apply the per-queue requeue policy:
   * an acknowledged event is terminal for its instance, but if the
   * underlying condition still holds past the queue's threshold a
   * fresh active event must fire. Returns undefined when no
   * acknowledged event has ever existed for that key.
   */
  getLastAcknowledgedRoutingEvent(
    entityType: string,
    entityId: number,
    queue: string,
    ruleName?: string,
  ): Promise<RoutingEvent | undefined>;

  // ─── AdFlow Reports History ───
  createAdflowReport(data: InsertAdflowReport): Promise<AdflowReport>;
  listAdflowReports(clientServiceId: number, limit?: number): Promise<AdflowReport[]>;
  getAdflowReport(id: number): Promise<AdflowReport | undefined>;

  // ─── Calendar Connections (Booking Engine) ───
  getCalendarConnection(clientId: number): Promise<CalendarConnection | undefined>;
  listCalendarConnections(clientId?: number): Promise<CalendarConnection[]>;
  createCalendarConnection(data: InsertCalendarConnection): Promise<CalendarConnection>;
  updateCalendarConnection(id: number, updates: Partial<InsertCalendarConnection>): Promise<CalendarConnection | undefined>;
  deleteCalendarConnection(id: number): Promise<CalendarConnection | undefined>;

  // ─── Profit Overview ───
  getProfitOverview(): Promise<{
    services: Array<{
      service_id: string;
      name: string;
      billing_period: string;
      sale_price: number;
      cost_amount: number;
      margin_cents: number;
      margin_percent: number;
      active_clients: number;
      delivered_count: number;
      monthly_revenue: number;
      monthly_cost: number;
      monthly_profit: number;
    }>;
    totals: {
      monthly_revenue: number;
      monthly_cost: number;
      monthly_profit: number;
      overall_margin_percent: number;
    };
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

  async getCalculatorByOldSlug(oldSlug: string): Promise<Calculator | undefined> {
    // Search for a calculator that has this slug in its _slug_redirects metadata.
    //
    // Wave Q-Hotfix — the previous version dropped the `jsonb_typeof` guard.
    // When any row had `calculator_settings._slug_redirects` as null or as a
    // non-array (e.g. legacy rows pre-slug-redirect feature), the bare
    // `@> [...]::jsonb` containment check threw and bubbled out as HTTP 500
    // from the /api/calculators/lookup endpoint, killing the hosted-page
    // feature entirely. The typeof guard short-circuits rows that don't
    // have an array there so the containment runs only on safe shapes.
    const results = await db.select().from(calculators)
      .where(sql`
        jsonb_typeof(${calculators.calculator_settings}::jsonb -> '_slug_redirects') = 'array'
        AND ${calculators.calculator_settings}::jsonb -> '_slug_redirects' @> ${JSON.stringify([{ slug: oldSlug }])}::jsonb
      `)
      .limit(1);
    return results[0];
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
      calculator_settings: calculators.calculator_settings,
    }).from(calculators).orderBy(desc(calculators.created_at));

    const PLAN_REVENUE = QUOTEQUICK_PLAN_REVENUE_CENTS;
    const QQ_COST_CENTS = 500;

    const results = [];
    for (const calc of allCalcs) {
      const deploy = await this.getDeploymentStatus(calc.id);
      const [leadRow] = await db.select({ count: sql<number>`count(*)::int` })
        .from(leads).where(eq(leads.calculator_id, calc.id));
      const tier = (calc.plan_tier as string) ?? 'free';
      const settings = (calc.calculator_settings as any) || {};
      results.push({
        ...calc,
        total_leads: leadRow?.count ?? 0,
        status: deploy?.status ?? 'draft',
        price_cents: PLAN_REVENUE[tier] ?? 0,
        cost_cents: tier === 'free' ? 0 : QQ_COST_CENTS,
        // Lead email notifications are on unless explicitly disabled.
        notifications_enabled: settings?.followup?.notifications?.email_enabled !== false,
      });
    }
    return results;
  }

  /**
   * Daily lead counts across all QuoteQuick calculators for the last N days.
   * Returns a continuous series (days with no leads are filled with 0) so the
   * admin trend chart has no gaps.
   */
  async getQuoteQuickLeadTrend(days: number): Promise<Array<{ date: string; count: number }>> {
    const span = Math.max(1, Math.min(days, 365));
    const cutoff = new Date(Date.now() - (span - 1) * 86400000);
    cutoff.setHours(0, 0, 0, 0);

    const rows = await db.select({
      day: sql<string>`to_char(date_trunc('day', ${leads.created_date}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
      .from(leads)
      .where(gte(leads.created_date, cutoff))
      .groupBy(sql`date_trunc('day', ${leads.created_date})`);

    const byDay = new Map(rows.map((r) => [r.day, r.count]));
    const series: Array<{ date: string; count: number }> = [];
    for (let i = 0; i < span; i++) {
      const d = new Date(cutoff.getTime() + i * 86400000);
      const key = d.toISOString().slice(0, 10);
      series.push({ date: key, count: byDay.get(key) ?? 0 });
    }
    return series;
  }

  async findCalculatorByStripeSubscriptionId(subscriptionId: string): Promise<Calculator | undefined> {
    const [calc] = await db.select().from(calculators)
      .where(eq(calculators.stripe_subscription_id, subscriptionId))
      .limit(1);
    return calc;
  }

  async markLeadReplied(leadId: number): Promise<Lead | undefined> {
    const [lead] = await db.update(leads)
      .set({ replied_at: new Date() })
      .where(eq(leads.id, leadId))
      .returning();
    return lead;
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

  async updateLead(id: number, updates: Record<string, any>): Promise<Lead | undefined> {
    const [lead] = await db.update(leads).set(updates).where(eq(leads.id, id)).returning();
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

  async listRecentBookings(limit: number = 100): Promise<Booking[]> {
    return db.select().from(bookings)
      .orderBy(desc(bookings.date), desc(bookings.time))
      .limit(limit);
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
        log.error(`[storage] Review request trigger failed for booking ${id}:`, err.message);
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

  async getUserByGoogleSub(googleSub: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.google_sub, googleSub)).limit(1);
    return user;
  }

  async updateUser(id: number, updates: Partial<Pick<InsertUser, 'name' | 'email' | 'role'>>): Promise<User | undefined> {
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
    const sanitized = sanitizeClientPlaceId(data);
    const [row] = await db.insert(clients).values(sanitized).returning();
    return row;
  }

  async updateClient(id: number, updates: Partial<InsertClient>): Promise<Client | undefined> {
    const sanitized = sanitizeClientPlaceId(updates);
    const [row] = await db.update(clients).set({ ...sanitized, updated_at: new Date() }).where(eq(clients.id, id)).returning();
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

  async updateServiceCatalog(id: string, updates: Partial<InsertServiceCatalog>): Promise<ServiceCatalogRow | undefined> {
    const [row] = await db.update(serviceCatalog)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(serviceCatalog.id, id))
      .returning();
    return row;
  }

  async listServicesWithClientCounts(): Promise<(ServiceCatalogRow & { active_client_count: number })[]> {
    const rows = await db.select({
      id: serviceCatalog.id,
      name: serviceCatalog.name,
      tagline: serviceCatalog.tagline,
      description: serviceCatalog.description,
      category: serviceCatalog.category,
      default_price: serviceCatalog.default_price,
      billing_period: serviceCatalog.billing_period,
      delivery_pattern: serviceCatalog.delivery_pattern,
      is_active: serviceCatalog.is_active,
      hidden: serviceCatalog.hidden,
      stripe_product_id: serviceCatalog.stripe_product_id,
      stripe_price_id: serviceCatalog.stripe_price_id,
      stripe_yearly_price_id: serviceCatalog.stripe_yearly_price_id,
      cost_amount: serviceCatalog.cost_amount,
      cost_type: serviceCatalog.cost_type,
      sort_order: serviceCatalog.sort_order,
      created_at: serviceCatalog.created_at,
      updated_at: serviceCatalog.updated_at,
      active_client_count: sql<number>`count(case when ${clientServices.status} = 'active' then 1 end)::int`,
    })
    .from(serviceCatalog)
    .leftJoin(clientServices, eq(serviceCatalog.id, clientServices.service_id))
    .groupBy(serviceCatalog.id)
    .orderBy(serviceCatalog.sort_order);
    return rows as any;
  }

  /* Q-shell: per-product KPI rollup. Aggregated from client_services where
     service_id matches. enabled=false rows are excluded from MRR / active
     counts so admins toggling a single subscription off don't inflate
     paused. churn_rate_30d denominator is active + cancelled_30d to avoid
     division-by-zero and produce a meaningful "of customers who could have
     churned, this many did" ratio. */
  async getProductStats(serviceId: string): Promise<ProductStats> {
    /* Regression-fix (PR fix/admin-stats-cards-loading): service_catalog rows
       are seeded at tier granularity (e.g. "adflow-starter", "adflow-growth",
       "adflow-pro") — there is no bare "adflow" row. The shell pages pass the
       product-family id ("adflow", "contentflow", etc.). Aggregate over any
       client_services row whose service_id equals the bare id OR starts with
       `${id}-`. LIKE-escape the bare id so a future product literal like
       "ad_flow" wouldn't blow up. */
    const escaped = serviceId.replace(/[%_\\]/g, "\\$&");
    const prefixPattern = `${escaped}-%`;
    const result = await db.execute(sql`
      SELECT
        COALESCE(SUM(price_cents) FILTER (WHERE status != 'cancelled' AND enabled), 0) AS mrr_cents,
        COUNT(*) FILTER (WHERE status = 'active' AND enabled) AS active_subs,
        COUNT(*) FILTER (WHERE status = 'paused' AND enabled) AS paused_subs,
        COUNT(*) FILTER (WHERE cancelled_at IS NOT NULL AND cancelled_at > NOW() - INTERVAL '30 days') AS cancelled_30d,
        COUNT(*) FILTER (WHERE started_at IS NOT NULL AND started_at > NOW() - INTERVAL '30 days') AS new_subs_30d
      FROM client_services
      WHERE service_id = ${serviceId}
         OR service_id LIKE ${prefixPattern} ESCAPE '\\'
    `);
    const row: any = (result as any).rows?.[0] ?? {};
    const mrr_cents = Number(row.mrr_cents ?? 0);
    const active_subs = Number(row.active_subs ?? 0);
    const paused_subs = Number(row.paused_subs ?? 0);
    const cancelled_30d = Number(row.cancelled_30d ?? 0);
    const new_subs_30d = Number(row.new_subs_30d ?? 0);
    const denom = active_subs + cancelled_30d;
    const churn_rate_30d = denom > 0 ? cancelled_30d / denom : 0;
    return { mrr_cents, active_subs, paused_subs, cancelled_30d, new_subs_30d, churn_rate_30d };
  }

  // ─── Product Drafts (Q28) ───

  async getLatestProductDraft(serviceId: string): Promise<ProductDraft | undefined> {
    const [row] = await db.select().from(productDrafts)
      .where(eq(productDrafts.service_id, serviceId))
      .orderBy(desc(productDrafts.created_at))
      .limit(1);
    return row;
  }

  async upsertProductDraft(data: Omit<InsertProductDraft, "status">): Promise<ProductDraft> {
    // If there's an existing draft (status='draft'), update it. Otherwise insert new.
    // Published or rejected drafts are immutable history — a new draft creates a new row.
    const existing = await this.getLatestProductDraft(data.service_id);
    if (existing && existing.status === "draft") {
      const [row] = await db.update(productDrafts)
        .set({
          draft_data: data.draft_data,
          notes: data.notes ?? null,
          created_by: data.created_by ?? null,
          created_by_email: data.created_by_email ?? null,
          updated_at: new Date(),
        })
        .where(eq(productDrafts.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(productDrafts).values({
      ...data,
      status: "draft",
    }).returning();
    return row;
  }

  /** Multi-approver workflow: idempotent add of an approver to a draft.
   *  Returns the updated draft. If the user is already in the approvers
   *  list, the existing entry is preserved (no duplicate). */
  async addProductDraftApprover(draftId: number, userId: number, email: string | null): Promise<ProductDraft | undefined> {
    const [existing] = await db.select().from(productDrafts).where(eq(productDrafts.id, draftId)).limit(1);
    if (!existing) return undefined;
    const current = (existing.approvers as Array<{ user_id: number; email: string | null; approved_at: string }> | null) ?? [];
    if (current.some((a) => a.user_id === userId)) return existing;
    const next = [...current, { user_id: userId, email, approved_at: new Date().toISOString() }];
    const [row] = await db.update(productDrafts)
      .set({ approvers: next, updated_at: new Date() })
      .where(eq(productDrafts.id, draftId))
      .returning();
    return row;
  }

  async publishProductDraft(draftId: number, serviceId: string, draftData: Record<string, any>, publishedBy: number | null): Promise<ServiceCatalogRow> {
    // Atomic-ish: update serviceCatalog with draft values, then mark draft as published.
    // Drizzle doesn't expose a clean txn helper here in this codebase, so we run sequentially.
    // If the second write fails, the catalog is updated but the draft still says 'draft' —
    // the next publish call would no-op since the row is already updated. Acceptable for v1.
    const updates: Partial<InsertServiceCatalog> = {};
    const ALLOWED = ["name", "tagline", "description", "default_price", "billing_period", "category", "tiers", "features", "stripe_product_id", "stripe_price_id", "stripe_yearly_price_id", "automation_config"] as const;
    for (const k of ALLOWED) {
      if (k in draftData) (updates as any)[k] = draftData[k];
    }
    if (Object.keys(updates).length === 0) {
      throw new Error("No publishable fields in draft");
    }

    /* Snapshot the existing row BEFORE we mutate, so we can diff
     * old-vs-new and only push to Stripe what actually changed. */
    const [prevRow] = await db.select().from(serviceCatalog).where(eq(serviceCatalog.id, serviceId)).limit(1);

    const [updatedRow] = await db.update(serviceCatalog)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(serviceCatalog.id, serviceId))
      .returning();

    /* Push parent-product changes to Stripe (best-effort, non-throwing).
     * - name/description change → stripe.products.update
     * - default_price change    → stripe.prices.create + archive old,
     *   then UPDATE service_catalog.stripe_price_id with the new ID
     * - yearly mirror: when monthly price changes, recompute yearly
     *   amount via monthlyToYearlyCents() and create matching Stripe
     *   yearly price.
     * If STRIPE_SECRET_KEY isn't configured, helpers no-op silently
     * (e.g. in test env). Logged via createLogger("stripe-product-sync").
     */
    if (prevRow) {
      const { syncProductMetadata, syncProductPrice, monthlyToYearlyCents } = await import("./services/stripeProductSync");
      const stripeProductId = (updatedRow.stripe_product_id as string | null) ?? (prevRow.stripe_product_id as string | null);
      // W-AU-2: detect a stripe_product_id swap so we can push the current
      // name/description to the newly-linked Stripe Product even if those
      // fields didn't change this publish.
      const stripeProductIdChanged =
        typeof updates.stripe_product_id === "string" &&
        updates.stripe_product_id !== prevRow.stripe_product_id;

      if (stripeProductId) {
        const newName = (updates.name as string | undefined) ?? undefined;
        const newDescription = (updates.tagline as string | undefined) ?? (updates.description as string | undefined) ?? undefined;
        const nameChanged = typeof newName === "string" && newName !== prevRow.name;
        const descChanged = typeof newDescription === "string" && newDescription !== (prevRow.tagline ?? prevRow.description);
        if (nameChanged || descChanged || stripeProductIdChanged) {
          // On a stripe_product_id swap, fall back to the LIVE row's name/description so
          // the new Stripe Product reflects current copy even if this publish didn't touch them.
          const pushName = nameChanged ? newName : stripeProductIdChanged ? (updatedRow.name as string | undefined) : undefined;
          const pushDescription = descChanged
            ? newDescription
            : stripeProductIdChanged
              ? ((updatedRow.tagline as string | undefined) ?? (updatedRow.description as string | undefined))
              : undefined;
          await syncProductMetadata({
            stripeProductId,
            newName: pushName,
            newDescription: pushDescription,
          });
        }

        // Price diff. default_price is in cents in our schema.
        const newPriceCents = updates.default_price as number | undefined;
        const billingPeriod = (updates.billing_period ?? prevRow.billing_period) as string | undefined;
        if (typeof newPriceCents === "number" && newPriceCents !== prevRow.default_price) {
          const period: "monthly" | "yearly" | "one_time" =
            billingPeriod === "one-time" ? "one_time" : "monthly";

          const priceResult = await syncProductPrice({
            serviceCatalogId: serviceId,
            stripeProductId,
            oldStripePriceId: prevRow.stripe_price_id as string | null,
            newAmountCents: newPriceCents,
            period,
          });
          if (priceResult.ok && priceResult.newStripePriceId) {
            await db.update(serviceCatalog)
              .set({ stripe_price_id: priceResult.newStripePriceId, updated_at: new Date() })
              .where(eq(serviceCatalog.id, serviceId));
          }

          // Yearly mirror — only for monthly products
          if (period === "monthly") {
            const yearlyResult = await syncProductPrice({
              serviceCatalogId: serviceId,
              stripeProductId,
              oldStripePriceId: prevRow.stripe_yearly_price_id as string | null,
              newAmountCents: monthlyToYearlyCents(newPriceCents),
              period: "yearly",
            });
            if (yearlyResult.ok && yearlyResult.newStripeYearlyPriceId) {
              await db.update(serviceCatalog)
                .set({ stripe_yearly_price_id: yearlyResult.newStripeYearlyPriceId, updated_at: new Date() })
                .where(eq(serviceCatalog.id, serviceId));
            }
          }
        }
      }
    }

    /* Q5f: mirror parent.tiers entries to the matching per-tier
     * serviceCatalog sibling rows. The public-checkout + portal-subscribe
     * paths read per-tier rows directly (mapguard-basic, tradeline-starter
     * etc) — without this mirror, admin edits to the parent's tiers jsonb
     * never reach the prices customers actually pay. Match by tier id; if
     * a tier id in the jsonb doesn't have a matching sibling row, log and
     * skip (admin needs to insert the row out-of-band first). */
    if (Array.isArray(updates.tiers)) {
      const { syncProductMetadata, syncProductPrice, monthlyToYearlyCents } = await import("./services/stripeProductSync");
      for (const t of updates.tiers as Array<{
        id: string;
        name?: string;
        price_cents?: number;
        billing_period?: "monthly" | "one-time";
        stripe_price_id?: string | null;
      }>) {
        if (!t?.id) continue;
        const [siblingPrev] = await db.select().from(serviceCatalog).where(eq(serviceCatalog.id, t.id)).limit(1);
        if (!siblingPrev) {
          log.warn("[publishProductDraft] tier id has no sibling row — skipped", { parent: serviceId, tier_id: t.id });
          continue;
        }
        // Drizzle update accepts any subset of the table columns; the
        // insert schema omits updated_at, so we use a broader record type.
        const siblingUpdate: Record<string, unknown> = { updated_at: new Date() };
        if (typeof t.name === "string") siblingUpdate.name = t.name;
        if (typeof t.price_cents === "number") siblingUpdate.default_price = t.price_cents;
        if (t.billing_period === "monthly" || t.billing_period === "one-time") {
          siblingUpdate.billing_period = t.billing_period;
        }
        if (t.stripe_price_id === null || typeof t.stripe_price_id === "string") {
          siblingUpdate.stripe_price_id = t.stripe_price_id;
        }
        // Only write if there's at least one field beyond updated_at.
        if (Object.keys(siblingUpdate).length > 1) {
          await db.update(serviceCatalog)
            .set(siblingUpdate)
            .where(eq(serviceCatalog.id, t.id));
        }

        /* Stripe sync for this tier row (mirrors the parent-product logic above).
         * Reads `stripe_product_id` from the sibling row itself — each per-tier
         * row keeps its own Stripe Product binding. */
        const tierStripeProductId = siblingPrev.stripe_product_id as string | null;
        if (tierStripeProductId) {
          // Name change → stripe.products.update
          if (typeof t.name === "string" && t.name !== siblingPrev.name) {
            await syncProductMetadata({ stripeProductId: tierStripeProductId, newName: t.name });
          }
          // Price change → new Stripe Price + archive old + persist new id
          if (typeof t.price_cents === "number" && t.price_cents !== siblingPrev.default_price) {
            const period: "monthly" | "yearly" | "one_time" =
              ((t.billing_period ?? siblingPrev.billing_period) === "one-time") ? "one_time" : "monthly";
            const priceResult = await syncProductPrice({
              serviceCatalogId: t.id,
              stripeProductId: tierStripeProductId,
              oldStripePriceId: siblingPrev.stripe_price_id as string | null,
              newAmountCents: t.price_cents,
              period,
            });
            if (priceResult.ok && priceResult.newStripePriceId) {
              await db.update(serviceCatalog)
                .set({ stripe_price_id: priceResult.newStripePriceId, updated_at: new Date() })
                .where(eq(serviceCatalog.id, t.id));
            }
            if (period === "monthly") {
              const yearlyResult = await syncProductPrice({
                serviceCatalogId: t.id,
                stripeProductId: tierStripeProductId,
                oldStripePriceId: siblingPrev.stripe_yearly_price_id as string | null,
                newAmountCents: monthlyToYearlyCents(t.price_cents),
                period: "yearly",
              });
              if (yearlyResult.ok && yearlyResult.newStripeYearlyPriceId) {
                await db.update(serviceCatalog)
                  .set({ stripe_yearly_price_id: yearlyResult.newStripeYearlyPriceId, updated_at: new Date() })
                  .where(eq(serviceCatalog.id, t.id));
              }
            }
          }
        }
      }
    }

    await db.update(productDrafts)
      .set({ status: "published", published_at: new Date(), published_by: publishedBy, updated_at: new Date() })
      .where(eq(productDrafts.id, draftId));
    return updatedRow;
  }

  async rejectProductDraft(draftId: number, rejectedBy: number | null, reason: string | null): Promise<ProductDraft> {
    const [row] = await db.update(productDrafts)
      .set({ status: "rejected", rejected_by: rejectedBy, rejected_at: new Date(), rejection_reason: reason, updated_at: new Date() })
      .where(eq(productDrafts.id, draftId))
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
    // Phase-2.1: fire MapGuard kickoff if the new row is already active.
    if (row?.status === "active" && row?.enabled === true) {
      await fireMapguardKickoffIfActive(row.id);
    }
    return row;
  }

  /**
   * Per-client roll-up of WebCare state for the admin oversight panel
   * (/admin/crm/webcare/ops). Read-only — purely composes data already
   * written by the webcare health + maintenance workers into
   * client_services.metadata. No new storage; no mutation.
   */
  async listWebCareOpsRows(): Promise<WebCareOpsRow[]> {
    const rows = await db
      .select({
        cs_id: clientServices.id,
        cs_client_id: clientServices.client_id,
        cs_service_id: clientServices.service_id,
        cs_status: clientServices.status,
        cs_metadata: clientServices.metadata,
        client_business_name: clients.business_name,
        client_website_url: clients.website_url,
      })
      .from(clientServices)
      .innerJoin(clients, eq(clientServices.client_id, clients.id))
      .where(
        and(
          sql`${clientServices.service_id} LIKE 'webcare%'`,
          eq(clientServices.enabled, true),
          // Include both active + paused so admins can see the paused ones —
          // exclude only cancelled/completed which carry no live signal.
          sql`${clientServices.status} NOT IN ('cancelled', 'completed')`,
        ),
      )
      .orderBy(desc(clientServices.updated_at));

    return rows.map((r): WebCareOpsRow => {
      const meta = (r.cs_metadata as Record<string, any>) || {};
      const history = Array.isArray(meta.uptime_history) ? meta.uptime_history : [];
      const lastEntry = history.length > 0 ? history[history.length - 1] : null;

      // Last 30 days = ~30 * 96 entries at 15-min intervals — same window
      // the maintenance worker uses for its uptime_percent calc.
      const recent = history.slice(-2880);
      const upCount = recent.filter((h: any) => h.status === "up").length;
      const uptimePercent = recent.length > 0 ? Math.round((upCount / recent.length) * 1000) / 10 : null;

      const tier: "basic" | "pro" | "unknown" =
        r.cs_service_id === "webcare-pro" ? "pro" :
        r.cs_service_id === "webcare-basic" ? "basic" :
        "unknown";

      // Content automation tracking — Pro tier only. The content worker
      // stamps metadata.last_content_published_at + a per-month counter.
      const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
      const contentCounts = (meta.content_published_by_month as Record<string, number>) || {};
      const contentAutomation = tier === "pro" ? {
        last_published_at: meta.last_content_published_at || null,
        published_this_month: contentCounts[monthKey] ?? 0,
      } : null;

      return {
        client_service_id: r.cs_id,
        client_id: r.cs_client_id,
        business_name: r.client_business_name,
        website_url: r.client_website_url,
        service_id: r.cs_service_id,
        plan_tier: tier,
        cs_status: r.cs_status,
        last_uptime_check: lastEntry ? {
          ts: lastEntry.ts,
          status: lastEntry.status,
          http_status: lastEntry.http_status ?? null,
        } : null,
        uptime_percent_30d: uptimePercent,
        last_plugin_update_at: meta.last_plugin_update?.checked_at ?? null,
        last_health_check_at: meta.last_health_report?.checked_at ?? meta.last_maintenance_at ?? null,
        content_automation: contentAutomation,
        last_downtime_alert_at: meta.last_downtime_alert_at ?? null,
      };
    });
  }

  async updateClientService(id: number, updates: Partial<InsertClientService>): Promise<ClientService | undefined> {
    const [row] = await db.update(clientServices).set({ ...updates, updated_at: new Date() }).where(eq(clientServices.id, id)).returning();
    // Phase-2.1: fire MapGuard kickoff if this update brought the service to active.
    if (row?.status === "active" && row?.enabled === true) {
      await fireMapguardKickoffIfActive(row.id);
    }
    return row;
  }

  /**
   * Hard-delete a client_service row. Many tables (mapguardPosts, contentflow,
   * tradeline configs, fulfillment tasks, etc.) reference this row via
   * client_service_id without ON DELETE CASCADE, so the underlying DB will
   * raise a foreign-key error if any dependent rows exist. The caller is
   * expected to translate that into a 409 with a useful message.
   */
  async deleteClientService(id: number): Promise<ClientService | undefined> {
    const [row] = await db.delete(clientServices).where(eq(clientServices.id, id)).returning();
    return row;
  }

  /** Q28e: subscriber roster — every client_service row for a given service id. */
  async listSubscribersForService(serviceId: string): Promise<Array<ClientService & { client_name: string; contact_email: string | null }>> {
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
      completed_at: clientServices.completed_at,
      cancelled_at: clientServices.cancelled_at,
      automation_enabled: clientServices.automation_enabled,
      human_review_required: clientServices.human_review_required,
      metadata: clientServices.metadata,
      created_at: clientServices.created_at,
      updated_at: clientServices.updated_at,
      client_name: clients.business_name,
      contact_email: clients.contact_email,
    })
      .from(clientServices)
      .innerJoin(clients, eq(clientServices.client_id, clients.id))
      .where(eq(clientServices.service_id, serviceId))
      .orderBy(desc(clientServices.created_at));
    return rows;
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

  async getSupplierById(id: number): Promise<Supplier | undefined> {
    const [row] = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
    return row;
  }

  async getSupplierTasks(supplierId: number): Promise<FulfillmentTask[]> {
    return db.select().from(fulfillmentTasks)
      .where(eq(fulfillmentTasks.supplier_id, supplierId))
      .orderBy(desc(fulfillmentTasks.created_at));
  }

  async createSupplier(data: InsertSupplier): Promise<Supplier> {
    const [row] = await db.insert(suppliers).values(data).returning();
    return row;
  }

  async updateSupplier(id: number, updates: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    const [row] = await db.update(suppliers).set({ ...updates, updated_at: new Date() }).where(eq(suppliers.id, id)).returning();
    return row;
  }

  /** Q28d: suppliers whose supported_services jsonb array contains the given service id. */
  async listSuppliersForService(serviceId: string): Promise<Supplier[]> {
    // jsonb @> '["service_id"]' returns true when the array contains the value.
    return db.select().from(suppliers)
      .where(sql`${suppliers.supported_services} @> ${JSON.stringify([serviceId])}::jsonb`)
      .orderBy(suppliers.name);
  }

  /** Q28h: set or clear a per-service cost override on a supplier. Pass null cost_cents to clear. */
  async setSupplierServiceCost(
    supplierId: number,
    serviceId: string,
    cost: { cost_cents: number; cost_type?: string } | null,
  ): Promise<Supplier | undefined> {
    const existing = await this.getSupplierById(supplierId);
    if (!existing) return undefined;
    const current = (existing.service_cost_overrides as Record<string, any> | null) ?? {};
    const next = { ...current };
    if (cost === null) {
      if (!(serviceId in next)) return existing; // no-op
      delete next[serviceId];
    } else {
      next[serviceId] = { cost_cents: cost.cost_cents, ...(cost.cost_type ? { cost_type: cost.cost_type } : {}) };
    }
    const [row] = await db.update(suppliers)
      .set({ service_cost_overrides: Object.keys(next).length === 0 ? null : next, updated_at: new Date() })
      .where(eq(suppliers.id, supplierId))
      .returning();
    return row;
  }

  /** Q28d: add or remove a service id from a supplier's supported_services array. */
  async setSupplierServiceAssignment(supplierId: number, serviceId: string, assigned: boolean): Promise<Supplier | undefined> {
    const existing = await this.getSupplierById(supplierId);
    if (!existing) return undefined;
    const current = (existing.supported_services as string[] | null) ?? [];
    let next: string[];
    if (assigned) {
      if (current.includes(serviceId)) return existing; // no-op
      next = [...current, serviceId];
    } else {
      if (!current.includes(serviceId)) return existing; // no-op
      next = current.filter((id) => id !== serviceId);
    }
    const [row] = await db.update(suppliers)
      .set({ supported_services: next, updated_at: new Date() })
      .where(eq(suppliers.id, supplierId))
      .returning();
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

  async listQaQueueTasks(): Promise<(FulfillmentTask & { client_name?: string; service_name?: string })[]> {
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
      deliverables: fulfillmentTasks.deliverables,
      metadata: fulfillmentTasks.metadata,
      created_at: fulfillmentTasks.created_at,
      updated_at: fulfillmentTasks.updated_at,
      client_name: clients.business_name,
      service_name: serviceCatalog.name,
    })
    .from(fulfillmentTasks)
    .leftJoin(clients, eq(fulfillmentTasks.client_id, clients.id))
    .leftJoin(clientServices, eq(fulfillmentTasks.client_service_id, clientServices.id))
    .leftJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .where(eq(fulfillmentTasks.status, "qa_review"))
    .orderBy(fulfillmentTasks.due_at, fulfillmentTasks.created_at);
    return rows as any;
  }

  async getFulfillmentTask(id: number): Promise<(FulfillmentTask & { client_name?: string; supplier_name?: string; service_name?: string }) | undefined> {
    const [row] = await db.select({
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
      deliverables: fulfillmentTasks.deliverables,
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
    .where(eq(fulfillmentTasks.id, id))
    .limit(1);
    return row as any;
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

  /** Edit a note in place. Only the writable surface (content + pinned)
   *  may be patched — author_id, client_id, actor_type stay immutable so
   *  the audit trail of who originally wrote the note is preserved. */
  async updateInternalNote(id: number, updates: Partial<InsertInternalNote>): Promise<InternalNote | undefined> {
    const patch: Partial<InsertInternalNote> = {};
    if (updates.content !== undefined) patch.content = updates.content;
    if (updates.pinned !== undefined) patch.pinned = updates.pinned;
    if (Object.keys(patch).length === 0) {
      const [existing] = await db.select().from(internalNotes).where(eq(internalNotes.id, id));
      return existing;
    }
    const [row] = await db.update(internalNotes).set(patch).where(eq(internalNotes.id, id)).returning();
    return row;
  }

  /** Hard-delete a note. Returns true if a row was removed. The current
   *  schema has no soft-delete column so this is permanent. */
  async deleteInternalNote(id: number): Promise<boolean> {
    const rows = await db.delete(internalNotes).where(eq(internalNotes.id, id)).returning();
    return rows.length > 0;
  }

  // ─── Activity Log ───
  async logAdminActivity(data: InsertAdminActivityLog): Promise<AdminActivityLog> {
    const [row] = await db.insert(adminActivityLog).values(data).returning();
    /* Push to any connected admin sockets so audit-log views and
     * dashboards update without a full refetch. Real-time pushes
     * are advisory — the page should still load fine via REST if
     * Socket.IO is down. The dynamic import avoids a hard cycle
     * between storage and the realtime module. */
    try {
      const { broadcastToAdmins } = await import("./realtime");
      broadcastToAdmins("admin.activity.new", { activity: row });
    } catch {
      /* swallow — realtime is best-effort */
    }
    return row;
  }

  async listAdminActivity(opts: {
    entityType?: string;
    entityId?: number;
    /** Filter to a single actor kind: human | ai_agent | system. */
    actorType?: string;
    /** Substring match against the action column (e.g. "fulfillment" matches "fulfillment.assigned"). */
    actionLike?: string;
    /** Free-text search applied to summary + actor_name. */
    q?: string;
    /** Inclusive lower bound on created_at. */
    since?: Date;
    /** Inclusive upper bound on created_at. */
    until?: Date;
    /** Keyset cursor — return rows with id < cursor. */
    cursor?: number;
    limit?: number;
  } = {}): Promise<AdminActivityLog[]> {
    const { entityType, entityId, actorType, actionLike, q, since, until, cursor, limit = 50 } = opts;
    const conditions = [];
    if (entityType) conditions.push(eq(adminActivityLog.entity_type, entityType));
    if (entityId) conditions.push(eq(adminActivityLog.entity_id, entityId));
    if (actorType) conditions.push(eq(adminActivityLog.actor_type, actorType));
    if (actionLike) conditions.push(ilike(adminActivityLog.action, `%${actionLike}%`));
    if (q) {
      const pat = `%${q}%`;
      conditions.push(or(ilike(adminActivityLog.summary, pat), ilike(adminActivityLog.actor_name, pat))!);
    }
    if (since) conditions.push(gte(adminActivityLog.created_at, since));
    if (until) conditions.push(lte(adminActivityLog.created_at, until));
    if (cursor) conditions.push(sql`${adminActivityLog.id} < ${cursor}`);
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
    if (row) return row;
    // W-AZ-2: tier-level template missing → fall back to product-family template.
    // Closes the MapGuard / ReputationShield / SocialSync gap where tier SKUs
    // (e.g. `mapguard-basic`) had no row and silently no-op'd post-checkout.
    // Family templates win nothing if a tier-specific row already exists (initial
    // lookup short-circuits above).
    const family = serviceId.replace(/-(basic|pro|premium|starter|standard|growth|business|agency|enterprise|creator|studio)$/i, '');
    if (family !== serviceId) {
      const [familyRow] = await db.select().from(onboardingTemplates)
        .where(and(eq(onboardingTemplates.service_id, family), eq(onboardingTemplates.is_active, true)))
        .limit(1);
      return familyRow;
    }
    return undefined;
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

    // Phase-2.1: belt-and-suspenders — fire MapGuard kickoff if the
    // setup-completion cascade just promoted the service to active.
    // Idempotent guard inside kickoffMapguardService prevents double-fire.
    if (serviceActivated) {
      await fireMapguardKickoffIfActive(clientServiceId);
    }

    // mapguard-setup completion upsell: when a one_time setup finishes,
    // nudge the customer toward Basic/Pro monthly. Idempotent inside
    // fireSetupCompletionUpsell (metadata.upsell_email_sent flag), so a
    // cascade re-fire or manual replay won't double-send. Fire-and-forget
    // — the email is non-essential to the completion flow.
    if (serviceCompleted && cs.service_id === "mapguard-setup") {
      void fireSetupCompletionUpsell(cs.client_id, clientServiceId)
        .catch(err => log.error(`[storage] setup-completion upsell failed for cs=${clientServiceId}: ${err.message}`));
    }

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

  async setTradeLineMode(clientServiceId: number, newMode: string, changedBy: string, reason?: string): Promise<TradelineModeLog> {
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
      reason: reason ?? null,
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

  async getTradeLineCallById(callId: number): Promise<TradelineCallLog | undefined> {
    const [row] = await db.select().from(tradelineCallLog)
      .where(eq(tradelineCallLog.id, callId))
      .limit(1);
    return row;
  }

  async listAllTradeLineCalls(filters: { clientId?: number; from?: Date; to?: Date; outcome?: string; limit?: number; offset?: number }): Promise<{ calls: (TradelineCallLog & { business_name: string; client_id: number })[]; total: number }> {
    const conditions = [];
    if (filters.clientId) {
      conditions.push(sql`${tradelineCallLog.client_service_id} IN (SELECT id FROM client_services WHERE client_id = ${filters.clientId})`);
    }
    if (filters.from) {
      conditions.push(gte(tradelineCallLog.created_at, filters.from));
    }
    if (filters.to) {
      conditions.push(sql`${tradelineCallLog.created_at} <= ${filters.to}`);
    }
    if (filters.outcome) {
      conditions.push(eq(tradelineCallLog.outcome, filters.outcome));
    }
    conditions.push(sql`${tradelineCallLog.client_service_id} IN (SELECT id FROM client_services WHERE service_id LIKE 'tradeline%')`);
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult] = await db.select({ total: sql<number>`count(*)::int` }).from(tradelineCallLog).where(whereClause);
    const rows = await db.select({
      id: tradelineCallLog.id, client_service_id: tradelineCallLog.client_service_id, vapi_call_id: tradelineCallLog.vapi_call_id,
      direction: tradelineCallLog.direction, caller_number: tradelineCallLog.caller_number, duration_seconds: tradelineCallLog.duration_seconds,
      outcome: tradelineCallLog.outcome, started_at: tradelineCallLog.started_at, ended_at: tradelineCallLog.ended_at,
      summary: tradelineCallLog.summary, transcript_json: tradelineCallLog.transcript_json, recording_url: tradelineCallLog.recording_url,
      created_at: tradelineCallLog.created_at, business_name: clients.business_name, client_id: clients.id,
    }).from(tradelineCallLog)
      .innerJoin(clientServices, eq(tradelineCallLog.client_service_id, clientServices.id))
      .innerJoin(clients, eq(clientServices.client_id, clients.id))
      .where(whereClause).orderBy(desc(tradelineCallLog.created_at)).limit(limit).offset(offset);
    return { calls: rows as any, total: countResult?.total ?? 0 };
  }

  async listTradeLineFleet(): Promise<Array<{ clientServiceId: number; clientId: number; businessName: string; serviceId: string; status: string; variant: string; mode: string; assistantStatus: string; lastCallAt: string | null; periodMinutes: number; failedCalls24h: number }>> {
    const services = await db.select({ id: clientServices.id, client_id: clientServices.client_id, service_id: clientServices.service_id, status: clientServices.status, metadata: clientServices.metadata, business_name: clients.business_name })
      .from(clientServices).innerJoin(clients, eq(clientServices.client_id, clients.id)).where(sql`${clientServices.service_id} LIKE 'tradeline%'`).orderBy(clients.business_name);
    const result = [];
    for (const svc of services) {
      const meta = (svc.metadata as Record<string, any>) ?? {};
      const tradeline = meta?.tradeline ?? {};
      const [lastCall] = await db.select({ created_at: tradelineCallLog.created_at }).from(tradelineCallLog).where(eq(tradelineCallLog.client_service_id, svc.id)).orderBy(desc(tradelineCallLog.created_at)).limit(1);
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [failedCount] = await db.select({ count: sql<number>`count(*)::int` }).from(tradelineCallLog).where(and(eq(tradelineCallLog.client_service_id, svc.id), eq(tradelineCallLog.outcome, "failed"), gte(tradelineCallLog.created_at, twentyFourHoursAgo)));
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const [usageRow] = await db.select({ voice_minutes_used: tradelineUsage.voice_minutes_used }).from(tradelineUsage).where(and(eq(tradelineUsage.client_service_id, svc.id), eq(tradelineUsage.period_start, periodStart))).limit(1);
      result.push({ clientServiceId: svc.id, clientId: svc.client_id, businessName: svc.business_name, serviceId: svc.service_id, status: svc.status, variant: tradeline.variant || "complete", mode: tradeline.currentMode || "available", assistantStatus: tradeline.assistant?.status || "not_built", lastCallAt: lastCall?.created_at?.toISOString() ?? null, periodMinutes: usageRow?.voice_minutes_used ?? 0, failedCalls24h: failedCount?.count ?? 0 });
    }
    return result;
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

  /* ─── TradeLine Phone-Number Lookups ─── */

  async findClientServiceByVapiPhoneNumberId(vapiPhoneNumberId: string): Promise<number | null> {
    const rows = await db.select({ id: clientServices.id })
      .from(clientServices)
      .where(
        and(
          sql`${clientServices.service_id} LIKE 'tradeline%'`,
          sql`${clientServices.metadata}->'tradeline'->'assistant'->>'vapiPhoneNumberId' = ${vapiPhoneNumberId}`,
        ),
      )
      .limit(1);
    return rows[0]?.id ?? null;
  }

  async findClientServiceByPrimaryBusinessNumber(phoneNumber: string): Promise<number | null> {
    const rows = await db.select({ id: clientServices.id })
      .from(clientServices)
      .where(
        and(
          sql`${clientServices.service_id} LIKE 'tradeline%'`,
          sql`${clientServices.metadata}->'tradeline'->'phoneRouting'->>'primaryBusinessNumber' = ${phoneNumber}`,
        ),
      )
      .limit(1);
    return rows[0]?.id ?? null;
  }

  async updateTradeLineCallLeadData(callLogId: number, leadData: Record<string, unknown>): Promise<void> {
    await db.update(tradelineCallLog)
      .set({ transcript_json: sql`COALESCE(${tradelineCallLog.transcript_json}, '{}'::jsonb) || jsonb_build_object('lead_data', ${JSON.stringify(leadData)}::jsonb)` })
      .where(eq(tradelineCallLog.id, callLogId));
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
  // Review-request suppression (DNC)
  // ═══════════════════════════════════════════════

  async isReviewRequestSuppressed(
    clientId: number,
    customerEmail: string | null,
    customerPhone: string | null,
  ): Promise<boolean> {
    if (!customerEmail && !customerPhone) return false;
    // Email lowercased at the boundary so a plain equality match hits the
    // unique index. The DB index is no longer on lower() (Drizzle-kit had
    // an operator-class bug there); we enforce case-insensitivity here.
    const normalizedEmail = customerEmail ? customerEmail.trim().toLowerCase() : null;
    const conditions: any[] = [];
    if (normalizedEmail) {
      conditions.push(eq(reviewRequestSuppression.customer_email, normalizedEmail));
    }
    if (customerPhone) {
      conditions.push(eq(reviewRequestSuppression.customer_phone, customerPhone));
    }
    const [row] = await db.select({ id: reviewRequestSuppression.id })
      .from(reviewRequestSuppression)
      .where(and(
        eq(reviewRequestSuppression.client_id, clientId),
        sql`(${sql.join(conditions, sql` OR `)})`,
      ))
      .limit(1);
    return !!row;
  }

  async addReviewRequestSuppression(data: {
    client_id: number;
    customer_email?: string | null;
    customer_phone?: string | null;
    reason?: string;
    source?: string;
    suppressed_by?: number | null;
    metadata?: any;
  }): Promise<{ id: number }> {
    // Normalize email to lowercase before insert so the unique index works
    // as case-insensitive. See isReviewRequestSuppressed for the matching
    // lookup-side normalization.
    const normalizedEmail = data.customer_email
      ? data.customer_email.trim().toLowerCase()
      : null;
    const [row] = await db.insert(reviewRequestSuppression).values({
      client_id: data.client_id,
      customer_email: normalizedEmail,
      customer_phone: data.customer_phone ?? null,
      reason: data.reason ?? null,
      source: data.source ?? "manual",
      suppressed_by: data.suppressed_by ?? null,
      metadata: data.metadata ?? null,
    }).returning({ id: reviewRequestSuppression.id });
    return row!;
  }

  async listReviewRequestSuppression(
    clientId: number,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<Array<{
    id: number;
    customer_email: string | null;
    customer_phone: string | null;
    reason: string | null;
    source: string;
    created_at: Date | null;
  }>> {
    const rows = await db.select({
      id: reviewRequestSuppression.id,
      customer_email: reviewRequestSuppression.customer_email,
      customer_phone: reviewRequestSuppression.customer_phone,
      reason: reviewRequestSuppression.reason,
      source: reviewRequestSuppression.source,
      created_at: reviewRequestSuppression.created_at,
    })
      .from(reviewRequestSuppression)
      .where(eq(reviewRequestSuppression.client_id, clientId))
      .orderBy(desc(reviewRequestSuppression.created_at))
      .limit(opts.limit ?? 100)
      .offset(opts.offset ?? 0);
    return rows;
  }

  async removeReviewRequestSuppression(clientId: number, id: number): Promise<boolean> {
    const result = await db.delete(reviewRequestSuppression)
      .where(and(
        eq(reviewRequestSuppression.id, id),
        eq(reviewRequestSuppression.client_id, clientId),
      ))
      .returning({ id: reviewRequestSuppression.id });
    return result.length > 0;
  }

  // ═══════════════════════════════════════════════
  // Multi-location Google Business Profile
  // ═══════════════════════════════════════════════

  async listGoogleLocations(clientId: number): Promise<GoogleLocation[]> {
    return db.select()
      .from(googleBusinessLocations)
      .where(eq(googleBusinessLocations.client_id, clientId))
      .orderBy(desc(googleBusinessLocations.is_primary), googleBusinessLocations.location_name);
  }

  async addGoogleLocation(data: InsertGoogleLocation): Promise<GoogleLocation> {
    // If marked primary on insert, demote any existing primary first.
    if (data.is_primary) {
      await db.update(googleBusinessLocations)
        .set({ is_primary: false, updated_at: new Date() })
        .where(and(
          eq(googleBusinessLocations.client_id, data.client_id),
          eq(googleBusinessLocations.is_primary, true),
        ));
    }
    const [row] = await db.insert(googleBusinessLocations).values(data).returning();
    return row!;
  }

  async updateGoogleLocation(id: number, updates: Partial<InsertGoogleLocation>): Promise<GoogleLocation | undefined> {
    const [row] = await db.update(googleBusinessLocations)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(googleBusinessLocations.id, id))
      .returning();
    return row;
  }

  async setPrimaryGoogleLocation(clientId: number, locationId: number): Promise<boolean> {
    // Demote current primary, promote the target, in a single transaction.
    return await db.transaction(async (tx) => {
      await tx.update(googleBusinessLocations)
        .set({ is_primary: false, updated_at: new Date() })
        .where(and(
          eq(googleBusinessLocations.client_id, clientId),
          eq(googleBusinessLocations.is_primary, true),
        ));
      const updated = await tx.update(googleBusinessLocations)
        .set({ is_primary: true, updated_at: new Date() })
        .where(and(
          eq(googleBusinessLocations.id, locationId),
          eq(googleBusinessLocations.client_id, clientId),
        ))
        .returning({ id: googleBusinessLocations.id });
      return updated.length > 0;
    });
  }

  async removeGoogleLocation(clientId: number, locationId: number): Promise<boolean> {
    const result = await db.delete(googleBusinessLocations)
      .where(and(
        eq(googleBusinessLocations.id, locationId),
        eq(googleBusinessLocations.client_id, clientId),
      ))
      .returning({ id: googleBusinessLocations.id });
    return result.length > 0;
  }

  // ═══════════════════════════════════════════════
  // Rate-limit counters
  // ═══════════════════════════════════════════════

  /**
   * Count successful review-request sends today (UTC) for a client.
   * Used by the service layer to enforce the daily SMS/email cap.
   */
  async countReviewRequestSendsToday(clientId: number, channel?: "sms" | "email"): Promise<number> {
    const conditions: any[] = [
      eq(reviewRequests.client_id, clientId),
      sql`${reviewRequests.sent_at} >= date_trunc('day', NOW())`,
      sql`${reviewRequests.status} IN ('sent', 'delivered')`,
    ];
    if (channel) conditions.push(eq(reviewRequests.channel, channel));
    const [row] = await db.select({ n: sql<number>`COUNT(*)::int` })
      .from(reviewRequests)
      .where(and(...conditions));
    return row?.n ?? 0;
  }

  // ═══════════════════════════════════════════════
  // Response edit audit
  // ═══════════════════════════════════════════════

  async appendReviewResponseEdit(data: {
    monitored_review_id: number;
    edited_by?: number | null;
    edit_kind: string;
    old_text?: string | null;
    new_text?: string | null;
    reason?: string | null;
    metadata?: any;
  }): Promise<{ id: number }> {
    const [row] = await db.insert(reviewResponseEdits).values({
      monitored_review_id: data.monitored_review_id,
      edited_by: data.edited_by ?? null,
      edit_kind: data.edit_kind,
      old_text: data.old_text ?? null,
      new_text: data.new_text ?? null,
      reason: data.reason ?? null,
      metadata: data.metadata ?? null,
    }).returning({ id: reviewResponseEdits.id });
    return row!;
  }

  async listReviewResponseEdits(monitoredReviewId: number): Promise<Array<{
    id: number;
    edited_by: number | null;
    edit_kind: string;
    old_text: string | null;
    new_text: string | null;
    reason: string | null;
    created_at: Date | null;
  }>> {
    return db.select({
      id: reviewResponseEdits.id,
      edited_by: reviewResponseEdits.edited_by,
      edit_kind: reviewResponseEdits.edit_kind,
      old_text: reviewResponseEdits.old_text,
      new_text: reviewResponseEdits.new_text,
      reason: reviewResponseEdits.reason,
      created_at: reviewResponseEdits.created_at,
    })
      .from(reviewResponseEdits)
      .where(eq(reviewResponseEdits.monitored_review_id, monitoredReviewId))
      .orderBy(desc(reviewResponseEdits.created_at));
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

  /* ─── ContentFlow product settings (singleton row, id = 1) ───────── */

  private _cfSettingsTableReady = false;

  /** Lazily create the contentflow_settings table. The repo has no
   *  migration step in the deploy pipeline, so this mirrors the same
   *  CREATE TABLE IF NOT EXISTS pattern used by unsubscribeStorage —
   *  the table self-creates on whichever database the app connects to. */
  private async _ensureContentflowSettingsTable(): Promise<void> {
    if (this._cfSettingsTableReady) return;
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contentflow_settings (
        id INTEGER PRIMARY KEY,
        kill_switch BOOLEAN NOT NULL DEFAULT false,
        text_tier VARCHAR(20) NOT NULL DEFAULT 'standard',
        disabled_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
        monthly_spend_cap_usd INTEGER,
        updated_at TIMESTAMP DEFAULT NOW(),
        updated_by INTEGER
      )
    `);
    this._cfSettingsTableReady = true;
  }

  async getContentflowSettings(): Promise<ContentflowSettings> {
    await this._ensureContentflowSettingsTable();
    const [row] = await db.select().from(contentflowSettings)
      .where(eq(contentflowSettings.id, 1)).limit(1);
    if (row) return row;
    // Lazily create the singleton row with column defaults on first read.
    const [created] = await db.insert(contentflowSettings)
      .values({ id: 1 })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    // Race: another caller inserted it first — re-read.
    const [existing] = await db.select().from(contentflowSettings)
      .where(eq(contentflowSettings.id, 1)).limit(1);
    return existing;
  }

  async updateContentflowSettings(
    patch: { kill_switch?: boolean; text_tier?: string; disabled_channels?: string[]; monthly_spend_cap_usd?: number | null },
    updatedBy?: number,
  ): Promise<ContentflowSettings> {
    await this.getContentflowSettings(); // ensure the singleton row exists
    const [row] = await db.update(contentflowSettings)
      .set({ ...patch, updated_at: new Date(), updated_by: updatedBy ?? null })
      .where(eq(contentflowSettings.id, 1))
      .returning();
    return row;
  }

  /** Sum of generation_cost_micro_usd across all drafts created this
   *  calendar month — the basis for the ContentFlow monthly spend cap. */
  async getContentflowMonthlySpendMicroUsd(): Promise<number> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [row] = await db.select({
      total: sql<string>`COALESCE(SUM(${contentDrafts.generation_cost_micro_usd}), 0)`,
    }).from(contentDrafts)
      .where(gte(contentDrafts.created_at, monthStart));
    return Number(row?.total ?? 0);
  }

  /** Add to a draft's recorded AI generation cost. Additive — a draft may
   *  accrue text + image cost, and an admin regenerate adds more. */
  async addDraftGenerationCost(draftId: number, microUsd: number): Promise<void> {
    if (!Number.isFinite(microUsd) || microUsd <= 0) return;
    await db.update(contentDrafts)
      .set({
        generation_cost_micro_usd: sql`COALESCE(${contentDrafts.generation_cost_micro_usd}, 0) + ${Math.round(microUsd)}`,
        updated_at: new Date(),
      })
      .where(eq(contentDrafts.id, draftId));
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
  async claimNextWordpressJob(workerId: string, opts: { now?: Date; staleLockMs?: number } = {}): Promise<ContentDraft | null> {
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
          /* Sprint 14: calendar gating */
          AND (metadata->'calendar'->>'paused' IS NULL OR metadata->'calendar'->>'paused' != 'true')
          AND (metadata->'calendar'->>'scheduled_for' IS NULL
               OR (metadata->'calendar'->>'scheduled_for')::timestamptz <= ${now.toISOString()}::timestamptz)
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
  async recoverStaleWordpressClaims(opts: { now?: Date; staleLockMs?: number } = {}): Promise<number> {
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

  /**
   * Sprint 9: idempotency lookup for review-reply drafts. One draft
   * per (clientId, externalReviewId). The external id lives in
   * metadata.gbp.external_review_id (no new column).
   */
  async getReviewReplyDraft(clientId: number, externalReviewId: string): Promise<ContentDraft | undefined> {
    const [row] = await db.select().from(contentDrafts)
      .where(and(
        eq(contentDrafts.client_id, clientId),
        eq(contentDrafts.kind, "review_reply"),
        eq(contentDrafts.surface, "reputationshield"),
        sql`${contentDrafts.metadata}->'gbp'->>'external_review_id' = ${externalReviewId}`,
      ))
      .limit(1);
    return row;
  }

  /**
   * Sprint 9: atomic claim for GBP review-reply jobs. Mirrors
   * claimNextWordpressJob but filters on kind='review_reply' /
   * surface='reputationshield' and uses the metadata.gbp.* path.
   * SKIP LOCKED is per-row, so the GBP and WP queues drain
   * independently and never block each other.
   *
   * Eligibility:
   *   - status='approved', kind='review_reply', surface='reputationshield'
   *   - metadata.gbp.queue_status='queued'
   *   - scheduled_for IS NULL or elapsed
   *   - posted_at IS NULL (defence-in-depth — never re-post)
   *   - locked_at IS NULL OR older than the stale threshold (10 min)
   */
  async claimNextGbpJob(workerId: string, opts: { now?: Date; staleLockMs?: number } = {}): Promise<ContentDraft | null> {
    const now = opts.now ?? new Date();
    const staleMs = opts.staleLockMs ?? 10 * 60_000;
    const staleCutoff = new Date(now.getTime() - staleMs).toISOString();
    const result: any = await db.execute(sql`
      UPDATE content_drafts
      SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'gbp',
            COALESCE(metadata->'gbp', '{}'::jsonb) || jsonb_build_object(
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
          AND kind = 'review_reply'
          AND surface = 'reputationshield'
          AND metadata->'gbp'->>'queue_status' = 'queued'
          AND (metadata->'gbp'->>'scheduled_for' IS NULL
               OR (metadata->'gbp'->>'scheduled_for')::timestamptz <= ${now.toISOString()}::timestamptz)
          AND metadata->'gbp'->>'posted_at' IS NULL
          AND (metadata->'gbp'->>'locked_at' IS NULL
               OR (metadata->'gbp'->>'locked_at')::timestamptz < ${staleCutoff}::timestamptz)
          /* Sprint 14: calendar gating */
          AND (metadata->'calendar'->>'paused' IS NULL OR metadata->'calendar'->>'paused' != 'true')
          AND (metadata->'calendar'->>'scheduled_for' IS NULL
               OR (metadata->'calendar'->>'scheduled_for')::timestamptz <= ${now.toISOString()}::timestamptz)
        ORDER BY (metadata->'gbp'->>'scheduled_for')::timestamptz ASC NULLS FIRST, id ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);
    const rows: ContentDraft[] = (result?.rows ?? result) as ContentDraft[];
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  /**
   * Sprint 10: shared internal helper that builds the per-channel
   * atomic claim. All 3 social adapters (facebook, instagram,
   * gbp_post) plus future channels share this implementation —
   * mirrors the Sprint 9 surgical-method approach but consolidates
   * the SQL into one shape so we don't proliferate near-identical
   * methods. Each public method below is a thin wrapper.
   */
  private async _claimNextSocialJob(
    metadataKey: "facebook" | "instagram" | "gbp_post" | "email" | "linkedin" | "pinterest" | "youtube",
    targetPlatform: string,
    workerId: string,
    opts: { now?: Date; staleLockMs?: number; kindFilter?: string[]; successField?: string } = {},
  ): Promise<ContentDraft | null> {
    const now = opts.now ?? new Date();
    const staleMs = opts.staleLockMs ?? 10 * 60_000;
    const staleCutoff = new Date(now.getTime() - staleMs).toISOString();
    /* Default: social_post + carousel_post for fb/ig, google_post for gbp_post.
     * Caller passes explicit kindFilter for clarity. Sprint 13: email
     * uses 'email_post' kind + 'message_id' as the don't-republish marker. */
    const kinds = opts.kindFilter ?? ["social_post"];
    const kindList = sql.raw(kinds.map((k) => `'${k.replace(/'/g, "''")}'`).join(","));
    /* successField is the metadata key that signals a successful publish
     * (set by the adapter on success). Eligibility excludes any row
     * already carrying it. Defaults to remote_post_id for social
     * platforms; email overrides to message_id. */
    const successField = opts.successField || "remote_post_id";
    const result: any = await db.execute(sql`
      UPDATE content_drafts
      SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            ${metadataKey}::text,
            COALESCE(metadata->${metadataKey}::text, '{}'::jsonb) || jsonb_build_object(
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
          AND kind IN (${kindList})
          AND target_platform = ${targetPlatform}
          AND metadata->${metadataKey}::text->>'queue_status' = 'queued'
          AND (metadata->${metadataKey}::text->>'scheduled_for' IS NULL
               OR (metadata->${metadataKey}::text->>'scheduled_for')::timestamptz <= ${now.toISOString()}::timestamptz)
          AND metadata->${metadataKey}::text->>${successField} IS NULL
          AND (metadata->${metadataKey}::text->>'locked_at' IS NULL
               OR (metadata->${metadataKey}::text->>'locked_at')::timestamptz < ${staleCutoff}::timestamptz)
          /* Sprint 14: calendar gating */
          AND (metadata->'calendar'->>'paused' IS NULL OR metadata->'calendar'->>'paused' != 'true')
          AND (metadata->'calendar'->>'scheduled_for' IS NULL
               OR (metadata->'calendar'->>'scheduled_for')::timestamptz <= ${now.toISOString()}::timestamptz)
        ORDER BY (metadata->${metadataKey}::text->>'scheduled_for')::timestamptz ASC NULLS FIRST, id ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);
    const rows: ContentDraft[] = (result?.rows ?? result) as ContentDraft[];
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  private async _recoverStaleSocialClaims(
    metadataKey: "facebook" | "instagram" | "gbp_post" | "email" | "linkedin" | "pinterest" | "youtube",
    targetPlatform: string,
    opts: { now?: Date; staleLockMs?: number; kindFilter?: string[] } = {},
  ): Promise<number> {
    const now = opts.now ?? new Date();
    const staleMs = opts.staleLockMs ?? 10 * 60_000;
    const staleCutoff = new Date(now.getTime() - staleMs).toISOString();
    const kinds = opts.kindFilter ?? ["social_post"];
    const kindList = sql.raw(kinds.map((k) => `'${k.replace(/'/g, "''")}'`).join(","));
    const result: any = await db.execute(sql`
      UPDATE content_drafts
      SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            ${metadataKey}::text,
            COALESCE(metadata->${metadataKey}::text, '{}'::jsonb) || jsonb_build_object(
              'queue_status', 'queued',
              'locked_at',  NULL::text,
              'locked_by',  NULL::text,
              'attempts',   COALESCE((metadata->${metadataKey}::text->>'attempts')::int, 0) + 1,
              'last_error', 'recovered from stale lock'
            )
          ),
          updated_at = NOW()
      WHERE status = 'approved'
        AND kind IN (${kindList})
        AND target_platform = ${targetPlatform}
        AND metadata->${metadataKey}::text->>'queue_status' = 'publishing'
        AND metadata->${metadataKey}::text->>'locked_at' IS NOT NULL
        AND (metadata->${metadataKey}::text->>'locked_at')::timestamptz < ${staleCutoff}::timestamptz
      RETURNING id
    `);
    const rows: any[] = (result?.rows ?? result) as any[];
    return Array.isArray(rows) ? rows.length : 0;
  }

  async claimNextFacebookJob(workerId: string, opts: { now?: Date; staleLockMs?: number } = {}): Promise<ContentDraft | null> {
    return this._claimNextSocialJob("facebook", "facebook", workerId, { ...opts, kindFilter: ["social_post", "carousel_post"] });
  }
  async recoverStaleFacebookClaims(opts: { now?: Date; staleLockMs?: number } = {}): Promise<number> {
    return this._recoverStaleSocialClaims("facebook", "facebook", { ...opts, kindFilter: ["social_post", "carousel_post"] });
  }

  async claimNextInstagramJob(workerId: string, opts: { now?: Date; staleLockMs?: number } = {}): Promise<ContentDraft | null> {
    return this._claimNextSocialJob("instagram", "instagram", workerId, { ...opts, kindFilter: ["social_post", "carousel_post"] });
  }
  async recoverStaleInstagramClaims(opts: { now?: Date; staleLockMs?: number } = {}): Promise<number> {
    return this._recoverStaleSocialClaims("instagram", "instagram", { ...opts, kindFilter: ["social_post", "carousel_post"] });
  }

  async claimNextGbpPostJob(workerId: string, opts: { now?: Date; staleLockMs?: number } = {}): Promise<ContentDraft | null> {
    return this._claimNextSocialJob("gbp_post", "google_business", workerId, { ...opts, kindFilter: ["google_post", "social_post"] });
  }
  async recoverStaleGbpPostClaims(opts: { now?: Date; staleLockMs?: number } = {}): Promise<number> {
    return this._recoverStaleSocialClaims("gbp_post", "google_business", { ...opts, kindFilter: ["google_post", "social_post"] });
  }

  /* Sprint 13: email queue. metadata.email.* lifecycle, kind='email_post',
   * target_platform='email'. Eligibility excludes rows with message_id
   * already set. */
  async claimNextEmailJob(workerId: string, opts: { now?: Date; staleLockMs?: number } = {}): Promise<ContentDraft | null> {
    return this._claimNextSocialJob("email", "email", workerId, {
      ...opts,
      kindFilter: ["email_post"],
      successField: "message_id",
    });
  }
  async recoverStaleEmailClaims(opts: { now?: Date; staleLockMs?: number } = {}): Promise<number> {
    return this._recoverStaleSocialClaims("email", "email", { ...opts, kindFilter: ["email_post"] });
  }

  /* Sprint 18: LinkedIn, Pinterest, YouTube queues. Each writes its
   * own metadata.<channel>.* lifecycle on the same content_drafts row.
   * LinkedIn + Pinterest are kind='social_post' (with carousel allowed
   * for completeness); YouTube is kind='video' and uses youtube_url as
   * the don't-republish marker because the YouTube adapter persists
   * remote_video_id + youtube_url + posted_at on success (not the
   * remote_post_id key used by the other social adapters). */
  async claimNextLinkedinJob(workerId: string, opts: { now?: Date; staleLockMs?: number } = {}): Promise<ContentDraft | null> {
    return this._claimNextSocialJob("linkedin", "linkedin", workerId, { ...opts, kindFilter: ["social_post", "carousel_post"] });
  }
  async recoverStaleLinkedinClaims(opts: { now?: Date; staleLockMs?: number } = {}): Promise<number> {
    return this._recoverStaleSocialClaims("linkedin", "linkedin", { ...opts, kindFilter: ["social_post", "carousel_post"] });
  }

  async claimNextPinterestJob(workerId: string, opts: { now?: Date; staleLockMs?: number } = {}): Promise<ContentDraft | null> {
    return this._claimNextSocialJob("pinterest", "pinterest", workerId, { ...opts, kindFilter: ["social_post", "carousel_post"] });
  }
  async recoverStalePinterestClaims(opts: { now?: Date; staleLockMs?: number } = {}): Promise<number> {
    return this._recoverStaleSocialClaims("pinterest", "pinterest", { ...opts, kindFilter: ["social_post", "carousel_post"] });
  }

  async claimNextYoutubeJob(workerId: string, opts: { now?: Date; staleLockMs?: number } = {}): Promise<ContentDraft | null> {
    return this._claimNextSocialJob("youtube", "youtube", workerId, {
      ...opts,
      kindFilter: ["video"],
      successField: "youtube_url",
    });
  }
  async recoverStaleYoutubeClaims(opts: { now?: Date; staleLockMs?: number } = {}): Promise<number> {
    return this._recoverStaleSocialClaims("youtube", "youtube", { ...opts, kindFilter: ["video"] });
  }

  /**
   * Sprint 9: recover GBP claims abandoned by a crashed worker. Same
   * shape as recoverStaleWordpressClaims, different jsonb path + kind
   * filter.
   */
  async recoverStaleGbpClaims(opts: { now?: Date; staleLockMs?: number } = {}): Promise<number> {
    const now = opts.now ?? new Date();
    const staleMs = opts.staleLockMs ?? 10 * 60_000;
    const staleCutoff = new Date(now.getTime() - staleMs).toISOString();
    const result: any = await db.execute(sql`
      UPDATE content_drafts
      SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'gbp',
            COALESCE(metadata->'gbp', '{}'::jsonb) || jsonb_build_object(
              'queue_status', 'queued',
              'locked_at',  NULL::text,
              'locked_by',  NULL::text,
              'attempts',   COALESCE((metadata->'gbp'->>'attempts')::int, 0) + 1,
              'last_error', 'recovered from stale lock'
            )
          ),
          updated_at = NOW()
      WHERE status = 'approved'
        AND kind = 'review_reply'
        AND surface = 'reputationshield'
        AND metadata->'gbp'->>'queue_status' = 'publishing'
        AND metadata->'gbp'->>'locked_at' IS NOT NULL
        AND (metadata->'gbp'->>'locked_at')::timestamptz < ${staleCutoff}::timestamptz
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

  // ─── Routing Events (Phase 1) ───

  /**
   * Idempotent insert: if an active or snoozed routing event already exists
   * for the same (entity_type, entity_id, queue), update its updated_at
   * timestamp instead of inserting a duplicate. Returns the existing or
   * newly created event.
   */
  async createRoutingEvent(data: InsertRoutingEvent): Promise<RoutingEvent> {
    // Check for existing active/snoozed event with same key
    const [existing] = await db
      .select()
      .from(routingEvents)
      .where(
        and(
          eq(routingEvents.entity_type, data.entity_type),
          eq(routingEvents.entity_id, data.entity_id),
          eq(routingEvents.queue, data.queue),
          or(
            eq(routingEvents.status, "active"),
            eq(routingEvents.status, "snoozed"),
          ),
        ),
      )
      .limit(1);

    if (existing) {
      // Update evaluated timestamp only — do not create duplicate
      const [updated] = await db
        .update(routingEvents)
        .set({ updated_at: new Date() })
        .where(eq(routingEvents.id, existing.id))
        .returning();
      return updated;
    }

    const [event] = await db.insert(routingEvents).values(data).returning();
    return event;
  }

  /**
   * Mark all active routing events matching (entity_type, entity_id, queue)
   * as system_resolved. Called when the engine re-evaluates and the
   * triggering condition no longer holds.
   */
  async systemResolveRoutingEvent(
    entityType: string,
    entityId: number,
    queue: string,
    ruleName?: string,
  ): Promise<void> {
    const now = new Date();
    const conds = [
      eq(routingEvents.entity_type, entityType),
      eq(routingEvents.entity_id, entityId),
      eq(routingEvents.queue, queue),
      or(
        eq(routingEvents.status, "active"),
        eq(routingEvents.status, "snoozed"),
      ),
    ];
    if (ruleName) conds.push(eq(routingEvents.rule_name, ruleName));
    await db
      .update(routingEvents)
      .set({
        status: "system_resolved",
        resolved_at: now,
        updated_at: now,
      })
      .where(and(...conds));
  }

  /**
   * Mark a specific routing event as admin_acknowledged.
   * Sets acknowledged_by, acknowledged_at, and updated_at.
   */
  async adminAcknowledgeRoutingEvent(
    id: number,
    userId: number,
  ): Promise<RoutingEvent | undefined> {
    const now = new Date();
    const [event] = await db
      .update(routingEvents)
      .set({
        status: "admin_acknowledged",
        acknowledged_by: userId,
        acknowledged_at: now,
        updated_at: now,
      })
      .where(
        and(
          eq(routingEvents.id, id),
          eq(routingEvents.status, "active"),
        ),
      )
      .returning();
    return event;
  }

  async getLastAcknowledgedRoutingEvent(
    entityType: string,
    entityId: number,
    queue: string,
    ruleName?: string,
  ): Promise<RoutingEvent | undefined> {
    const conds = [
      eq(routingEvents.entity_type, entityType),
      eq(routingEvents.entity_id, entityId),
      eq(routingEvents.queue, queue),
      eq(routingEvents.status, "admin_acknowledged"),
    ];
    if (ruleName) conds.push(eq(routingEvents.rule_name, ruleName));
    const [row] = await db
      .select()
      .from(routingEvents)
      .where(and(...conds))
      .orderBy(desc(routingEvents.acknowledged_at))
      .limit(1);
    return row;
  }

  /**
   * Return active + snoozed routing events for a given queue,
   * ordered by priority (urgent first) then created_at (oldest first).
   */
  async listQueueItems(queue: string, limit: number = 100): Promise<RoutingEvent[]> {
    return db
      .select()
      .from(routingEvents)
      .where(
        and(
          eq(routingEvents.queue, queue),
          or(
            eq(routingEvents.status, "active"),
            eq(routingEvents.status, "snoozed"),
          ),
        ),
      )
      .orderBy(
        sql`CASE ${routingEvents.priority}
          WHEN 'urgent' THEN 0
          WHEN 'high' THEN 1
          WHEN 'normal' THEN 2
          WHEN 'low' THEN 3
          ELSE 4
        END`,
        routingEvents.created_at,
      )
      .limit(limit);
  }

  // ─── Profit Overview ───
  async getProfitOverview() {
    // 1. Get all active services from catalog
    const catalog = await db.select().from(serviceCatalog).where(eq(serviceCatalog.is_active, true));

    // 2. Get active client counts per service
    const activeCounts = await db.select({
      service_id: clientServices.service_id,
      count: sql<number>`count(*)::int`,
    })
    .from(clientServices)
    .where(eq(clientServices.status, "active"))
    .groupBy(clientServices.service_id);
    const activeMap = new Map(activeCounts.map(r => [r.service_id, r.count]));

    // 3. Get delivered (completed) counts for one-time services
    const deliveredCounts = await db.select({
      service_id: clientServices.service_id,
      count: sql<number>`count(*)::int`,
    })
    .from(clientServices)
    .where(eq(clientServices.status, "completed"))
    .groupBy(clientServices.service_id);
    const deliveredMap = new Map(deliveredCounts.map(r => [r.service_id, r.count]));

    const services = catalog.map(svc => {
      const salePrice = svc.default_price || 0;
      const costAmount = (svc as any).cost_amount || 0;
      const isOneTime = svc.billing_period === "one-time";

      const activeClients = activeMap.get(svc.id) || 0;
      const deliveredCount = deliveredMap.get(svc.id) || 0;

      // For subscription services: revenue = price * active_clients
      // For one-time services: use total delivered count
      const usageCount = isOneTime ? deliveredCount : activeClients;
      const monthlyRevenue = isOneTime ? salePrice * deliveredCount : salePrice * activeClients;
      const monthlyCost = isOneTime ? costAmount * deliveredCount : costAmount * activeClients;
      const monthlyProfit = monthlyRevenue - monthlyCost;

      const marginCents = salePrice - costAmount;
      const marginPercent = salePrice > 0 ? Math.round((marginCents / salePrice) * 1000) / 10 : 0;

      return {
        service_id: svc.id,
        name: svc.name,
        billing_period: svc.billing_period,
        sale_price: salePrice,
        cost_amount: costAmount,
        margin_cents: marginCents,
        margin_percent: marginPercent,
        active_clients: activeClients,
        delivered_count: deliveredCount,
        monthly_revenue: monthlyRevenue,
        monthly_cost: monthlyCost,
        monthly_profit: monthlyProfit,
      };
    });

    const totalRevenue = services.reduce((s, r) => s + r.monthly_revenue, 0);
    const totalCost = services.reduce((s, r) => s + r.monthly_cost, 0);
    const totalProfit = totalRevenue - totalCost;
    const overallMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0;

    return {
      services,
      totals: {
        monthly_revenue: totalRevenue,
        monthly_cost: totalCost,
        monthly_profit: totalProfit,
        overall_margin_percent: overallMargin,
      },
    };
  }

  // ─── Calendar Connections (Booking Engine) ───

  async getCalendarConnection(clientId: number): Promise<CalendarConnection | undefined> {
    const [conn] = await db
      .select()
      .from(calendarConnections)
      .where(and(eq(calendarConnections.client_id, clientId), eq(calendarConnections.is_active, true)))
      .limit(1);
    return conn;
  }

  async listCalendarConnections(clientId?: number): Promise<CalendarConnection[]> {
    if (clientId) {
      return db
        .select()
        .from(calendarConnections)
        .where(eq(calendarConnections.client_id, clientId))
        .orderBy(desc(calendarConnections.created_at));
    }
    return db
      .select()
      .from(calendarConnections)
      .orderBy(desc(calendarConnections.created_at));
  }

  async createCalendarConnection(data: InsertCalendarConnection): Promise<CalendarConnection> {
    const [conn] = await db.insert(calendarConnections).values(data).returning();
    return conn;
  }

  async updateCalendarConnection(id: number, updates: Partial<InsertCalendarConnection>): Promise<CalendarConnection | undefined> {
    const [conn] = await db
      .update(calendarConnections)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(calendarConnections.id, id))
      .returning();
    return conn;
  }

  async deleteCalendarConnection(id: number): Promise<CalendarConnection | undefined> {
    // Soft delete — set is_active = false
    const [conn] = await db
      .update(calendarConnections)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(calendarConnections.id, id))
      .returning();
    return conn;
  }

  // ─── System Alerts ───
  async createSystemAlert(data: InsertSystemAlert): Promise<SystemAlert> {
    const [alert] = await db.insert(systemAlerts).values(data).returning();
    return alert;
  }
  async listSystemAlerts(opts: { severity?: string; category?: string; acknowledged?: boolean; limit?: number; offset?: number } = {}): Promise<SystemAlert[]> {
    const conditions: any[] = [];
    if (opts.severity) conditions.push(eq(systemAlerts.severity, opts.severity));
    if (opts.category) conditions.push(eq(systemAlerts.category, opts.category));
    if (opts.acknowledged !== undefined) conditions.push(eq(systemAlerts.acknowledged, opts.acknowledged));
    const q = db.select().from(systemAlerts);
    const filtered = conditions.length > 0 ? q.where(and(...conditions)) : q;
    return filtered.orderBy(desc(systemAlerts.created_at)).limit(opts.limit ?? 100).offset(opts.offset ?? 0);
  }
  async acknowledgeSystemAlert(id: number, userId: number): Promise<SystemAlert | undefined> {
    const [alert] = await db.update(systemAlerts).set({ acknowledged: true, acknowledged_by: userId, acknowledged_at: new Date() }).where(eq(systemAlerts.id, id)).returning();
    return alert;
  }
  async getUnacknowledgedAlertCount(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(systemAlerts).where(eq(systemAlerts.acknowledged, false));
    return result?.count ?? 0;
  }
  async findRecentAlert(category: string, title: string, withinMs: number = 3600000): Promise<SystemAlert | undefined> {
    const cutoff = new Date(Date.now() - withinMs);
    const [alert] = await db.select().from(systemAlerts).where(and(eq(systemAlerts.category, category), eq(systemAlerts.title, title), gte(systemAlerts.created_at, cutoff))).orderBy(desc(systemAlerts.created_at)).limit(1);
    return alert;
  }

  // ─── AdFlow Reports History ───
  async createAdflowReport(data: InsertAdflowReport): Promise<AdflowReport> {
    const [report] = await db.insert(adflowReports).values(data).returning();
    return report;
  }
  async listAdflowReports(clientServiceId: number, limit: number = 12): Promise<AdflowReport[]> {
    return db.select().from(adflowReports)
      .where(eq(adflowReports.client_service_id, clientServiceId))
      .orderBy(desc(adflowReports.period_start))
      .limit(limit);
  }
  async getAdflowReport(id: number): Promise<AdflowReport | undefined> {
    const [report] = await db.select().from(adflowReports).where(eq(adflowReports.id, id)).limit(1);
    return report;
  }

  // ─── Email Queue ───
  async enqueueEmail(data: InsertEmailQueue): Promise<EmailQueueItem> {
    const [item] = await db.insert(emailQueue).values(data).returning();
    return item;
  }
  async fetchPendingEmails(limit: number = 10): Promise<EmailQueueItem[]> {
    return db.select().from(emailQueue).where(eq(emailQueue.status, "pending")).orderBy(emailQueue.created_at).limit(limit);
  }
  async updateEmailQueueItem(id: number, updates: Partial<{ status: string; attempts: number; last_error: string | null; sent_at: Date | null }>): Promise<void> {
    await db.update(emailQueue).set(updates).where(eq(emailQueue.id, id));
  }

  // ─── Vapi Webhook Events ───
  async createVapiWebhookEvent(data: InsertVapiWebhookEvent): Promise<VapiWebhookEventRow> {
    const [row] = await db.insert(vapiWebhookEvents).values(data).returning();
    return row;
  }
  async listVapiWebhookEvents(limit = 50): Promise<VapiWebhookEventRow[]> {
    return db.select().from(vapiWebhookEvents)
      .orderBy(desc(vapiWebhookEvents.created_at))
      .limit(limit);
  }

  // ─── Brand-availability singleton ───
  // Single-row table (id = 1). Reads return the row, with a sane default if it
  // somehow isn't seeded yet.
  async getBrandAvailability(): Promise<BrandAvailability> {
    const [row] = await db.select().from(brandAvailability).where(eq(brandAvailability.id, 1)).limit(1);
    if (row) return row;
    // Defensive: re-seed if the row was wiped
    const [seeded] = await db.insert(brandAvailability).values({ id: 1, is_available: true } as any).returning();
    return seeded;
  }

  async setBrandAvailability(input: { is_available: boolean; away_message?: string; set_by_user_id?: number | null }): Promise<BrandAvailability> {
    const updates: any = {
      is_available: input.is_available,
      set_by_user_id: input.set_by_user_id ?? null,
      set_at: new Date(),
    };
    if (input.away_message !== undefined) updates.away_message = input.away_message;
    const [row] = await db.update(brandAvailability).set(updates).where(eq(brandAvailability.id, 1)).returning();
    return row;
  }
}

export const storage = new DatabaseStorage();
