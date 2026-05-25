import crypto from "crypto";
import { hashPassword } from "./auth";
import { db } from "./db";
import {
  // Calculator + leads + analytics_events + deployment_status table objects
  // moved with impl to ./storage/calculator.ts and ./storage/leads.ts /
  // ./storage/analytics.ts. Types stay here for IStorage signatures.
  // jobLogs, notificationQueue, followupJobs moved with impl to ./storage/jobs.ts
  bookings,
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
  clients, clientServices, serviceCatalog,
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
  // RankFlow (table objects moved with impl to ./storage/rankflow.ts)
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
  // Reputation table objects moved with impl to ./storage/reputation.ts
  type ReviewRequest, type InsertReviewRequest,
  type MonitoredReview, type InsertMonitoredReview,
  type GoogleLocation, type InsertGoogleLocation,
  // TradeLine types (table objects + Insert types moved with impl to ./storage/tradeline.ts)
  type TradelineConfig,
  type TradelineUsage,
  type TradelineCallLog, type InsertTradelineCallLog,
  type TradelineModeLog,
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
  // ContentFlow (table objects moved with impl to ./storage/contentflow.ts)
  type ContentDraft, type InsertContentDraft,
  type ContentApproval, type InsertContentApproval,
  type ContentAsset, type InsertContentAsset,
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
import { eq, desc, sql, and, gte, lte, ilike, or, count } from "drizzle-orm";
import * as leadsImpl from "./storage/leads";
import * as billingImpl from "./storage/billing";
import * as socialsyncImpl from "./storage/socialsync";
import * as reviewsImpl from "./storage/reviews";
import * as calendarImpl from "./storage/calendar";
import * as usersImpl from "./storage/users";
import * as clientsImpl from "./storage/clients";
import * as productsImpl from "./storage/products";
import * as tradelineImpl from "./storage/tradeline";
import * as rankflowImpl from "./storage/rankflow";
import * as contentflowImpl from "./storage/contentflow";
import * as reputationImpl from "./storage/reputation";
import * as analyticsImpl from "./storage/analytics";
import * as fulfillmentImpl from "./storage/fulfillment";
import * as supportImpl from "./storage/support";
import * as calculatorImpl from "./storage/calculator";
import * as jobsImpl from "./storage/jobs";
import { createLogger } from "./lib/logger";
import { kickoffMapguardService } from "./services/mapguardTaskEngine";
import { fireSetupCompletionUpsell } from "./services/mapguardUpsell";

import type { ProductStats } from "./storage/products";
// Re-export ProductStats so external consumers can still `import { ProductStats } from "../storage"`.
export type { ProductStats };

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

// ContentFlow platform config (type + map) moved to ./storage/contentflow.ts.
// Re-exported here for any existing `import { ContentJobPlatform } from "./storage"` callers.
export { type ContentJobPlatform } from "./storage/contentflow";
import type { ContentJobPlatform } from "./storage/contentflow";

export class DatabaseStorage implements IStorage {
  // ─── Calculator methods (impl in ./storage/calculator.ts) ───
  createCalculator(data: InsertCalculator): Promise<Calculator> { return calculatorImpl.createCalculator(data); }
  getCalculatorBySlug(slug: string): Promise<Calculator | undefined> { return calculatorImpl.getCalculatorBySlug(slug); }
  getCalculatorByToken(token: string): Promise<Calculator | undefined> { return calculatorImpl.getCalculatorByToken(token); }
  updateCalculator(id: number, updates: Partial<InsertCalculator>): Promise<Calculator | undefined> { return calculatorImpl.updateCalculator(id, updates); }
  duplicateCalculator(id: number, newSlug: string, newToken: string, newExpiry: Date): Promise<Calculator | undefined> { return calculatorImpl.duplicateCalculator(id, newSlug, newToken, newExpiry); }
  getCalculatorByOldSlug(oldSlug: string): Promise<Calculator | undefined> { return calculatorImpl.getCalculatorByOldSlug(oldSlug); }
  deleteCalculator(id: number): Promise<void> { return calculatorImpl.deleteCalculator(id); }
  incrementViews(id: number): Promise<void> { return calculatorImpl.incrementViews(id); }

  // ─── Lead methods (impl in ./storage/leads.ts) ───
  createLead(data: InsertLead): Promise<Lead> { return leadsImpl.createLead(data); }
  getLeadsByCalculatorId(calculatorId: number): Promise<Lead[]> { return leadsImpl.getLeadsByCalculatorId(calculatorId); }
  searchLeads(calculatorId: number, query: string): Promise<Lead[]> { return leadsImpl.searchLeads(calculatorId, query); }
  deleteLead(id: number, calculatorId: number): Promise<void> { return leadsImpl.deleteLead(id, calculatorId); }
  getLeadCountSince(calculatorId: number, since: Date): Promise<number> { return leadsImpl.getLeadCountSince(calculatorId, since); }

  // ─── Analytics methods (impl in ./storage/analytics.ts) ───
  trackEvent(data: InsertAnalyticsEvent): Promise<AnalyticsEvent> { return analyticsImpl.trackEvent(data); }
  getEventCounts(calculatorId: number, since: Date): Promise<{ views: number; leads: number; quotes: number }> { return analyticsImpl.getEventCounts(calculatorId, since); }
  getWeeklyTrend(calculatorId: number): Promise<{ week: string; views: number; leads: number }[]> { return analyticsImpl.getWeeklyTrend(calculatorId); }
  getAvgQuoteAmount(calculatorId: number): Promise<number> { return analyticsImpl.getAvgQuoteAmount(calculatorId); }

  getDeploymentStatus(calculatorId: number): Promise<DeploymentStatus | undefined> { return calculatorImpl.getDeploymentStatus(calculatorId); }
  upsertDeploymentStatus(data: InsertDeploymentStatus): Promise<DeploymentStatus> { return calculatorImpl.upsertDeploymentStatus(data); }
  getAllCalculatorsWithEmail(): Promise<Calculator[]> { return calculatorImpl.getAllCalculatorsWithEmail(); }
  getAllCalculatorsForAdmin(): Promise<any[]> { return calculatorImpl.getAllCalculatorsForAdmin(); }

  /**
   * Daily lead counts across all QuoteQuick calculators for the last N days.
   * Returns a continuous series (days with no leads are filled with 0) so the
   * admin trend chart has no gaps.
   */
  getQuoteQuickLeadTrend(days: number): Promise<Array<{ date: string; count: number }>> { return leadsImpl.getQuoteQuickLeadTrend(days); }

  findCalculatorByStripeSubscriptionId(subscriptionId: string): Promise<Calculator | undefined> { return calculatorImpl.findCalculatorByStripeSubscriptionId(subscriptionId); }

  markLeadReplied(leadId: number): Promise<Lead | undefined> { return leadsImpl.markLeadReplied(leadId); }

  upsertAnalyticsSummary(data: InsertAnalyticsSummary): Promise<AnalyticsSummary> { return analyticsImpl.upsertAnalyticsSummary(data); }
  getAnalyticsSummary(calculatorId: number): Promise<AnalyticsSummary | undefined> { return analyticsImpl.getAnalyticsSummary(calculatorId); }
  getDailyEventCounts(calculatorId: number, date: Date): Promise<{ views: number; leads: number; quotes: number }> { return analyticsImpl.getDailyEventCounts(calculatorId, date); }
  getBestDay(calculatorId: number, since: Date): Promise<string | null> { return analyticsImpl.getBestDay(calculatorId, since); }

  createJobLog(data: InsertJobLog): Promise<JobLog> { return jobsImpl.createJobLog(data); }
  updateJobLog(id: number, updates: Partial<InsertJobLog>): Promise<void> { return jobsImpl.updateJobLog(id, updates); }

  getLeadById(id: number): Promise<Lead | undefined> { return leadsImpl.getLeadById(id); }
  updateLeadStatus(id: number, status: string): Promise<Lead | undefined> { return leadsImpl.updateLeadStatus(id, status); }
  updateLead(id: number, updates: Record<string, any>): Promise<Lead | undefined> { return leadsImpl.updateLead(id, updates); }

  enqueueNotification(data: InsertNotificationQueue): Promise<NotificationQueue> { return jobsImpl.enqueueNotification(data); }
  fetchDueNotifications(limit = 20): Promise<NotificationQueue[]> { return jobsImpl.fetchDueNotifications(limit); }
  updateNotification(id: number, updates: Record<string, any>): Promise<void> { return jobsImpl.updateNotification(id, updates); }
  getNotificationLogs(calculatorId: number, limit = 50): Promise<NotificationQueue[]> { return jobsImpl.getNotificationLogs(calculatorId, limit); }
  getRecentNotificationCount(calculatorId: number, windowMinutes: number): Promise<number> { return jobsImpl.getRecentNotificationCount(calculatorId, windowMinutes); }

  enqueueFollowupJobs(data: InsertFollowupJob[]): Promise<FollowupJob[]> { return jobsImpl.enqueueFollowupJobs(data); }
  fetchDueFollowups(limit = 20): Promise<FollowupJob[]> { return jobsImpl.fetchDueFollowups(limit); }
  updateFollowupJob(id: number, updates: Record<string, any>): Promise<void> { return jobsImpl.updateFollowupJob(id, updates); }
  getFollowupLogs(calculatorId: number, limit = 50): Promise<FollowupJob[]> { return jobsImpl.getFollowupLogs(calculatorId, limit); }
  cancelFollowupsForLead(leadId: number): Promise<void> { return jobsImpl.cancelFollowupsForLead(leadId); }

  getCalculatorById(id: number): Promise<Calculator | undefined> { return calculatorImpl.getCalculatorById(id); }

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

  createAiConversation(data: InsertAiConversation): Promise<AiConversation> { return supportImpl.createAiConversation(data); }
  updateAiConversation(id: number, updates: Partial<InsertAiConversation>): Promise<void> { return supportImpl.updateAiConversation(id, updates); }
  getAiConversationBySession(sessionId: string): Promise<AiConversation | undefined> { return supportImpl.getAiConversationBySession(sessionId); }

  createSupportTicket(data: Partial<InsertSupportTicket> & { description: string; subject: string; client_id: number }): Promise<SupportTicket> { return supportImpl.createSupportTicket(data); }
  updateSupportTicket(id: number, updates: Record<string, any>): Promise<SupportTicket | undefined> { return supportImpl.updateSupportTicket(id, updates); }
  getSupportTicketById(id: number): Promise<SupportTicket | undefined> { return supportImpl.getSupportTicketById(id); }
  listSupportTickets(opts?: { clientId?: number; status?: string; priority?: string; category?: string; search?: string; limit?: number; offset?: number }): Promise<(SupportTicket & { client_name?: string | null })[]> { return supportImpl.listSupportTickets(opts); }
  getSupportTicketCounts(clientId?: number): Promise<Record<string, number>> { return supportImpl.getSupportTicketCounts(clientId); }

  createTicketMessage(data: InsertTicketMessage): Promise<TicketMessage> { return supportImpl.createTicketMessage(data); }
  listTicketMessages(ticketId: number, visibility?: "customer" | "all"): Promise<(TicketMessage & { author_name?: string | null })[]> { return supportImpl.listTicketMessages(ticketId, visibility); }

  createTicketEvent(data: InsertTicketEvent): Promise<TicketEvent> { return supportImpl.createTicketEvent(data); }

  getSmsThreads(calculatorId: number): Promise<{ lead: Lead; messages: SmsMessage[] }[]> { return supportImpl.getSmsThreads(calculatorId); }

  updateLeadAiPaused(leadId: number, calculatorId: number, paused: boolean): Promise<void> { return leadsImpl.updateLeadAiPaused(leadId, calculatorId, paused); }

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

  /* ─── User methods (impl in ./storage/users.ts) ─── */
  createUser(data: InsertUser): Promise<User> { return usersImpl.createUser(data); }
  getUserById(id: number): Promise<User | undefined> { return usersImpl.getUserById(id); }
  getUserByEmail(email: string): Promise<User | undefined> { return usersImpl.getUserByEmail(email); }
  getUserByGoogleSub(googleSub: string): Promise<User | undefined> { return usersImpl.getUserByGoogleSub(googleSub); }
  updateUser(id: number, updates: Partial<Pick<InsertUser, 'name' | 'email' | 'role'>>): Promise<User | undefined> { return usersImpl.updateUser(id, updates); }
  listUsers(limit = 50, offset = 0): Promise<User[]> { return usersImpl.listUsers(limit, offset); }
  getUserCount(): Promise<number> { return usersImpl.getUserCount(); }

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

  getCalculatorsByUserId(userId: number): Promise<Calculator[]> { return calculatorImpl.getCalculatorsByUserId(userId); }

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

  createMissedCallLead(data: InsertMissedCallLead): Promise<MissedCallLead> { return leadsImpl.createMissedCallLead(data); }
  createDemoQuoteLead(data: InsertDemoQuoteLead): Promise<DemoQuoteLead> { return leadsImpl.createDemoQuoteLead(data); }

  // ═══════════════════════════════════════════════
  // Admin CRM Methods
  // ═══════════════════════════════════════════════

  // ─── Clients (impl in ./storage/clients.ts) ───
  listClients(opts: { search?: string; status?: string; limit?: number; offset?: number } = {}): Promise<Client[]> { return clientsImpl.listClients(opts); }
  getClientById(id: number): Promise<Client | undefined> { return clientsImpl.getClientById(id); }
  createClient(data: InsertClient): Promise<Client> { return clientsImpl.createClient(data); }
  updateClient(id: number, updates: Partial<InsertClient>): Promise<Client | undefined> { return clientsImpl.updateClient(id, updates); }
  getClientCount(status?: string): Promise<number> { return clientsImpl.getClientCount(status); }

  // ─── Service Catalog (impl in ./storage/products.ts) ───
  listServiceCatalog(): Promise<ServiceCatalogRow[]> { return productsImpl.listServiceCatalog(); }
  upsertServiceCatalog(data: InsertServiceCatalog): Promise<ServiceCatalogRow> { return productsImpl.upsertServiceCatalog(data); }
  updateServiceCatalog(id: string, updates: Partial<InsertServiceCatalog>): Promise<ServiceCatalogRow | undefined> { return productsImpl.updateServiceCatalog(id, updates); }
  listServicesWithClientCounts(): Promise<(ServiceCatalogRow & { active_client_count: number })[]> { return productsImpl.listServicesWithClientCounts(); }
  getProductStats(serviceId: string): Promise<ProductStats> { return productsImpl.getProductStats(serviceId); }

  // ─── Product Drafts (Q28) — impl in ./storage/products.ts ───
  getLatestProductDraft(serviceId: string): Promise<ProductDraft | undefined> { return productsImpl.getLatestProductDraft(serviceId); }
  upsertProductDraft(data: Omit<InsertProductDraft, "status">): Promise<ProductDraft> { return productsImpl.upsertProductDraft(data); }
  addProductDraftApprover(draftId: number, userId: number, email: string | null): Promise<ProductDraft | undefined> { return productsImpl.addProductDraftApprover(draftId, userId, email); }

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

  rejectProductDraft(draftId: number, rejectedBy: number | null, reason: string | null): Promise<ProductDraft> { return productsImpl.rejectProductDraft(draftId, rejectedBy, reason); }

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
  // ─── Orders / Suppliers / Fulfillment (impl in ./storage/fulfillment.ts) ───
  listOrders(clientId?: number, limit = 50, offset = 0): Promise<Order[]> { return fulfillmentImpl.listOrders(clientId, limit, offset); }
  createOrder(data: InsertOrder): Promise<Order> { return fulfillmentImpl.createOrder(data); }
  createOrderItem(data: InsertOrderItem): Promise<OrderItem> { return fulfillmentImpl.createOrderItem(data); }
  listSuppliers(): Promise<Supplier[]> { return fulfillmentImpl.listSuppliers(); }
  getSupplierById(id: number): Promise<Supplier | undefined> { return fulfillmentImpl.getSupplierById(id); }
  getSupplierTasks(supplierId: number): Promise<FulfillmentTask[]> { return fulfillmentImpl.getSupplierTasks(supplierId); }
  createSupplier(data: InsertSupplier): Promise<Supplier> { return fulfillmentImpl.createSupplier(data); }
  updateSupplier(id: number, updates: Partial<InsertSupplier>): Promise<Supplier | undefined> { return fulfillmentImpl.updateSupplier(id, updates); }
  listSuppliersForService(serviceId: string): Promise<Supplier[]> { return fulfillmentImpl.listSuppliersForService(serviceId); }
  setSupplierServiceCost(supplierId: number, serviceId: string, cost: { cost_cents: number; cost_type?: string } | null): Promise<Supplier | undefined> { return fulfillmentImpl.setSupplierServiceCost(supplierId, serviceId, cost); }
  setSupplierServiceAssignment(supplierId: number, serviceId: string, assigned: boolean): Promise<Supplier | undefined> { return fulfillmentImpl.setSupplierServiceAssignment(supplierId, serviceId, assigned); }
  listFulfillmentTasks(opts: { clientId?: number; status?: string; limit?: number; offset?: number } = {}): Promise<(FulfillmentTask & { client_name?: string; supplier_name?: string; service_name?: string })[]> { return fulfillmentImpl.listFulfillmentTasks(opts); }
  listQaQueueTasks(): Promise<(FulfillmentTask & { client_name?: string; service_name?: string })[]> { return fulfillmentImpl.listQaQueueTasks(); }
  getFulfillmentTask(id: number): Promise<(FulfillmentTask & { client_name?: string; supplier_name?: string; service_name?: string }) | undefined> { return fulfillmentImpl.getFulfillmentTask(id); }
  createFulfillmentTask(data: InsertFulfillmentTask): Promise<FulfillmentTask> { return fulfillmentImpl.createFulfillmentTask(data); }
  updateFulfillmentTask(id: number, updates: Partial<InsertFulfillmentTask>): Promise<FulfillmentTask | undefined> { return fulfillmentImpl.updateFulfillmentTask(id, updates); }
  getOpenFulfillmentCount(): Promise<number> { return fulfillmentImpl.getOpenFulfillmentCount(); }

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

  // ─── Payments (impl in ./storage/billing.ts) ───
  listClientPayments(clientId: number): Promise<ClientPayment[]> { return billingImpl.listClientPayments(clientId); }
  listAllPayments(opts: { status?: string; limit?: number; offset?: number } = {}): Promise<(ClientPayment & { client_name?: string })[]> { return billingImpl.listAllPayments(opts); }

  async getActiveClientCountByService(): Promise<{ service_id: string; count: number }[]> {
    return db.select({
      service_id: clientServices.service_id,
      count: sql<number>`count(*)::int`,
    })
    .from(clientServices)
    .where(eq(clientServices.status, "active"))
    .groupBy(clientServices.service_id);
  }

  createClientPayment(data: InsertClientPayment): Promise<ClientPayment> { return billingImpl.createClientPayment(data); }
  updateClientPayment(id: number, updates: Partial<InsertClientPayment>): Promise<ClientPayment | undefined> { return billingImpl.updateClientPayment(id, updates); }
  getUnpaidTotal(): Promise<number> { return billingImpl.getUnpaidTotal(); }
  getMonthlyRevenue(): Promise<number> { return billingImpl.getMonthlyRevenue(); }

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

  findPaymentByStripeSession(sessionId: string): Promise<ClientPayment | undefined> { return billingImpl.findPaymentByStripeSession(sessionId); }

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

  findPendingPaymentForClientService(clientServiceId: number): Promise<ClientPayment | undefined> { return billingImpl.findPendingPaymentForClientService(clientServiceId); }

  getServiceById(serviceId: string): Promise<ServiceCatalogRow | undefined> { return productsImpl.getServiceById(serviceId); }

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
     RankFlow (impl in ./storage/rankflow.ts)
     ═══════════════════════════════════════════ */

  async getRankFlowProfile(clientId: number): Promise<RankflowProfile | undefined> { return rankflowImpl.getRankFlowProfile(clientId); }
  async upsertRankFlowProfile(clientId: number, data: Partial<InsertRankflowProfile>): Promise<RankflowProfile> { return rankflowImpl.upsertRankFlowProfile(clientId, data); }
  async listEnabledRankFlowProfiles(): Promise<RankflowProfile[]> { return rankflowImpl.listEnabledRankFlowProfiles(); }
  async createMonthlyPlan(data: InsertRankflowMonthlyPlan): Promise<RankflowMonthlyPlan> { return rankflowImpl.createMonthlyPlan(data); }
  async getMonthlyPlan(clientId: number, month: string): Promise<RankflowMonthlyPlan | undefined> { return rankflowImpl.getMonthlyPlan(clientId, month); }
  async updateMonthlyPlanStatus(planId: number, status: string): Promise<void> { return rankflowImpl.updateMonthlyPlanStatus(planId, status); }
  async createRankFlowTask(data: InsertRankflowTask): Promise<RankflowTask> { return rankflowImpl.createRankFlowTask(data); }
  async listTasksByClient(clientId: number): Promise<RankflowTask[]> { return rankflowImpl.listTasksByClient(clientId); }
  async listTasksByPlan(planId: number): Promise<RankflowTask[]> { return rankflowImpl.listTasksByPlan(planId); }
  async updateRankFlowTaskStatus(taskId: number, status: string): Promise<RankflowTask | undefined> { return rankflowImpl.updateRankFlowTaskStatus(taskId, status); }
  async createQACheck(data: InsertRankflowQaCheck): Promise<RankflowQaCheck> { return rankflowImpl.createQACheck(data); }
  async listQAChecks(taskId: number): Promise<RankflowQaCheck[]> { return rankflowImpl.listQAChecks(taskId); }
  async getRankFlowTaskById(taskId: number): Promise<RankflowTask | undefined> { return rankflowImpl.getRankFlowTaskById(taskId); }
  async assignRankflowTask(taskId: number, assignedTo: string): Promise<RankflowTask | undefined> { return rankflowImpl.assignRankflowTask(taskId, assignedTo); }
  async startRankflowTask(taskId: number): Promise<RankflowTask | undefined> { return rankflowImpl.startRankflowTask(taskId); }
  async submitRankflowTask(taskId: number, proofData: any): Promise<RankflowTask | undefined> { return rankflowImpl.submitRankflowTask(taskId, proofData); }
  async updateRankflowTaskQA(taskId: number, qaStatus: string, qaNotes: string | null): Promise<RankflowTask | undefined> { return rankflowImpl.updateRankflowTaskQA(taskId, qaStatus, qaNotes); }
  async approveRankflowTask(taskId: number, actualCost?: string): Promise<RankflowTask | undefined> { return rankflowImpl.approveRankflowTask(taskId, actualCost); }
  async rejectRankflowTask(taskId: number, rejectionReason: string): Promise<RankflowTask | undefined> { return rankflowImpl.rejectRankflowTask(taskId, rejectionReason); }
  async listPendingAITasks(planId: number): Promise<RankflowTask[]> { return rankflowImpl.listPendingAITasks(planId); }
  async upsertMonthlyProgress(clientId: number, month: string, data: Partial<InsertRankflowProgress>): Promise<RankflowProgress> { return rankflowImpl.upsertMonthlyProgress(clientId, month, data); }
  async getMonthlyProgress(clientId: number, month: string): Promise<RankflowProgress | undefined> { return rankflowImpl.getMonthlyProgress(clientId, month); }

  // ─── TradeLine (impl in ./storage/tradeline.ts) ───
  getTradeLineConfig(clientServiceId: number): Promise<TradelineConfig | undefined> { return tradelineImpl.getTradeLineConfig(clientServiceId); }
  updateTradeLineConfig(clientServiceId: number, partialConfig: Partial<TradelineConfig>): Promise<TradelineConfig> { return tradelineImpl.updateTradeLineConfig(clientServiceId, partialConfig); }
  setTradeLineMode(clientServiceId: number, newMode: string, changedBy: string, reason?: string): Promise<TradelineModeLog> { return tradelineImpl.setTradeLineMode(clientServiceId, newMode, changedBy, reason); }
  createTradeLineCallLog(data: InsertTradelineCallLog): Promise<TradelineCallLog | null> { return tradelineImpl.createTradeLineCallLog(data); }
  listTradeLineCalls(clientServiceId: number, limit = 50): Promise<TradelineCallLog[]> { return tradelineImpl.listTradeLineCalls(clientServiceId, limit); }
  getTradeLineCallById(callId: number): Promise<TradelineCallLog | undefined> { return tradelineImpl.getTradeLineCallById(callId); }
  listAllTradeLineCalls(filters: { clientId?: number; from?: Date; to?: Date; outcome?: string; limit?: number; offset?: number }): Promise<{ calls: (TradelineCallLog & { business_name: string; client_id: number })[]; total: number }> { return tradelineImpl.listAllTradeLineCalls(filters); }
  listTradeLineFleet(): Promise<Array<{ clientServiceId: number; clientId: number; businessName: string; serviceId: string; status: string; variant: string; mode: string; assistantStatus: string; lastCallAt: string | null; periodMinutes: number; failedCalls24h: number }>> { return tradelineImpl.listTradeLineFleet(); }
  upsertTradeLineUsage(clientServiceId: number, periodStart: Date, periodEnd: Date): Promise<TradelineUsage> { return tradelineImpl.upsertTradeLineUsage(clientServiceId, periodStart, periodEnd); }
  getTradeLineUsage(clientServiceId: number, periodStart?: Date): Promise<TradelineUsage | undefined> { return tradelineImpl.getTradeLineUsage(clientServiceId, periodStart); }
  findClientServiceByVapiPhoneNumberId(vapiPhoneNumberId: string): Promise<number | null> { return tradelineImpl.findClientServiceByVapiPhoneNumberId(vapiPhoneNumberId); }
  findClientServiceByPrimaryBusinessNumber(phoneNumber: string): Promise<number | null> { return tradelineImpl.findClientServiceByPrimaryBusinessNumber(phoneNumber); }
  updateTradeLineCallLeadData(callLogId: number, leadData: Record<string, unknown>): Promise<void> { return tradelineImpl.updateTradeLineCallLeadData(callLogId, leadData); }

  /* ═══════════════════════════════════════════
     RankFlow Vendor Batches (impl in ./storage/rankflow.ts)
     ═══════════════════════════════════════════ */

  async createRankflowVendorBatch(data: InsertRankflowVendorBatch): Promise<RankflowVendorBatch> { return rankflowImpl.createRankflowVendorBatch(data); }
  async getRankflowVendorBatch(batchId: number): Promise<RankflowVendorBatch | undefined> { return rankflowImpl.getRankflowVendorBatch(batchId); }
  async listRankflowVendorBatches(filters?: { status?: string; vendor_type?: string }): Promise<RankflowVendorBatch[]> { return rankflowImpl.listRankflowVendorBatches(filters); }
  async updateRankflowVendorBatchStatus(batchId: number, status: string, extra?: Record<string, any>): Promise<RankflowVendorBatch | undefined> { return rankflowImpl.updateRankflowVendorBatchStatus(batchId, status, extra); }
  async submitRankflowVendorBatch(batchId: number, proofData: any): Promise<RankflowVendorBatch | undefined> { return rankflowImpl.submitRankflowVendorBatch(batchId, proofData); }
  async linkTaskToBatch(taskId: number, batchId: number): Promise<void> { return rankflowImpl.linkTaskToBatch(taskId, batchId); }
  async listTasksByBatch(batchId: number): Promise<RankflowTask[]> { return rankflowImpl.listTasksByBatch(batchId); }
  async completeRankflowVendorBatch(batchId: number, actualCost?: string): Promise<RankflowVendorBatch | undefined> { return rankflowImpl.completeRankflowVendorBatch(batchId, actualCost); }
  async listUnbatchedOutsourcedTasks(): Promise<RankflowTask[]> { return rankflowImpl.listUnbatchedOutsourcedTasks(); }
  async getVendorStats(vendorType?: string): Promise<{
    vendor_type: string;
    total_batches: number;
    completed: number;
    failed: number;
    avg_cost: number | null;
  }[]> { return rankflowImpl.getVendorStats(vendorType); }

  /* ═══════════════════════════════════════════
     RankFlow Tracking (impl in ./storage/rankflow.ts)
     ═══════════════════════════════════════════ */

  async createKeywords(data: InsertRankflowKeyword[]): Promise<RankflowKeyword[]> { return rankflowImpl.createKeywords(data); }
  async listKeywordsByClient(clientId: number): Promise<RankflowKeyword[]> { return rankflowImpl.listKeywordsByClient(clientId); }
  async insertRankingRecord(data: InsertRankflowRanking): Promise<RankflowRanking> { return rankflowImpl.insertRankingRecord(data); }
  async getLastRankingForKeyword(keywordId: number): Promise<RankflowRanking | undefined> { return rankflowImpl.getLastRankingForKeyword(keywordId); }
  async upsertPage(clientId: number, url: string, data: Partial<InsertRankflowPage>): Promise<RankflowPage> { return rankflowImpl.upsertPage(clientId, url, data); }
  async listPagesByClient(clientId: number): Promise<RankflowPage[]> { return rankflowImpl.listPagesByClient(clientId); }
  async updatePageIndexStatus(pageId: number, indexed: boolean): Promise<void> { return rankflowImpl.updatePageIndexStatus(pageId, indexed); }
  async upsertSignalSummary(clientId: number, data: Partial<InsertRankflowSignal>): Promise<RankflowSignal> { return rankflowImpl.upsertSignalSummary(clientId, data); }
  async getSignalSummary(clientId: number): Promise<RankflowSignal | undefined> { return rankflowImpl.getSignalSummary(clientId); }
  // ─── TradeLine (continued, impl in ./storage/tradeline.ts) ───
  listTradeLineModeChanges(clientServiceId: number, limit = 50): Promise<TradelineModeLog[]> { return tradelineImpl.listTradeLineModeChanges(clientServiceId, limit); }
  incrementTradeLineUsage(clientServiceId: number, periodStart: Date, periodEnd: Date, increments: { voiceMinutes?: number; calls?: number; sms?: number }): Promise<TradelineUsage> { return tradelineImpl.incrementTradeLineUsage(clientServiceId, periodStart, periodEnd, increments); }
  getTradeLineProfitability(clientServiceId: number): Promise<{ revenue: number; voiceCost: number; smsCost: number; aiCost: number; totalCost: number; profit: number; margin: number; }> { return tradelineImpl.getTradeLineProfitability(clientServiceId); }

  // ─── SocialSync (impl in ./storage/socialsync.ts) ───

  async upsertSocialSyncProfile(data: InsertSocialSyncProfile): Promise<SocialSyncProfile> {
    return socialsyncImpl.upsertSocialSyncProfile(data);
  }
  async getSocialSyncProfile(clientId: number): Promise<SocialSyncProfile | undefined> {
    return socialsyncImpl.getSocialSyncProfile(clientId);
  }
  async createSocialSyncTopic(data: InsertSocialSyncTopic): Promise<SocialSyncTopic> {
    return socialsyncImpl.createSocialSyncTopic(data);
  }
  async createSocialSyncTopics(data: InsertSocialSyncTopic[]): Promise<SocialSyncTopic[]> {
    return socialsyncImpl.createSocialSyncTopics(data);
  }
  async listSocialSyncTopics(clientId: number, status?: string): Promise<SocialSyncTopic[]> {
    return socialsyncImpl.listSocialSyncTopics(clientId, status);
  }
  async updateSocialSyncTopic(id: number, updates: Partial<InsertSocialSyncTopic>): Promise<SocialSyncTopic | undefined> {
    return socialsyncImpl.updateSocialSyncTopic(id, updates);
  }
  async createSocialSyncPost(data: InsertSocialSyncPost): Promise<SocialSyncPost> {
    return socialsyncImpl.createSocialSyncPost(data);
  }
  async listSocialSyncPosts(clientId: number, opts: { status?: string; platform?: string; limit?: number; offset?: number } = {}): Promise<SocialSyncPost[]> {
    return socialsyncImpl.listSocialSyncPosts(clientId, opts);
  }
  async getSocialSyncPostById(id: number): Promise<SocialSyncPost | undefined> {
    return socialsyncImpl.getSocialSyncPostById(id);
  }
  async updateSocialSyncPost(id: number, updates: Partial<InsertSocialSyncPost>): Promise<SocialSyncPost | undefined> {
    return socialsyncImpl.updateSocialSyncPost(id, updates);
  }
  async enqueueSocialSyncJob(data: InsertSocialSyncQueueItem): Promise<SocialSyncQueueItem> {
    return socialsyncImpl.enqueueSocialSyncJob(data);
  }
  async fetchDueSocialSyncJobs(limit = 20): Promise<SocialSyncQueueItem[]> {
    return socialsyncImpl.fetchDueSocialSyncJobs(limit);
  }
  async updateSocialSyncQueueItem(id: number, updates: Record<string, any>): Promise<void> {
    return socialsyncImpl.updateSocialSyncQueueItem(id, updates);
  }
  async listSocialSyncQueue(clientId: number): Promise<SocialSyncQueueItem[]> {
    return socialsyncImpl.listSocialSyncQueue(clientId);
  }
  async createSocialSyncLog(data: InsertSocialSyncActivityLog): Promise<SocialSyncActivityLog> {
    return socialsyncImpl.createSocialSyncLog(data);
  }
  async listSocialSyncLogs(clientId: number, limit = 50): Promise<SocialSyncActivityLog[]> {
    return socialsyncImpl.listSocialSyncLogs(clientId, limit);
  }
  async upsertSocialSyncConnection(data: InsertSocialSyncConnection): Promise<SocialSyncConnection> {
    return socialsyncImpl.upsertSocialSyncConnection(data);
  }
  async listSocialSyncConnections(clientId: number): Promise<SocialSyncConnection[]> {
    return socialsyncImpl.listSocialSyncConnections(clientId);
  }
  async listEnabledSocialSyncProfiles(): Promise<SocialSyncProfile[]> {
    return socialsyncImpl.listEnabledSocialSyncProfiles();
  }
  async listRecentSocialSyncPosts(clientId: number, limit = 30): Promise<SocialSyncPost[]> {
    return socialsyncImpl.listRecentSocialSyncPosts(clientId, limit);
  }
  async listAllSocialSyncConnections(): Promise<SocialSyncConnection[]> {
    return socialsyncImpl.listAllSocialSyncConnections();
  }
  async fetchStaleSocialSyncLocks(thresholdMs: number): Promise<SocialSyncQueueItem[]> {
    return socialsyncImpl.fetchStaleSocialSyncLocks(thresholdMs);
  }

  // ─── Reviews (impl in ./storage/reviews.ts) ───

  async upsertReview(data: InsertReview): Promise<Review> {
    return reviewsImpl.upsertReview(data);
  }
  async listReviews(clientId: number, opts: { platform?: string; needsReply?: boolean; limit?: number } = {}): Promise<Review[]> {
    return reviewsImpl.listReviews(clientId, opts);
  }
  async getReviewByExternalId(clientId: number, platform: string, externalId: string): Promise<Review | undefined> {
    return reviewsImpl.getReviewByExternalId(clientId, platform, externalId);
  }
  async updateReview(id: number, updates: Partial<InsertReview>): Promise<Review | undefined> {
    return reviewsImpl.updateReview(id, updates);
  }
  async createReviewSyncLog(data: InsertReviewSyncLog): Promise<ReviewSyncLog> {
    return reviewsImpl.createReviewSyncLog(data);
  }

  // ─── Review Requests (impl in ./storage/reputation.ts) ───

  async createReviewRequest(data: InsertReviewRequest): Promise<ReviewRequest> {
    return reputationImpl.createReviewRequest(data);
  }
  async findReviewRequestByIdempotencyKey(key: string): Promise<ReviewRequest | undefined> {
    return reputationImpl.findReviewRequestByIdempotencyKey(key);
  }
  async getReviewRequestByDedupKey(key: string): Promise<ReviewRequest | undefined> {
    return reputationImpl.getReviewRequestByDedupKey(key);
  }
  async getReviewRequestByToken(token: string): Promise<ReviewRequest | undefined> {
    return reputationImpl.getReviewRequestByToken(token);
  }
  async getReviewRequestById(id: number): Promise<ReviewRequest | undefined> {
    return reputationImpl.getReviewRequestById(id);
  }
  async fetchDueReviewRequests(limit = 20): Promise<ReviewRequest[]> {
    return reputationImpl.fetchDueReviewRequests(limit);
  }
  async fetchDueReviewFollowups(limit = 20): Promise<ReviewRequest[]> {
    return reputationImpl.fetchDueReviewFollowups(limit);
  }
  async updateReviewRequest(id: number, updates: Record<string, any>): Promise<ReviewRequest | undefined> {
    return reputationImpl.updateReviewRequest(id, updates);
  }
  async listReviewRequests(clientId: number, limit?: number): Promise<ReviewRequest[]>;
  async listReviewRequests(opts?: { clientId?: number; status?: string; triggerSource?: string; hasFeedback?: boolean; dueForFollowup?: boolean; limit?: number; offset?: number }): Promise<ReviewRequest[]>;
  async listReviewRequests(
    clientIdOrOpts: number | { clientId?: number; status?: string; triggerSource?: string; hasFeedback?: boolean; dueForFollowup?: boolean; limit?: number; offset?: number } = {},
    limitArg?: number,
  ): Promise<ReviewRequest[]> {
    return reputationImpl.listReviewRequests(clientIdOrOpts, limitArg);
  }
  async countReviewRequests(opts: { clientId?: number; status?: string; triggerSource?: string; hasFeedback?: boolean; dueForFollowup?: boolean } = {}): Promise<number> {
    return reputationImpl.countReviewRequests(opts);
  }
  async getReviewRequestStats(): Promise<{ total: number; pending: number; sent: number; clicked: number; routed_positive: number; routed_negative: number; feedback_captured: number; completed: number; failed: number; stopped: number; due_for_followup: number }> {
    return reputationImpl.getReviewRequestStats();
  }
  async stopReviewRequestsForBooking(bookingId: number): Promise<void> {
    return reputationImpl.stopReviewRequestsForBooking(bookingId);
  }

  async findClientByUserId(userId: number): Promise<Client | undefined> {
    const [row] = await db.select().from(clients)
      .where(eq(clients.user_id, userId))
      .limit(1);
    return row;
  }

  // ═══════════════════════════════════════════════
  // Review-request suppression (DNC) — impl in ./storage/reputation.ts
  // ═══════════════════════════════════════════════

  async isReviewRequestSuppressed(
    clientId: number,
    customerEmail: string | null,
    customerPhone: string | null,
  ): Promise<boolean> {
    return reputationImpl.isReviewRequestSuppressed(clientId, customerEmail, customerPhone);
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
    return reputationImpl.addReviewRequestSuppression(data);
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
    return reputationImpl.listReviewRequestSuppression(clientId, opts);
  }
  async removeReviewRequestSuppression(clientId: number, id: number): Promise<boolean> {
    return reputationImpl.removeReviewRequestSuppression(clientId, id);
  }

  // ═══════════════════════════════════════════════
  // Multi-location Google Business Profile — impl in ./storage/reputation.ts
  // ═══════════════════════════════════════════════

  async listGoogleLocations(clientId: number): Promise<GoogleLocation[]> {
    return reputationImpl.listGoogleLocations(clientId);
  }
  async addGoogleLocation(data: InsertGoogleLocation): Promise<GoogleLocation> {
    return reputationImpl.addGoogleLocation(data);
  }
  async updateGoogleLocation(id: number, updates: Partial<InsertGoogleLocation>): Promise<GoogleLocation | undefined> {
    return reputationImpl.updateGoogleLocation(id, updates);
  }
  async setPrimaryGoogleLocation(clientId: number, locationId: number): Promise<boolean> {
    return reputationImpl.setPrimaryGoogleLocation(clientId, locationId);
  }
  async removeGoogleLocation(clientId: number, locationId: number): Promise<boolean> {
    return reputationImpl.removeGoogleLocation(clientId, locationId);
  }

  // ═══════════════════════════════════════════════
  // Rate-limit counters — impl in ./storage/reputation.ts
  // ═══════════════════════════════════════════════

  async countReviewRequestSendsToday(clientId: number, channel?: "sms" | "email"): Promise<number> {
    return reputationImpl.countReviewRequestSendsToday(clientId, channel);
  }

  // ═══════════════════════════════════════════════
  // Response edit audit — impl in ./storage/reputation.ts
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
    return reputationImpl.appendReviewResponseEdit(data);
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
    return reputationImpl.listReviewResponseEdits(monitoredReviewId);
  }

  // ═══════════════════════════════════════════════
  // Monitored Reviews — impl in ./storage/reputation.ts
  // ═══════════════════════════════════════════════

  async upsertMonitoredReview(data: InsertMonitoredReview): Promise<{ review: MonitoredReview; isNew: boolean }> {
    return reputationImpl.upsertMonitoredReview(data);
  }
  async getMonitoredReviewById(id: number): Promise<MonitoredReview | undefined> {
    return reputationImpl.getMonitoredReviewById(id);
  }
  async updateMonitoredReview(id: number, updates: Record<string, any>): Promise<MonitoredReview | undefined> {
    return reputationImpl.updateMonitoredReview(id, updates);
  }
  async findMonitoredReviewByDedupKey(dedupKey: string): Promise<MonitoredReview | undefined> {
    return reputationImpl.findMonitoredReviewByDedupKey(dedupKey);
  }
  async listMonitoredReviews(opts: { clientId?: number; platform?: string; isNew?: boolean; minRating?: number; maxRating?: number; limit?: number; offset?: number } = {}): Promise<MonitoredReview[]> {
    return reputationImpl.listMonitoredReviews(opts);
  }
  async countMonitoredReviews(opts: { clientId?: number; isNew?: boolean } = {}): Promise<number> {
    return reputationImpl.countMonitoredReviews(opts);
  }
  async getMonitoredReviewStats(clientId?: number): Promise<{ total: number; averageRating: number; newCount: number; withResponse: number; byRating: Record<number, number> }> {
    return reputationImpl.getMonitoredReviewStats(clientId);
  }
  async markMonitoredReviewsAcknowledged(ids: number[]): Promise<void> {
    return reputationImpl.markMonitoredReviewsAcknowledged(ids);
  }
  async listClientsForReviewSync(limit = 20): Promise<Client[]> {
    return reputationImpl.listClientsForReviewSync(limit);
  }
  async getClientReputationService(clientId: number): Promise<{ serviceId: string; status: string; metadata: any } | null> {
    return reputationImpl.getClientReputationService(clientId);
  }
  async getClientByWidgetToken(token: string): Promise<Client | undefined> {
    return reputationImpl.getClientByWidgetToken(token);
  }
  async ensureWidgetToken(clientId: number): Promise<string> {
    return reputationImpl.ensureWidgetToken(clientId);
  }
  async getWidgetReviews(clientId: number, minRating: number, limit: number): Promise<{ reviewer_name: string; rating: number; review_text: string | null; published_at: Date | null; platform: string }[]> {
    return reputationImpl.getWidgetReviews(clientId, minRating, limit);
  }
  async countReviewsMissingGoogleName(clientId?: number): Promise<number> {
    return reputationImpl.countReviewsMissingGoogleName(clientId);
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

  createSalesLead(data: InsertSalesLead): Promise<SalesLead> { return leadsImpl.createSalesLead(data); }
  listSalesLeads(status?: string): Promise<SalesLead[]> { return leadsImpl.listSalesLeads(status); }
  updateSalesLead(id: number, updates: Partial<InsertSalesLead>): Promise<SalesLead | undefined> { return leadsImpl.updateSalesLead(id, updates); }
  getSalesLeadById(id: number): Promise<SalesLead | undefined> { return leadsImpl.getSalesLeadById(id); }

  /* ═══════════════════════════════════════════
     ContentFlow (impl in ./storage/contentflow.ts)
     ═══════════════════════════════════════════ */

  createContentDraft(data: InsertContentDraft): Promise<ContentDraft> { return contentflowImpl.createContentDraft(data); }
  getContentDraftById(id: number): Promise<ContentDraft | undefined> { return contentflowImpl.getContentDraftById(id); }
  getContentDraftBySocialPostId(postId: number): Promise<ContentDraft | undefined> { return contentflowImpl.getContentDraftBySocialPostId(postId); }
  getContentDraftByTaskId(taskId: number): Promise<ContentDraft | undefined> { return contentflowImpl.getContentDraftByTaskId(taskId); }
  listContentDrafts(opts: { client_id?: number; status?: string; surface?: string; kind?: string; limit?: number; offset?: number } = {}): Promise<ContentDraft[]> { return contentflowImpl.listContentDrafts(opts); }
  updateContentDraft(id: number, updates: Partial<InsertContentDraft>): Promise<ContentDraft | undefined> { return contentflowImpl.updateContentDraft(id, updates); }
  getContentflowSettings(): Promise<ContentflowSettings> { return contentflowImpl.getContentflowSettings(); }
  updateContentflowSettings(patch: { kill_switch?: boolean; text_tier?: string; disabled_channels?: string[]; monthly_spend_cap_usd?: number | null }, updatedBy?: number): Promise<ContentflowSettings> { return contentflowImpl.updateContentflowSettings(patch, updatedBy); }
  getContentflowMonthlySpendMicroUsd(): Promise<number> { return contentflowImpl.getContentflowMonthlySpendMicroUsd(); }
  addDraftGenerationCost(draftId: number, microUsd: number): Promise<void> { return contentflowImpl.addDraftGenerationCost(draftId, microUsd); }
  findQueuedWordpressDrafts(opts: { limit?: number; now?: Date } = {}): Promise<ContentDraft[]> { return contentflowImpl.findQueuedWordpressDrafts(opts); }
  getReviewReplyDraft(clientId: number, externalReviewId: string): Promise<ContentDraft | undefined> { return contentflowImpl.getReviewReplyDraft(clientId, externalReviewId); }
  claimNextJob(platform: ContentJobPlatform, workerId: string, opts: { now?: Date; staleLockMs?: number } = {}): Promise<ContentDraft | null> { return contentflowImpl.claimNextJob(platform, workerId, opts); }
  recoverStaleClaims(platform: ContentJobPlatform, opts: { now?: Date; staleLockMs?: number } = {}): Promise<number> { return contentflowImpl.recoverStaleClaims(platform, opts); }
  createContentApproval(data: InsertContentApproval): Promise<ContentApproval> { return contentflowImpl.createContentApproval(data); }
  listContentApprovals(draftId: number): Promise<ContentApproval[]> { return contentflowImpl.listContentApprovals(draftId); }
  createContentAsset(data: InsertContentAsset): Promise<ContentAsset> { return contentflowImpl.createContentAsset(data); }
  getContentAssetById(id: number): Promise<ContentAsset | undefined> { return contentflowImpl.getContentAssetById(id); }
  listContentAssets(clientId: number): Promise<ContentAsset[]> { return contentflowImpl.listContentAssets(clientId); }
  deleteContentDraftCascade(draftId: number, postId?: number): Promise<{ deleted_draft: boolean; deleted_approvals: number; deleted_post: boolean }> { return contentflowImpl.deleteContentDraftCascade(draftId, postId); }

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

  // ─── Calendar Connections — Booking Engine (impl in ./storage/calendar.ts) ───

  async getCalendarConnection(clientId: number): Promise<CalendarConnection | undefined> {
    return calendarImpl.getCalendarConnection(clientId);
  }
  async listCalendarConnections(clientId?: number): Promise<CalendarConnection[]> {
    return calendarImpl.listCalendarConnections(clientId);
  }
  async createCalendarConnection(data: InsertCalendarConnection): Promise<CalendarConnection> {
    return calendarImpl.createCalendarConnection(data);
  }
  async updateCalendarConnection(id: number, updates: Partial<InsertCalendarConnection>): Promise<CalendarConnection | undefined> {
    return calendarImpl.updateCalendarConnection(id, updates);
  }
  async deleteCalendarConnection(id: number): Promise<CalendarConnection | undefined> {
    return calendarImpl.deleteCalendarConnection(id);
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
