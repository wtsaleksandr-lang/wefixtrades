/**
 * Magic-link approval routes — public endpoints for one-click
 * design approval from email.
 *
 * GET /api/approval/:token
 *   Verifies the HMAC token, executes the approve action, and
 *   redirects to the portal with a success/error query param.
 *
 *   "approve" action: marks the task as approved (same logic as
 *   the portal approval endpoint).
 *
 *   "revision" action: redirects to the portal service page so the
 *   client can add revision notes (revision requires text input,
 *   so we can't do it in one click).
 */

import type { Express, Request, Response } from "express";
import { verifyApprovalToken } from "../lib/approvalToken";
import { storage } from "../storage";
import { db } from "../db";
import { fulfillmentTasks, clientServices } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("ApprovalRoute");

export function registerApprovalRoutes(app: Express) {
  app.get("/api/approval/:token", async (req: Request, res: Response) => {
    const { token } = req.params;

    const payload = verifyApprovalToken(token as string);
    if (!payload) {
      log.warn("Invalid or expired approval token");
      return res.redirect("/portal/services?approval=expired");
    }

    const { taskId, clientId, action } = payload;

    try {
      // Load the task
      const [task] = await db
        .select()
        .from(fulfillmentTasks)
        .where(eq(fulfillmentTasks.id, taskId))
        .limit(1);

      if (!task) {
        log.warn(`Approval token references non-existent task #${taskId}`);
        return res.redirect("/portal/services?approval=not_found");
      }

      // Verify the task belongs to the claimed client
      if (task.client_id !== clientId) {
        log.warn(`Approval token client mismatch: token=${clientId}, task=${task.client_id}`);
        return res.redirect("/portal/services?approval=unauthorized");
      }

      if (action === "revision") {
        // Redirect to portal so the client can add revision notes
        return res.redirect(`/portal/services/${task.client_service_id}?action=revision&task=${taskId}`);
      }

      // action === "approve"
      // Only approve if the task is currently waiting on client
      if (task.waiting_on !== "client") {
        log.info(`Task #${taskId} not waiting on client (status=${task.status}, waiting_on=${task.waiting_on})`);
        return res.redirect(`/portal/services/${task.client_service_id}?approval=already_handled`);
      }

      // Execute approval — same logic as portal endpoint
      const existingMeta = (task.metadata as Record<string, any>) || {};
      await storage.updateFulfillmentTask(taskId, {
        status: "in_progress",
        waiting_on: "internal",
        last_action: "Client approved via magic link",
        last_action_at: new Date(),
        metadata: {
          ...existingMeta,
          approved_via: "magic_link",
          approved_at: new Date().toISOString(),
        },
      } as any);

      // Resolve client name for audit log
      const client = await storage.getClientById(clientId);
      const actorName = client?.contact_name || client?.business_name || "Client";

      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: null,
        actor_name: actorName,
        action: "task.approved_via_magic_link",
        entity_type: "fulfillment_task",
        entity_id: taskId,
        summary: `Client "${actorName}" approved task "${task.title}" via magic link`,
        metadata: { approval_method: "magic_link" },
      });

      log.info(`Task #${taskId} approved via magic link by client #${clientId}`);
      return res.redirect(`/portal/services/${task.client_service_id}?approval=success`);
    } catch (err: any) {
      log.error("Approval route error", { error: err.message, taskId, clientId });
      return res.redirect("/portal/services?approval=error");
    }
  });
}
