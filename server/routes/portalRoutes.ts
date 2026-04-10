import type { Express, Request, Response } from "express";
import { requireClient, hashPassword, verifyPassword } from "../auth";
import { db } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import { chat as aiChat } from "../services/aiService";
import { authRateLimiter } from "../services/rateLimiter";
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
  passwordResetTokens,
  mapguardSnapshots,
  mapguardTasks,
} from "@shared/schema";
import { compileMonthlyReport } from "../services/mapguardReports";
import { getExecutionUsage } from "../services/mapguardTaskEngine";
import { generateClientActivityFeed } from "../services/mapguardRetention";

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

      res.json({
        calculator: {
          id: calc.id,
          business_name: calc.business_name,
          slug: calc.slug,
          edit_token: calc.edit_token,
          plan_tier: calc.plan_tier ?? "free",
          total_views: calc.total_views ?? 0,
          total_leads: leadCount?.count ?? 0,
          status: deploy?.status ?? "draft",
        },
      });
    } catch (err) {
      console.error("Portal QuoteQuick summary error:", err);
      res.status(500).json({ error: "Failed to load QuoteQuick summary" });
    }
  });

  /**
   * GET /api/portal/tickets
   * List support tickets for the authenticated client.
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
          description: supportTickets.description,
          created_at: supportTickets.created_at,
          updated_at: supportTickets.updated_at,
          resolved_at: supportTickets.resolved_at,
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
   * POST /api/portal/tickets
   * Create a support ticket for the authenticated client.
   */
  app.post("/api/portal/tickets", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { subject, message } = req.body;
      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }

      const [ticket] = await db
        .insert(supportTickets)
        .values({
          client_id: clientId,
          subject: subject?.trim() || null,
          description: message.trim(),
          status: "open",
          admin_notified: false,
        })
        .returning();

      res.status(201).json({
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        created_at: ticket.created_at,
      });
    } catch (err) {
      console.error("Portal ticket create error:", err);
      res.status(500).json({ error: "Failed to create ticket" });
    }
  });

  /**
   * POST /api/portal/ai-chat
   * Context-aware AI assistant for onboarding or general help.
   */
  app.post("/api/portal/ai-chat", requireClient, async (req: Request, res: Response) => {
    try {
      const { messages, context } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages array is required" });
      }

      // Validate and sanitize message roles — only allow user/assistant
      const allowedRoles = new Set(["user", "assistant"]);
      const sanitizedMessages = messages
        .filter((m: any) => m && typeof m.content === "string" && allowedRoles.has(m.role))
        .slice(-10);

      let systemPrompt: string;

      if (context?.surface === "help") {
        // General help context
        systemPrompt = `You are a helpful support assistant for WeFixTrades, a company that provides digital marketing services for trade businesses (plumbers, electricians, builders, etc.).

Services include: MapGuard (Google Business Profile), MapSetup (one-time GBP optimization), TradeLine (AI phone/chat), QuoteQuick (quote calculators), RankFlow (ongoing SEO), AdFlow (done-for-you ads), ReputationShield (review management), SocialSync (social media), SiteLaunch (website builds), WebCare (website maintenance), and WebFix (one-time website fixes).

Your job:
- Answer questions about how services work
- Explain billing, onboarding, and service delivery
- Help clients understand their portal and dashboard
- Keep answers short and practical (2-4 sentences)
- Use Australian English
- If you don't know something specific to their account, suggest they submit a ticket

Do NOT:
- Make up account-specific details (balances, dates, statuses)
- Provide legal or financial advice
- Discuss internal pricing or margins`;
      } else {
        // Onboarding context
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
        maxTokens: 300,
      });

      res.json({ reply });
    } catch (err) {
      console.error("Portal AI chat error:", err);
      res.json({ reply: "Sorry, the assistant is temporarily unavailable. You can still fill in the form manually." });
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
}
