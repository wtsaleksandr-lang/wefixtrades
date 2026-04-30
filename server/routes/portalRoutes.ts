import type { Express, Request, Response } from "express";
import { requireClient, hashPassword, verifyPassword } from "../auth";
import { storage } from "../storage";
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
  ticketMessages,
  ticketEvents,
  passwordResetTokens,
} from "@shared/schema";
import { storage } from "../storage";

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
   * When the AI determines escalation is needed, it returns an escalation_draft
   * alongside the reply. The client must explicitly confirm before a ticket is created.
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
      let escalationEnabled = false;

      if (context?.surface === "help") {
        escalationEnabled = true;
        // General help context — with escalation instructions
        systemPrompt = `You are a helpful support assistant for WeFixTrades, a company that provides digital marketing services for trade businesses (plumbers, electricians, builders, etc.).

Services include: MapGuard (Google Business Profile), MapSetup (one-time GBP optimization), TradeLine (AI phone/chat), QuoteQuick (quote calculators), RankFlow (ongoing SEO), AdFlow (done-for-you ads), ReputationShield (review management), SocialSync (social media), SiteLaunch (website builds), WebCare (website maintenance), and WebFix (one-time website fixes).

Your job:
- Answer questions about how services work
- Explain billing, onboarding, and service delivery
- Help clients understand their portal and dashboard
- Keep answers short and practical (2-4 sentences)
- Use Australian English

ESCALATION RULES:
You should offer to create a support ticket ONLY when:
1. The user explicitly asks to speak to a human or create a ticket
2. The issue requires account-specific action you cannot take (refunds, cancellations, access changes, service modifications)
3. The user has described a problem you've already tried to help with but could not resolve
4. The user reports something broken, missing, or wrong with their service

Do NOT offer escalation for:
- Simple "how does X work" questions you can answer
- First-time questions before you've attempted to help
- Vague or unclear messages — ask for clarification first

When you decide escalation is appropriate, end your reply with exactly this phrase on its own line:
Would you like me to create a support ticket for this?

Do NOT:
- Make up account-specific details (balances, dates, statuses)
- Provide legal or financial advice
- Discuss internal pricing or margins
- Create tickets automatically — always ask first`;
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

      // Detect escalation offer in reply
      const ESCALATION_PHRASE = "Would you like me to create a support ticket for this?";
      const hasEscalationOffer = escalationEnabled && reply.includes(ESCALATION_PHRASE);

      if (!hasEscalationOffer) {
        return res.json({ reply });
      }

      // AI offered escalation — generate structured ticket draft via second AI call
      // This extracts subject, category, description, and summary from the conversation
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
        autopilot: autopilot ?? false,
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
}
