/**
 * Portal Support Tickets routes.
 *
 * Mounted under /api/portal/tickets*.
 * Auth: requireClient.
 *
 * Extracted from portalRoutes.ts as wave 14 of the portal sub-registrar
 * refactor. Pure code move — zero behaviour change. The parent registrar
 * (registerPortalRoutes) invokes registerPortalTicketsRoutes(app) so the
 * wiring in routes/index.ts is unchanged.
 *
 * VISIBILITY RULE: only messages with visibility="customer" are exposed.
 * Internal notes, AI summary, assignee, and admin metadata are NEVER returned.
 *
 * Endpoints
 *   GET  /api/portal/tickets              (list customer tickets)
 *   GET  /api/portal/tickets/:id          (detail + customer-visible messages)
 *   POST /api/portal/tickets              (create ticket; 3/day rate limit)
 *   POST /api/portal/tickets/:id/messages (customer reply)
 */

import type { Express, Request, Response } from "express";
import { and, eq, desc, sql } from "drizzle-orm";
import { requireClient } from "../../auth";
import { storage } from "../../storage";
import { db } from "../../db";
import {
  clients,
  supportTickets,
  ticketMessages,
} from "@shared/schema";
import { createLogger } from "../../lib/logger";
import { sendTicketCreatedEmail, sendAdminNewTicketAlert } from "../../lib/supportTicketEmails";
import { withClientIdOrPreview } from "../../middleware/adminPreviewSafe";

const log = createLogger("PortalTickets");

/** Resolve client_id from the authenticated user's id. Returns null if no client record linked. */
async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Wave 12C: admin users without a linked clients row receive 200 with
 * `{previewMode:true, persisted:false, ...previewShape}` so the page renders
 * its empty state. Real customers still get 403 `no_client_linked`.
 */
async function withClientId(
  req: Request,
  res: Response,
  previewShape: Record<string, unknown> = {},
): Promise<number | null> {
  return withClientIdOrPreview(req, res, { previewShape });
}

export function registerPortalTicketsRoutes(app: Express) {
  /**
   * GET /api/portal/tickets
   * List support tickets for the authenticated client.
   * Returns customer-safe fields only.
   */
  app.get("/api/portal/tickets", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, { tickets: [] });
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
}
