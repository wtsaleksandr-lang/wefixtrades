import express, { type Express, type Request, type Response } from "express";
import { requireClient, requireClientStrict, hashPassword, verifyPassword } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import { authRateLimiter } from "../services/rateLimiter";
import { sendTicketCreatedEmail, sendAdminNewTicketAlert } from "../lib/supportTicketEmails";
import Stripe from "stripe";

import {
  clients,
  clientServices,
  serviceCatalog,
  fulfillmentTasks,
  onboardingSubmissions,
  clientPayments,
  users,
  calculators,
  leads,
  deploymentStatus,
  supportTickets,
  ticketMessages,
  ticketEvents,
  passwordResetTokens,
  parseNotificationPreferences,
  notificationPreferencesSchema,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "@shared/schema";
import { SERVICES } from "@shared/services";
import { ALL_BUNDLES, bundleSavings } from "@shared/pricing";
import type { ServiceCatalogRow } from "@shared/schema";

import { createLogger } from "../lib/logger";
import { saveFile, deleteFile } from "../services/fileStorage";
import { registerPortalQuotequickRoutes } from "./portal/quotequick";
import { registerPortalReputationRoutes } from "./portal/reputation";
import { registerPortalBillingRoutes } from "./portal/billing";
import { registerPortalServicesRoutes } from "./portal/services";
import { registerPortalTradelineRoutes } from "./portal/tradeline";
import { registerPortalChatRoutes } from "./portal/chat";
import { registerPortalOnboardingRoutes } from "./portal/onboarding";
import { registerPortalReviewQueueRoutes } from "./portal/review-queue";
import { registerPortalContentflowRoutes } from "./portal/contentflow";
import { registerPortalMapguardRoutes } from "./portal/mapguard";
import { registerPortalSocialsyncRoutes } from "./portal/socialsync";
import { registerPortalRankflowRoutes } from "./portal/rankflow";

const log = createLogger("Portal");

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
    // Q20a: stable error code so the portal UI can show an admin-friendly
    // empty state instead of a generic "Failed to load" red box.
    res.status(403).json({ error: "No client record linked to this account", code: "no_client_linked" });
    return null;
  }
  return clientId;
}

/* ─── Routes ─── */

