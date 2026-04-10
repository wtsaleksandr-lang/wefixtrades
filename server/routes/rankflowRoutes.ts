import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { generateMonthlyPlan } from "../services/rankflow/planGenerator";
import { generateTasksFromPlan } from "../services/rankflow/taskGenerator";
import { runQA } from "../services/rankflow/qaService";
import { createVendorBatch, addTaskToBatch, buildDispatchPacket } from "../services/rankflow/batchService";
import { getTierConfig } from "../services/rankflow/marginGuardrails";

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

  // Approve a task (QA passed → done) + auto-track page if page_create
  app.post("/api/rankflow/tasks/:id/approve", requireAdmin, async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id as string);
      const { actual_cost } = req.body;

      const task = await storage.approveRankflowTask(taskId, actual_cost);
      if (!task) return res.status(404).json({ error: "Task not found" });

      // Auto-create tracked page entry for page_create tasks
      if (task.type === "page_create") {
        const proof = (task.proof_data || {}) as { urls?: string[] };
        const pageUrl = proof.urls?.[0];
        const primaryKw = (task.metadata as any)?.primary_keyword || null;
        const pageType = (task.metadata as any)?.page_type || null;
        if (pageUrl) {
          await storage.upsertPage(task.client_id, pageUrl, {
            target_keyword: primaryKw,
            page_type: pageType,
            created_by_task_id: task.id,
            indexed: false,
          });
          console.log(`[rankflow] Auto-tracked page: ${pageUrl}`);
        }
      }

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

  /* ═══════════════════════════════════════════
     Vendor Batches
     ═══════════════════════════════════════════ */

  app.get("/api/rankflow/vendor-batches", requireAdmin, async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const vendor_type = req.query.vendor_type as string | undefined;
      const batches = await storage.listRankflowVendorBatches({ status, vendor_type });
      res.json(batches);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/rankflow/vendor-batches", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { vendor_type, task_ids } = req.body;
      if (!vendor_type || !task_ids?.length) return res.status(400).json({ error: "vendor_type and task_ids required" });
      const batch = await createVendorBatch(vendor_type, task_ids);
      res.status(201).json(batch);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/rankflow/vendor-batches/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const batchId = parseInt(req.params.id as string);
      const batch = await storage.getRankflowVendorBatch(batchId);
      if (!batch) return res.status(404).json({ error: "Batch not found" });
      const tasks = await storage.listTasksByBatch(batchId);
      res.json({ ...batch, tasks });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/rankflow/vendor-batches/:id/assign", requireAdmin, async (req: Request, res: Response) => {
    try {
      const batchId = parseInt(req.params.id as string);
      const { assigned_to } = req.body;
      if (!assigned_to) return res.status(400).json({ error: "assigned_to required" });

      // Build dispatch packet before assigning
      const packet = await buildDispatchPacket(batchId);

      const batch = await storage.updateRankflowVendorBatchStatus(batchId, "assigned", { assigned_to });
      if (!batch) return res.status(404).json({ error: "Batch not found" });

      // Mark linked tasks as assigned
      const taskIds = (batch.task_ids as number[]) || [];
      for (const taskId of taskIds) {
        await storage.assignRankflowTask(taskId, assigned_to);
      }

      console.log(`[rankflow] Batch ${batchId} assigned to ${assigned_to} — ${taskIds.length} tasks`);
      res.json({ ...batch, dispatch_packet: packet });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/rankflow/vendor-batches/:id/start", requireAdmin, async (req: Request, res: Response) => {
    try {
      const batchId = parseInt(req.params.id as string);
      const batch = await storage.updateRankflowVendorBatchStatus(batchId, "in_progress");
      if (!batch) return res.status(404).json({ error: "Batch not found" });

      const taskIds = (batch.task_ids as number[]) || [];
      for (const taskId of taskIds) {
        await storage.startRankflowTask(taskId);
      }

      res.json(batch);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/rankflow/vendor-batches/:id/submit", requireAdmin, async (req: Request, res: Response) => {
    try {
      const batchId = parseInt(req.params.id as string);
      const { proof_data } = req.body;
      if (!proof_data) return res.status(400).json({ error: "proof_data required" });

      const batch = await storage.submitRankflowVendorBatch(batchId, proof_data);
      if (!batch) return res.status(404).json({ error: "Batch not found" });

      // Propagate proof to linked tasks and mark submitted
      const taskIds = (batch.task_ids as number[]) || [];
      for (const taskId of taskIds) {
        await storage.submitRankflowTask(taskId, proof_data);
      }

      console.log(`[rankflow] Batch ${batchId} submitted with proof — ${taskIds.length} tasks`);
      res.json(batch);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/rankflow/vendor-batches/:id/qa", requireAdmin, async (req: Request, res: Response) => {
    try {
      const batchId = parseInt(req.params.id as string);
      const tasks = await storage.listTasksByBatch(batchId);

      const results: { task_id: number; passed: boolean; notes: string }[] = [];
      let allPassed = true;

      for (const task of tasks) {
        const qaResult = await runQA(task);
        for (const check of qaResult.checks) {
          await storage.createQACheck({
            task_id: task.id,
            check_type: check.check_type,
            required: true,
            passed: check.passed,
            notes: check.notes,
            issues: null,
            checked_by: "ai",
          });
        }

        const qaNotes = qaResult.checks.filter(c => !c.passed).map(c => `${c.check_type}: ${c.notes}`).join("; ");
        await storage.updateRankflowTaskQA(task.id, qaResult.overall_passed ? "passed" : "failed", qaNotes || null);

        if (!qaResult.overall_passed) allPassed = false;
        results.push({ task_id: task.id, passed: qaResult.overall_passed, notes: qaNotes });
      }

      await storage.updateRankflowVendorBatchStatus(batchId, "qa_review", {
        qa_status: allPassed ? "passed" : "failed",
        qa_notes: results.filter(r => !r.passed).map(r => `Task ${r.task_id}: ${r.notes}`).join(" | ") || null,
      });

      res.json({ batch_id: batchId, overall_passed: allPassed, results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/rankflow/vendor-batches/:id/complete", requireAdmin, async (req: Request, res: Response) => {
    try {
      const batchId = parseInt(req.params.id as string);
      const { actual_cost } = req.body;

      const batch = await storage.completeRankflowVendorBatch(batchId, actual_cost);
      if (!batch) return res.status(404).json({ error: "Batch not found" });

      // Mark all linked tasks done
      const taskIds = (batch.task_ids as number[]) || [];
      for (const taskId of taskIds) {
        await storage.approveRankflowTask(taskId);
      }

      console.log(`[rankflow] Batch ${batchId} completed — ${taskIds.length} tasks done`);
      res.json(batch);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/rankflow/vendor-batches/:id/fail", requireAdmin, async (req: Request, res: Response) => {
    try {
      const batchId = parseInt(req.params.id as string);
      const { reason } = req.body;

      const batch = await storage.updateRankflowVendorBatchStatus(batchId, "failed", {
        qa_status: "failed",
        qa_notes: reason || "Batch failed",
      });
      if (!batch) return res.status(404).json({ error: "Batch not found" });

      // Reject linked tasks back to assigned
      const taskIds = (batch.task_ids as number[]) || [];
      for (const taskId of taskIds) {
        await storage.rejectRankflowTask(taskId, reason || "Batch failed");
      }

      res.json(batch);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Add task to existing batch
  app.post("/api/rankflow/tasks/:id/add-to-batch", requireAdmin, async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.id as string);
      const { batch_id } = req.body;
      if (!batch_id) return res.status(400).json({ error: "batch_id required" });

      const batch = await addTaskToBatch(batch_id, taskId);
      res.json(batch);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vendor performance stats
  app.get("/api/rankflow/vendor-stats", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getVendorStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ═══════════════════════════════════════════
     Signals / Tracking (Admin)
     ═══════════════════════════════════════════ */

  app.get("/api/rankflow/clients/:id/signals", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.id as string);

      const summary = await storage.getSignalSummary(clientId);
      const keywords = await storage.listKeywordsByClient(clientId);
      const pages = await storage.listPagesByClient(clientId);

      // Get latest ranking for each keyword
      const keywordsWithRanking = [];
      for (const kw of keywords) {
        const lastRanking = await storage.getLastRankingForKeyword(kw.id);
        keywordsWithRanking.push({
          id: kw.id,
          keyword: kw.keyword,
          cluster: kw.cluster,
          priority: kw.priority,
          position: lastRanking?.position ?? null,
          previous_position: lastRanking?.previous_position ?? null,
          change: lastRanking?.change ?? null,
          checked_at: lastRanking?.checked_at ?? null,
        });
      }

      res.json({
        summary: summary || { total_keywords: 0, keywords_top_10: 0, keywords_top_20: 0, keywords_improved: 0, avg_position: null, pages_indexed: 0, pages_total: 0 },
        keywords: keywordsWithRanking,
        pages: pages.map(p => ({
          id: p.id,
          url: p.url,
          target_keyword: p.target_keyword,
          page_type: p.page_type,
          indexed: p.indexed,
          last_checked_at: p.last_checked_at,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ═══════════════════════════════════════════
     Profitability (Admin)
     ═══════════════════════════════════════════ */

  app.get("/api/rankflow/clients/:id/profitability", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.id as string);
      const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);

      const profile = await storage.getRankFlowProfile(clientId);
      if (!profile) return res.status(404).json({ error: "RankFlow profile not found" });

      const tierConfig = getTierConfig(profile.plan_tier || "starter");
      const price = tierConfig?.price || 0;

      // Get completed tasks for the month
      const plan = await storage.getMonthlyPlan(clientId, month);
      const tasks = plan ? await storage.listTasksByPlan(plan.id) : [];
      const completedTasks = tasks.filter(t => t.status === "done");

      // Sum actual costs by category
      let totalCost = 0;
      const breakdown: Record<string, number> = {
        citations: 0,
        pages: 0,
        onpage: 0,
        other: 0,
      };

      for (const t of completedTasks) {
        const cost = Number(t.actual_cost) || 0;
        totalCost += cost;
        if (t.type === "citation_build") breakdown.citations += cost;
        else if (t.type === "page_create") breakdown.pages += cost;
        else if (["meta_fix", "internal_linking", "schema_basic"].includes(t.type)) breakdown.onpage += cost;
        else breakdown.other += cost;
      }

      const margin = price - totalCost;
      const marginPercent = price > 0 ? Math.round((margin / price) * 100) : 0;

      res.json({
        month,
        tier: profile.plan_tier,
        price,
        cost: Math.round(totalCost * 100) / 100,
        margin: Math.round(margin * 100) / 100,
        margin_percent: marginPercent,
        tasks_completed: completedTasks.length,
        tasks_total: tasks.length,
        task_cost_breakdown: breakdown,
        cost_ceiling: tierConfig?.cost_ceiling || 0,
        soft_cost_limit: tierConfig?.soft_cost_limit || 0,
        over_ceiling: tierConfig ? totalCost > tierConfig.cost_ceiling : false,
        over_soft: tierConfig ? totalCost > tierConfig.soft_cost_limit : false,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
