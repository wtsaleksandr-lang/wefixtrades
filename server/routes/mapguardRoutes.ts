/**
 * MapGuard Task Engine — Admin API Routes
 *
 * Internal/admin-safe routes for managing MapGuard delivery tasks.
 * All routes require admin authentication.
 */

import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import {
  createMapguardTask,
  updateMapguardTaskStatus,
  updateMapguardTaskResult,
  updateMapguardTask,
  listMapguardTasks,
  getMapguardTaskById,
  getTaskActivity,
  getMapguardTaskSummary,
  createTasksFromAudit,
  assignMapguardTask,
  submitMapguardResult,
  rejectMapguardResult,
} from "../services/mapguardTaskEngine";
import {
  MAPGUARD_TASK_TYPES,
  MAPGUARD_TASK_STATUSES,
  MAPGUARD_STATUS_TRANSITIONS,
  type MapguardTaskStatus,
} from "@shared/mapguardTypes";
import {
  getLatestSnapshot,
  getSnapshotHistory,
  getMonitoringSummary,
  runMapguardScan,
  getActiveMapguardClients,
  runMapguardBatchScan,
  getMapguardPortfolioDashboard,
} from "../services/mapguardMonitor";
import { getRecentAlerts, dismissAlert } from "../services/mapguardAlerts";

