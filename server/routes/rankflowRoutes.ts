import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { generateMonthlyPlan } from "../services/rankflow/planGenerator";
import { generateTasksFromPlan } from "../services/rankflow/taskGenerator";
import { runQA } from "../services/rankflow/qaService";
import { createVendorBatch, addTaskToBatch, buildDispatchPacket } from "../services/rankflow/batchService";
import { getTierConfig } from "../services/rankflow/marginGuardrails";
import { createDraftFromRankflowTask, generateArticleBody } from "../services/contentflow/articleService";
import { encryptToken, isEncryptionConfigured } from "../services/socialSync/tokenEncryption";
import { createLogger } from "../lib/logger";

const log = createLogger("RankflowRoutes");

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

  /**
   * PUT /api/rankflow/clients/:id/cms-config
   *
   * Stores WordPress connection details for a RankFlow client. The
   * application password is encrypted at rest via tokenEncryption
   * (AES-256-GCM, TOKEN_ENCRYPTION_KEY). The plaintext password is never
   * persisted, never returned, and never logged. Body:
   *   { cms_url, cms_username, cms_app_password,
   *     cms_default_status?: "draft"|"publish" }
   *
   * Returns: { ok: true, configured_at, cms_url, cms_username,
   *            cms_default_status } — the password is NOT echoed back.
   */
  app.put(
    "/api/rankflow/clients/:id/cms-config",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const clientId = parseInt(req.params.id as string);
        const cmsUrl = typeof req.body?.cms_url === "string" ? req.body.cms_url.trim() : "";
        const cmsUsername = typeof req.body?.cms_username === "string" ? req.body.cms_username.trim() : "";
        const cmsAppPassword = typeof req.body?.cms_app_password === "string" ? req.body.cms_app_password : "";
        const cmsDefaultStatus = req.body?.cms_default_status === "publish" ? "publish" : "draft";

        if (!cmsUrl || !/^https?:\/\//i.test(cmsUrl)) {
          return res.status(400).json({ error: "cms_url must be an http(s) URL" });
        }
        /* Sprint 8: HTTPS allowlist. We will not store or use credentials
         * destined for a non-https URL. The dev-only WP mock at
         * http://localhost:5000 is exempted under NODE_ENV !== "production"
         * so the existing test harness still works. */
        const isLocalhostDev =
          process.env.NODE_ENV !== "production" && /^http:\/\/localhost(:\d+)?\//.test(cmsUrl);
        if (!cmsUrl.startsWith("https://") && !isLocalhostDev) {
          return res.status(422).json({ error: "cms_url must use https:// — refusing to send credentials over plaintext" });
        }
        if (!cmsUsername) return res.status(400).json({ error: "cms_username required" });
        if (!cmsAppPassword) return res.status(400).json({ error: "cms_app_password required" });
        if (!isEncryptionConfigured()) {
          return res.status(500).json({ error: "TOKEN_ENCRYPTION_KEY is not configured on this server" });
        }

        const profile = await storage.getRankFlowProfile(clientId);
        if (!profile) return res.status(404).json({ error: "RankFlow profile not found — create profile first" });

        const encryptedPassword = encryptToken(cmsAppPassword);
        const configuredAt = new Date().toISOString();
        const existingCreds = (profile.credentials || {}) as Record<string, any>;

        const updated = await storage.upsertRankFlowProfile(clientId, {
          cms_type: "wordpress",
          credentials: {
            ...existingCreds,
            wordpress: {
              cms_url: cmsUrl,
              cms_username: cmsUsername,
              cms_app_password: encryptedPassword,
              cms_default_status: cmsDefaultStatus,
              configured_at: configuredAt,
            },
          },
        } as any);

        // Log only non-sensitive fields. NEVER log the application password.
        log.info(
          `[rankflow] cms-config saved: client=${clientId} cms_url=${cmsUrl} cms_username=${cmsUsername} cms_default_status=${cmsDefaultStatus}`,
        );

        res.json({
          ok: true,
          client_id: clientId,
          cms_type: updated.cms_type ?? "wordpress",
          cms_url: cmsUrl,
          cms_username: cmsUsername,
          cms_default_status: cmsDefaultStatus,
          configured_at: configuredAt,
        });
      } catch (err: any) {
        // Avoid surfacing sensitive details in error message.
        log.error(`[rankflow] cms-config error: ${err.message}`);
        res.status(500).json({ error: "Failed to save CMS config" });
      }
    },
  );

  /* ═══════════════════════════════════════════
     Plan Generation
     ═══════════════════════════════════════════ */

  app.post("/api/rankflow/clients/:id/generate-plan", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.id as string);
      // Accept month via JSON body or query string; fall back to current month.
      // Defensive against empty-body POSTs (req.body undefined when no parser fires).
      const month =
        (req.body && typeof req.body.month === "string" ? req.body.month : null) ||
        (typeof req.query.month === "string" ? req.query.month : null) ||
        new Date().toISOString().slice(0, 7);

      const profile = await storage.getRankFlowProfile(clientId);
      if (!profile) return res.status(404).json({ error: "RankFlow profile not found" });
      if (!profile.enabled) return res.status(400).json({ error: "RankFlow profile is not enabled" });

      const existing = await storage.getMonthlyPlan(clientId, month);
      if (existing) return res.status(409).json({ error: `Plan already exists for ${month}`, plan: existing });

      // Pass the requested month so rotation logic (Starter tier alternates
      // page_create / citation_build by odd/even month) honors the caller's
      // intent. Without this, rotation always used the *current* real month
      // even for plans scheduled into the future.
      const planData = generateMonthlyPlan(profile, month);

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
        if (task.type === "page_create") {
          try {
            const draft = await createDraftFromRankflowTask({ task, profile });
            generateArticleBody(draft.id).catch((err) =>
              log.error(`[contentflow] background article generation rejected for draft ${draft.id}:`, err),
            );
          } catch (hookErr: any) {
            log.error(`[contentflow] article hook failed for task ${task.id}:`, hookErr.message);
          }
        }
      }

      await storage.updateMonthlyPlanStatus(plan.id, "active");

      res.status(201).json({
        plan: { ...plan, status: "active" },
        tasksCreated: tasks.length,
      });
    } catch (err: any) {
      log.error("[rankflow] generate-plan error:", err.message);
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

      log.info(`[rankflow] Task ${taskId} assigned to ${assigned_to}`);
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

      log.info(`[rankflow] Task ${taskId} started`);
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

      log.info(`[rankflow] Task ${taskId} submitted with proof`);
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

      log.info(`[rankflow] Task ${taskId} QA: ${qaResult.overall_passed ? "PASSED" : "FAILED"}`);
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
          log.info(`[rankflow] Auto-tracked page: ${pageUrl}`);
        }
      }

      log.info(`[rankflow] Task ${taskId} approved`);
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

      log.info(`[rankflow] Task ${taskId} rejected: ${rejection_reason}`);
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

      log.info(`[rankflow] Batch ${batchId} assigned to ${assigned_to} — ${taskIds.length} tasks`);
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

      log.info(`[rankflow] Batch ${batchId} submitted with proof — ${taskIds.length} tasks`);
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

      log.info(`[rankflow] Batch ${batchId} completed — ${taskIds.length} tasks done`);
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

  /* ═══════════════════════════════════════════
     Ops Overview (Multi-Client Admin)
     ═══════════════════════════════════════════ */

  app.get("/api/rankflow/ops/overview", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const month = new Date().toISOString().slice(0, 7);
      const allProfiles = await storage.listEnabledRankFlowProfiles();
      const batches = await storage.listRankflowVendorBatches({});
      const openBatches = batches.filter(b => !["completed", "failed"].includes(b.status));

      const clients: any[] = [];
      let totalBlocked = 0;
      let totalOverSoft = 0;
      let totalRejected = 0;
      let totalNoMovement = 0;
      let totalInQA = 0;

      for (const profile of allProfiles) {
        const plan = await storage.getMonthlyPlan(profile.client_id, month);
        const tasks = plan ? await storage.listTasksByPlan(plan.id) : [];
        const signals = await storage.getSignalSummary(profile.client_id);

        const done = tasks.filter(t => t.status === "done").length;
        const rejected = tasks.filter(t => t.status === "rejected").length;
        const inQA = tasks.filter(t => ["submitted", "qa_review"].includes(t.status)).length;
        const pending = tasks.filter(t => t.status === "pending").length;
        const total = tasks.length;
        const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

        // Cost
        const totalCost = tasks.filter(t => t.status === "done").reduce((s, t) => s + (Number(t.actual_cost) || 0), 0);
        const tierConfig = getTierConfig(profile.plan_tier || "starter");
        const price = tierConfig?.price || 0;
        const marginPct = price > 0 ? Math.round(((price - totalCost) / price) * 100) : 100;
        const overSoft = tierConfig ? totalCost > tierConfig.soft_cost_limit : false;
        const overCeiling = tierConfig ? totalCost > tierConfig.cost_ceiling : false;

        // Risk status
        let risk = "healthy";
        if (!profile.website_url) risk = "blocked";
        else if (overCeiling) risk = "over_budget";
        else if (overSoft) risk = "over_budget";
        else if (rejected > 0) risk = "at_risk";
        else if (signals && signals.keywords_improved === 0 && signals.total_keywords > 0) risk = "no_movement";
        else if (inQA > 0 || pending > total * 0.5) risk = "needs_review";

        if (risk === "blocked") totalBlocked++;
        if (overSoft || overCeiling) totalOverSoft++;
        if (rejected > 0) totalRejected++;
        if (signals && signals.keywords_improved === 0 && signals.total_keywords > 0) totalNoMovement++;
        totalInQA += inQA;

        clients.push({
          client_id: profile.client_id,
          niche: profile.niche,
          location: profile.location,
          website_url: profile.website_url,
          tier: profile.plan_tier,
          risk,
          month_progress: progressPct,
          plan_status: plan?.status || "none",
          tasks: { total, done, pending, rejected, in_qa: inQA },
          cost: Math.round(totalCost),
          price,
          margin_percent: marginPct,
          over_soft: overSoft,
          over_ceiling: overCeiling,
          keywords_tracked: signals?.total_keywords || 0,
          keywords_top_10: signals?.keywords_top_10 || 0,
          keywords_improved: signals?.keywords_improved || 0,
          open_batches: openBatches.filter(b => (b.task_ids as number[]).some(id => tasks.some(t => t.id === id))).length,
        });
      }

      // Sort: at_risk/blocked first, then by tier (pro > growth > starter)
      const riskOrder: Record<string, number> = { blocked: 0, over_budget: 1, at_risk: 2, no_movement: 3, needs_review: 4, healthy: 5 };
      const tierOrder: Record<string, number> = { pro: 0, growth: 1, starter: 2 };
      clients.sort((a, b) => {
        const rd = (riskOrder[a.risk] ?? 9) - (riskOrder[b.risk] ?? 9);
        if (rd !== 0) return rd;
        return (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9);
      });

      res.json({
        summary: {
          active_clients: allProfiles.length,
          blocked: totalBlocked,
          over_budget: totalOverSoft,
          rejected_tasks: totalRejected,
          no_movement: totalNoMovement,
          in_qa: totalInQA,
          open_batches: openBatches.length,
        },
        clients,
      });
    } catch (err: any) {
      log.error("[rankflow-ops] overview error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });
}