export function registerPortalRoutes(app: Express) {
  // Sub-registrars (portal sub-modules extracted from this file).
  // Adding new ones here keeps routes/index.ts unchanged.
  registerPortalQuotequickRoutes(app);
  registerPortalReputationRoutes(app);
  registerPortalBillingRoutes(app);
  registerPortalServicesRoutes(app);
  registerPortalTradelineRoutes(app);
  registerPortalChatRoutes(app);
  registerPortalOnboardingRoutes(app);
  registerPortalReviewQueueRoutes(app);
  registerPortalContentflowRoutes(app);
  registerPortalMapguardRoutes(app);
  registerPortalSocialsyncRoutes(app);
  registerPortalRankflowRoutes(app);

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
      log.error("Portal overview error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load overview" });
    }
  });

  /**
   * GET /api/portal/adflow/:csId/reports
   * List past AdFlow reports for a client service.
   */
  app.get("/api/portal/adflow/:csId/reports", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const csId = parseInt(req.params.csId as string);
      if (isNaN(csId)) return res.status(400).json({ error: "Invalid service id" });

      // Verify ownership
      const [cs] = await db.select({ id: clientServices.id, client_id: clientServices.client_id })
        .from(clientServices)
        .where(and(eq(clientServices.id, csId), eq(clientServices.client_id, clientId)))
        .limit(1);
      if (!cs) return res.status(404).json({ error: "Service not found" });

      const reports = await storage.listAdflowReports(csId, 12);
      const safe = reports.map((r) => ({
        id: r.id,
        period_label: r.period_label,
        period_start: r.period_start,
        period_end: r.period_end,
        metrics: r.metrics,
        ai_summary: r.ai_summary,
        sent_at: r.sent_at,
      }));
      res.json(safe);
    } catch (err) {
      log.error("Portal adflow reports error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load reports" });
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
        logo_url: client.logo_url ?? null,
        trade_type: client.trade_type,
        account_email: user?.email ?? null,
      });
    } catch (err) {
      log.error("Portal settings error:", { error: String(err) });
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
      log.error("Portal settings update error:", { error: String(err) });
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  /**
   * GET /api/portal/notification-preferences
   * Returns the client's notification preferences, falling back to
   * sensible defaults if none have been saved yet.
   */
  app.get("/api/portal/notification-preferences", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const [client] = await db.select({ metadata: clients.metadata }).from(clients).where(eq(clients.id, clientId)).limit(1);
      const prefs = parseNotificationPreferences(client?.metadata);
      res.json({ preferences: prefs, defaults: DEFAULT_NOTIFICATION_PREFERENCES });
    } catch (err) {
      log.error("Portal notification prefs GET error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load preferences" });
    }
  });

  /**
   * PUT /api/portal/notification-preferences
   * Replace the full preferences blob. Body must match the
   * notificationPreferencesSchema; partial updates are not supported
   * because the categories list is short enough that a full PUT is
   * always cheaper than reasoning about merges.
   */
  app.put("/api/portal/notification-preferences", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const parsed = notificationPreferencesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid preferences payload", details: parsed.error.flatten() });
      }

      const [existing] = await db.select({ metadata: clients.metadata }).from(clients).where(eq(clients.id, clientId)).limit(1);
      const prevMetadata = (existing?.metadata ?? {}) as Record<string, unknown>;
      const newMetadata = { ...prevMetadata, notification_preferences: parsed.data };

      const [updated] = await db
        .update(clients)
        .set({ metadata: newMetadata, updated_at: new Date() })
        .where(eq(clients.id, clientId))
        .returning({ metadata: clients.metadata });

      res.json({ preferences: parseNotificationPreferences(updated.metadata) });
    } catch (err) {
      log.error("Portal notification prefs PUT error:", { error: String(err) });
      res.status(500).json({ error: "Failed to update preferences" });
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
      log.error("Portal password change error:", { error: String(err) });
      res.status(500).json({ error: "Failed to change password" });
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
      log.error("Portal tickets list error:", { error: String(err) });
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
      log.error("Portal ticket detail error:", { error: String(err) });
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

      // Send ticket-created confirmation email (fail-safe, non-blocking)
      try {
        const [client] = await db.select({ contact_email: clients.contact_email })
          .from(clients).where(eq(clients.id, clientId)).limit(1);
        if (client?.contact_email) {
          const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
          sendTicketCreatedEmail(client.contact_email, {
            ticketId: ticket.id,
            subject: ticket.subject,
            portalUrl: `${baseUrl}/portal`,
          }).catch(err =>
            log.warn(`[support-ticket-email] created email failed for ticket #${ticket.id}:`, err.message),
          );
        }
      } catch (err: any) {
        log.warn(`[support-ticket-email] lookup failed for ticket #${ticket.id}:`, err.message);
      }

      // Phase 3c-ii: notify the founder of every client-raised ticket. The
      // portal path previously left admin_notified false and pinged nobody.
      // Fire-and-forget so it never delays the response.
      void (async () => {
        try {
          const [client] = await db.select({ business_name: clients.business_name })
            .from(clients).where(eq(clients.id, clientId)).limit(1);
          const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
          const notified = await sendAdminNewTicketAlert({
            ticketId: ticket.id,
            subject: ticket.subject,
            clientName: client?.business_name || `Client #${clientId}`,
            category: ticket.category || "general",
            priority: ticket.priority || "normal",
            description: ticket.description || "",
            source: ticket.source || "manual",
            adminUrl: `${baseUrl}/admin/crm/support/${ticket.id}`,
          });
          if (notified) await storage.updateSupportTicket(ticket.id, { admin_notified: true });
        } catch (err: any) {
          log.warn(`[support-ticket] admin alert failed for ticket #${ticket.id}:`, err.message);
        }
      })();

      res.status(201).json({
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        category: ticket.category,
        created_at: ticket.created_at,
      });
    } catch (err) {
      log.error("Portal ticket create error:", { error: String(err) });
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
      log.error("Portal ticket reply error:", { error: String(err) });
      res.status(500).json({ error: "Failed to add reply" });
    }
  });

  /* ═══════════════════════════════════════════
     Task Approval / Revision (client-facing)
     ═══════════════════════════════════════════ */

  /**
   * POST /api/portal/tasks/:taskId/approve
   * Client approves a task that is waiting on them (e.g. design approval).
   * Sets status to "delivered" and clears waiting_on.
   */
  app.post("/api/portal/tasks/:taskId/approve", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const taskId = parseInt(req.params.taskId as string);
      if (isNaN(taskId)) return res.status(400).json({ error: "Invalid task ID" });

      // Fetch the task
      const [task] = await db.select().from(fulfillmentTasks).where(eq(fulfillmentTasks.id, taskId)).limit(1);
      if (!task) return res.status(404).json({ error: "Task not found" });

      // Verify ownership
      if (task.client_id !== clientId) {
        return res.status(403).json({ error: "This task does not belong to your account" });
      }

      // Verify the task is waiting on the client
      if (task.waiting_on !== "client") {
        return res.status(400).json({ error: "This task is not waiting on client action" });
      }

      // Update: mark as delivered and clear waiting_on
      const updated = await storage.updateFulfillmentTask(taskId, {
        status: "delivered",
        waiting_on: null,
        last_action: "Client approved",
        last_action_at: new Date(),
        completed_at: new Date(),
      });

      // Resolve client name for the log
      const client = await storage.getClientById(clientId);
      const actorName = client?.contact_name || client?.business_name || "Client";

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: req.user!.id,
        actor_name: actorName,
        action: "task.approved",
        entity_type: "fulfillment_task",
        entity_id: taskId,
        summary: `Client "${actorName}" approved task "${task.title}"`,
      });

      log.info(`[portal/task-approve] Task #${taskId} approved by client #${clientId}`);
      res.json({ ok: true, task: updated });
    } catch (err: any) {
      log.error("[portal/task-approve] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to approve task" });
    }
  });

  /**
   * POST /api/portal/tasks/:taskId/request-revision
   * Client requests a revision on a task that is waiting on them.
   * Sets status to "in_progress", waiting_on to "internal", and stores revision notes.
   */
  app.post("/api/portal/tasks/:taskId/request-revision", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const taskId = parseInt(req.params.taskId as string);
      if (isNaN(taskId)) return res.status(400).json({ error: "Invalid task ID" });

      const { notes } = req.body || {};
      if (!notes || typeof notes !== "string" || !notes.trim()) {
        return res.status(400).json({ error: "Revision notes are required" });
      }

      // Fetch the task
      const [task] = await db.select().from(fulfillmentTasks).where(eq(fulfillmentTasks.id, taskId)).limit(1);
      if (!task) return res.status(404).json({ error: "Task not found" });

      // Verify ownership
      if (task.client_id !== clientId) {
        return res.status(403).json({ error: "This task does not belong to your account" });
      }

      // Verify the task is waiting on the client
      if (task.waiting_on !== "client") {
        return res.status(400).json({ error: "This task is not waiting on client action" });
      }

      // Build metadata with revision history
      const existingMeta = (task.metadata as Record<string, any>) || {};
      const revisionHistory = existingMeta.revision_history || [];
      revisionHistory.push({
        notes: notes.trim(),
        requested_at: new Date().toISOString(),
        requested_by: clientId,
      });

      const updated = await storage.updateFulfillmentTask(taskId, {
        status: "in_progress",
        waiting_on: "internal",
        last_action: `Client requested revision: ${notes.trim().slice(0, 100)}`,
        last_action_at: new Date(),
        metadata: { ...existingMeta, revision_history: revisionHistory, latest_revision_notes: notes.trim() },
      } as any);

      // Resolve client name for the log
      const client = await storage.getClientById(clientId);
      const actorName = client?.contact_name || client?.business_name || "Client";

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: req.user!.id,
        actor_name: actorName,
        action: "task.revision_requested",
        entity_type: "fulfillment_task",
        entity_id: taskId,
        summary: `Client "${actorName}" requested revision on task "${task.title}": ${notes.trim().slice(0, 200)}`,
        metadata: { revision_notes: notes.trim() },
      });

      log.info(`[portal/task-revision] Task #${taskId} revision requested by client #${clientId}`);
      res.json({ ok: true, task: updated });
    } catch (err: any) {
      log.error("[portal/task-revision] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to request revision" });
    }
  });

  /* ═══════════════════════════════════════════════════════════════════
     Sprint 12 — Automation pause toggles
     Clients can pause individual service automation or all at once.
     Flags are stored in client.metadata and client_service.metadata.
     ═══════════════════════════════════════════════════════════════════ */

  /**
   * GET /api/portal/automation-status
   * Returns the current automation pause state for the client and each
   * applicable service.
   */
  app.get("/api/portal/automation-status", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
      if (!client) return res.status(404).json({ error: "Client not found" });

      const meta = (client.metadata as Record<string, any>) ?? {};
      const allPaused = meta.all_automation_paused === true;

      // Get per-service pause flags
      const services = await db.select({
        id: clientServices.id,
        service_id: clientServices.service_id,
        metadata: clientServices.metadata,
      })
        .from(clientServices)
        .where(and(
          eq(clientServices.client_id, clientId),
          eq(clientServices.status, "active"),
        ));

      const serviceFlags: Record<string, boolean> = {};
      for (const svc of services) {
        const svcMeta = (svc.metadata as Record<string, any>) ?? {};
        if (svc.service_id.includes("socialsync")) {
          serviceFlags.socialsync_auto_post_paused = svcMeta.auto_post_paused === true;
        }
        if (svc.service_id.includes("reputationshield")) {
          serviceFlags.reputationshield_auto_reply_paused = svcMeta.auto_reply_paused === true;
        }
        if (svc.service_id.includes("rankflow")) {
          serviceFlags.rankflow_article_generation_paused = svcMeta.article_generation_paused === true;
        }
      }

      res.json({
        all_automation_paused: allPaused,
        ...serviceFlags,
      });
    } catch (err: any) {
      log.error("[portal/automation-status] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to load automation status" });
    }
  });

  /**
   * PATCH /api/portal/settings/automation
   * Master "Pause All Automation" toggle.
   * Body: { all_automation_paused: boolean }
   * Stores in client.metadata.
   */
  app.patch("/api/portal/settings/automation", requireClientStrict, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { all_automation_paused } = req.body;
      if (typeof all_automation_paused !== "boolean") {
        return res.status(400).json({ error: "all_automation_paused must be a boolean" });
      }

      const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
      if (!client) return res.status(404).json({ error: "Client not found" });

      const existing = (client.metadata as Record<string, any>) ?? {};
      await db.update(clients)
        .set({ metadata: { ...existing, all_automation_paused }, updated_at: new Date() })
        .where(eq(clients.id, clientId));

      log.info("[portal/settings/automation] all_automation_paused toggled", { clientId, all_automation_paused });
      res.json({ ok: true, all_automation_paused });
    } catch (err: any) {
      log.error("[portal/settings/automation] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to update automation settings" });
    }
  });

  /**
   * POST /api/portal/catalog/subscribe
   * Q16: add a service to an authenticated client's subscription via Stripe Checkout.
   * Pre-creates the clientService + onboarding + tasks in 'pending' state, then
   * returns a checkout_url. Webhook (stripeBillingRoutes) flips status to active
   * on payment success — same flow as /api/public/checkout.
   * Body: { service_id: string, billing_period?: "monthly" | "yearly" }
   */
  app.post("/api/portal/catalog/subscribe", requireClientStrict, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) return res.status(503).json({ error: "Payments are not configured yet. Please contact us." });
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-01-27.acacia" as any });

      const { service_id, billing_period, tier_id, bundle_id } = req.body ?? {};

      /* Q5e: bundle path. When bundle_id is set, resolve the bundle from
         shared/pricing.ts ALL_BUNDLES and create a pending client_service
         per included tier, then a SINGLE Stripe Checkout Session with one
         line_item per included tier (Stripe subscription mode supports
         mixed subscription + one-time line items). */
      if (bundle_id) {
        if (typeof bundle_id !== "string") {
          return res.status(400).json({ error: "bundle_id must be a string" });
        }
        const bundle = ALL_BUNDLES.find((b) => b.id === bundle_id);
        if (!bundle) return res.status(400).json({ error: "Unknown bundle" });

        // Pre-flight: every included tier must exist + be active + the client
        // must not already have any of them.
        const includedSvcs: Array<ServiceCatalogRow & { _priceId: string }> = [];
        for (const inc of bundle.includes) {
          const s = await storage.getServiceById(inc.tierId);
          if (!s || !s.is_active) return res.status(400).json({ error: `${inc.label} is not available` });
          const dup = await storage.findClientServiceByServiceId(clientId, s.id);
          if (dup && dup.status !== "cancelled" && dup.status !== "completed") {
            return res.status(409).json({ error: `You're already subscribed to ${s.name}.` });
          }
          const priceId = s.stripe_price_id;
          if (!priceId) {
            return res.status(400).json({ error: `${s.name} pricing isn't configured yet. Please contact us.` });
          }
          includedSvcs.push({ ...s, _priceId: priceId });
        }

        const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
        if (!client) return res.status(404).json({ error: "Client not found" });
        let stripeCustomerId = client.stripe_customer_id;
        if (!stripeCustomerId) {
          const customer = await stripe.customers.create({
            name: client.business_name,
            email: client.contact_email || undefined,
            phone: client.contact_phone || undefined,
            metadata: { crm_client_id: String(client.id) },
          });
          stripeCustomerId = customer.id;
          await storage.updateClient(client.id, { stripe_customer_id: stripeCustomerId });
        }

        // Pre-create each included service in pending state.
        const createdIds: number[] = [];
        for (const s of includedSvcs) {
          const cs = await storage.createClientService({
            client_id: client.id,
            service_id: s.id,
            status: "pending",
            enabled: true,
            fulfillment_mode: "internal",
            price_cents: s.default_price,
            billing_period: s.billing_period,
            metadata: { bundle_id: bundle.id, bundle_name: bundle.name },
          });
          createdIds.push(cs.id);
          await storage.createClientPayment({
            client_id: client.id,
            client_service_id: cs.id,
            type: s.billing_period === "monthly" ? "invoice" : "payment",
            amount_cents: s.default_price ?? 0,
            status: "pending",
            description: `${s.name} (bundle: ${bundle.name})`,
            actor_type: "system",
          });
        }

        const hasMonthly = includedSvcs.some((s) => s.billing_period === "monthly");
        const mode = hasMonthly ? "subscription" : "payment";
        const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
        const session = await stripe.checkout.sessions.create({
          customer: stripeCustomerId,
          mode: mode as Stripe.Checkout.SessionCreateParams.Mode,
          payment_method_types: ["card", "us_bank_account", "cashapp", "afterpay_clearpay", "klarna", "acss_debit"],
          line_items: includedSvcs.map((s) => ({ price: s._priceId, quantity: 1 })),
          metadata: {
            crm_client_id: String(client.id),
            bundle_id: bundle.id,
            service_catalog_id: includedSvcs.map((s) => s.id).join(","),
            client_service_ids: createdIds.join(","),
            source: "portal_catalog_bundle",
          },
          success_url: `${baseUrl}/portal/services?checkout=success&bundle=${encodeURIComponent(bundle.id)}`,
          cancel_url: `${baseUrl}/portal/catalog?checkout=cancelled`,
          allow_promotion_codes: true,
          billing_address_collection: "auto",
        });

        log.info("[portal/catalog/subscribe] bundle session created", {
          clientId, bundle_id: bundle.id, items: includedSvcs.length, session_id: session.id,
        });
        return res.json({ checkout_url: session.url, session_id: session.id });
      }

      if (!service_id || typeof service_id !== "string") {
        return res.status(400).json({ error: "service_id or bundle_id is required" });
      }
      const wantsYearly = billing_period === "yearly";

      const svc = await storage.getServiceById(service_id);
      if (!svc || !svc.is_active) return res.status(400).json({ error: "Service not available" });

      const existing = await storage.findClientServiceByServiceId(clientId, svc.id);
      if (existing && existing.status !== "cancelled" && existing.status !== "completed") {
        return res.status(409).json({ error: "You're already subscribed to this service." });
      }

      /* Q28g2: if the product has tiers AND the request specifies a tier_id,
         use that tier's stripe_price_id + price_cents. Otherwise fall back to
         the product-level stripe_price_id (single-price products) or the
         first/highlighted tier when tiers exist but no tier_id was picked. */
      type ProductTier = {
        id: string;
        name: string;
        price_cents: number;
        billing_period: "monthly" | "one-time";
        stripe_price_id?: string | null;
        highlighted?: boolean;
      };
      const productTiers: ProductTier[] | null = Array.isArray(svc.tiers)
        ? (svc.tiers as ProductTier[])
        : null;

      let pickedTier: ProductTier | null = null;
      if (productTiers && productTiers.length > 0) {
        if (tier_id) {
          pickedTier = productTiers.find((t) => t.id === tier_id) ?? null;
          if (!pickedTier) {
            return res.status(400).json({ error: "Selected tier not found for this product." });
          }
        } else {
          // Default: highlighted tier if any, else first
          pickedTier = productTiers.find((t) => t.highlighted) ?? productTiers[0] ?? null;
        }
      }

      const tierStripeId = pickedTier?.stripe_price_id || null;
      const productLevelPriceId = wantsYearly && svc.billing_period === "monthly"
        ? svc.stripe_yearly_price_id
        : svc.stripe_price_id;
      const resolvedPriceId = tierStripeId ?? productLevelPriceId;
      if (!resolvedPriceId) {
        return res.status(400).json({ error: `${svc.name} pricing isn't configured yet. Please contact us.` });
      }

      const tierPriceCents = pickedTier?.price_cents ?? null;
      const tierBillingPeriod = pickedTier?.billing_period ?? null;

      const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
      if (!client) return res.status(404).json({ error: "Client not found" });

      let stripeCustomerId = client.stripe_customer_id;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          name: client.business_name,
          email: client.contact_email || undefined,
          phone: client.contact_phone || undefined,
          metadata: { crm_client_id: String(client.id) },
        });
        stripeCustomerId = customer.id;
        await storage.updateClient(client.id, { stripe_customer_id: stripeCustomerId });
      }

      // Pre-create pending clientService + payment + onboarding + tasks (same shape as public flow)
      const effectivePriceCents = tierPriceCents ?? svc.default_price;
      const effectiveBillingPeriod = tierBillingPeriod ?? svc.billing_period;
      const tierLabel = pickedTier ? ` (${pickedTier.name})` : "";
      const cs = await storage.createClientService({
        client_id: client.id,
        service_id: svc.id,
        status: "pending",
        enabled: true,
        fulfillment_mode: "internal",
        price_cents: effectivePriceCents,
        billing_period: effectiveBillingPeriod,
        metadata: pickedTier ? { tier_id: pickedTier.id, tier_name: pickedTier.name } : null,
      });
      await storage.createClientPayment({
        client_id: client.id,
        client_service_id: cs.id,
        type: effectiveBillingPeriod === "monthly" ? "invoice" : "payment",
        amount_cents: effectivePriceCents ?? 0,
        status: "pending",
        description: `${svc.name}${tierLabel} — ${effectiveBillingPeriod === "monthly" ? "monthly" : "one-time"}`,
        actor_type: "system",
      });
      const tmpl = await storage.getOnboardingTemplate(svc.id);
      if (tmpl) {
        await storage.createOnboardingSubmission({
          client_service_id: cs.id,
          client_id: client.id,
          template_id: tmpl.id,
          status: "not_sent",
          actor_type: "system",
        });
      }
      const tasks = await storage.getTaskTemplates(svc.id);
      for (const t of tasks) {
        await storage.createFulfillmentTask({
          client_service_id: cs.id,
          client_id: client.id,
          title: t.title,
          description: t.description,
          sort_order: t.sort_order,
          priority: t.default_priority,
          handled_by: t.default_handled_by,
          waiting_on: t.default_waiting_on,
          human_review_required: t.human_review_required,
          due_at: t.sla_days ? new Date(Date.now() + t.sla_days * 86400000) : null,
          status: "not_started",
          actor_type: "system",
        });
      }

      const mode = effectiveBillingPeriod === "monthly" ? "subscription" : "payment";
      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: mode as Stripe.Checkout.SessionCreateParams.Mode,
        payment_method_types: ["card", "us_bank_account", "cashapp", "afterpay_clearpay", "klarna", "acss_debit"],
        line_items: [{ price: resolvedPriceId, quantity: 1 }],
        metadata: {
          crm_client_id: String(client.id),
          service_catalog_id: svc.id,
          client_service_id: String(cs.id),
          billing_period: wantsYearly ? "yearly" : "monthly",
          source: "portal_catalog",
          ...(pickedTier ? { tier_id: pickedTier.id, tier_name: pickedTier.name } : {}),
        },
        success_url: `${baseUrl}/portal/services?checkout=success&service=${encodeURIComponent(svc.id)}`,
        cancel_url: `${baseUrl}/portal/catalog?checkout=cancelled`,
        allow_promotion_codes: true,
        billing_address_collection: "auto",
      });

      log.info("[portal/catalog/subscribe] session created", {
        clientId,
        service_id: svc.id,
        client_service_id: cs.id,
        session_id: session.id,
      });

      res.json({ checkout_url: session.url, session_id: session.id });
    } catch (err: any) {
      log.error("[portal/catalog/subscribe] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to start checkout. Please try again." });
    }
  });

  /**
   * GET /api/portal/catalog
   * Q16: in-portal service catalog — services the client is NOT yet subscribed to.
   * Returns full SERVICES rows minus any IDs the client already has active/pending/onboarding.
   */
  app.get("/api/portal/catalog", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const active = await db
        .select({ service_id: clientServices.service_id })
        .from(clientServices)
        .where(and(
          eq(clientServices.client_id, clientId),
          sql`${clientServices.status} in ('pending','onboarding','active','paused')`,
        ));
      const activeIds = new Set(active.map((r) => r.service_id));

      /* Q28g + Q28g2: read-path flip for admin-edited copy. DB overrides for
         name / tagline / description / features when non-null; otherwise fall
         back to the hardcoded SERVICES list. Tiers (Q28a) are passed through
         so the client can render a tier picker when present. */
      const dbRows = await db
        .select({
          id: serviceCatalog.id,
          name: serviceCatalog.name,
          tagline: serviceCatalog.tagline,
          description: serviceCatalog.description,
          features: serviceCatalog.features,
          tiers: serviceCatalog.tiers,
        })
        .from(serviceCatalog);
      const dbById = new Map(dbRows.map((r) => [r.id, r]));

      const available = SERVICES
        .filter((svc) => !activeIds.has(svc.id))
        .map((svc) => {
          const override = dbById.get(svc.id);
          if (!override) return { ...svc, tiers: null };
          return {
            ...svc,
            name: override.name ?? svc.name,
            tagline: override.tagline ?? svc.tagline,
            description: override.description ?? svc.description,
            features: Array.isArray(override.features) && override.features.length > 0
              ? (override.features as string[])
              : svc.features,
            tiers: Array.isArray(override.tiers) && override.tiers.length > 0
              ? override.tiers
              : null,
          };
        });

      /* Q5e: bundles available to subscribe to. A bundle is "available"
         if NONE of its included tier IDs are already on the client's
         active subscription list — otherwise checking out the bundle
         would create a duplicate subscription. */
      const availableBundles = ALL_BUNDLES
        .filter((b) => b.includes.every((inc) => !activeIds.has(inc.tierId)))
        .map((b) => ({
          id: b.id,
          name: b.name,
          tagline: b.tagline,
          price: b.price,
          billingPeriod: b.billingPeriod,
          badge: b.badge ?? null,
          highlighted: !!b.highlighted,
          savings: bundleSavings(b),
          includes: b.includes.map((inc) => ({
            tier_id: inc.tierId,
            label: inc.label,
            value: inc.value,
          })),
        }));

      res.json({ services: available, bundles: availableBundles });
    } catch (err: any) {
      log.error("[portal/catalog] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to load catalog" });
    }
  });

  /**
   * POST /api/portal/logo
   * Q15: save customer logo URL (paste-link v1; file-upload later).
   * Body: { logo_url: string | null }
   */
  app.post("/api/portal/logo", requireClientStrict, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { logo_url } = req.body ?? {};
      if (logo_url !== null && typeof logo_url !== "string") {
        return res.status(400).json({ error: "logo_url must be a string or null" });
      }
      if (typeof logo_url === "string" && logo_url.length > 2048) {
        return res.status(400).json({ error: "logo_url exceeds 2048 chars" });
      }
      if (typeof logo_url === "string" && logo_url.length > 0 && !/^https?:\/\//i.test(logo_url)) {
        return res.status(400).json({ error: "logo_url must start with http:// or https://" });
      }

      await db.update(clients)
        .set({ logo_url: logo_url ?? null, updated_at: new Date() })
        .where(eq(clients.id, clientId));

      log.info("[portal/logo] updated", { clientId, has_logo: !!logo_url });
      res.json({ ok: true, logo_url: logo_url ?? null });
    } catch (err: any) {
      log.error("[portal/logo] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to update logo" });
    }
  });

  /**
   * POST /api/portal/logo/upload
   * Q15 (file-upload): accept a logo image file directly instead of
   * requiring the customer to host it elsewhere. Body is a base64 JSON
   * payload — same pattern as the admin deliverables upload
   * (`/api/admin/crm/fulfillment/:id/deliverables`); no multer dependency.
   * Body: { file: "base64data...", filename: "logo.png" }
   *
   * The file is stored via fileStorage.saveFile() under data/uploads/logos
   * and served from the /uploads static mount (server/index.ts). The
   * resulting public URL is persisted to clients.logo_url, replacing any
   * previous value and deleting a previously-uploaded file.
   *
   * TODO(alex): in production the data/uploads directory is local to the
   * Replit container and is wiped on redeploy. Before launch, point
   * fileStorage at a durable bucket (Replit Object Storage via
   * server/lib/objectStorage.ts, or set LOGO_UPLOAD_BUCKET) so customer
   * logos survive deploys. Paste-URL logos are unaffected.
   */
  // The global express.json() parser defaults to a 100 KB body limit, which
  // is far too small for a base64-encoded image. Mount a route-scoped parser
  // with a raised limit (5 MB binary -> ~6.8 MB base64, +slack) ahead of the
  // handler so the upload body is accepted.
  const logoUploadBodyParser = express.json({ limit: "8mb" });

  app.post("/api/portal/logo/upload", requireClientStrict, logoUploadBodyParser, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { file, filename } = req.body ?? {};
      if (!file || typeof file !== "string") {
        return res.status(400).json({ error: "file (base64 string) is required" });
      }
      if (!filename || typeof filename !== "string") {
        return res.status(400).json({ error: "filename is required" });
      }

      // Only allow common raster/vector image extensions.
      const ext = (filename.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase();
      const ALLOWED_EXT = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
      if (!ALLOWED_EXT.includes(ext)) {
        return res.status(400).json({
          error: "Unsupported image type — use PNG, JPG, GIF, WEBP or SVG",
        });
      }

      const buffer = Buffer.from(file, "base64");
      if (buffer.length === 0) {
        return res.status(400).json({ error: "File is empty or invalid base64" });
      }
      // 5 MB limit — logos are small; this also bounds the JSON body size.
      const MAX_SIZE = 5 * 1024 * 1024;
      if (buffer.length > MAX_SIZE) {
        return res.status(400).json({ error: "Logo exceeds 5 MB limit" });
      }

      const url = await saveFile(buffer, `logo${ext}`, "logos");

      // Replace the stored reference, cleaning up a previously-uploaded file.
      const [prev] = await db
        .select({ logo_url: clients.logo_url })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      await db.update(clients)
        .set({ logo_url: url, updated_at: new Date() })
        .where(eq(clients.id, clientId));

      const prevUrl = prev?.logo_url;
      if (prevUrl && prevUrl.startsWith("/uploads/logos/") && prevUrl !== url) {
        await deleteFile(prevUrl).catch(() => {});
      }

      log.info("[portal/logo/upload] uploaded", { clientId, size: buffer.length });
      res.status(201).json({ ok: true, logo_url: url });
    } catch (err: any) {
      log.error("[portal/logo/upload] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to upload logo" });
    }
  });
}
