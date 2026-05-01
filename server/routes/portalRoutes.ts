import type { Express, Request, Response, NextFunction } from "express";
import { requireClient, requireClientStrict, hashPassword, verifyPassword } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and, asc, desc, sql, gte } from "drizzle-orm";
import { chat as aiChat } from "../services/aiService";
import { generateMonthlyPlan } from "../services/rankflow/planGenerator";
import { generateTasksFromPlan } from "../services/rankflow/taskGenerator";
import { generateKeywordTargets, clusterKeywords, deriveTargetServices } from "../services/rankflow/keywordHelper";
import { createDraftFromRankflowTask, generateArticleBody } from "../services/contentflow/articleService";
import {
  readBrandProfile,
  mergeBrandProfile,
  sanitizeBrandProfilePatch,
} from "../services/contentflow/brandProfile";
import {
  clientApproveDraft,
  clientRequestChanges,
  clientRejectDraft,
} from "../services/contentflow/approvalService";
import { getOrCreateThread, loadThreadMessages, derivePageContext } from "../services/threadService";
import { authRateLimiter, portalReviewRateLimiter } from "../services/rateLimiter";

import {
  clients,
  clientServices,
  serviceCatalog,
  fulfillmentTasks,
  onboardingSubmissions,
  onboardingTemplates,
  clientPayments,
  users,
  calculators,
  leads,
  deploymentStatus,
  supportTickets,
  ticketMessages,
  ticketEvents,
  passwordResetTokens,
  rankflowProfiles,
  rankflowTasks,
  rankflowProgress,
  rankflowMonthlyPlans,
  reviewRequests,
  monitoredReviews,
  mapguardSnapshots,
  mapguardTasks,
  socialsyncPosts,
  socialsyncPublishQueue,
  contentDrafts,
  getTradeLineReadiness,
  mapOnboardingToTradeLineConfig,
  advanceSetupStage,
} from "@shared/schema";

import { compileMonthlyReport } from "../services/mapguardReports";
import { getExecutionUsage } from "../services/mapguardTaskEngine";
import { generateClientActivityFeed } from "../services/mapguardRetention";
import { getClientPerformanceSummary } from "../services/mapguardMonitor";

/* ─── Helpers ─── */

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}

/** Resolve client_id from the authenticated user's id. Returns null if no client record linked. */
async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

/** Middleware-style helper: resolve client_id or return 403. */
async function withClientId(req: Request, res: Response): Promise<number | null> {
  const clientId = await resolveClientId(req.user!.id);
  if (!clientId) {
    res.status(403).json({ error: "No client record linked to this account" });
    return null;
  }
  return clientId;
}

/* ─── Routes ─── */

