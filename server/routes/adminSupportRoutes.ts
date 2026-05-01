import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { users, clients } from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { sendTicketReplyEmail, sendTicketResolvedEmail } from "../lib/supportTicketEmails";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminSupport");

const VALID_STATUSES = ["open", "in_progress", "waiting_on_customer", "resolved", "closed"] as const;
const VALID_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const VALID_CATEGORIES = ["general", "billing", "service", "onboarding", "access", "other"] as const;

export function registerAdminSupportRoutes(app: Express): void {

  /* ═══════════════════════════════════════════
     Admin Support Tickets
     ═══════════════════════════════════════════ */

  /**
   * GET /api/admin/crm/support/tickets
   * List all support tickets with filters.
   * Admin sees full ticket data including AI summary, source, assignee.
   */
  app.get("/api/admin/crm/support/tickets", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { status, priority, category, client_id, search, limit, offset } = req.query;

      const tickets = await storage.listSupportTickets({
        status: typeof status === "string" && VALID_STATUSES.includes(status as any) ? status : undefined,
        priority: typeof priority === "string" && VALID_PRIORITIES.includes(priority as any) ? priority : undefined,
        category: typeof category === "string" && VALID_CATEGORIES.includes(category as any) ? category : undefined,
        clientId: client_id ? parseInt(client_id as string) : undefined,
        search: typeof search === "string" && search.trim() ? search.trim() : undefined,
        limit: limit ? Math.min(parseInt(limit as string) || 100, 200) : 100,
        offset: offset ? parseInt(offset as string) || 0 : 0,
      });

      res.json({ tickets });
    } catch (err) {
      log.error("[admin-support] List tickets error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load tickets" });
    }
  });

  /**
   * GET /api/admin/crm/support/tickets/counts
   * Status counts for sidebar badge and filter tabs.
   */
  app.get("/api/admin/crm/support/tickets/counts", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const counts = await storage.getSupportTicketCounts();
      res.json(counts);
    } catch (err) {
      log.error("[admin-support] Ticket counts error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load ticket counts" });
    }
  });

  /**
   * GET /api/admin/crm/support/tickets/:id
   * Full ticket detail with ALL messages (customer + internal).
   * Admin sees everything: AI summary, internal notes, metadata.
   */
  app.get("/api/admin/crm/support/tickets/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const ticketId = parseInt(req.params.id as string);
      if (isNaN(ticketId)) return res.status(400).json({ error: "Invalid ticket id" });

      const ticket = await storage.getSupportTicketById(ticketId);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      // All messages — no visibility filter (admin sees everything)
      const messages = await storage.listTicketMessages(ticketId, "all");

      res.json({ ticket, messages });
    } catch (err) {
      log.error("[admin-support] Ticket detail error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load ticket" });
    }
  });

  /**
   * PATCH /api/admin/crm/support/tickets/:id
   * Update ticket: status, priority, category, assigned_to.
   * Each change is logged as a ticket event.
   */
  app.patch("/api/admin/crm/support/tickets/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const ticketId = parseInt(req.params.id as string);
      if (isNaN(ticketId)) return res.status(400).json({ error: "Invalid ticket id" });

      const ticket = await storage.getSupportTicketById(ticketId);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      const body = z.object({
        status: z.enum(VALID_STATUSES).optional(),
        priority: z.enum(VALID_PRIORITIES).optional(),
        category: z.enum(VALID_CATEGORIES).optional(),
        assigned_to: z.number().nullable().optional(),
      }).safeParse(req.body);

      if (!body.success) {
        return res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      }

      const updates: Record<string, any> = {};
      const { status, priority, category, assigned_to } = body.data;

      // Status change
      if (status && status !== ticket.status) {
        updates.status = status;
        if (status === "resolved" && !ticket.resolved_at) updates.resolved_at = new Date();
        if (status === "closed" && !ticket.closed_at) updates.closed_at = new Date();
        // Reopen: clear resolved/closed timestamps
        if (status === "open" && (ticket.status === "resolved" || ticket.status === "closed")) {
          updates.resolved_at = null;
          updates.closed_at = null;
        }

        await storage.createTicketEvent({
          ticket_id: ticketId,
          actor_id: req.user!.id,
          actor_type: "human",
          action: "status_changed",
          old_value: ticket.status,
          new_value: status,
          summary: `Status changed from ${ticket.status} to ${status}`,
        });

        // Send resolved/closed notification to client (fail-safe, non-blocking)
        if (status === "resolved" || status === "closed") {
          try {
            const [client] = await db.select({ contact_email: clients.contact_email })
              .from(clients).where(eq(clients.id, ticket.client_id)).limit(1);
            if (client?.contact_email) {
              const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
              sendTicketResolvedEmail(client.contact_email, {
                ticketId: ticket.id,
                subject: ticket.subject,
                portalUrl: `${baseUrl}/portal`,
              }).catch(err =>
                log.warn(`[support-ticket-email] resolved email failed for ticket #${ticket.id}:`, err.message),
              );
            }
          } catch (emailErr: any) {
            log.warn(`[support-ticket-email] resolved lookup failed for ticket #${ticket.id}:`, emailErr.message);
          }
        }
      }

      // Priority change
      if (priority && priority !== ticket.priority) {
        updates.priority = priority;
        await storage.createTicketEvent({
          ticket_id: ticketId,
          actor_id: req.user!.id,
          actor_type: "human",
          action: "priority_changed",
          old_value: ticket.priority,
          new_value: priority,
          summary: `Priority changed from ${ticket.priority} to ${priority}`,
        });
      }

      // Category change
      if (category && category !== ticket.category) {
        updates.category = category;
      }

      // Assignee change — must be an admin user
      if (assigned_to !== undefined && assigned_to !== ticket.assigned_to) {
        if (assigned_to !== null) {
          const [assignee] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, assigned_to)).limit(1);
          if (!assignee || assignee.role !== "admin") {
            return res.status(400).json({ error: "Assignee must be an admin user" });
          }
        }
        updates.assigned_to = assigned_to;
        await storage.createTicketEvent({
          ticket_id: ticketId,
          actor_id: req.user!.id,
          actor_type: "human",
          action: "assigned",
          old_value: ticket.assigned_to?.toString() ?? null,
          new_value: assigned_to?.toString() ?? null,
          summary: assigned_to ? `Ticket assigned` : `Ticket unassigned`,
        });
      }

      if (Object.keys(updates).length === 0) {
        return res.json({ ticket });
      }

      const updated = await storage.updateSupportTicket(ticketId, updates);
      res.json({ ticket: updated });
    } catch (err) {
      log.error("[admin-support] Ticket update error:", { error: String(err) });
      res.status(500).json({ error: "Failed to update ticket" });
    }
  });

  /**
   * POST /api/admin/crm/support/tickets/:id/messages
   * Add admin reply (customer-visible) or internal note (admin-only).
   *
   * VISIBILITY RULES:
   *   visibility="customer" → visible to both customer and admin
   *   visibility="internal" → admin-only, NEVER shown to customer
   */
  app.post("/api/admin/crm/support/tickets/:id/messages", requireAdmin, async (req: Request, res: Response) => {
    try {
      const ticketId = parseInt(req.params.id as string);
      if (isNaN(ticketId)) return res.status(400).json({ error: "Invalid ticket id" });

      const ticket = await storage.getSupportTicketById(ticketId);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      const body = z.object({
        message: z.string().min(1, "Message is required"),
        visibility: z.enum(["customer", "internal"]),
      }).safeParse(req.body);

      if (!body.success) {
        return res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      }

      const { message, visibility } = body.data;

      const msg = await storage.createTicketMessage({
        ticket_id: ticketId,
        author_id: req.user!.id,
        author_type: "admin",
        visibility,
        content: message.trim(),
      });

      // Log event
      const action = visibility === "internal" ? "note_added" : "reply_added";
      await storage.createTicketEvent({
        ticket_id: ticketId,
        actor_id: req.user!.id,
        actor_type: "human",
        action,
        summary: visibility === "internal" ? "Internal note added" : "Admin replied to customer",
      });

      // Update ticket timestamp
      await storage.updateSupportTicket(ticketId, {});

      // Send reply notification to client for customer-visible replies (fail-safe, non-blocking)
      if (visibility === "customer") {
        try {
          const [client] = await db.select({ contact_email: clients.contact_email })
            .from(clients).where(eq(clients.id, ticket.client_id)).limit(1);
          if (client?.contact_email) {
            const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
            sendTicketReplyEmail(client.contact_email, {
              ticketId: ticket.id,
              subject: ticket.subject,
              replyPreview: message.trim(),
              portalUrl: `${baseUrl}/portal`,
            }).catch(err =>
              log.warn(`[support-ticket-email] reply email failed for ticket #${ticket.id}:`, err.message),
            );
          }
        } catch (emailErr: any) {
          log.warn(`[support-ticket-email] reply lookup failed for ticket #${ticket.id}:`, emailErr.message);
        }
      }

      res.status(201).json({ message: msg });
    } catch (err) {
      log.error("[admin-support] Add message error:", { error: String(err) });
      res.status(500).json({ error: "Failed to add message" });
    }
  });

  /**
   * POST /api/admin/crm/support/tickets
   * Admin creates a ticket on behalf of a client.
   */
  app.post("/api/admin/crm/support/tickets", requireAdmin, async (req: Request, res: Response) => {
    try {
      const body = z.object({
        client_id: z.number().int().positive(),
        subject: z.string().min(1, "Subject is required"),
        description: z.string().min(10, "Description must be at least 10 characters"),
        category: z.enum(VALID_CATEGORIES).default("general"),
        priority: z.enum(VALID_PRIORITIES).default("normal"),
        assigned_to: z.number().int().positive().nullable().optional(),
      }).safeParse(req.body);

      if (!body.success) {
        return res.status(400).json({ error: "Invalid request", details: body.error.flatten() });
      }

      const { client_id, subject, description, category, priority, assigned_to } = body.data;

      // Validate assignee is admin
      if (assigned_to) {
        const [assignee] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, assigned_to)).limit(1);
        if (!assignee || assignee.role !== "admin") {
          return res.status(400).json({ error: "Assignee must be an admin user" });
        }
      }

      const ticket = await storage.createSupportTicket({
        client_id,
        subject: subject.trim(),
        description: description.trim(),
        category,
        priority,
        source: "admin_created",
        assigned_to: assigned_to ?? null,
        status: "open",
        admin_notified: true,
      });

      // Create initial message
      await storage.createTicketMessage({
        ticket_id: ticket.id,
        author_id: req.user!.id,
        author_type: "admin",
        visibility: "customer",
        content: description.trim(),
      });

      // Log event
      await storage.createTicketEvent({
        ticket_id: ticket.id,
        actor_id: req.user!.id,
        actor_type: "human",
        action: "created",
        new_value: "open",
        summary: "Ticket created by admin on behalf of client",
      });

      res.status(201).json({ ticket });
    } catch (err) {
      log.error("[admin-support] Create ticket error:", { error: String(err) });
      res.status(500).json({ error: "Failed to create ticket" });
    }
  });

  /**
   * GET /api/admin/crm/team
   * Returns admin users for assignee dropdowns.
   */
  app.get("/api/admin/crm/team", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const admins = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.role, "admin"));
      res.json(admins);
    } catch (err) {
      log.error("[admin-support] Team list error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load team" });
    }
  });
}
