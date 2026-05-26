import { storage } from "../storage";
import { generateMonthlyPlan } from "../services/rankflow/planGenerator";
import { generateTasksFromPlan } from "../services/rankflow/taskGenerator";
import { runQA } from "../services/rankflow/qaService";
import { autoBatchUnbatchedTasks } from "../services/rankflow/batchService";
import { WORKER_LIMITS, prioritizeProfiles } from "../services/rankflow/scalingConfig";
import { createDraftFromRankflowTask } from "../services/contentflow/articleService";
import { requestContent } from "../services/contentflow/api";
import { createLogger } from "../lib/logger";

const log = createLogger("RankflowWorker");

/**
 * Weekly job: generate plans and auto-process AI tasks.
 * Load-controlled: processes max N clients per run, prioritized by tier.
 */
export async function processRankFlowPlans(): Promise<{
  processed: number; skipped: number; created: number;
  ai_completed: number; batches_created: number;
}> {
  const month = new Date().toISOString().slice(0, 7);
  const allProfiles = await storage.listEnabledRankFlowProfiles();
  const sorted = prioritizeProfiles(allProfiles);
  const batch = sorted.slice(0, WORKER_LIMITS.plan_generation_max_clients);

  let processed = 0;
  let skipped = 0;
  let created = 0;
  let ai_completed = 0;
  let totalAiProcessed = 0;

  for (const profile of batch) {
    processed++;

    let plan = await storage.getMonthlyPlan(profile.client_id, month);
    if (plan) {
      skipped++;
    } else {
      try {
        const planData = generateMonthlyPlan(profile);

        plan = await storage.createMonthlyPlan({
          client_id: profile.client_id,
          month,
          plan_data: planData,
          status: "draft",
        });

        const taskDefs = generateTasksFromPlan(plan.id, planData, profile);
        for (const t of taskDefs) {
          const task = await storage.createRankFlowTask(t as any);
          if (task.type === "page_create") {
            try {
              // Wave 20: route through unified ContentFlow API. The draft
              // row is created up-front (cheap DB insert, idempotent) so
              // RankFlow's task → draft cross-link is back-filled
              // synchronously; the body generation runs async inside the
              // ContentFlow dispatcher and logs every stage transition to
              // content_pipeline_log for the admin dashboard.
              const draft = await createDraftFromRankflowTask({ task, profile });
              requestContent({
                source: "rankflow",
                type: "article",
                clientId: task.client_id,
                topic: task.title,
                metadata: {
                  draftId: draft.id,
                  rankflowTaskId: task.id,
                },
              }).catch((err) =>
                log.error(`[contentflow] requestContent failed for draft ${draft.id}:`, err?.message),
              );
            } catch (hookErr: any) {
              log.error(`[contentflow] article hook failed for task ${task.id}:`, hookErr.message);
            }
          }
        }

        await storage.updateMonthlyPlanStatus(plan.id, "active");
        created++;

        log.info(`[rankflow-worker] Created plan for client ${profile.client_id} — ${month} — ${taskDefs.length} tasks`);
      } catch (err: any) {
        log.error(`[rankflow-worker] Failed for client ${profile.client_id}:`, err.message);
        continue;
      }
    }

    // Auto-process AI tasks (respect global limit)
    if (plan && totalAiProcessed < WORKER_LIMITS.ai_tasks_max_per_run) {
      const remaining = WORKER_LIMITS.ai_tasks_max_per_run - totalAiProcessed;
      const aiDone = await autoProcessAITasks(plan.id, remaining);
      ai_completed += aiDone;
      totalAiProcessed += aiDone;
    }
  }

  if (allProfiles.length > batch.length) {
    log.info(`[rankflow-worker] Processed ${batch.length}/${allProfiles.length} clients (capped at ${WORKER_LIMITS.plan_generation_max_clients})`);
  }

  // Auto-batch unbatched outsourced tasks
  let batches_created = 0;
  try {
    batches_created = await autoBatchUnbatchedTasks();
    if (batches_created > 0) {
      log.info(`[rankflow-worker] Auto-created ${batches_created} draft vendor batch(es)`);
    }
  } catch (err: any) {
    log.error("[rankflow-worker] Auto-batch error:", err.message);
  }

  return { processed, skipped, created, ai_completed, batches_created };
}

/**
 * Auto-execute AI tasks with a cap on total processed.
 */
async function autoProcessAITasks(planId: number, maxTasks: number): Promise<number> {
  const pendingAI = await storage.listPendingAITasks(planId);
  const toProcess = pendingAI.slice(0, maxTasks);
  let completed = 0;

  for (const task of toProcess) {
    try {
      await storage.assignRankflowTask(task.id, "ai_engine");
      await storage.startRankflowTask(task.id);

      const stubProof: { urls: string[]; notes: string } = {
        urls: [],
        notes: `[AI-generated] Task "${task.title}" completed by AI engine. Content/output pending review.`,
      };
      await storage.submitRankflowTask(task.id, stubProof);

      const updatedTask = await storage.getRankFlowTaskById(task.id);
      if (!updatedTask) continue;

      const qaResult = await runQA(updatedTask);

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

      const qaNotes = qaResult.checks
        .filter((c) => !c.passed)
        .map((c) => `${c.check_type}: ${c.notes}`)
        .join("; ");

      await storage.updateRankflowTaskQA(
        task.id,
        qaResult.overall_passed ? "passed" : "failed",
        qaNotes || null,
      );

      if (qaResult.overall_passed) {
        // Quality guard: if the AI submitted with stub/empty proof (no URLs
        // present), do NOT auto-approve. updateRankflowTaskQA above already
        // moved the task to `qa_review`; leaving it there forces an admin
        // to verify real evidence before the task is marked done.
        // Tasks with genuine proof (any URL present) continue the happy
        // path and get auto-approved as before. See
        // WORKSTREAMS/launch-audit/rankflow.md.
        const proofUrls = Array.isArray(stubProof.urls) ? stubProof.urls : [];
        const hasRealProof = proofUrls.some(
          (u) => typeof u === "string" && u.trim().length > 0,
        );
        if (!hasRealProof) {
          log.info(
            `[rankflow-worker] Task ${task.id} passed QA but has empty proof — held in qa_review for admin verification`,
          );
        } else {
          await storage.approveRankflowTask(task.id, task.estimated_cost || undefined);
          completed++;
        }
      }
    } catch (err: any) {
      log.error(`[rankflow-worker] AI task ${task.id} error:`, err.message);
    }
  }

  return completed;
}
