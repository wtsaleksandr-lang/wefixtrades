import type { Express, Request, Response } from "express";
import { requireClient, hashPassword, verifyPassword } from "../auth";
import { db } from "../db";
import { eq, and, desc, sql, gte } from "drizzle-orm";
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
  reviewRequests,
  monitoredReviews,
} from "@shared/schema";

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
}