export function registerMapguardRoutes(app: Express) {

  /* ─── List tasks for a client ─── */
  app.get("/api/mapguard/clients/:clientId/tasks", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const { status, task_type, limit, offset } = req.query;
      const tasks = await listMapguardTasks({
        clientId,
        status: status as string | undefined,
        taskType: task_type as string | undefined,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      });

      res.json(tasks);
    } catch (err: any) {
      console.error("[mapguard] list tasks error:", err);
      res.status(500).json({ error: "Failed to list tasks" });
    }
  });

  /* ─── Get task summary for a client ─── */
  app.get("/api/mapguard/clients/:clientId/task-summary", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const summary = await getMapguardTaskSummary(clientId);
      res.json(summary);
    } catch (err: any) {
      console.error("[mapguard] task summary error:", err);
      res.status(500).json({ error: "Failed to get task summary" });
    }
  });

  /* ─── Create task manually ─── */
  app.post("/api/mapguard/clients/:clientId/tasks", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const { task_type, title, description, priority, source_type, next_step_hint,
              client_service_id, scheduled_for, due_at, input_data, expected_output,
              supplier_type, assigned_to } = req.body;

      if (!task_type || !title) {
        return res.status(400).json({ error: "task_type and title are required" });
      }

      // Validate task type
      if (!(task_type in MAPGUARD_TASK_TYPES)) {
        return res.status(400).json({ error: `Invalid task_type: ${task_type}`, valid: Object.keys(MAPGUARD_TASK_TYPES) });
      }

      const actor = {
        type: "human",
        name: (req.user as any)?.name || (req.user as any)?.email || "admin",
      };

      const task = await createMapguardTask({
        client_id: clientId,
        client_service_id: client_service_id || null,
        task_type,
        title,
        description: description || MAPGUARD_TASK_TYPES[task_type as keyof typeof MAPGUARD_TASK_TYPES].description,
        source_type: source_type || "manual",
        created_by_system: false,
        status: "pending",
        priority: priority || MAPGUARD_TASK_TYPES[task_type as keyof typeof MAPGUARD_TASK_TYPES].default_priority,
        next_step_hint: next_step_hint || null,
        scheduled_for: scheduled_for ? new Date(scheduled_for) : null,
        due_at: due_at ? new Date(due_at) : null,
        input_data: input_data || null,
        expected_output: expected_output || null,
        supplier_type: supplier_type || null,
        assigned_to: assigned_to || null,
      }, actor);

      res.status(201).json(task);
    } catch (err: any) {
      console.error("[mapguard] create task error:", err);
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  /* ─── Create tasks from audit report ─── */
  app.post("/api/mapguard/clients/:clientId/tasks/from-audit/:auditId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const auditId = req.params.auditId as string;
      if (!auditId) return res.status(400).json({ error: "Audit report ID required" });

      const { client_service_id } = req.body;

      const tasks = await createTasksFromAudit(clientId, auditId, {
        clientServiceId: client_service_id,
      });

      res.status(201).json({
        created: tasks.length,
        tasks,
      });
    } catch (err: any) {
      console.error("[mapguard] create from audit error:", err);
      if (err.message?.includes("not found")) {
        return res.status(404).json({ error: err.message });
      }
      res.status(500).json({ error: "Failed to create tasks from audit" });
    }
  });

  /* ─── Update task status ─── */
  app.patch("/api/mapguard/tasks/:taskId/status", requireAdmin, async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.taskId as string);
      if (isNaN(taskId)) return res.status(400).json({ error: "Invalid task ID" });

      const { status, next_step_hint, waiting_on, summary } = req.body;
      if (!status) return res.status(400).json({ error: "status is required" });

      if (!(status in MAPGUARD_TASK_STATUSES)) {
        return res.status(400).json({ error: `Invalid status: ${status}`, valid: Object.keys(MAPGUARD_TASK_STATUSES) });
      }

      const actor = {
        type: "human",
        name: (req.user as any)?.name || (req.user as any)?.email || "admin",
      };

      const task = await updateMapguardTaskStatus(taskId, status as MapguardTaskStatus, {
        next_step_hint,
        waiting_on,
        actor,
        summary,
      });

      if (!task) return res.status(404).json({ error: "Task not found" });

      res.json(task);
    } catch (err: any) {
      if (err.message?.includes("Invalid status transition")) {
        return res.status(400).json({ error: err.message });
      }
      console.error("[mapguard] update status error:", err);
      res.status(500).json({ error: "Failed to update task status" });
    }
  });

  /* ─── Attach result data ─── */
  app.patch("/api/mapguard/tasks/:taskId/result", requireAdmin, async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.taskId as string);
      if (isNaN(taskId)) return res.status(400).json({ error: "Invalid task ID" });

      const { result_data } = req.body;
      if (!result_data || typeof result_data !== "object") {
        return res.status(400).json({ error: "result_data object is required" });
      }

      const actor = {
        type: "human",
        name: (req.user as any)?.name || (req.user as any)?.email || "admin",
      };

      const task = await updateMapguardTaskResult(taskId, result_data, actor);
      if (!task) return res.status(404).json({ error: "Task not found" });

      res.json(task);
    } catch (err: any) {
      console.error("[mapguard] update result error:", err);
      res.status(500).json({ error: "Failed to update task result" });
    }
  });

  /* ─── Update task fields (general patch) ─── */
  app.patch("/api/mapguard/tasks/:taskId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.taskId as string);
      if (isNaN(taskId)) return res.status(400).json({ error: "Invalid task ID" });

      // Whitelist of updatable fields (status changes go through /status endpoint)
      const allowed = [
        "title", "description", "priority", "sort_order", "next_step_hint",
        "scheduled_for", "due_at", "supplier_type", "supplier_ref", "assigned_to",
        "cost_cents", "escalation_flag", "expected_output", "validation_rules", "metadata",
      ];

      const updates: Record<string, any> = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          updates[key] = req.body[key];
        }
      }

      // Convert date strings
      if (updates.scheduled_for) updates.scheduled_for = new Date(updates.scheduled_for);
      if (updates.due_at) updates.due_at = new Date(updates.due_at);

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      const task = await updateMapguardTask(taskId, updates);
      if (!task) return res.status(404).json({ error: "Task not found" });

      res.json(task);
    } catch (err: any) {
      console.error("[mapguard] update task error:", err);
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  /* ─── Get single task with activity ─── */
  app.get("/api/mapguard/tasks/:taskId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.taskId as string);
      if (isNaN(taskId)) return res.status(400).json({ error: "Invalid task ID" });

      const task = await getMapguardTaskById(taskId);
      if (!task) return res.status(404).json({ error: "Task not found" });

      const activity = await getTaskActivity(taskId);

      res.json({ task, activity });
    } catch (err: any) {
      console.error("[mapguard] get task error:", err);
      res.status(500).json({ error: "Failed to get task" });
    }
  });

  /* ─── Assign task to supplier ─── */
  app.post("/api/mapguard/tasks/:taskId/assign", requireAdmin, async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.taskId as string);
      if (isNaN(taskId)) return res.status(400).json({ error: "Invalid task ID" });

      const { supplier_type, assigned_to, supplier_ref, cost_cents, handoff_notes, next_step_hint } = req.body;

      if (!supplier_type || !assigned_to) {
        return res.status(400).json({ error: "supplier_type and assigned_to are required" });
      }

      const validTypes = ["fiverr", "agency", "internal"];
      if (!validTypes.includes(supplier_type)) {
        return res.status(400).json({ error: `Invalid supplier_type. Valid: ${validTypes.join(", ")}` });
      }

      const actor = {
        type: "human",
        name: (req.user as any)?.name || (req.user as any)?.email || "admin",
      };

      const task = await assignMapguardTask(taskId, {
        supplier_type,
        assigned_to,
        supplier_ref,
        cost_cents,
        handoff_notes,
        next_step_hint,
      }, actor);

      if (!task) return res.status(404).json({ error: "Task not found" });

      res.json(task);
    } catch (err: any) {
      if (err.message?.includes("Cannot assign")) {
        return res.status(400).json({ error: err.message });
      }
      console.error("[mapguard] assign error:", err);
      res.status(500).json({ error: "Failed to assign task" });
    }
  });

  /* ─── Submit result (structured intake) ─── */
  app.post("/api/mapguard/tasks/:taskId/submit-result", requireAdmin, async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.taskId as string);
      if (isNaN(taskId)) return res.status(400).json({ error: "Invalid task ID" });

      const { summary, deliverable_type, deliverable_url, deliverable_text, notes } = req.body;

      if (!summary) {
        return res.status(400).json({ error: "summary is required" });
      }

      const actor = {
        type: "human",
        name: (req.user as any)?.name || (req.user as any)?.email || "admin",
      };

      const task = await submitMapguardResult(taskId, {
        summary,
        deliverable_type,
        deliverable_url,
        deliverable_text,
        notes,
      }, actor);

      if (!task) return res.status(404).json({ error: "Task not found" });

      res.json(task);
    } catch (err: any) {
      console.error("[mapguard] submit result error:", err);
      res.status(500).json({ error: "Failed to submit result" });
    }
  });

  /* ─── Reject result / request follow-up ─── */
  app.post("/api/mapguard/tasks/:taskId/reject", requireAdmin, async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.taskId as string);
      if (isNaN(taskId)) return res.status(400).json({ error: "Invalid task ID" });

      const { reason, send_back_to_supplier } = req.body;

      if (!reason) {
        return res.status(400).json({ error: "reason is required" });
      }

      const actor = {
        type: "human",
        name: (req.user as any)?.name || (req.user as any)?.email || "admin",
      };

      const task = await rejectMapguardResult(taskId, {
        reason,
        send_back_to_supplier: send_back_to_supplier !== false, // default true
      }, actor);

      if (!task) return res.status(404).json({ error: "Task not found" });

      res.json(task);
    } catch (err: any) {
      if (err.message?.includes("Can only reject")) {
        return res.status(400).json({ error: err.message });
      }
      console.error("[mapguard] reject error:", err);
      res.status(500).json({ error: "Failed to reject result" });
    }
  });

  /* ═══ PORTFOLIO DASHBOARD ═══ */

  /* ─── Get portfolio-level MapGuard ops dashboard ─── */
  app.get("/api/mapguard/dashboard", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const dashboard = await getMapguardPortfolioDashboard();
      res.json(dashboard);
    } catch (err: any) {
      console.error("[mapguard] dashboard error:", err);
      res.status(500).json({ error: "Failed to load dashboard" });
    }
  });

  /* ═══ ALERT ENDPOINTS ═══ */

  /* ─── Get recent alerts ─── */
  app.get("/api/mapguard/alerts", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { client_id, severity, limit } = req.query;
      const alerts = await getRecentAlerts({
        clientId: client_id ? parseInt(client_id as string) : undefined,
        severity: severity as string | undefined,
        limit: limit ? parseInt(limit as string) : 20,
      });
      res.json(alerts);
    } catch (err: any) {
      console.error("[mapguard] alerts error:", err);
      res.status(500).json({ error: "Failed to load alerts" });
    }
  });

  /* ─── Dismiss alert ─── */
  app.post("/api/mapguard/alerts/:alertId/dismiss", requireAdmin, async (req: Request, res: Response) => {
    try {
      const alertId = parseInt(req.params.alertId as string);
      if (isNaN(alertId)) return res.status(400).json({ error: "Invalid alert ID" });
      await dismissAlert(alertId);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[mapguard] dismiss alert error:", err);
      res.status(500).json({ error: "Failed to dismiss alert" });
    }
  });

  /* ═══ MONITORING ENDPOINTS ═══ */

  /* ─── Get monitoring summary for a client ─── */
  app.get("/api/mapguard/clients/:clientId/monitoring", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const summary = await getMonitoringSummary(clientId);
      res.json(summary);
    } catch (err: any) {
      console.error("[mapguard] monitoring summary error:", err);
      res.status(500).json({ error: "Failed to get monitoring summary" });
    }
  });

  /* ─── Get snapshot history for a client ─── */
  app.get("/api/mapguard/clients/:clientId/snapshots", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 12;
      const snapshots = await getSnapshotHistory(clientId, limit);
      res.json(snapshots);
    } catch (err: any) {
      console.error("[mapguard] snapshot history error:", err);
      res.status(500).json({ error: "Failed to get snapshot history" });
    }
  });

  /* ─── Trigger manual scan for a single client ─── */
  app.post("/api/mapguard/clients/:clientId/scan", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      // Find client in active mapguard clients
      const activeClients = await getActiveMapguardClients();
      const client = activeClients.find(c => c.client_id === clientId);

      if (!client) {
        return res.status(404).json({ error: "Client not found or does not have an active MapGuard service" });
      }

      const result = await runMapguardScan(client);
      res.json({
        snapshot_id: result.snapshot.id,
        score: result.snapshot.score_total,
        grade: result.snapshot.score_grade,
        changes: result.changes,
        tasks_created: result.tasksCreated,
      });
    } catch (err: any) {
      console.error("[mapguard] manual scan error:", err);
      res.status(500).json({ error: "Failed to run scan" });
    }
  });

  /* ─── Trigger batch scan (all clients) ─── */
  app.post("/api/mapguard/scan/batch", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await runMapguardBatchScan();
      res.json(result);
    } catch (err: any) {
      console.error("[mapguard] batch scan error:", err);
      res.status(500).json({ error: "Failed to run batch scan" });
    }
  });

  /* ─── Reference data: task types, statuses, transitions ─── */
  app.get("/api/mapguard/reference", requireAdmin, async (_req: Request, res: Response) => {
    res.json({
      task_types: MAPGUARD_TASK_TYPES,
      statuses: MAPGUARD_TASK_STATUSES,
      transitions: MAPGUARD_STATUS_TRANSITIONS,
    });
  });
}