export function registerPortalRoutes(app: Express) {
  /**
   * GET /api/portal/overview
   * Dashboard summary for the authenticated client.
   */
  app.get("/api/portal/overview", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      // Client info
      const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);

      // Active services count
      const [activeCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(clientServices)
        .where(and(eq(clientServices.client_id, clientId), sql`${clientServices.status} IN ('active', 'onboarding')`));

      // Pending onboarding count
      const [onboardingCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(onboardingSubmissions)
        .where(and(eq(onboardingSubmissions.client_id, clientId), sql`${onboardingSubmissions.status} IN ('not_sent', 'sent', 'viewed')`));

      // Items waiting on client
      const [waitingCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(fulfillmentTasks)
        .where(
          and(
            eq(fulfillmentTasks.client_id, clientId),
            eq(fulfillmentTasks.waiting_on, "client"),
            sql`${fulfillmentTasks.status} NOT IN ('delivered', 'cancelled')`
          )
        );

      // Outstanding balance
      const [balance] = await db
        .select({ total: sql<number>`coalesce(sum(${clientPayments.amount_cents}), 0)::int` })
        .from(clientPayments)
        .where(and(eq(clientPayments.client_id, clientId), eq(clientPayments.status, "pending")));

      // Recent activity (last 10 fulfilled tasks, client-safe fields only)
      const recentActivity = await db
        .select({
          id: fulfillmentTasks.id,
          title: fulfillmentTasks.title,
          status: fulfillmentTasks.status,
          completed_at: fulfillmentTasks.completed_at,
          updated_at: fulfillmentTasks.updated_at,
        })
        .from(fulfillmentTasks)
        .where(eq(fulfillmentTasks.client_id, clientId))
        .orderBy(desc(fulfillmentTasks.updated_at))
        .limit(10);

      res.json({
        business_name: client.business_name,
        contact_name: client.contact_name,
        contact_email: client.contact_email,
        active_services: activeCount?.count ?? 0,
        pending_onboarding: onboardingCount?.count ?? 0,
        action_needed: waitingCount?.count ?? 0,
        outstanding_balance_cents: balance?.total ?? 0,
        recent_activity: recentActivity,
      });
    } catch (err) {
      console.error("Portal overview error:", err);
      res.status(500).json({ error: "Failed to load overview" });
    }
  });

  /**
   * GET /api/portal/services
   * List all services for the authenticated client.
   */
  app.get("/api/portal/services", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      // Get client services joined with catalog
      const services = await db
        .select({
          id: clientServices.id,
          service_id: clientServices.service_id,
          service_name: serviceCatalog.name,
          category: serviceCatalog.category,
          status: clientServices.status,
          billing_period: clientServices.billing_period,
          started_at: clientServices.started_at,
          created_at: clientServices.created_at,
        })
        .from(clientServices)
        .leftJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
        .where(eq(clientServices.client_id, clientId))
        .orderBy(desc(clientServices.created_at));

      // For each service, get task counts + onboarding status
      const enriched = await Promise.all(
        services.map(async (svc) => {
          const [taskCounts] = await db
            .select({
              total: sql<number>`count(*)::int`,
              delivered: sql<number>`count(*) filter (where ${fulfillmentTasks.status} = 'delivered')::int`,
            })
            .from(fulfillmentTasks)
            .where(eq(fulfillmentTasks.client_service_id, svc.id));

          const [onboarding] = await db
            .select({
              id: onboardingSubmissions.id,
              status: onboardingSubmissions.status,
              responses: onboardingSubmissions.responses,
            })
            .from(onboardingSubmissions)
            .where(eq(onboardingSubmissions.client_service_id, svc.id))
            .limit(1);

          // Check if draft responses exist
          const hasResponses = onboarding?.responses != null
            && typeof onboarding.responses === "object"
            && Object.keys(onboarding.responses as Record<string, unknown>).length > 0;

          return {
            ...svc,
            tasks_total: taskCounts?.total ?? 0,
            tasks_delivered: taskCounts?.delivered ?? 0,
            onboarding_id: onboarding?.id ?? null,
            onboarding_status: onboarding?.status ?? null,
            onboarding_has_responses: hasResponses,
          };
        })
      );

      res.json({ services: enriched });
    } catch (err) {
      console.error("Portal services error:", err);
      res.status(500).json({ error: "Failed to load services" });
    }
  });

  /**
   * GET /api/portal/services/:id
   * Single service detail with tasks, onboarding status, and payments.
   */
  app.get("/api/portal/services/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const serviceId = parseInt(req.params.id as string);
      if (isNaN(serviceId)) return res.status(400).json({ error: "Invalid service id" });

      // Get service (scoped to client)
      const [service] = await db
        .select({
          id: clientServices.id,
          service_id: clientServices.service_id,
          service_name: serviceCatalog.name,
          category: serviceCatalog.category,
          status: clientServices.status,
          billing_period: clientServices.billing_period,
          price_cents: clientServices.price_cents,
          started_at: clientServices.started_at,
          completed_at: clientServices.completed_at,
          created_at: clientServices.created_at,
        })
        .from(clientServices)
        .leftJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
        .where(and(eq(clientServices.id, serviceId), eq(clientServices.client_id, clientId)))
        .limit(1);

      if (!service) return res.status(404).json({ error: "Service not found" });

      // Tasks — client-safe fields only
      const tasks = await db
        .select({
          id: fulfillmentTasks.id,
          title: fulfillmentTasks.title,
          status: fulfillmentTasks.status,
          waiting_on: fulfillmentTasks.waiting_on,
          due_at: fulfillmentTasks.due_at,
          completed_at: fulfillmentTasks.completed_at,
          sort_order: fulfillmentTasks.sort_order,
        })
        .from(fulfillmentTasks)
        .where(eq(fulfillmentTasks.client_service_id, serviceId))
        .orderBy(fulfillmentTasks.sort_order);

      // Filter waiting_on: only show if "client", otherwise null
      const safeTasks = tasks.map((t) => ({
        ...t,
        waiting_on: t.waiting_on === "client" ? "client" : null,
      }));

      // Onboarding submission status
      const [onboarding] = await db
        .select({
          id: onboardingSubmissions.id,
          status: onboardingSubmissions.status,
          submitted_at: onboardingSubmissions.submitted_at,
          approved_at: onboardingSubmissions.approved_at,
        })
        .from(onboardingSubmissions)
        .where(eq(onboardingSubmissions.client_service_id, serviceId))
        .limit(1);

      // Payments for this service
      const payments = await db
        .select({
          id: clientPayments.id,
          type: clientPayments.type,
          amount_cents: clientPayments.amount_cents,
          status: clientPayments.status,
          description: clientPayments.description,
          period_start: clientPayments.period_start,
          period_end: clientPayments.period_end,
          due_at: clientPayments.due_at,
          paid_at: clientPayments.paid_at,
          created_at: clientPayments.created_at,
        })
        .from(clientPayments)
        .where(eq(clientPayments.client_service_id, serviceId))
        .orderBy(desc(clientPayments.created_at));

      res.json({
        service,
        tasks: safeTasks,
        onboarding: onboarding ?? null,
        payments,
      });
    } catch (err) {
      console.error("Portal service detail error:", err);
      res.status(500).json({ error: "Failed to load service detail" });
    }
  });

  /**
   * GET /api/portal/billing
   * All payments/invoices for the authenticated client.
   */
  app.get("/api/portal/billing", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      // All payments with service name
      const payments = await db
        .select({
          id: clientPayments.id,
          type: clientPayments.type,
          amount_cents: clientPayments.amount_cents,
          status: clientPayments.status,
          description: clientPayments.description,
          service_name: serviceCatalog.name,
          period_start: clientPayments.period_start,
          period_end: clientPayments.period_end,
          due_at: clientPayments.due_at,
          paid_at: clientPayments.paid_at,
          created_at: clientPayments.created_at,
        })
        .from(clientPayments)
        .leftJoin(clientServices, eq(clientPayments.client_service_id, clientServices.id))
        .leftJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
        .where(eq(clientPayments.client_id, clientId))
        .orderBy(desc(clientPayments.created_at));

      // Summary aggregates
      const [summary] = await db
        .select({
          total_paid: sql<number>`coalesce(sum(case when ${clientPayments.status} = 'paid' then ${clientPayments.amount_cents} else 0 end), 0)::int`,
          total_pending: sql<number>`coalesce(sum(case when ${clientPayments.status} = 'pending' then ${clientPayments.amount_cents} else 0 end), 0)::int`,
        })
        .from(clientPayments)
        .where(eq(clientPayments.client_id, clientId));

      // Next due payment
      const [nextDue] = await db
        .select({
          due_at: clientPayments.due_at,
          amount_cents: clientPayments.amount_cents,
        })
        .from(clientPayments)
        .where(and(eq(clientPayments.client_id, clientId), eq(clientPayments.status, "pending")))
        .orderBy(clientPayments.due_at)
        .limit(1);

      res.json({
        payments,
        summary: {
          total_paid_cents: summary?.total_paid ?? 0,
          total_pending_cents: summary?.total_pending ?? 0,
          next_due_at: nextDue?.due_at ?? null,
          next_due_amount_cents: nextDue?.amount_cents ?? null,
        },
      });
    } catch (err) {
      console.error("Portal billing error:", err);
      res.status(500).json({ error: "Failed to load billing" });
    }
  });

  /**
   * GET /api/portal/settings
   * Client profile and account info.
   */
  app.get("/api/portal/settings", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
      const [user] = await db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, req.user!.id))
        .limit(1);

      res.json({
        business_name: client.business_name,
        contact_name: client.contact_name,
        contact_email: client.contact_email,
        contact_phone: client.contact_phone,
        website_url: client.website_url,
        trade_type: client.trade_type,
        account_email: user?.email ?? null,
      });
    } catch (err) {
      console.error("Portal settings error:", err);
      res.status(500).json({ error: "Failed to load settings" });
    }
  });

  /**
   * PATCH /api/portal/settings
   * Update client contact info.
   */
  app.patch("/api/portal/settings", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { contact_name, contact_email, contact_phone, website_url } = req.body;

      const updates: Record<string, string | undefined> = {};
      if (contact_name !== undefined) updates.contact_name = contact_name;
      if (contact_email !== undefined) updates.contact_email = contact_email;
      if (contact_phone !== undefined) updates.contact_phone = contact_phone;
      if (website_url !== undefined) updates.website_url = website_url;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      const [updated] = await db
        .update(clients)
        .set({ ...updates, updated_at: new Date() })
        .where(eq(clients.id, clientId))
        .returning();

      res.json({
        business_name: updated.business_name,
        contact_name: updated.contact_name,
        contact_email: updated.contact_email,
        contact_phone: updated.contact_phone,
        website_url: updated.website_url,
        trade_type: updated.trade_type,
      });
    } catch (err) {
      console.error("Portal settings update error:", err);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  /**
   * POST /api/portal/password
   * Change password for the authenticated client.
   */
  app.post("/api/portal/password", requireClient, async (req: Request, res: Response) => {
    try {
      const ip = getClientIp(req);
      if (!(await authRateLimiter.check(`pw:${ip}`))) {
        return res.status(429).json({ error: "Too many attempts. Please wait before trying again." });
      }

      const { current_password, new_password } = req.body;

      if (!current_password || typeof current_password !== "string") {
        return res.status(400).json({ error: "Current password is required" });
      }
      if (!new_password || typeof new_password !== "string" || new_password.length < 8) {
        return res.status(400).json({ error: "New password must be at least 8 characters" });
      }

      // Get current user with hash
      const [user] = await db
        .select({ id: users.id, password_hash: users.password_hash })
        .from(users)
        .where(eq(users.id, req.user!.id))
        .limit(1);

      if (!user) return res.status(404).json({ error: "User not found" });

      // Verify current password
      if (!verifyPassword(current_password, user.password_hash)) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      // Update password
      await db
        .update(users)
        .set({ password_hash: hashPassword(new_password) })
        .where(eq(users.id, req.user!.id));

      // Invalidate any existing reset tokens for this user
      await db
        .update(passwordResetTokens)
        .set({ used: true })
        .where(and(eq(passwordResetTokens.user_id, req.user!.id), eq(passwordResetTokens.used, false)));

      res.json({ ok: true });
    } catch (err) {
      console.error("Portal password change error:", err);
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  /**
   * GET /api/portal/onboarding
   * List pending onboarding submissions for the authenticated client.
   * Pending = status in ('not_sent', 'sent', 'viewed', 'needs_followup').
   * Used by the portal dashboard "Complete your setup" card.
   */
  app.get("/api/portal/onboarding", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const rows = await db
        .select({
          id: onboardingSubmissions.id,
          client_service_id: onboardingSubmissions.client_service_id,
          service_id: clientServices.service_id,
          service_name: serviceCatalog.name,
          status: onboardingSubmissions.status,
          sent_at: onboardingSubmissions.sent_at,
          created_at: onboardingSubmissions.created_at,
          has_draft: sql<boolean>`
            ${onboardingSubmissions.responses} IS NOT NULL
            AND jsonb_typeof(${onboardingSubmissions.responses}) = 'object'
            AND ${onboardingSubmissions.responses}::text <> '{}'
          `,
        })
        .from(onboardingSubmissions)
        .leftJoin(clientServices, eq(onboardingSubmissions.client_service_id, clientServices.id))
        .leftJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
        .where(and(
          eq(onboardingSubmissions.client_id, clientId),
          sql`${onboardingSubmissions.status} IN ('not_sent', 'sent', 'viewed', 'needs_followup')`,
        ))
        .orderBy(desc(onboardingSubmissions.created_at));

      res.json({ submissions: rows });
    } catch (err) {
      console.error("Portal pending-onboarding error:", err);
      res.status(500).json({ error: "Failed to load pending onboarding" });
    }
  });

  /**
   * GET /api/portal/onboarding/:id
   * Returns onboarding submission with template steps, scoped to client.
   */
  app.get("/api/portal/onboarding/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const submissionId = parseInt(req.params.id as string);
      if (isNaN(submissionId)) return res.status(400).json({ error: "Invalid onboarding id" });

      // Get submission scoped to client
      const [submission] = await db
        .select()
        .from(onboardingSubmissions)
        .where(and(eq(onboardingSubmissions.id, submissionId), eq(onboardingSubmissions.client_id, clientId)))
        .limit(1);

      if (!submission) return res.status(404).json({ error: "Onboarding not found" });

      // Get template
      const template = submission.template_id
        ? (await db.select().from(onboardingTemplates).where(eq(onboardingTemplates.id, submission.template_id)).limit(1))[0] ?? null
        : null;

      // Get service name
      const [cs] = await db
        .select({ service_id: clientServices.service_id })
        .from(clientServices)
        .where(eq(clientServices.id, submission.client_service_id))
        .limit(1);
      const [svc] = cs
        ? await db.select({ name: serviceCatalog.name }).from(serviceCatalog).where(eq(serviceCatalog.id, cs.service_id)).limit(1)
        : [null];

      // Mark as viewed on first access
      if (submission.status === "not_sent" || submission.status === "sent") {
        await db
          .update(onboardingSubmissions)
          .set({ status: "viewed", updated_at: new Date() })
          .where(eq(onboardingSubmissions.id, submissionId));
      }

      res.json({
        id: submission.id,
        client_service_id: submission.client_service_id,
        status: submission.status === "not_sent" || submission.status === "sent" ? "viewed" : submission.status,
        service_name: svc?.name ?? null,
        service_id: cs?.service_id ?? null,
        steps: (template?.steps ?? []) as { key: string; label: string; type: string; required: boolean }[],
        responses: (submission.responses ?? {}) as Record<string, { value: any; completed_at?: string }>,
        submitted_at: submission.submitted_at,
        approved_at: submission.approved_at,
      });
    } catch (err) {
      console.error("Portal onboarding GET error:", err);
      res.status(500).json({ error: "Failed to load onboarding form" });
    }
  });

  /**
   * PUT /api/portal/onboarding/:id
   * Save/submit onboarding responses, scoped to client.
   */
  app.put("/api/portal/onboarding/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const submissionId = parseInt(req.params.id as string);
      if (isNaN(submissionId)) return res.status(400).json({ error: "Invalid onboarding id" });

      const { responses, mode } = req.body;
      if (!responses || typeof responses !== "object") {
        return res.status(400).json({ error: "responses object is required" });
      }

      const isDraft = mode === "draft";

      // Verify ownership
      const [submission] = await db
        .select()
        .from(onboardingSubmissions)
        .where(and(eq(onboardingSubmissions.id, submissionId), eq(onboardingSubmissions.client_id, clientId)))
        .limit(1);

      if (!submission) return res.status(404).json({ error: "Onboarding not found" });

      if (submission.status === "approved") {
        return res.status(400).json({ error: "This form has already been approved and cannot be changed." });
      }

      if (submission.status === "submitted") {
        return res.status(400).json({ error: "This form has already been submitted. Please contact us if you need to make changes." });
      }

      if (isDraft) {
        // Save draft — store responses, keep status as "viewed"
        const newStatus = "viewed";
        await db
          .update(onboardingSubmissions)
          .set({ responses, status: newStatus, updated_at: new Date() })
          .where(eq(onboardingSubmissions.id, submissionId));
        res.json({ ok: true, status: newStatus, mode: "draft" });
      } else {
        // Final submit
        await db
          .update(onboardingSubmissions)
          .set({ responses, status: "submitted", submitted_at: new Date(), updated_at: new Date() })
          .where(eq(onboardingSubmissions.id, submissionId));

        // Map onboarding answers into TradeLine config if applicable
        if (submission.client_service_id) {
          try {
            const cs = await storage.getClientServiceById(submission.client_service_id);
            if (cs && cs.service_id.startsWith("tradeline")) {
              const config = await storage.getTradeLineConfig(cs.id);
              if (config) {
                const updates = mapOnboardingToTradeLineConfig(responses, config.variant);
                // Use safe stage advancement — never regress
                if (updates.setupStage) {
                  updates.setupStage = advanceSetupStage(config.setupStage, updates.setupStage);
                }
                if (Object.keys(updates).length > 0) {
                  await storage.updateTradeLineConfig(cs.id, updates);
                }
              }

              // Trigger assistant build (non-blocking)
              import("../services/vapiService").then(({ provisionTradeLineAssistant }) => {
                provisionTradeLineAssistant(cs.id).catch(err =>
                  console.warn(`[tradeline] Auto-build assistant failed for service #${cs.id}:`, err.message),
                );
              });
            }
          } catch (err) {
            console.warn("Portal onboarding: failed to map TradeLine config:", err);
          }
        }

        res.json({ ok: true, status: "submitted", mode: "submit" });
      }
    } catch (err) {
      console.error("Portal onboarding PUT error:", err);
      res.status(500).json({ error: "Failed to save onboarding" });
    }
  });

  /**
   * GET /api/portal/quotequick/summary
   * Returns QuoteQuick calculator summary for the authenticated client.
   * Links via clients.user_id → calculators.user_id.
   */
  app.get("/api/portal/quotequick/summary", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      // Get client's user_id
      const [client] = await db.select({ user_id: clients.user_id }).from(clients).where(eq(clients.id, clientId)).limit(1);
      if (!client?.user_id) return res.json({ calculator: null });

      // Find calculators owned by this user
      const calcs = await db
        .select()
        .from(calculators)
        .where(eq(calculators.user_id, client.user_id))
        .orderBy(desc(calculators.id))
        .limit(1);

      if (calcs.length === 0) return res.json({ calculator: null });

      const calc = calcs[0];

      // Get deployment status
      const [deploy] = await db
        .select({ status: deploymentStatus.status })
        .from(deploymentStatus)
        .where(eq(deploymentStatus.calculator_id, calc.id))
        .limit(1);

      // Get lead count
      const [leadCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leads)
        .where(eq(leads.calculator_id, calc.id));

      const tokenExpired = new Date() > new Date(calc.token_expires_at);

      res.json({
        calculator: {
          id: calc.id,
          business_name: calc.business_name,
          trade_type: calc.trade_type,
          slug: calc.slug,
          plan_tier: calc.plan_tier ?? "free",
          total_views: calc.total_views ?? 0,
          total_leads: leadCount?.count ?? 0,
          status: deploy?.status ?? "draft",
          calculator_url: `/calculator?slug=${calc.slug}`,
          edit_url: tokenExpired ? null : `/EditCalculator?token=${calc.edit_token}`,
          preview_url: tokenExpired ? null : `/calculator?slug=${calc.slug}&preview=${calc.edit_token}`,
          edit_token_expired: tokenExpired,
          created_at: calc.created_at,
        },
      });
    } catch (err) {
      console.error("Portal QuoteQuick summary error:", err);
      res.status(500).json({ error: "Failed to load QuoteQuick summary" });
    }
  });

  /* ═══════════════════════════════════════════
     Support Tickets (Portal / Customer)
     ═══════════════════════════════════════════ */

  /**
   * GET /api/portal/tickets
   * List support tickets for the authenticated client.
   * Returns customer-safe fields only.
   */
  app.get("/api/portal/tickets", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const tickets = await db
        .select({
          id: supportTickets.id,
          subject: supportTickets.subject,
          status: supportTickets.status,
          priority: supportTickets.priority,
          category: supportTickets.category,
          description: supportTickets.description,
          created_at: supportTickets.created_at,
          updated_at: supportTickets.updated_at,
          resolved_at: supportTickets.resolved_at,
          closed_at: supportTickets.closed_at,
          // Last customer-visible message preview (subquery)
          last_message_preview: sql<string | null>`(
            SELECT substring(${ticketMessages.content} from 1 for 120)
            FROM ${ticketMessages}
            WHERE ${ticketMessages.ticket_id} = ${supportTickets.id}
              AND ${ticketMessages.visibility} = 'customer'
            ORDER BY ${ticketMessages.created_at} DESC
            LIMIT 1
          )`,
          last_message_at: sql<string | null>`(
            SELECT ${ticketMessages.created_at}::text
            FROM ${ticketMessages}
            WHERE ${ticketMessages.ticket_id} = ${supportTickets.id}
              AND ${ticketMessages.visibility} = 'customer'
            ORDER BY ${ticketMessages.created_at} DESC
            LIMIT 1
          )`,
          last_message_author: sql<string | null>`(
            SELECT ${ticketMessages.author_type}
            FROM ${ticketMessages}
            WHERE ${ticketMessages.ticket_id} = ${supportTickets.id}
              AND ${ticketMessages.visibility} = 'customer'
            ORDER BY ${ticketMessages.created_at} DESC
            LIMIT 1
          )`,
        })
        .from(supportTickets)
        .where(eq(supportTickets.client_id, clientId))
        .orderBy(desc(supportTickets.created_at))
        .limit(50);

      res.json({ tickets });
    } catch (err) {
      console.error("Portal tickets list error:", err);
      res.status(500).json({ error: "Failed to load tickets" });
    }
  });

  /**
   * GET /api/portal/tickets/:id
   * Ticket detail with customer-visible messages only.
   * VISIBILITY RULE: only messages with visibility="customer" are returned.
   * Internal notes, AI summary, assignee, and admin metadata are NEVER exposed.
   */
  app.get("/api/portal/tickets/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const ticketId = parseInt(req.params.id as string);
      if (isNaN(ticketId)) return res.status(400).json({ error: "Invalid ticket id" });

      // Fetch ticket scoped to client
      const [ticket] = await db
        .select({
          id: supportTickets.id,
          subject: supportTickets.subject,
          status: supportTickets.status,
          priority: supportTickets.priority,
          category: supportTickets.category,
          description: supportTickets.description,
          created_at: supportTickets.created_at,
          updated_at: supportTickets.updated_at,
          resolved_at: supportTickets.resolved_at,
          closed_at: supportTickets.closed_at,
        })
        .from(supportTickets)
        .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.client_id, clientId)))
        .limit(1);

      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      // Messages — customer-visible only (server-side enforcement)
      const messages = await storage.listTicketMessages(ticketId, "customer");

      // Strip author_name for admin authors → show as "Support"
      const safeMessages = messages.map((m) => ({
        id: m.id,
        author_type: m.author_type === "admin" ? "support" : m.author_type,
        content: m.content,
        created_at: m.created_at,
      }));

      res.json({ ticket, messages: safeMessages });
    } catch (err) {
      console.error("Portal ticket detail error:", err);
      res.status(500).json({ error: "Failed to load ticket" });
    }
  });

  /**
   * POST /api/portal/tickets
   * Create a structured support ticket.
   * Requires subject (title) and message (description). Category optional.
   */
  app.post("/api/portal/tickets", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { subject, message, category, source, ai_summary, transcript_json } = req.body;

      if (!subject || typeof subject !== "string" || !subject.trim()) {
        return res.status(400).json({ error: "Subject is required" });
      }
      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }
      if (message.trim().length < 10) {
        return res.status(400).json({ error: "Message must be at least 10 characters" });
      }

      const validCategories = ["general", "billing", "service", "onboarding", "access", "other"];
      const validSources = ["manual", "ai_escalation"];
      const ticketCategory = validCategories.includes(category) ? category : "general";
      const ticketSource = validSources.includes(source) ? source : "manual";

      // Rate limit: max 3 tickets per client per 24 hours
      const [recentCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(supportTickets)
        .where(and(
          eq(supportTickets.client_id, clientId),
          sql`${supportTickets.created_at} > now() - interval '24 hours'`
        ));
      if ((recentCount?.count ?? 0) >= 3) {
        return res.status(429).json({ error: "You can create up to 3 tickets per day. Please try again later." });
      }

      const ticket = await storage.createSupportTicket({
        client_id: clientId,
        subject: subject.trim(),
        description: message.trim(),
        category: ticketCategory,
        source: ticketSource,
        ai_summary: typeof ai_summary === "string" ? ai_summary.trim() : null,
        transcript_json: Array.isArray(transcript_json) ? transcript_json : [],
        status: "open",
        priority: "normal",
        admin_notified: false,
      });

      // Create initial message in thread
      await storage.createTicketMessage({
        ticket_id: ticket.id,
        author_id: req.user!.id,
        author_type: "customer",
        visibility: "customer",
        content: message.trim(),
      });

      // Log creation event
      await storage.createTicketEvent({
        ticket_id: ticket.id,
        actor_id: req.user!.id,
        actor_type: "human",
        action: "created",
        new_value: "open",
        summary: `Ticket created by customer via ${ticketSource}`,
      });

      res.status(201).json({
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        category: ticket.category,
        created_at: ticket.created_at,
      });
    } catch (err) {
      console.error("Portal ticket create error:", err);
      res.status(500).json({ error: "Failed to create ticket" });
    }
  });

  /* ═══════════════════════════════════════════
     TradeLine
     ═══════════════════════════════════════════ */

  /** Verify a TradeLine client_service belongs to the authenticated client. */
  async function verifyTradeLineOwnership(
    req: Request,
    res: Response,
    clientServiceId: number,
  ): Promise<{ clientId: number; clientServiceId: number } | null> {
    const clientId = await withClientId(req, res);
    if (!clientId) return null;

    const [cs] = await db
      .select({ id: clientServices.id, client_id: clientServices.client_id, service_id: clientServices.service_id })
      .from(clientServices)
      .where(and(eq(clientServices.id, clientServiceId), eq(clientServices.client_id, clientId)))
      .limit(1);

    if (!cs || !cs.service_id.startsWith("tradeline")) {
      res.status(404).json({ error: "TradeLine service not found" });
      return null;
    }

    return { clientId, clientServiceId: cs.id };
  }

  /**
   * POST /api/portal/tickets/:id/messages
   * Add a customer reply to an existing ticket.
   * Only allowed on non-closed tickets owned by this client.
   * Auto-reverts status to "open" if ticket was "waiting_on_customer".
   */
  app.post("/api/portal/tickets/:id/messages", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const ticketId = parseInt(req.params.id as string);
      if (isNaN(ticketId)) return res.status(400).json({ error: "Invalid ticket id" });

      const { message } = req.body;
      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Verify ownership and status
      const ticket = await storage.getSupportTicketById(ticketId);
      if (!ticket || ticket.client_id !== clientId) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      if (ticket.status === "closed") {
        return res.status(400).json({ error: "This ticket is closed. Please create a new ticket if you need further help." });
      }

      // Create message
      await storage.createTicketMessage({
        ticket_id: ticketId,
        author_id: req.user!.id,
        author_type: "customer",
        visibility: "customer",
        content: message.trim(),
      });

      // Auto-revert to "open" if waiting on customer
      if (ticket.status === "waiting_on_customer") {
        await storage.updateSupportTicket(ticketId, { status: "open" });
        await storage.createTicketEvent({
          ticket_id: ticketId,
          actor_id: req.user!.id,
          actor_type: "system",
          action: "status_changed",
          old_value: "waiting_on_customer",
          new_value: "open",
          summary: "Status auto-reverted to open after customer reply",
        });
      }

      // Log reply event
      await storage.createTicketEvent({
        ticket_id: ticketId,
        actor_id: req.user!.id,
        actor_type: "human",
        action: "reply_added",
        summary: "Customer added a reply",
      });

      res.status(201).json({ ok: true });
    } catch (err) {
      console.error("Portal ticket reply error:", err);
      res.status(500).json({ error: "Failed to add reply" });
    }
  });

  /**
   * POST /api/portal/ai-chat
   * Context-aware AI assistant for onboarding or general help.
   *
   * ARCHITECTURE NOTE:
   * This is the SINGLE backend logic path for the portal assistant.
   * Two frontend surfaces call this same endpoint:
   *   - AiHelpSection (PortalHelp.tsx) — surface="help", escalation enabled
   *   - AiChatPanel (PortalOnboarding.tsx) — surface=undefined, escalation disabled
   * AiHelpSection is a local UI wrapper (inline chat + escalation confirmation).
   * There is ONE assistant, ONE endpoint, differentiated only by system prompt.
   *
   * ESCALATION FLOW:
   * 1. Main AI call generates a natural reply
   * 2. Separate lightweight classification call determines if the reply offers escalation
   * 3. If yes, a third call extracts a structured ticket draft
   * 4. Frontend shows the draft for user to confirm — no ticket is created server-side
   */
  app.post("/api/portal/ai-chat", requireClient, async (req: Request, res: Response) => {
    try {
      const { messages, context } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages array is required" });
      }

      // Client can signal "don't offer escalation" (e.g. after dismissing a draft)
      const skipEscalation = context?.skip_escalation === true;

      // Validate and sanitize message roles — only allow user/assistant
      const allowedRoles = new Set(["user", "assistant"]);
      const sanitizedMessages = messages
        .filter((m: any) => m && typeof m.content === "string" && allowedRoles.has(m.role))
        .slice(-10);

      let systemPrompt: string;
      let escalationEnabled = false;

      if (context?.surface === "help") {
        escalationEnabled = !skipEscalation;
        // General help context — with natural escalation behavior
        systemPrompt = `You are a helpful support assistant for WeFixTrades, a company that provides digital marketing services for trade businesses (plumbers, electricians, builders, etc.).

Services include: MapGuard (Google Business Profile), MapSetup (one-time GBP optimization), TradeLine (AI phone/chat), QuoteQuick (quote calculators), RankFlow (ongoing SEO), ReputationShield (review management), SocialSync (social media), SiteLaunch (website builds), WebCare (website maintenance), and WebFix (one-time website fixes).

Your job:
- Answer questions about how services work
- Explain billing, onboarding, and service delivery
- Help clients understand their portal and dashboard
- Keep answers short and practical (2-4 sentences)
- Use Australian English

When you CANNOT resolve the customer's issue (e.g. it requires account-specific action, is about something broken, or you've already tried and failed to help), offer to create a support ticket so a human can assist. Do this naturally in your reply — just suggest it as an option.

Do NOT offer a ticket when:
- You can answer the question yourself
- It's the user's first message and you haven't tried to help yet
- The question is vague — ask for clarification first

Do NOT:
- Make up account-specific details (balances, dates, statuses)
- Provide legal or financial advice
- Discuss internal pricing or margins
- Create tickets automatically — always offer first and let the user decide`;
      } else {
        // Onboarding context — no escalation
        const fieldList = (context?.fields ?? [])
          .map((f: { key: string; label: string; required: boolean }) =>
            `- ${f.label}${f.required ? " (required)" : " (optional)"}`)
          .join("\n");

        const currentValues = context?.current_responses
          ? Object.entries(context.current_responses)
              .filter(([, v]) => v !== "" && v !== false)
              .map(([k, v]) => `- ${k}: ${v}`)
              .join("\n")
          : "None filled yet.";

        systemPrompt = `You are a helpful onboarding assistant for WeFixTrades, a company that provides digital marketing and trade business services.

The client is filling out an onboarding form for: ${context?.service_name ?? "a service"} (${context?.service_id ?? ""}).

The form fields are:
${fieldList}

What the client has filled in so far:
${currentValues}

Your job:
- Help explain what each field means in simple terms
- Suggest answers based on the client's business
- Ask clarifying questions to help them think
- Keep answers short and practical (1-3 sentences)
- Use Australian English
- Never auto-submit or override their input
- If they seem stuck, ask "What services bring you most jobs?" or similar to get them started

Do NOT:
- Make up specific business details
- Provide legal or financial advice
- Discuss pricing of WeFixTrades services`;
      }

      const reply = await aiChat({
        system: systemPrompt,
        messages: sanitizedMessages.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        maxTokens: 400,
      });

      // ─── Structured escalation detection (classification step) ───
      // Instead of fragile string matching, use a lightweight AI classification
      // to determine whether the reply offers/suggests escalation to human support.
      if (!escalationEnabled) {
        return res.json({ reply });
      }

      let hasEscalationOffer = false;
      try {
        const classification = await aiChat({
          system: `You are a binary classifier. Given an assistant reply from a customer support chat, determine if the assistant is offering, suggesting, or asking the customer about creating a support ticket or escalating to a human agent.

Answer ONLY "YES" or "NO". Nothing else.`,
          messages: [{ role: "user" as const, content: reply }],
          maxTokens: 5,
        });
        hasEscalationOffer = classification.trim().toUpperCase().startsWith("YES");
      } catch (err) {
        console.error("[portal-ai] Escalation classification failed:", err);
        // On failure, don't block the reply — just skip escalation
      }

      if (!hasEscalationOffer) {
        return res.json({ reply });
      }

      // ─── Draft extraction (only runs when escalation detected) ───
      const conversationSummary = sanitizedMessages
        .map((m: { role: string; content: string }) => `${m.role === "user" ? "Customer" : "Assistant"}: ${m.content}`)
        .join("\n");

      let escalationDraft = null;
      try {
        const draftJson = await aiChat({
          system: `You are extracting a structured support ticket draft from a customer support conversation.
Given the conversation below, create a JSON object with these fields:
- "subject": A clear, concise ticket title (max 80 characters). Describe the customer's issue, not a question.
- "category": Exactly one of: general, billing, service, onboarding, access, other
- "description": A 2-4 sentence description of what the customer needs, written from the customer's perspective.
- "ai_summary": A 1-2 sentence internal note for the support team about what was discussed and what the customer needs.

Respond with ONLY valid JSON, no markdown fences, no explanation.`,
          messages: [{ role: "user" as const, content: conversationSummary }],
          maxTokens: 300,
        });

        // Parse JSON from AI response — handle potential markdown fences
        const jsonStr = draftJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        const parsed = JSON.parse(jsonStr);

        // Validate required fields
        const validCategories = ["general", "billing", "service", "onboarding", "access", "other"];
        if (parsed.subject && parsed.description) {
          escalationDraft = {
            subject: String(parsed.subject).slice(0, 100),
            category: validCategories.includes(parsed.category) ? parsed.category : "general",
            description: String(parsed.description).slice(0, 2000),
            ai_summary: parsed.ai_summary ? String(parsed.ai_summary).slice(0, 500) : null,
          };
        }
      } catch (err) {
        console.error("[portal-ai] Failed to generate escalation draft:", err);
        // Don't fail the request — just return the reply without the draft
      }

      res.json({ reply, escalation_draft: escalationDraft });
    } catch (err) {
      console.error("Portal AI chat error:", err);
      res.json({ reply: "Sorry, the assistant is temporarily unavailable. You can still fill in the form manually." });
    }
  });

  /**
   * GET /api/portal/tradeline/:clientServiceId
   * Returns TradeLine config, latest usage, and recent calls.
   */
  app.get("/api/portal/tradeline/:clientServiceId", requireClient, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(req.params.clientServiceId as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const ownership = await verifyTradeLineOwnership(req, res, csId);
      if (!ownership) return;

      const [config, usage, calls] = await Promise.all([
        storage.getTradeLineConfig(csId),
        storage.getTradeLineUsage(csId),
        storage.listTradeLineCalls(csId, 10),
      ]);

      res.json({
        config: config ?? null,
        usage: usage ?? null,
        recentCalls: calls,
        setupStage: config?.setupStage ?? "not_started",
        readiness: config ? getTradeLineReadiness(config) : null,
        assistantStatus: config?.assistant?.status ?? "not_built",
      });
    } catch (err) {
      console.error("Portal tradeline GET error:", err);
      res.status(500).json({ error: "Failed to load TradeLine data" });
    }
  });

  /**
   * POST /api/portal/tradeline/:clientServiceId/mode
   * Switch TradeLine mode (available / on_the_job / after_hours).
   */
  app.post("/api/portal/tradeline/:clientServiceId/mode", requireClient, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(req.params.clientServiceId as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const ownership = await verifyTradeLineOwnership(req, res, csId);
      if (!ownership) return;

      const { newMode } = req.body;
      const validModes = ["available", "on_the_job", "after_hours"];
      if (!newMode || !validModes.includes(newMode)) {
        return res.status(400).json({ error: "newMode must be one of: available, on_the_job, after_hours" });
      }

      const modeLog = await storage.setTradeLineMode(csId, newMode, "client");
      const config = await storage.getTradeLineConfig(csId);

      res.json({ config, modeLog });
    } catch (err) {
      console.error("Portal tradeline mode error:", err);
      res.status(500).json({ error: "Failed to update mode" });
    }
  });

  /**
   * POST /api/portal/tradeline/:clientServiceId/settings
   * Client-facing config update for voice, personality, and widget style.
   * Only allows updating curated fields — not raw config.
   */
  app.post("/api/portal/tradeline/:clientServiceId/settings", requireClient, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(req.params.clientServiceId as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const ownership = await verifyTradeLineOwnership(req, res, csId);
      if (!ownership) return;

      const { voice, personality, widgetStyle } = req.body;
      const update: Record<string, any> = {};

      if (voice && typeof voice === "object") update.voice = voice;
      if (personality && typeof personality === "object") update.personality = personality;
      if (widgetStyle && typeof widgetStyle === "object") update.widgetStyle = widgetStyle;

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: "No valid settings provided" });
      }

      const config = await storage.updateTradeLineConfig(csId, update);
      res.json({ config });
    } catch (err) {
      console.error("Portal tradeline settings error:", err);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  /**
   * GET /api/portal/tradeline/:clientServiceId/calls
   * Paginated call log list.
   */
  app.get("/api/portal/tradeline/:clientServiceId/calls", requireClient, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(req.params.clientServiceId as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const ownership = await verifyTradeLineOwnership(req, res, csId);
      if (!ownership) return;

      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const calls = await storage.listTradeLineCalls(csId, limit);

      res.json({ calls });
    } catch (err) {
      console.error("Portal tradeline calls error:", err);
      res.status(500).json({ error: "Failed to load call log" });
    }
  });

  /**
   * GET /api/portal/tradeline/:clientServiceId/widget-config
   * Minimal config payload for future widget embed / hosted fallback.
   */
  app.get("/api/portal/tradeline/:clientServiceId/widget-config", requireClient, async (req: Request, res: Response) => {
    try {
      const csId = parseInt(req.params.clientServiceId as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      const ownership = await verifyTradeLineOwnership(req, res, csId);
      if (!ownership) return;

      const config = await storage.getTradeLineConfig(csId);
      if (!config) return res.status(404).json({ error: "TradeLine not configured" });

      // Get business name from client record
      const [client] = await db
        .select({ business_name: clients.business_name })
        .from(clients)
        .where(eq(clients.id, ownership.clientId))
        .limit(1);

      res.json({
        channels: config.channels,
        embedMode: config.website.embedMode,
        hostedUrl: config.website.hostedUrl || null,
        businessName: client?.business_name ?? null,
        mode: config.currentMode,
      });
    } catch (err) {
      console.error("Portal tradeline widget-config error:", err);
      res.status(500).json({ error: "Failed to load widget config" });
    }
  });

  /**
   * GET /api/portal/thread/messages
   * Returns the active thread's message history for the authenticated portal user.
   * Used by PortalChatWidget to hydrate on mount (source of truth for persistence).
   */
  app.get("/api/portal/thread/messages", requireClient, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const page = typeof req.query.page === "string" ? req.query.page : undefined;
      const pageCtx = derivePageContext(page);
      const { id: threadId, isNew } = await getOrCreateThread(userId, "portal", pageCtx);

      if (isNew) {
        return res.json({ threadId, messages: [], pageContext: pageCtx });
      }

      const messages = await loadThreadMessages(threadId);
      res.json({ threadId, messages, pageContext: pageCtx });
    } catch (err) {
      console.error("Portal thread messages error:", err);
      res.status(500).json({ error: "Failed to load conversation" });
    }
  });

  /**
   * GET /api/portal/reputation
   * Client-facing reputation report — clean, positive-framed metrics.
   * No internal noise (errors, queue states, system details).
   */
  app.get("/api/portal/reputation", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const allReviews = await storage.listReviews(clientId, { limit: 200 });
      const requests = await storage.listReviewRequests(clientId, 200);

      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const thirtyDays = 30 * day;

      // Review metrics
      const recentReviews = allReviews.filter(r => r.review_time && (now - new Date(r.review_time).getTime()) < thirtyDays);
      const prevMonthReviews = allReviews.filter(r => r.review_time && (now - new Date(r.review_time).getTime()) >= thirtyDays && (now - new Date(r.review_time).getTime()) < 2 * thirtyDays);
      const ratings = allReviews.filter(r => r.star_rating).map(r => r.star_rating!);
      const recentRatings = recentReviews.filter(r => r.star_rating).map(r => r.star_rating!);
      const prevRatings = prevMonthReviews.filter(r => r.star_rating).map(r => r.star_rating!);
      const avgRating = ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;
      const avgRatingRecent = recentRatings.length > 0 ? Math.round((recentRatings.reduce((a, b) => a + b, 0) / recentRatings.length) * 10) / 10 : null;
      const avgRatingPrev = prevRatings.length > 0 ? Math.round((prevRatings.reduce((a, b) => a + b, 0) / prevRatings.length) * 10) / 10 : null;

      // Replies — client-friendly language
      const repliedCount = allReviews.filter(r => r.reply_status === "auto_replied" || r.reply_status === "manually_replied" || r.has_existing_owner_reply).length;
      const replyRate = allReviews.length > 0 ? Math.round((repliedCount / allReviews.length) * 100) : null;

      // Requests — client-friendly
      const sentRequests = requests.filter(r => r.status === "sent" || r.status === "delivered");
      const attributed = sentRequests.filter(r => r.attributed_review_id);
      const responseRate = sentRequests.length > 0 ? Math.round((attributed.length / sentRequests.length) * 100) : null;

      // Avg days to review
      const daysList: number[] = [];
      for (const req of attributed) {
        if (req.sent_at) {
          const matchedReview = allReviews.find(r => r.id === req.attributed_review_id);
          if (matchedReview?.review_time) {
            const d = (new Date(matchedReview.review_time).getTime() - new Date(req.sent_at).getTime()) / day;
            if (d >= 0) daysList.push(d);
          }
        }
      }
      const avgDays = daysList.length > 0 ? Math.round((daysList.reduce((a, b) => a + b, 0) / daysList.length) * 10) / 10 : null;

      // Weekly trend (last 8 weeks)
      const weeklyTrend: { week: string; reviews: number }[] = [];
      for (let i = 7; i >= 0; i--) {
        const weekStart = now - (i + 1) * 7 * day;
        const weekEnd = now - i * 7 * day;
        const count = allReviews.filter(r => r.review_time && new Date(r.review_time).getTime() >= weekStart && new Date(r.review_time).getTime() < weekEnd).length;
        weeklyTrend.push({ week: new Date(weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }), reviews: count });
      }

      // Latest positive reviews (client-safe subset)
      const latestPositive = allReviews
        .filter(r => (r.star_rating || 0) >= 4 && r.review_text)
        .slice(0, 5)
        .map(r => ({
          reviewer: r.reviewer_name || "A customer",
          rating: r.star_rating,
          text: (r.review_text || "").slice(0, 150) + ((r.review_text || "").length > 150 ? "..." : ""),
          date: r.review_time ? new Date(r.review_time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null,
          replied: r.reply_status === "auto_replied" || r.reply_status === "manually_replied" || r.has_existing_owner_reply,
        }));

      // Recent replies we posted
      const recentReplies = allReviews
        .filter(r => (r.reply_status === "auto_replied" || r.reply_status === "manually_replied") && r.reply_posted_at)
        .sort((a, b) => new Date(b.reply_posted_at!).getTime() - new Date(a.reply_posted_at!).getTime())
        .slice(0, 3)
        .map(r => ({
          reviewer: r.reviewer_name || "A customer",
          rating: r.star_rating,
          date: r.reply_posted_at ? new Date(r.reply_posted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null,
        }));

      res.json({
        summary: {
          reviews_this_month: recentReviews.length,
          reviews_last_month: prevMonthReviews.length,
          reviews_change: recentReviews.length - prevMonthReviews.length,
          total_reviews: allReviews.length,
          average_rating: avgRating,
          average_rating_this_month: avgRatingRecent,
          average_rating_last_month: avgRatingPrev,
          reply_rate: replyRate,
        },
        activity: {
          reviews_responded_to: repliedCount,
          review_requests_sent: sentRequests.length,
          reviews_generated: attributed.length,
          estimated_response_rate: responseRate,
          avg_days_to_review: avgDays,
        },
        weekly_trend: weeklyTrend,
        latest_reviews: latestPositive,
        recent_replies: recentReplies,
      });
    } catch (err: any) {
      console.error("Portal reputation error:", err);
      res.status(500).json({ error: "Failed to load reputation report" });
    }
  });

  /**
   * GET /api/portal/socialsync-profile
   * Get the client's SocialSync profile.
   */
  app.get("/api/portal/socialsync-profile", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const profile = await storage.getSocialSyncProfile(clientId);
      if (!profile) return res.json({ exists: false });
      res.json(profile);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to load profile" });
    }
  });

  /**
   * POST /api/portal/socialsync-setup
   * Create or update SocialSync profile from onboarding wizard.
   */
  app.post("/api/portal/socialsync-setup", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { niche, location, services, service_focus, tone, frequency, platform_preferences, enabled, autopilot } = req.body;

      const profile = await storage.upsertSocialSyncProfile({
        client_id: clientId,
        enabled: enabled ?? true,
        niche: niche || null,
        location: location || null,
        services: services || null,
        service_focus: service_focus || null,
        tone: tone || "professional",
        frequency: frequency || "3_per_week",
        // Default to autopilot ON — customer expects content to flow after
        // onboarding. They can review each post via the approval queue before
        // it publishes; if they do nothing, posts auto-approve at scheduled time.
        autopilot: autopilot ?? true,
        platform_preferences: platform_preferences || ["facebook", "instagram"],
      } as any);

      await storage.createSocialSyncLog({
        client_id: clientId,
        entity_type: "profile",
        entity_id: profile.id,
        action: "profile.onboarding_completed",
        status: "success",
        details: { source: "portal_setup" },
      });

      res.status(201).json(profile);
    } catch (err: any) {
      console.error("Portal SocialSync setup error:", err);
      res.status(500).json({ error: "Failed to save profile" });
    }
  });

  /**
   * GET /api/portal/socialsync/pending
   * List posts awaiting customer approval (status=pending_approval),
   * scoped to the authenticated client. Used by the portal approval queue UI.
   */
  app.get("/api/portal/socialsync/pending", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const rows = await db.select({
        id: socialsyncPosts.id,
        platform: socialsyncPosts.platform,
        post_text: socialsyncPosts.post_text,
        hashtags: socialsyncPosts.hashtags,
        media_plan: socialsyncPosts.media_plan,
        scheduled_for: socialsyncPosts.scheduled_for,
        created_at: socialsyncPosts.created_at,
      })
        .from(socialsyncPosts)
        .where(and(
          eq(socialsyncPosts.client_id, clientId),
          eq(socialsyncPosts.status, "pending_approval"),
        ))
        .orderBy(asc(socialsyncPosts.scheduled_for));

      res.json({ posts: rows });
    } catch (err) {
      console.error("Portal socialsync pending error:", err);
      res.status(500).json({ error: "Failed to load pending posts" });
    }
  });

  /**
   * POST /api/portal/socialsync/posts/:id/approve
   * Customer explicitly approves a pending post — flips status to "queued"
   * so the worker will publish at scheduled_for.
   */
  app.post("/api/portal/socialsync/posts/:id/approve", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const postId = parseInt(req.params.id as string);
      if (isNaN(postId)) return res.status(400).json({ error: "Invalid post id" });

      const post = await storage.getSocialSyncPostById(postId);
      if (!post || post.client_id !== clientId) return res.status(404).json({ error: "Post not found" });
      if (post.status !== "pending_approval") {
        return res.status(400).json({ error: `Post is "${post.status}" — only pending_approval posts can be approved` });
      }

      const updated = await storage.updateSocialSyncPost(postId, { status: "queued" } as any);
      await storage.createSocialSyncLog({
        client_id: clientId,
        entity_type: "post",
        entity_id: postId,
        action: "post.customer_approved",
        status: "success",
        details: { approved_via: "portal" },
      });

      res.json({ ok: true, post: updated });
    } catch (err) {
      console.error("Portal socialsync approve error:", err);
      res.status(500).json({ error: "Failed to approve post" });
    }
  });

  /**
   * POST /api/portal/socialsync/posts/:id/reject
   * Customer rejects a pending post — cancels the queue item and marks rejected.
   */
  app.post("/api/portal/socialsync/posts/:id/reject", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const postId = parseInt(req.params.id as string);
      if (isNaN(postId)) return res.status(400).json({ error: "Invalid post id" });

      const post = await storage.getSocialSyncPostById(postId);
      if (!post || post.client_id !== clientId) return res.status(404).json({ error: "Post not found" });
      if (post.status !== "pending_approval") {
        return res.status(400).json({ error: `Post is "${post.status}" — only pending_approval posts can be rejected` });
      }

      // Mark post rejected. Worker validation will skip it on queue pickup.
      await storage.updateSocialSyncPost(postId, {
        status: "rejected",
        failure_reason: (req.body?.reason as string) || "Rejected by customer",
      } as any);

      // Cancel any pending queue items for this post
      await db.update(socialsyncPublishQueue)
        .set({ status: "cancelled", updated_at: new Date() })
        .where(and(
          eq(socialsyncPublishQueue.post_id, postId),
          sql`${socialsyncPublishQueue.status} IN ('pending', 'locked')`,
        ));

      await storage.createSocialSyncLog({
        client_id: clientId,
        entity_type: "post",
        entity_id: postId,
        action: "post.customer_rejected",
        status: "info",
        details: { rejected_via: "portal", reason: req.body?.reason },
      });

      res.json({ ok: true });
    } catch (err) {
      console.error("Portal socialsync reject error:", err);
      res.status(500).json({ error: "Failed to reject post" });
    }
  });

  /**
   * PATCH /api/portal/socialsync/posts/:id
   * Customer edits a pending post's text/hashtags. After edit the post is
   * considered approved and moves to "queued".
   * Body: { post_text?: string, hashtags?: string[] }
   */
  app.patch("/api/portal/socialsync/posts/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const postId = parseInt(req.params.id as string);
      if (isNaN(postId)) return res.status(400).json({ error: "Invalid post id" });

      const post = await storage.getSocialSyncPostById(postId);
      if (!post || post.client_id !== clientId) return res.status(404).json({ error: "Post not found" });
      if (post.status !== "pending_approval") {
        return res.status(400).json({ error: `Post is "${post.status}" — only pending_approval posts can be edited` });
      }

      const { post_text, hashtags } = req.body || {};
      const updates: any = { status: "queued" };
      if (typeof post_text === "string") {
        if (post_text.trim().length < 10) return res.status(400).json({ error: "post_text must be at least 10 characters" });
        if (post_text.length > 3000) return res.status(400).json({ error: "post_text too long" });
        updates.post_text = post_text.trim();
      }
      if (Array.isArray(hashtags)) {
        updates.hashtags = hashtags.slice(0, 30).map((h: any) => String(h));
      }

      const updated = await storage.updateSocialSyncPost(postId, updates);
      await storage.createSocialSyncLog({
        client_id: clientId,
        entity_type: "post",
        entity_id: postId,
        action: "post.customer_edited",
        status: "success",
        details: { edited_fields: Object.keys(updates).filter(k => k !== "status") },
      });

      res.json({ ok: true, post: updated });
    } catch (err) {
      console.error("Portal socialsync edit error:", err);
      res.status(500).json({ error: "Failed to edit post" });
    }
  });

  /**
   * GET /api/portal/socialsync-connections/:platform
   * Check if a platform is connected for the client.
   */
  app.get("/api/portal/socialsync-connections/:platform", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const connections = await storage.listSocialSyncConnections(clientId);
      const conn = connections.find(c => c.platform === req.params.platform);

      res.json({
        connected: conn?.connection_status === "connected" || conn?.connection_status === "expiring_soon",
        status: conn?.connection_status || "not_connected",
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to check connection" });
    }
  });

  /**
   * GET /api/portal/socialsync
   * Client-facing SocialSync activity report.
   */
  app.get("/api/portal/socialsync", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const profile = await storage.getSocialSyncProfile(clientId);
      const posts = await storage.listSocialSyncPosts(clientId, { limit: 100 });
      const connections = await storage.listSocialSyncConnections(clientId);

      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const thirtyDays = 30 * day;

      // Metrics
      const publishedPosts = posts.filter(p => p.status === "published");
      const publishedThisMonth = publishedPosts.filter(p => p.published_at && (now - new Date(p.published_at).getTime()) < thirtyDays);
      const queuedPosts = posts.filter(p => p.status === "queued" && p.scheduled_for);

      // Next scheduled
      const nextPost = queuedPosts
        .filter(p => p.scheduled_for && new Date(p.scheduled_for).getTime() > now)
        .sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime())[0];

      // Platforms
      const platforms = ["facebook", "instagram", "google_business"].map(p => {
        const conn = connections.find(c => c.platform === p);
        return {
          platform: p === "google_business" ? "Google Business" : p.charAt(0).toUpperCase() + p.slice(1),
          connected: conn?.connection_status === "connected" || conn?.connection_status === "expiring_soon",
        };
      });

      // Client-safe status
      let status: "setup_in_progress" | "needs_connection" | "ready" | "active";
      if (!profile?.niche || !profile?.location) {
        status = "setup_in_progress";
      } else if (!platforms.some(p => p.connected)) {
        status = "needs_connection";
      } else if (publishedPosts.length === 0) {
        status = "ready";
      } else {
        status = "active";
      }

      // Frequency label
      const freqLabels: Record<string, string> = {
        daily: "Daily", "3_per_week": "3x per week", "2_per_week": "2x per week", weekly: "Weekly",
      };

      // Recent published posts (client-safe)
      const recentPosts = publishedPosts.slice(0, 8).map(p => ({
        id: p.id,
        platform: p.platform === "google_business" ? "Google Business" : p.platform.charAt(0).toUpperCase() + p.platform.slice(1),
        caption: (p.caption || p.post_text).slice(0, 120) + ((p.caption || p.post_text).length > 120 ? "..." : ""),
        full_text: p.post_text,
        hashtags: p.hashtags as string[] | null,
        published_at: p.published_at ? new Date(p.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null,
        has_image: !!(p.media_plan as any)?.image_url,
        image_url: (p.media_plan as any)?.image_url || null,
      }));

      // Upcoming scheduled posts
      const upcomingPosts = queuedPosts
        .filter(p => p.scheduled_for && new Date(p.scheduled_for).getTime() > now)
        .sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime())
        .slice(0, 12)
        .map(p => ({
          id: p.id,
          platform: p.platform === "google_business" ? "Google Business" : p.platform.charAt(0).toUpperCase() + p.platform.slice(1),
          caption: (p.caption || p.post_text).slice(0, 120) + ((p.caption || p.post_text).length > 120 ? "..." : ""),
          full_text: p.post_text,
          hashtags: p.hashtags as string[] | null,
          scheduled_for: new Date(p.scheduled_for!).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
          scheduled_date: new Date(p.scheduled_for!).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
          has_image: !!(p.media_plan as any)?.image_url,
          image_url: (p.media_plan as any)?.image_url || null,
        }));

      res.json({
        status,
        summary: {
          posts_this_month: publishedThisMonth.length,
          total_published: publishedPosts.length,
          active_platforms: platforms.filter(p => p.connected).length,
          posting_frequency: freqLabels[profile?.frequency || "3_per_week"] || "3x per week",
          autopilot: profile?.autopilot || false,
        },
        next_scheduled: nextPost ? {
          platform: nextPost.platform === "google_business" ? "Google Business" : nextPost.platform.charAt(0).toUpperCase() + nextPost.platform.slice(1),
          scheduled_for: new Date(nextPost.scheduled_for!).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
        } : null,
        platforms,
        recent_posts: recentPosts,
        upcoming_posts: upcomingPosts,
      });
    } catch (err: any) {
      console.error("Portal SocialSync report error:", err);
      res.status(500).json({ error: "Failed to load SocialSync report" });
    }
  });

  /**
   * GET /api/portal/mapguard
   * Client-safe MapGuard dashboard data.
   * Returns snapshots, health, and trend data — no tasks, alerts, or supplier info.
   */
  app.get("/api/portal/mapguard", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      // Check if client has active MapGuard service
      const [mgService] = await db.select({ id: clientServices.id, status: clientServices.status })
        .from(clientServices)
        .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
        .where(and(
          eq(clientServices.client_id, clientId),
          sql`${serviceCatalog.id} LIKE 'mapguard%'`,
          sql`${clientServices.status} IN ('active', 'onboarding')`,
        ))
        .limit(1);

      if (!mgService) {
        return res.json({ active: false, snapshots: [], health: null });
      }

      // Get last 12 snapshots (newest first)
      const snapshots = await db.select({
        id: mapguardSnapshots.id,
        captured_at: mapguardSnapshots.captured_at,
        rating: mapguardSnapshots.rating,
        review_count: mapguardSnapshots.review_count,
        photo_count: mapguardSnapshots.photo_count,
        has_website: mapguardSnapshots.has_website,
        has_description: mapguardSnapshots.has_description,
        keywords_in_local_pack: mapguardSnapshots.keywords_in_local_pack,
        keywords_in_top_10: mapguardSnapshots.keywords_in_top_10,
        score_total: mapguardSnapshots.score_total,
        score_grade: mapguardSnapshots.score_grade,
        score_google_maps: mapguardSnapshots.score_google_maps,
        score_search_visibility: mapguardSnapshots.score_search_visibility,
        changes: mapguardSnapshots.changes,
      })
      .from(mapguardSnapshots)
      .where(eq(mapguardSnapshots.client_id, clientId))
      .orderBy(desc(mapguardSnapshots.captured_at))
      .limit(12);

      const latest = snapshots[0] || null;
      const previous = snapshots[1] || null;

      // Compute client-safe health status
      let health: string = "monitoring";
      if (latest && previous) {
        const changes = latest.changes as any;
        const scoreDelta = changes?.score_delta ?? null;
        if (scoreDelta !== null && scoreDelta > 5) health = "improving";
        else if (scoreDelta !== null && scoreDelta < -8) health = "needs_attention";
        else if (scoreDelta !== null && scoreDelta < -3) health = "watch_closely";
        else health = "healthy";
      } else if (latest) {
        health = "healthy";
      }

      // Build client-safe snapshot data (strip internal fields)
      const clientSnapshots = snapshots.map(s => ({
        captured_at: s.captured_at,
        score: s.score_total,
        grade: s.score_grade,
        rating: s.rating,
        review_count: s.review_count,
        keywords_in_local_pack: s.keywords_in_local_pack,
        keywords_in_top_10: s.keywords_in_top_10,
      }));

      // Compute simple deltas for display
      const deltas = latest && previous ? {
        score: (latest.changes as any)?.score_delta ?? null,
        rating: (latest.changes as any)?.rating_delta ?? null,
        reviews: (latest.changes as any)?.reviews_delta ?? null,
        local_pack: (latest.changes as any)?.local_pack_delta ?? null,
      } : null;

      // Build client-friendly activity list from recent tasks
      const TASK_TYPE_TRANSLATIONS: Record<string, string> = {
        baseline_audit_review: "Reviewing your visibility data and planning improvements",
        gbp_optimization: "Optimizing your Google Business profile",
        citation_cleanup: "Improving your online listings consistency",
        review_issue_response: "Handling and improving your customer reviews",
        competitor_reaction: "Monitoring competitors and adjusting your visibility strategy",
        profile_content_update: "Updating your profile content for better performance",
        photo_upload: "Refreshing your business photos",
        post_scheduling: "Creating and scheduling posts for your profile",
        suspension_support: "Resolving a profile issue with Google",
        monthly_report_review: "Preparing your monthly performance review",
        manual_followup: "Following up on an improvement action",
      };

      const recentTaskTypes = await db.selectDistinct({ task_type: mapguardTasks.task_type })
        .from(mapguardTasks)
        .where(and(
          eq(mapguardTasks.client_id, clientId),
          sql`${mapguardTasks.status} NOT IN ('completed', 'cancelled')`,
        ))
        .limit(5);

      const activities = recentTaskTypes
        .map(r => TASK_TYPE_TRANSLATIONS[r.task_type])
        .filter(Boolean);

      // Add recent completions as past-tense signals
      const [recentCompleted] = await db.select({ count: sql<number>`count(*)::int` })
        .from(mapguardTasks)
        .where(and(
          eq(mapguardTasks.client_id, clientId),
          eq(mapguardTasks.status, "completed"),
          sql`${mapguardTasks.completed_at} > NOW() - INTERVAL '30 days'`,
        ));
      const completedCount = recentCompleted?.count || 0;

      // Client-safe execution progress (no internal limits exposed)
      let executionProgress: { completed: number; pending: number; has_more: boolean } | null = null;
      try {
        const usage = await getExecutionUsage(clientId);
        executionProgress = {
          completed: usage.used,
          pending: usage.backlog_count,
          has_more: usage.upgrade_recommended,
        };
      } catch { /* skip on error */ }

      res.json({
        active: true,
        health,
        last_scan: latest?.captured_at || null,
        activities,
        completed_last_30d: completedCount,
        execution_progress: executionProgress,
        activity_feed: await generateClientActivityFeed(clientId, 8),
        since_start: await (async () => {
          try {
            const perf = await getClientPerformanceSummary(clientId);
            if (!perf || perf.score_change == null) return null;
            return { score_change: perf.score_change, reviews_gained: perf.reviews_gained, days_active: perf.days_active };
          } catch { return null; }
        })(),
        current: latest ? {
          score: latest.score_total,
          grade: latest.score_grade,
          rating: latest.rating,
          review_count: latest.review_count,
          photo_count: latest.photo_count,
          has_website: latest.has_website,
          has_description: latest.has_description,
          keywords_in_local_pack: latest.keywords_in_local_pack,
          keywords_in_top_10: latest.keywords_in_top_10,
        } : null,
        deltas,
        snapshots: clientSnapshots.reverse(), // chronological for charts
      });
    } catch (err: any) {
      console.error("Portal MapGuard error:", err);
      res.status(500).json({ error: "Failed to load MapGuard data" });
    }
  });

  /**
   * GET /api/portal/mapguard/report/:year/:month
   * Client-safe monthly report data.
   */
  app.get("/api/portal/mapguard/report/:year/:month", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const year = parseInt(req.params.year as string);
      const month = parseInt(req.params.month as string);
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: "Invalid date parameters" });
      }

      const report = await compileMonthlyReport(clientId, year, month);
      if (!report) return res.status(404).json({ error: "No report data for this month" });

      // Return client-safe subset (strip internal counts)
      res.json({
        month_label: report.month_label,
        business_name: report.business_name,
        score_end: report.score_end,
        score_delta: report.score_delta,
        grade_end: report.grade_end,
        rating_end: report.rating_end,
        rating_delta: report.rating_delta,
        reviews_end: report.reviews_end,
        reviews_gained: report.reviews_gained,
        local_pack_end: report.local_pack_end,
        scans_this_month: report.scans_this_month,
        has_website: report.has_website,
        has_description: report.has_description,
        photo_count: report.photo_count,
        completed_actions: report.completed_actions,
        active_work: report.active_work,
        movement: report.movement,
      });
    } catch (err: any) {
      console.error("Portal MapGuard report error:", err);
      res.status(500).json({ error: "Failed to load report" });
    }
  });

  // ═══════════════════════════════════════════════
  // ReputationShield — Client Portal
  // ═══════════════════════════════════════════════

  /**
   * GET /api/portal/reputation/overview
   * Summary metrics for the client's reputation status.
   */
  app.get("/api/portal/reputation/overview", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Reviews stats
      const [reviewStats] = await db.select({
        total: sql<number>`count(*)::int`,
        averageRating: sql<number>`coalesce(round(avg(${monitoredReviews.rating})::numeric, 2), 0)::float`,
        withResponse: sql<number>`count(*) filter (where ${monitoredReviews.response_text} is not null)::int`,
        last30Days: sql<number>`count(*) filter (where ${monitoredReviews.first_seen_at} >= ${thirtyDaysAgo})::int`,
        last7Days: sql<number>`count(*) filter (where ${monitoredReviews.first_seen_at} >= ${sevenDaysAgo})::int`,
        lowRatingNoResponse: sql<number>`count(*) filter (where ${monitoredReviews.rating} <= 2 and ${monitoredReviews.response_text} is null)::int`,
        withDraft: sql<number>`count(*) filter (where ${monitoredReviews.draft_response} is not null)::int`,
      }).from(monitoredReviews)
        .where(eq(monitoredReviews.client_id, clientId));

      // Review requests stats
      const [requestStats] = await db.select({
        totalSent: sql<number>`count(*) filter (where ${reviewRequests.status} != 'pending')::int`,
        pendingFollowups: sql<number>`count(*) filter (where ${reviewRequests.status} = 'sent' and ${reviewRequests.next_followup_at} is not null)::int`,
        routedPositive: sql<number>`count(*) filter (where ${reviewRequests.status} = 'routed_positive')::int`,
        feedbackCaptured: sql<number>`count(*) filter (where ${reviewRequests.status} = 'feedback_captured')::int`,
      }).from(reviewRequests)
        .where(eq(reviewRequests.client_id, clientId));

      // Private feedback count
      const [feedbackCount] = await db.select({
        total: sql<number>`count(*) filter (where ${reviewRequests.internal_feedback} is not null)::int`,
      }).from(reviewRequests)
        .where(eq(reviewRequests.client_id, clientId));

      const noResponse = (reviewStats?.total ?? 0) - (reviewStats?.withResponse ?? 0);

      res.json({
        reviews: {
          total: reviewStats?.total ?? 0,
          averageRating: reviewStats?.averageRating ?? 0,
          last30Days: reviewStats?.last30Days ?? 0,
          last7Days: reviewStats?.last7Days ?? 0,
          withoutResponse: noResponse,
          lowRatingNoResponse: reviewStats?.lowRatingNoResponse ?? 0,
          withDraft: reviewStats?.withDraft ?? 0,
        },
        requests: {
          totalSent: requestStats?.totalSent ?? 0,
          pendingFollowups: requestStats?.pendingFollowups ?? 0,
          routedPositive: requestStats?.routedPositive ?? 0,
          feedbackCaptured: feedbackCount?.total ?? 0,
        },
      });
    } catch (err: any) {
      console.error("[portal] reputation overview error:", err.message);
      res.status(500).json({ error: "Failed to load reputation data" });
    }
  });

  /**
   * GET /api/portal/reputation/reviews
   * Recent public reviews for the client.
   */
  app.get("/api/portal/reputation/reviews", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

      const rows = await db.select({
        id: monitoredReviews.id,
        reviewer_name: monitoredReviews.reviewer_name,
        rating: monitoredReviews.rating,
        review_text: monitoredReviews.review_text,
        published_at: monitoredReviews.published_at,
        response_text: monitoredReviews.response_text,
        response_date: monitoredReviews.response_date,
        is_new: monitoredReviews.is_new,
        draft_response: monitoredReviews.draft_response,
        platform: monitoredReviews.platform,
        first_seen_at: monitoredReviews.first_seen_at,
      }).from(monitoredReviews)
        .where(eq(monitoredReviews.client_id, clientId))
        .orderBy(desc(monitoredReviews.published_at))
        .limit(limit).offset(offset);

      const [countRow] = await db.select({ total: sql<number>`count(*)::int` })
        .from(monitoredReviews)
        .where(eq(monitoredReviews.client_id, clientId));

      res.json({ data: rows, total: countRow?.total ?? 0 });
    } catch (err: any) {
      console.error("[portal] reputation reviews error:", err.message);
      res.status(500).json({ error: "Failed to load reviews" });
    }
  });

  /**
   * GET /api/portal/reputation/feedback
   * Private feedback captured through the sentiment gate.
   */
  app.get("/api/portal/reputation/feedback", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const rows = await db.select({
        id: reviewRequests.id,
        customer_name: reviewRequests.customer_name,
        internal_feedback: reviewRequests.internal_feedback,
        sentiment: reviewRequests.sentiment,
        trigger_source: reviewRequests.trigger_source,
        created_at: reviewRequests.created_at,
        completed_at: reviewRequests.completed_at,
      }).from(reviewRequests)
        .where(and(
          eq(reviewRequests.client_id, clientId),
          sql`${reviewRequests.internal_feedback} is not null`,
        ))
        .orderBy(desc(reviewRequests.completed_at))
        .limit(20);

      res.json({ data: rows });
    } catch (err: any) {
      console.error("[portal] reputation feedback error:", err.message);
      res.status(500).json({ error: "Failed to load feedback" });
    }
  });

  /**
   * GET /api/portal/reputation/config
   * Returns client's ReputationShield tier, features, and settings.
   */
  app.get("/api/portal/reputation/config", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { extractTier, canAccessFeature, mergeSettings, TIER_LABELS, FEATURE_LABELS, FEATURE_MIN_TIER, TIER_FEATURES } = await import("@shared/reputationConfig");
      const { storage } = await import("../storage");

      const svc = await storage.getClientReputationService(clientId);
      if (!svc) {
        return res.json({ active: false, tier: null, features: {}, settings: null });
      }

      const tier = extractTier(svc.serviceId);
      const settings = mergeSettings(svc.metadata?.reputation_settings);
      const features = tier ? TIER_FEATURES[tier] : {};

      // Build upgrade hints for locked features
      const upgradeHints: Record<string, string> = {};
      if (tier) {
        for (const [feature, minTier] of Object.entries(FEATURE_MIN_TIER)) {
          if (!canAccessFeature(tier, feature as any)) {
            upgradeHints[feature] = `Available on ${TIER_LABELS[minTier as keyof typeof TIER_LABELS]} plan`;
          }
        }
      }

      res.json({
        active: true,
        tier,
        tierLabel: tier ? TIER_LABELS[tier] : null,
        features,
        settings,
        upgradeHints,
      });
    } catch (err: any) {
      console.error("[portal] reputation config error:", err.message);
      res.status(500).json({ error: "Failed to load config" });
    }
  });

  /**
   * PATCH /api/portal/reputation/settings
   * Update client's ReputationShield settings (channel, reminders, etc).
   */
  app.patch("/api/portal/reputation/settings", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { mergeSettings } = await import("@shared/reputationConfig");
      const { storage } = await import("../storage");

      const svc = await storage.getClientReputationService(clientId);
      if (!svc) {
        return res.status(404).json({ error: "No ReputationShield service found" });
      }

      const current = svc.metadata?.reputation_settings ?? {};
      const updated = mergeSettings({ ...current, ...req.body });
      const metadata = { ...svc.metadata, reputation_settings: updated };

      await storage.updateClientServiceMetadata(clientId, svc.serviceId, metadata);

      res.json({ ok: true, settings: updated });
    } catch (err: any) {
      console.error("[portal] reputation settings error:", err.message);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  /**
   * GET /api/portal/reputation/widget
   * Returns widget setup info: token, embed code, current settings.
   */
  app.get("/api/portal/reputation/widget", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { extractTier, canAccessFeature, mergeWidgetSettings } = await import("@shared/reputationConfig");
      const { storage } = await import("../storage");

      // Check feature access
      const svc = await storage.getClientReputationService(clientId);
      const tier = svc ? extractTier(svc.serviceId) : null;

      // Badge available on all tiers; carousel on Pro+
      const badgeAccess = !!tier;
      const carouselAccess = canAccessFeature(tier, "reviewWidget");

      if (!tier) {
        return res.json({ active: false, widgetAccess: false });
      }

      // Ensure widget token exists
      const widgetToken = await storage.ensureWidgetToken(clientId);

      // Load widget settings
      const ws = mergeWidgetSettings(svc?.metadata?.reputation_settings?.widget);

      // Build base URL for embed code
      const origin = req.headers.origin || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `${req.protocol}://${req.get("host")}`);

      res.json({
        active: true,
        widgetToken,
        badgeAccess,
        carouselAccess,
        settings: ws,
        embedCode: {
          badge: `<script src="${origin}/widget/embed.js" data-wft-widget="badge" data-wft-token="${widgetToken}"></script>`,
          carousel: carouselAccess
            ? `<script src="${origin}/widget/embed.js" data-wft-widget="carousel" data-wft-token="${widgetToken}"></script>`
            : null,
        },
      });
    } catch (err: any) {
      console.error("[portal] widget info error:", err.message);
      res.status(500).json({ error: "Failed to load widget info" });
    }
  });

  /**
   * PATCH /api/portal/reputation/widget
   * Update widget settings.
   */
  app.patch("/api/portal/reputation/widget", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { mergeSettings, mergeWidgetSettings } = await import("@shared/reputationConfig");
      const { storage } = await import("../storage");

      const svc = await storage.getClientReputationService(clientId);
      if (!svc) return res.status(404).json({ error: "No ReputationShield service found" });

      const currentSettings = svc.metadata?.reputation_settings ?? {};
      const currentWidget = currentSettings.widget ?? {};
      const updatedWidget = mergeWidgetSettings({ ...currentWidget, ...req.body });
      const updatedSettings = mergeSettings({ ...currentSettings, widget: updatedWidget });
      const metadata = { ...svc.metadata, reputation_settings: updatedSettings };

      await storage.updateClientServiceMetadata(clientId, svc.serviceId, metadata);

      res.json({ ok: true, settings: updatedWidget });
    } catch (err: any) {
      console.error("[portal] widget settings error:", err.message);
      res.status(500).json({ error: "Failed to update widget settings" });
    }
  });

  // ═══════════════════════════════════════════════
  // Manual Review Requests + QR
  // ═══════════════════════════════════════════════

  /** Rate limit: max 20 manual requests per client per day. */
  const manualRequestCounts = new Map<string, { count: number; resets: number }>();
  const MANUAL_DAILY_LIMIT = 20;

  function checkManualRateLimit(clientId: number): boolean {
    const key = `manual:${clientId}`;
    const now = Date.now();
    const entry = manualRequestCounts.get(key);
    if (!entry || now > entry.resets) {
      manualRequestCounts.set(key, { count: 1, resets: now + 24 * 60 * 60 * 1000 });
      return true;
    }
    if (entry.count >= MANUAL_DAILY_LIMIT) return false;
    entry.count++;
    return true;
  }

  /**
   * POST /api/portal/reputation/request-review
   * Client sends a review request to a specific customer.
   */
  app.post("/api/portal/reputation/request-review", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { customer_name, customer_email, customer_phone, job_label } = req.body;

      if (!customer_name || typeof customer_name !== "string" || customer_name.trim().length < 2) {
        return res.status(400).json({ error: "Customer name is required" });
      }
      if (!customer_email && !customer_phone) {
        return res.status(400).json({ error: "Email or phone number is required" });
      }

      // Rate limit
      if (!checkManualRateLimit(clientId)) {
        return res.status(429).json({ error: "Daily limit reached (20 review requests per day). Try again tomorrow." });
      }

      const { createManualReviewRequest, processReviewRequest } = await import("../services/reviewRequestService");

      const result = await createManualReviewRequest({
        clientId,
        customerName: customer_name.trim(),
        customerEmail: customer_email?.trim() || undefined,
        customerPhone: customer_phone?.trim() || undefined,
        jobLabel: job_label?.trim() || undefined,
        triggerSource: "portal_manual",
      });

      if (!result.created) {
        return res.status(409).json({ error: result.reason });
      }

      // Send immediately
      if (result.reviewRequest) {
        processReviewRequest(result.reviewRequest).catch((err: any) => {
          console.error("[portal] Review request send error:", err.message);
        });
      }

      res.status(201).json({ ok: true, id: result.reviewRequest?.id });
    } catch (err: any) {
      console.error("[portal] request-review error:", err.message);
      res.status(500).json({ error: "Failed to send review request" });
    }
  });

  /**
   * GET /api/portal/reputation/qr
   * Returns the client's QR review collection URL and widget token.
   */
  app.get("/api/portal/reputation/qr", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { storage } = await import("../storage");
      const widgetToken = await storage.ensureWidgetToken(clientId);

      const origin = req.headers.origin
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `${req.protocol}://${req.get("host")}`);

      const qrUrl = `${origin}/review/qr/${widgetToken}`;

      res.json({ qrUrl, widgetToken });
    } catch (err: any) {
      console.error("[portal] qr config error:", err.message);
      res.status(500).json({ error: "Failed to load QR config" });
    }
  });

  /**
   * GET /api/portal/reputation/request-stats
   * Source breakdown for review requests.
   */
  app.get("/api/portal/reputation/request-stats", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const [row] = await db.select({
        total: sql<number>`count(*)::int`,
        job_complete: sql<number>`count(*) filter (where ${reviewRequests.trigger_source} = 'job_complete')::int`,
        portal_manual: sql<number>`count(*) filter (where ${reviewRequests.trigger_source} = 'portal_manual')::int`,
        admin_manual: sql<number>`count(*) filter (where ${reviewRequests.trigger_source} = 'manual')::int`,
        qr_scan: sql<number>`count(*) filter (where ${reviewRequests.trigger_source} = 'qr_scan')::int`,
      }).from(reviewRequests)
        .where(eq(reviewRequests.client_id, clientId));

      res.json(row || { total: 0, job_complete: 0, portal_manual: 0, admin_manual: 0, qr_scan: 0 });
    } catch (err: any) {
      console.error("[portal] request-stats error:", err.message);
      res.status(500).json({ error: "Failed to load stats" });
    }
  });

  // ═══════════════════════════════════════════════
  // Google Business Connection (Portal)
  // ═══════════════════════════════════════════════

  /**
   * GET /api/portal/reputation/google-status
   * Returns Google connection status for the authenticated client.
   */
  app.get("/api/portal/reputation/google-status", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { isGoogleOAuthConfigured } = await import("../services/googleBusinessService");
      const { storage } = await import("../storage");
      const client = await storage.getClientById(clientId);
      const creds = client?.google_credentials as any;

      const connected = !!(creds?.refresh_token || creds?.access_token);
      const expired = connected && creds?.expiry_date && new Date(creds.expiry_date).getTime() < Date.now() && !creds?.refresh_token;

      res.json({
        oauthConfigured: isGoogleOAuthConfigured(),
        connected,
        connectedAt: creds?.connected_at || null,
        needsReconnect: expired,
      });
    } catch (err: any) {
      console.error("[portal] google-status error:", err.message);
      res.status(500).json({ error: "Failed to check connection" });
    }
  });

  /**
   * GET /api/portal/reputation/google-connect
   * Initiates Google OAuth flow for the authenticated client.
   */
  app.get("/api/portal/reputation/google-connect", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { isGoogleOAuthConfigured, getGoogleAuthUrl } = await import("../services/googleBusinessService");
      if (!isGoogleOAuthConfigured()) {
        return res.status(503).json({ error: "Google connection is not available right now" });
      }

      const state = JSON.stringify({ clientId, source: "portal" });
      const authUrl = getGoogleAuthUrl(state);
      res.json({ authUrl });
    } catch (err: any) {
      console.error("[portal] google-connect error:", err.message);
      res.status(500).json({ error: "Failed to start connection" });
    }
  });

  /**
   * POST /api/portal/reputation/google-disconnect
   * Disconnects Google for the authenticated client.
   */
  app.post("/api/portal/reputation/google-disconnect", requireClient, async (req, res) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { storage } = await import("../storage");
      await storage.updateClient(clientId, { google_credentials: null } as any);

      await storage.logAdminActivity({
        actor_type: "client",
        actor_id: (req.user as any)?.id,
        actor_name: null,
        action: "google.disconnected",
        entity_type: "client",
        entity_id: clientId,
        summary: `Google Business disconnected by client (portal)`,
      });

      res.json({ ok: true });
    } catch (err: any) {
      console.error("[portal] google-disconnect error:", err.message);
      res.status(500).json({ error: "Failed to disconnect" });
    }
  });

  /* ═══════════════════════════════════════════
     RankFlow Client Dashboard
     ═══════════════════════════════════════════ */

  const TASK_TYPE_LABELS: Record<string, string> = {
    page_create: "Page created",
    meta_fix: "Page optimization",
    citation_build: "Directory listing",
    internal_linking: "Internal linking",
    content_support: "SEO content support",
    schema_basic: "Search visibility improvement",
  };

  app.get("/api/portal/rankflow", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const month = new Date().toISOString().slice(0, 7);

      // Profile
      const [profile] = await db.select().from(rankflowProfiles)
        .where(eq(rankflowProfiles.client_id, clientId)).limit(1);

      if (!profile) return res.json({ active: false });

      // Current month plan
      const [plan] = await db.select().from(rankflowMonthlyPlans)
        .where(and(eq(rankflowMonthlyPlans.client_id, clientId), eq(rankflowMonthlyPlans.month, month)))
        .limit(1);

      // Tasks for this month (only done or in-progress — hide internal clutter)
      const allTasks = plan
        ? await db.select().from(rankflowTasks).where(eq(rankflowTasks.plan_id, plan.id))
        : [];

      const completed = allTasks.filter(t => t.status === "done");
      const inProgress = allTasks.filter(t => ["assigned", "in_progress", "submitted", "qa_review", "pending"].includes(t.status));

      // Transform to client-safe language
      const completedItems = completed.map(t => ({
        label: TASK_TYPE_LABELS[t.type] || t.type.replace(/_/g, " "),
        detail: t.title.replace(/^(Create SEO page|Optimize title tag|Build citation|Add internal links|Add schema markup|Content recommendation).*?—?\s*/i, "").trim() || t.title,
        completedAt: t.completed_at,
      }));

      const inProgressItems = inProgress.map(t => ({
        label: TASK_TYPE_LABELS[t.type] || t.type.replace(/_/g, " "),
        detail: t.title,
      }));

      // Progress stats
      const totalTasks = allTasks.length;
      const doneTasks = completed.length;
      const pagesCreated = completed.filter(t => t.type === "page_create").length;
      const citationsBuilt = completed.filter(t => t.type === "citation_build").length;
      const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

      // Status line
      let statusLine = "Work is underway this month";
      if (!profile.enabled) statusLine = "RankFlow is currently paused";
      else if (!plan) statusLine = "This month's plan is being prepared";
      else if (doneTasks === totalTasks && totalTasks > 0) statusLine = "This month's SEO work is complete";
      else if (doneTasks === 0) statusLine = "Work is starting this month";

      // What's next (simple narrative)
      const nextUp: string[] = [];
      const pendingTypes = new Set(inProgress.map(t => t.type));
      if (pendingTypes.has("page_create")) nextUp.push("Creating optimized service pages");
      if (pendingTypes.has("meta_fix")) nextUp.push("Optimizing page titles and descriptions");
      if (pendingTypes.has("citation_build")) nextUp.push("Expanding local directory coverage");
      if (pendingTypes.has("internal_linking")) nextUp.push("Improving internal page connections");
      if (pendingTypes.has("content_support")) nextUp.push("Preparing next month's content strategy");
      if (pendingTypes.has("schema_basic")) nextUp.push("Enhancing search result visibility");
      if (nextUp.length === 0 && totalTasks > 0 && doneTasks < totalTasks) nextUp.push("Finalizing this month's SEO improvements");
      if (nextUp.length === 0 && doneTasks === totalTasks) nextUp.push("Reviewing keyword progress for next month");

      // Ranking highlights (from signals table)
      const signals = await storage.getSignalSummary(clientId);
      const rankingHighlights: string[] = [];
      if (signals) {
        if (signals.keywords_top_10 > 0) rankingHighlights.push(`${signals.keywords_top_10} keyword${signals.keywords_top_10 > 1 ? "s" : ""} in top 10`);
        if (signals.keywords_improved > 0) rankingHighlights.push(`${signals.keywords_improved} keyword${signals.keywords_improved > 1 ? "s" : ""} improved this month`);
        if (signals.pages_indexed > 0) rankingHighlights.push(`${signals.pages_indexed} page${signals.pages_indexed > 1 ? "s" : ""} indexed on Google`);
        if (signals.keywords_top_20 > signals.keywords_top_10) rankingHighlights.push(`${signals.keywords_top_20} keyword${signals.keywords_top_20 > 1 ? "s" : ""} in top 20`);
      }

      // Indexing summary
      const pages = await storage.listPagesByClient(clientId);
      const indexedPages = pages.filter(p => p.indexed).length;
      const pendingIndex = pages.length - indexedPages;

      // Monthly narrative (rule-based)
      const narrativeParts: string[] = [];
      if (doneTasks > 0) narrativeParts.push(`This month we completed ${doneTasks} SEO improvement${doneTasks > 1 ? "s" : ""}`);
      if (pagesCreated > 0) narrativeParts.push(`created ${pagesCreated} new page${pagesCreated > 1 ? "s" : ""}`);
      if (citationsBuilt > 0) narrativeParts.push(`built ${citationsBuilt} local listing${citationsBuilt > 1 ? "s" : ""}`);
      if (signals?.keywords_improved && signals.keywords_improved > 0) narrativeParts.push(`${signals.keywords_improved} keyword${signals.keywords_improved > 1 ? "s" : ""} improved in Google`);
      if (indexedPages > 0) narrativeParts.push(`${indexedPages} page${indexedPages > 1 ? "s are" : " is"} indexed on Google`);
      let narrative = narrativeParts.length > 0
        ? narrativeParts.join(", ") + "."
        : "We are setting up your SEO plan and will begin work shortly.";
      // Capitalize first letter
      narrative = narrative.charAt(0).toUpperCase() + narrative.slice(1);

      res.json({
        active: profile.enabled,
        plan_tier: profile.plan_tier,
        month,
        statusLine,
        narrative,
        metrics: {
          tasksCompleted: doneTasks,
          totalTasks,
          pagesCreated,
          citationsBuilt,
          progressPct,
        },
        ranking: {
          highlights: rankingHighlights,
          keywordsTracked: signals?.total_keywords || 0,
          keywordsTop10: signals?.keywords_top_10 || 0,
          keywordsTop20: signals?.keywords_top_20 || 0,
          keywordsImproved: signals?.keywords_improved || 0,
          avgPosition: signals?.avg_position ? Number(signals.avg_position) : null,
        },
        indexing: {
          totalPages: pages.length,
          indexed: indexedPages,
          pending: pendingIndex,
        },
        completed: completedItems,
        inProgress: inProgressItems,
        nextUp,
      });
    } catch (err: any) {
      console.error("[portal-rankflow] error:", err.message);
      res.status(500).json({ error: "Failed to load RankFlow dashboard" });
    }
  });

  /* ═══════════════════════════════════════════
     RankFlow Onboarding
     ═══════════════════════════════════════════ */

  app.post("/api/portal/rankflow/onboard", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { business_name, website_url, niche, location, additional_services, additional_locations, plan_tier } = req.body;

      if (!business_name || !website_url || !niche || !location) {
        return res.status(400).json({ error: "business_name, website_url, niche, and location are required" });
      }

      // Check if profile already exists and is enabled
      const existing = await storage.getRankFlowProfile(clientId);
      if (existing?.enabled) {
        return res.status(409).json({ error: "RankFlow is already active for this client" });
      }

      // Derive target services and locations
      const targetServices = deriveTargetServices(niche, additional_services);
      const targetLocations = [location, ...(additional_locations || [])].filter(Boolean);

      // Create or update profile
      const profile = await storage.upsertRankFlowProfile(clientId, {
        niche,
        location,
        website_url,
        target_services: targetServices,
        target_locations: targetLocations,
        plan_tier: plan_tier || "starter",
        enabled: true,
      });

      // Generate initial monthly plan + tasks
      const month = new Date().toISOString().slice(0, 7);
      let planResult = null;

      const existingPlan = await storage.getMonthlyPlan(clientId, month);
      if (!existingPlan) {
        const planData = generateMonthlyPlan(profile, month);
        const plan = await storage.createMonthlyPlan({
          client_id: clientId,
          month,
          plan_data: planData,
          status: "draft",
        });

        const taskDefs = generateTasksFromPlan(plan.id, planData, profile);
        let tasksCreated = 0;
        for (const t of taskDefs) {
          const task = await storage.createRankFlowTask(t as any);
          tasksCreated++;
          if (task.type === "page_create") {
            try {
              const draft = await createDraftFromRankflowTask({ task, profile });
              generateArticleBody(draft.id).catch((err) =>
                console.error(`[contentflow] background article generation rejected for draft ${draft.id}:`, err),
              );
            } catch (hookErr: any) {
              console.error(`[contentflow] article hook failed for task ${task.id}:`, hookErr.message);
            }
          }
        }

        await storage.updateMonthlyPlanStatus(plan.id, "active");
        planResult = { planId: plan.id, month, tasksCreated };
      }

      // Generate structured keyword targets and save to tracking table
      const keywords = generateKeywordTargets(niche, location, additional_locations, additional_services);
      const clusters = clusterKeywords(keywords);

      // Save keywords to tracking table (max 40)
      const kwToSave = keywords.slice(0, 40).map(k => ({
        client_id: clientId,
        keyword: k.keyword,
        cluster: k.cluster,
        priority: k.priority,
      }));
      await storage.createKeywords(kwToSave);

      console.log(`[rankflow-onboard] Client ${clientId} onboarded — ${kwToSave.length} keywords saved, ${clusters.length} clusters, plan: ${planResult ? "created" : "already exists"}`);

      res.status(201).json({
        profile,
        plan: planResult,
        keywords_saved: kwToSave.length,
        clusters: clusters.length,
      });
    } catch (err: any) {
      console.error("[rankflow-onboard] error:", err.message);
      res.status(500).json({ error: "Failed to complete onboarding" });
    }
  });

  /* ═══════════════════════════════════════════════════════════════════
     Sprint 6 — ContentFlow article review (client portal)

     Clients see RankFlow article drafts that the admin has approved
     and can approve / request changes / reject. All decisions write
     to metadata.client_review (no schema migration) AND to the
     content_approvals audit trail (actor_type='client').

     Security boundary: every endpoint resolves clientId from the
     authenticated session and refuses any draft whose client_id
     doesn't match. Cross-client leakage is impossible by design.
     ═══════════════════════════════════════════════════════════════════ */

  /**
   * Sprint 8: project an article record for portal consumption — strips
   * admin-only metadata keys (admin_emailed_*, raw WP errors, lock fields)
   * before returning to the client. Keeps the client_review state/note
   * decided_at and the wordpress.post_url that the client legitimately
   * needs to see.
   */
  const projectArticleForPortal = (raw: any) => {
    if (!raw) return raw;
    const meta = (raw.metadata || {}) as Record<string, any>;
    const cr = (meta.client_review || {}) as Record<string, any>;
    const wp = (meta.wordpress || {}) as Record<string, any>;
    const cleanCr = {
      state: cr.state ?? null,
      note: cr.note ?? null,
      decided_at: cr.decided_at ?? null,
    };
    const cleanWp = wp.post_url
      ? { post_url: wp.post_url, published_at: wp.published_at ?? null }
      : undefined;
    const safeMeta: Record<string, any> = {
      ...(cr.state ? { client_review: cleanCr } : {}),
      ...(cleanWp ? { wordpress: cleanWp } : {}),
    };
    return { ...raw, metadata: safeMeta };
  };

  /**
   * Sprint 8 — rate-limit middleware for portal review action endpoints.
   * Per-clientId, 30 actions / 60s. Falls back to user.id if the clients
   * row hasn't been resolved yet (defensive — handler also guards).
   */
  async function portalReviewLimit(req: Request, res: Response, next: NextFunction) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    const ok = await portalReviewRateLimiter.check(`portal-review:${userId}`);
    if (!ok) {
      return res.status(429).json({ error: "Too many review actions. Please slow down and try again shortly." });
    }
    next();
  }

  /**
   * GET /api/portal/articles
   *
   * Returns the authenticated client's RankFlow article drafts that are
   * ready for or past client review. Filter:
   *   client_id = THIS client AND kind='article' AND surface='rankflow'
   *   AND status IN ('approved','published','rejected')
   * Drafts in 'draft' status (admin still working) are intentionally
   * hidden so clients don't see half-baked work.
   */
  app.get("/api/portal/articles", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const drafts = await db.select({
        id: contentDrafts.id,
        title: contentDrafts.title,
        excerpt: contentDrafts.excerpt,
        status: contentDrafts.status,
        target_url: contentDrafts.target_url,
        metadata: contentDrafts.metadata,
        client_approved_at: contentDrafts.client_approved_at,
        created_at: contentDrafts.created_at,
        updated_at: contentDrafts.updated_at,
      })
        .from(contentDrafts)
        .where(and(
          eq(contentDrafts.client_id, clientId),
          eq(contentDrafts.kind, "article"),
          eq(contentDrafts.surface, "rankflow"),
          sql`${contentDrafts.status} IN ('approved', 'published', 'rejected')`,
        ))
        .orderBy(desc(contentDrafts.created_at))
        .limit(50);

      res.json({ articles: drafts.map(projectArticleForPortal), count: drafts.length });
    } catch (err: any) {
      console.error("[portal/articles] list error:", err.message);
      res.status(500).json({ error: "Failed to load articles" });
    }
  });

  /**
   * GET /api/portal/articles/:id
   *
   * Detail for a single article. Returns 404 if the draft doesn't exist
   * or doesn't belong to this client (deliberately conflated to avoid
   * leaking existence of other clients' drafts).
   */
  app.get("/api/portal/articles/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const draftId = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(draftId)) {
        return res.status(400).json({ error: "id must be a number" });
      }

      const draft = await storage.getContentDraftById(draftId);
      if (!draft || draft.client_id !== clientId || draft.kind !== "article" || draft.surface !== "rankflow") {
        return res.status(404).json({ error: "Article not found" });
      }
      res.json({ article: projectArticleForPortal(draft) });
    } catch (err: any) {
      console.error("[portal/articles] detail error:", err.message);
      res.status(500).json({ error: "Failed to load article" });
    }
  });

  /**
   * Sprint 8: shared error mapper for review actions. Returns generic
   * messages to the client (never raw err.message — that may include
   * PG constraint names or internal state). Audit detail goes to logs.
   */
  function reviewActionErrorResponse(action: string, err: any, res: Response) {
    const code: string | undefined = err?.code;
    if (code === "not_found" || code === "forbidden") {
      return res.status(404).json({ error: "Article not found" });
    }
    if (code === "wrong_kind") {
      return res.status(409).json({ error: "Article does not support client review" });
    }
    console.error(`[portal/articles] ${action} error:`, err?.message || err);
    return res.status(500).json({ error: "Action failed. Please try again." });
  }

  /**
   * POST /api/portal/articles/:id/approve
   * Body: { note?: string }
   * Sprint 8: requireClientStrict (admin role rejected) + per-client rate
   * limit + projected response + generic error messages.
   */
  app.post("/api/portal/articles/:id/approve", requireClientStrict, portalReviewLimit, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const draftId = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(draftId)) return res.status(400).json({ error: "id must be a number" });
      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : undefined;

      const updated = await clientApproveDraft({ draftId, clientId, note });
      res.json({ ok: true, article: projectArticleForPortal(updated) });
    } catch (err: any) {
      return reviewActionErrorResponse("approve", err, res);
    }
  });

  /**
   * POST /api/portal/articles/:id/request-changes
   * Body: { note?: string }
   */
  app.post("/api/portal/articles/:id/request-changes", requireClientStrict, portalReviewLimit, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const draftId = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(draftId)) return res.status(400).json({ error: "id must be a number" });
      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : undefined;

      const updated = await clientRequestChanges({ draftId, clientId, note });
      res.json({ ok: true, article: projectArticleForPortal(updated) });
    } catch (err: any) {
      return reviewActionErrorResponse("request-changes", err, res);
    }
  });

  /**
   * POST /api/portal/articles/:id/reject
   * Body: { note?: string }
   */
  app.post("/api/portal/articles/:id/reject", requireClientStrict, portalReviewLimit, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const draftId = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(draftId)) return res.status(400).json({ error: "id must be a number" });
      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : undefined;

      const updated = await clientRejectDraft({ draftId, clientId, note });
      res.json({ ok: true, article: projectArticleForPortal(updated) });
    } catch (err: any) {
      return reviewActionErrorResponse("reject", err, res);
    }
  });

  /* ═══════════════════════════════════════════════════════════════════
     Sprint 9 — REVIEW-REPLY PORTAL
     Authenticated client views + acts on AI-drafted replies to their
     Google Business reviews. Uses the same approvalService helpers as
     article review so the audit trail stays uniform.
     ═══════════════════════════════════════════════════════════════════ */

  /** Sprint 9: project a review-reply for portal — strip admin email
   *  flags and any raw GBP error strings; expose only what a client
   *  needs to see. */
  const projectReviewReplyForPortal = (raw: any) => {
    if (!raw) return raw;
    const meta = (raw.metadata || {}) as Record<string, any>;
    const cr = (meta.client_review || {}) as Record<string, any>;
    const gbp = (meta.gbp || {}) as Record<string, any>;
    const cleanCr = cr.state
      ? { state: cr.state ?? null, note: cr.note ?? null, decided_at: cr.decided_at ?? null }
      : undefined;
    const cleanGbp = {
      external_review_id: gbp.external_review_id ?? null,
      star_rating: gbp.star_rating ?? null,
      posted_at: gbp.posted_at ?? null,
      queue_status: gbp.queue_status ?? null,
    };
    return {
      id: raw.id,
      title: raw.title,
      body: raw.body,
      status: raw.status,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
      metadata: {
        gbp: cleanGbp,
        ...(cleanCr ? { client_review: cleanCr } : {}),
      },
    };
  };

  /**
   * GET /api/portal/review-replies
   *
   * Returns the authenticated client's pending and recent review
   * replies. Filter:
   *   client_id = THIS client AND kind='review_reply' AND surface='reputationshield'
   *   AND status IN ('draft','approved','published','rejected')
   */
  app.get("/api/portal/review-replies", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const drafts = await db.select({
        id: contentDrafts.id,
        title: contentDrafts.title,
        body: contentDrafts.body,
        status: contentDrafts.status,
        metadata: contentDrafts.metadata,
        created_at: contentDrafts.created_at,
        updated_at: contentDrafts.updated_at,
      })
        .from(contentDrafts)
        .where(and(
          eq(contentDrafts.client_id, clientId),
          eq(contentDrafts.kind, "review_reply"),
          eq(contentDrafts.surface, "reputationshield"),
          sql`${contentDrafts.status} IN ('draft', 'approved', 'published', 'rejected')`,
        ))
        .orderBy(desc(contentDrafts.created_at))
        .limit(50);

      res.json({ replies: drafts.map(projectReviewReplyForPortal), count: drafts.length });
    } catch (err: any) {
      console.error("[portal/review-replies] list error:", err.message);
      res.status(500).json({ error: "Failed to load review replies" });
    }
  });

  /**
   * GET /api/portal/review-replies/:id
   * Detail for a single review reply. 404 if missing or cross-client.
   */
  app.get("/api/portal/review-replies/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const draftId = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(draftId)) return res.status(400).json({ error: "id must be a number" });
      const draft = await storage.getContentDraftById(draftId);
      if (!draft || draft.client_id !== clientId || draft.kind !== "review_reply" || draft.surface !== "reputationshield") {
        return res.status(404).json({ error: "Review reply not found" });
      }
      res.json({ reply: projectReviewReplyForPortal(draft) });
    } catch (err: any) {
      console.error("[portal/review-replies] detail error:", err.message);
      res.status(500).json({ error: "Failed to load review reply" });
    }
  });

  /**
   * POST /api/portal/review-replies/:id/approve
   * Reuses clientApproveDraft (kind-aware after Sprint 9 extension).
   */
  app.post("/api/portal/review-replies/:id/approve", requireClientStrict, portalReviewLimit, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const draftId = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(draftId)) return res.status(400).json({ error: "id must be a number" });
      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : undefined;
      const updated = await clientApproveDraft({ draftId, clientId, note });
      res.json({ ok: true, reply: projectReviewReplyForPortal(updated) });
    } catch (err: any) {
      return reviewActionErrorResponse("approve", err, res);
    }
  });

  app.post("/api/portal/review-replies/:id/request-changes", requireClientStrict, portalReviewLimit, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const draftId = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(draftId)) return res.status(400).json({ error: "id must be a number" });
      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : undefined;
      const updated = await clientRequestChanges({ draftId, clientId, note });
      res.json({ ok: true, reply: projectReviewReplyForPortal(updated) });
    } catch (err: any) {
      return reviewActionErrorResponse("request-changes", err, res);
    }
  });

  app.post("/api/portal/review-replies/:id/reject", requireClientStrict, portalReviewLimit, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const draftId = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(draftId)) return res.status(400).json({ error: "id must be a number" });
      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : undefined;
      const updated = await clientRejectDraft({ draftId, clientId, note });
      res.json({ ok: true, reply: projectReviewReplyForPortal(updated) });
    } catch (err: any) {
      return reviewActionErrorResponse("reject", err, res);
    }
  });

  /* ─── Sprint 16: Brand profile (portal) ──────────────────────────── */

  /**
   * GET /api/portal/contentflow/brand-profile
   * Returns the calling client's brand profile. Strict tenant
   * isolation — the clientId comes from the session, never the URL.
   */
  app.get("/api/portal/contentflow/brand-profile", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const client = await storage.getClientById(clientId);
      if (!client) return res.status(404).json({ error: "client not found" });
      res.json({ brand_profile: readBrandProfile(client) });
    } catch (err: any) {
      console.error("[portal/brand-profile][get]", err?.message || err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * PATCH /api/portal/contentflow/brand-profile
   * Body: subset of editable BrandProfile fields. Protected fields
   * (primary_color/secondary_color/logo_url/forbidden_claims) and
   * unknown keys are SILENTLY dropped — not echoed as errors. The
   * resulting profile is returned so the client UI can re-render.
   */
  app.patch("/api/portal/contentflow/brand-profile", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const patch = sanitizeBrandProfilePatch(req.body, "client");
      const updated = await mergeBrandProfile(clientId, patch);
      res.json({ ok: true, brand_profile: updated });
    } catch (err: any) {
      console.error("[portal/brand-profile][patch]", err?.message || err);
      res.status(500).json({ error: err.message });
    }
  });
}
