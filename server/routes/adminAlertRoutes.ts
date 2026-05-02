/**
 * Admin Alert Routes -- CRUD for system alerts + unified inbox endpoint.
 */

import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { jobLogs, fulfillmentTasks, supportTickets, clients } from "@shared/schema";
import { eq, desc, and, gte, or } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminAlerts");

export function registerAdminAlertRoutes(app: Express): void {

  app.get("/api/admin/alerts", requireAdmin, async (req: Request, res: Response) => {
    try {
      const severity = req.query.severity as string | undefined;
      const category = req.query.category as string | undefined;
      const acknowledged = req.query.acknowledged === "true" ? true : req.query.acknowledged === "false" ? false : undefined;
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
      const alerts = await storage.listSystemAlerts({ severity, category, acknowledged, limit, offset });
      const unacknowledgedCount = await storage.getUnacknowledgedAlertCount();
      res.json({ data: alerts, unacknowledged_count: unacknowledgedCount });
    } catch (err: any) {
      log.error("Failed to list alerts", { error: err.message });
      res.status(500).json({ error: "Failed to list alerts" });
    }
  });

  app.post("/api/admin/alerts/:id/acknowledge", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id));
      const userId = (req.user as any)?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const alert = await storage.acknowledgeSystemAlert(id, userId);
      if (!alert) return res.status(404).json({ error: "Alert not found" });
      res.json(alert);
    } catch (err: any) {
      log.error("Failed to acknowledge alert", { error: err.message });
      res.status(500).json({ error: "Failed to acknowledge alert" });
    }
  });

  app.get("/api/admin/alerts/count", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const alertCount = await storage.getUnacknowledgedAlertCount();
      res.json({ count: alertCount });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to get alert count" });
    }
  });

  app.get("/api/admin/inbox", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const failedJobs = await db.select().from(jobLogs)
        .where(and(eq(jobLogs.status, "failed"), gte(jobLogs.started_at, last24h)))
        .orderBy(desc(jobLogs.started_at)).limit(20);

      const unackedAlerts = await storage.listSystemAlerts({ acknowledged: false, limit: 30 });

      const internalTasks = await db.select({
        id: fulfillmentTasks.id, title: fulfillmentTasks.title, status: fulfillmentTasks.status,
        priority: fulfillmentTasks.priority, waiting_on: fulfillmentTasks.waiting_on,
        client_id: fulfillmentTasks.client_id, due_at: fulfillmentTasks.due_at,
        created_at: fulfillmentTasks.created_at, client_name: clients.business_name,
      }).from(fulfillmentTasks).leftJoin(clients, eq(fulfillmentTasks.client_id, clients.id))
        .where(eq(fulfillmentTasks.waiting_on, "internal")).orderBy(desc(fulfillmentTasks.created_at)).limit(20);

      const openTickets = await db.select({
        id: supportTickets.id, subject: supportTickets.subject, status: supportTickets.status,
        priority: supportTickets.priority, category: supportTickets.category,
        client_id: supportTickets.client_id, created_at: supportTickets.created_at,
      }).from(supportTickets)
        .where(or(eq(supportTickets.status, "open"), eq(supportTickets.status, "in_progress")))
        .orderBy(desc(supportTickets.created_at)).limit(20);

      const qaReviews = await db.select({
        id: fulfillmentTasks.id, title: fulfillmentTasks.title, status: fulfillmentTasks.status,
        priority: fulfillmentTasks.priority, client_id: fulfillmentTasks.client_id,
        due_at: fulfillmentTasks.due_at, created_at: fulfillmentTasks.created_at,
        client_name: clients.business_name,
      }).from(fulfillmentTasks).leftJoin(clients, eq(fulfillmentTasks.client_id, clients.id))
        .where(eq(fulfillmentTasks.status, "qa_review")).orderBy(desc(fulfillmentTasks.created_at)).limit(20);

      const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, critical: 0, warning: 1, normal: 2, info: 3, low: 4 };

      interface InboxItem {
        id: string; type: string; title: string; severity: string;
        age_ms: number; age_label: string; created_at: string;
        action_url?: string; entity_id: number; metadata?: Record<string, unknown>;
      }

      function ageLabel(ms: number): string {
        const mins = Math.floor(ms / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
      }

      const items: InboxItem[] = [];

      for (const job of failedJobs) {
        const age = now.getTime() - new Date(job.started_at!).getTime();
        items.push({ id: `job-${job.id}`, type: "failed_job", title: `Worker "${job.job_name}" failed`, severity: "critical", age_ms: age, age_label: ageLabel(age), created_at: job.started_at!.toISOString(), entity_id: job.id, metadata: { error: job.error_message } });
      }
      for (const a of unackedAlerts) {
        const age = now.getTime() - new Date(a.created_at!).getTime();
        items.push({ id: `alert-${a.id}`, type: "alert", title: a.title, severity: a.severity, age_ms: age, age_label: ageLabel(age), created_at: a.created_at!.toISOString(), entity_id: a.id, metadata: { category: a.category, details: a.details } });
      }
      for (const task of internalTasks) {
        const age = now.getTime() - new Date(task.created_at!).getTime();
        items.push({ id: `task-${task.id}`, type: "waiting_internal", title: task.title, severity: task.priority, age_ms: age, age_label: ageLabel(age), created_at: task.created_at!.toISOString(), action_url: `/admin/crm/clients/${task.client_id}`, entity_id: task.id, metadata: { client_name: task.client_name, client_id: task.client_id } });
      }
      for (const ticket of openTickets) {
        const age = now.getTime() - new Date(ticket.created_at!).getTime();
        items.push({ id: `ticket-${ticket.id}`, type: "support_ticket", title: `[${ticket.category}] ${ticket.subject}`, severity: ticket.priority, age_ms: age, age_label: ageLabel(age), created_at: ticket.created_at!.toISOString(), action_url: `/admin/crm/support/${ticket.id}`, entity_id: ticket.id, metadata: { status: ticket.status, category: ticket.category } });
      }
      for (const qa of qaReviews) {
        const age = now.getTime() - new Date(qa.created_at!).getTime();
        items.push({ id: `qa-${qa.id}`, type: "qa_review", title: `QA Review: ${qa.title}`, severity: qa.priority, age_ms: age, age_label: ageLabel(age), created_at: qa.created_at!.toISOString(), action_url: `/admin/crm/clients/${qa.client_id}`, entity_id: qa.id, metadata: { client_name: qa.client_name, client_id: qa.client_id } });
      }

      items.sort((a, b) => {
        const pa = PRIORITY_ORDER[a.severity] ?? 2;
        const pb = PRIORITY_ORDER[b.severity] ?? 2;
        if (pa !== pb) return pa - pb;
        return b.age_ms - a.age_ms;
      });

      res.json({
        items,
        counts: { failed_jobs: failedJobs.length, unacked_alerts: unackedAlerts.length, waiting_internal: internalTasks.length, open_tickets: openTickets.length, qa_reviews: qaReviews.length, total: items.length },
      });
    } catch (err: any) {
      log.error("Failed to load inbox", { error: err.message });
      res.status(500).json({ error: "Failed to load inbox" });
    }
  });

  app.post("/api/admin/inbox/:itemId/handle", requireAdmin, async (req: Request, res: Response) => {
    try {
      const itemId = String(req.params.itemId);
      const userId = (req.user as any)?.id;
      if (itemId.startsWith("alert-")) {
        const id = parseInt(itemId.replace("alert-", ""));
        await storage.acknowledgeSystemAlert(id, userId);
      } else if (itemId.startsWith("ticket-")) {
        const id = parseInt(itemId.replace("ticket-", ""));
        await storage.updateSupportTicket(id, { status: "in_progress" });
      }
      res.json({ ok: true });
    } catch (err: any) {
      log.error("Failed to handle inbox item", { error: err.message });
      res.status(500).json({ error: "Failed to handle item" });
    }
  });
}
