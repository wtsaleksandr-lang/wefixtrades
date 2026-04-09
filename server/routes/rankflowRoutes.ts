import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { generateMonthlyPlan } from "../services/rankflow/planGenerator";
import { generateTasksFromPlan } from "../services/rankflow/taskGenerator";

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

      // Check profile exists and is enabled
      const profile = await storage.getRankFlowProfile(clientId);
      if (!profile) return res.status(404).json({ error: "RankFlow profile not found" });
      if (!profile.enabled) return res.status(400).json({ error: "RankFlow profile is not enabled" });

      // Check for existing plan this month
      const existing = await storage.getMonthlyPlan(clientId, month);
      if (existing) return res.status(409).json({ error: `Plan already exists for ${month}`, plan: existing });

      // Generate plan
      const planData = generateMonthlyPlan(profile);

      // Save plan
      const plan = await storage.createMonthlyPlan({
        client_id: clientId,
        month,
        plan_data: planData,
        status: "draft",
      });

      // Generate tasks from plan
      const taskDefs = generateTasksFromPlan(plan.id, planData, profile);
      const tasks = [];
      for (const t of taskDefs) {
        const task = await storage.createRankFlowTask(t as any);
        tasks.push(task);
      }

      // Activate plan
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
     Tasks
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

  app.patch("/api/rankflow/tasks/:taskId/status", requireAdmin, async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.taskId as string);
      const { status } = req.body;
      if (!status) return res.status(400).json({ error: "status required" });

      const task = await storage.updateRankFlowTaskStatus(taskId, status);
      if (!task) return res.status(404).json({ error: "Task not found" });
      res.json(task);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ═══════════════════════════════════════════
     QA
     ═══════════════════════════════════════════ */

  app.post("/api/rankflow/tasks/:taskId/qa", requireAdmin, async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.taskId as string);
      const { passed, issues, checked_by } = req.body;
      if (typeof passed !== "boolean") return res.status(400).json({ error: "passed (boolean) required" });

      const qa = await storage.createQACheck({
        task_id: taskId,
        passed,
        issues: issues || null,
        checked_by: checked_by || "admin",
      });

      // If QA passed, move task to done
      if (passed) {
        await storage.updateRankFlowTaskStatus(taskId, "done");
      } else {
        await storage.updateRankFlowTaskStatus(taskId, "pending");
      }

      res.status(201).json(qa);
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
