/**
 * Supplier webhook endpoint — public (no auth).
 *
 * Allows API-type suppliers to POST status updates back for tasks
 * they've been dispatched. The callback_url sent during dispatch
 * points here: POST /api/supplier/webhook/:taskId
 *
 * Validated by task existence — if the task doesn't exist, returns 404.
 */

import type { Express, Request, Response } from "express";
import { db } from "../db";
import { fulfillmentTasks } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";

const log = createLogger("SupplierWebhook");

/** Valid status values suppliers can report */
const VALID_STATUSES = ["completed", "in_progress", "failed", "submitted"] as const;
type SupplierStatus = typeof VALID_STATUSES[number];

/** Map supplier-reported status to internal fulfillment task status */
function mapSupplierStatus(status: SupplierStatus): string {
  switch (status) {
    case "completed":
    case "submitted":
      return "submitted";
    case "in_progress":
      return "in_progress";
    case "failed":
      return "blocked";
    default:
      return "submitted";
  }
}

export function registerSupplierWebhookRoutes(app: Express): void {

  /**
   * POST /api/supplier/webhook/:taskId
   *
   * Body:
   *   {
   *     "status": "completed",           // required
   *     "notes": "Work done",            // optional
   *     "deliverable_url": "https://..."  // optional
   *   }
   *
   * No authentication — validated by task existence.
   * Suppliers receive this URL in the API dispatch payload.
   */
  app.post("/api/supplier/webhook/:taskId", async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.taskId as string);
      if (isNaN(taskId)) {
        res.status(400).json({ error: "Invalid task ID" });
        return;
      }

      // Load the task
      const [task] = await db.select()
        .from(fulfillmentTasks)
        .where(eq(fulfillmentTasks.id, taskId))
        .limit(1);

      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }

      const { status, notes, deliverable_url } = req.body || {};

      if (!status || !VALID_STATUSES.includes(status)) {
        res.status(400).json({
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
        });
        return;
      }

      const internalStatus = mapSupplierStatus(status as SupplierStatus);

      // Build update payload
      const updates: Record<string, any> = {
        status: internalStatus,
        last_action: notes || `Supplier reported: ${status}`,
        last_action_at: new Date(),
        actor_type: "system",
      };

      // If supplier reports completed, set completed_at
      if (status === "completed" || status === "submitted") {
        updates.waiting_on = null;
      }

      // Handle deliverable URL — append to deliverables array
      if (deliverable_url && typeof deliverable_url === "string") {
        const existingDeliverables = (task.deliverables as any[]) || [];
        updates.deliverables = [
          ...existingDeliverables,
          {
            kind: "supplier_deliverable",
            url: deliverable_url,
            label: "Supplier deliverable",
            uploaded_by: `supplier_webhook`,
            uploaded_at: new Date().toISOString(),
          },
        ];
      }

      // Store webhook data in metadata
      const prevMeta = (task.metadata as any) || {};
      updates.metadata = {
        ...prevMeta,
        last_webhook: {
          received_at: new Date().toISOString(),
          status,
          notes: notes || null,
          deliverable_url: deliverable_url || null,
          ip: req.ip,
        },
      };

      const updated = await storage.updateFulfillmentTask(taskId, updates);

      // Log to admin activity
      await storage.logAdminActivity({
        actor_type: "system",
        actor_name: "SupplierWebhook",
        action: "fulfillment.supplier_webhook",
        entity_type: "fulfillment_task",
        entity_id: taskId,
        summary: `Supplier webhook: task #${taskId} "${task.title}" → ${internalStatus}`,
        metadata: {
          supplier_id: task.supplier_id,
          reported_status: status,
          notes: notes || null,
          deliverable_url: deliverable_url || null,
        },
      });

      log.info(`Webhook received for task #${taskId}: status=${status}`, {
        supplier_id: task.supplier_id ? String(task.supplier_id) : undefined,
      });

      res.json({
        ok: true,
        task_id: taskId,
        new_status: internalStatus,
      });
    } catch (err: any) {
      log.error(`Webhook error for task #${req.params.taskId}: ${err.message}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
