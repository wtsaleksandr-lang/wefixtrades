import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { generateMonthlyPlan } from "../services/rankflow/planGenerator";
import { generateTasksFromPlan } from "../services/rankflow/taskGenerator";
import { runQA } from "../services/rankflow/qaService";

export function registerRankFlowRoutes(app: Express): void {

  /* ═══════════════════════════════════════════
     Profile
     ═══════════════════════════════════════════ */

  app.get("/api/rankflow/clients/:id/profile", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.id as string);
      const profile = await storage.getRankFlowProfile(clientId);
      if (!profile) return res.status(404).json({ error: "RankFlow profile not found" });
      res.json(profile);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/rankflow/clients/:id/profile", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.id as string);
      const profile = await storage.upsertRankFlowProfile(clientId, req.body);
      res.json(profile);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ═══════════════════════════════════════════
     Plan Generation
     ═══════════════════════════════════════════ */

  app.post("/api/rankflow/clients/:id/generate-plan", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.id as string);
      const month = req.body.month || new Date().toISOString().slice(0, 7);

      const profile = await storage.getRankFlowProfile(clientId);
      if (!profile) return res.status(404).json({ error: "RankFlow profile not found" });
      if (!profile.enabled) return res.status(400).json({ error: "RankFlow profile is not enabled" });

      const existing = await storage.getMonthlyPlan(clientId, month);
      if (existing) return res.status(409).json({ error: `Plan already exists for ${month}`, plan: existing });

      const planData = generateMonthlyPlan(profile);

      const plan = await storage.createMonthlyPlan({
        client_id: clientId,
        month,
        plan_data: planData,
        status: "draft",
      });

      const taskDefs = generateTasksFromPlan(plan.id, planData, profile);
      const tasks = [];
      for (const t of taskDefs) {
        const task = await storage.createRankFlowTask(t as any);
        tasks.push(task);
      }

      await storage.updateMonthlyPlanStatus(plan.id, "active");

      res.status(201).json({
        plan: { ...plan, status: "active" },
        tasksCreated: tasks.length,
      });
    } catch (err: any) {
      console.error("[rankflow] generate-plan error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /* ═══════════════════════════════════════════
     Tasks — List
     ═══════════════════════════════════════════ */

  app.get("/api/rankflow/clients/:id/tasks", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.id as string);
      const tasks = await storage.listTasksByClient(clientId);
      res.json(tasks);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ═══════════════════════════════════════════
     Task Lifecycle
     ═══════════════════════════════════════════ */

  // Assign a task to someone
  app.post("/api/rankflow/tasks/:id/assign", requireAdmin, async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id as string);
      const { assigned_to } = req.body;
      if (!assigned_to) return res.status(400).json({ error: "assigned_to required" });

      const task = await storage.assignRankflowTask(taskId, assigned_to);
      if (!task) return res.status(404).json({ error: "Task not found" });

      console.log(`[rankflow] Task ${taskId} assigned to ${assigned_to}`);
      res.json(task);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Start working on a task
  app.post("/api/rankflow/tasks/:id/start", requireAdmin, async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id as string);
      const task = await storage.startRankflowTask(taskId);
      if (!task) return res.status(404).json({ error: "Task not found" });

      console.log(`[rankflow] Task ${taskId} started`);
      res.json(task);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Submit completed work with proof
  app.post("/api/rankflow/tasks/:id/submit", requireAdmin, async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id as string);
      const { proof_data } = req.body;
      if (!proof_data) return res.status(400).json({ error: "proof_data required" });

      const task = await storage.submitRankflowTask(taskId, proof_data);
      if (!task) return res.status(404).json({ error: "Task not found" });

      console.log(`[rankflow] Task ${taskId} submitted with proof`);
      res.json(task);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Run QA on a submitted task
  app.post("/api/rankflow/tasks/:id/qa", requireAdmin, async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id as string);
      const task = await storage.getRankFlowTaskById(taskId);
      if (!task) return res.status(404).json({ error: "Task not found" });

      // Run automated QA
      const qaResult = await runQA(task);

      // Store individual check results
      for (const check of qaResult.checks) {
        await storage.createQACheck({
          task_id: taskId,
          check_type: check.check_type,
          required: true,
          passed: check.passed,
          notes: check.notes,
          issues: null,
          checked_by: "ai",
        });
      }

      // Update task QA status
      const qaNotes = qaResult.checks
        .filter((c) => !c.passed)
        .map((c) => `${c.check_type}: ${c.notes}`)
        .join("; ");

      await storage.updateRankflowTaskQA(
        taskId,
        qaResult.overall_passed ? "passed" : "failed",
        qaNotes || null,
      );

      console.log(`[rankflow] Task ${taskId} QA: ${qaResult.overall_passed ? "PASSED" : "FAILED"}`);
      res.json({ task_id: taskId, ...qaResult });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Approve a task (QA passed → done)
  app.post("/api/rankflow/tasks/:id/approve", requireAdmin, async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id as string);
      const { actual_cost } = req.body;

      const task = await storage.approveRankflowTask(taskId, actual_cost);
      if (!task) return res.status(404).json({ error: "Task not found" });

      console.log(`[rankflow] Task ${taskId} approved`);
      res.json(task);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Reject a task (back to assigned for rework)
  app.post("/api/rankflow/tasks/:id/reject", requireAdmin, async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id as string);
      const { rejection_reason } = req.body;
      if (!rejection_reason) return res.status(400).json({ error: "rejection_reason required" });

      const task = await storage.rejectRankflowTask(taskId, rejection_reason);
      if (!task) return res.status(404).json({ error: "Task not found" });

      console.log(`[rankflow] Task ${taskId} rejected: ${rejection_reason}`);
      res.json(task);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ═══════════════════════════════════════════
     Progress
     ═══════════════════════════════════════════ */

  app.get("/api/rankflow/clients/:id/progress", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.id as string);
      const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
      const progress = await storage.getMonthlyProgress(clientId, month);
      if (!progress) return res.status(404).json({ error: `No progress for ${month}` });
      res.json(progress);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
