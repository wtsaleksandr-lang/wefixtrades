import { storage } from "../storage";
import { generateMonthlyPlan } from "../services/rankflow/planGenerator";
import { generateTasksFromPlan } from "../services/rankflow/taskGenerator";
import { runQA } from "../services/rankflow/qaService";
import { autoBatchUnbatchedTasks } from "../services/rankflow/batchService";
import { WORKER_LIMITS, prioritizeProfiles } from "../services/rankflow/scalingConfig";
import { createDraftFromRankflowTask } from "../services/contentflow/articleService";
import { requestContent } from "../services/contentflow/api";
import {
  executeTask,
  isExecutableTaskType,
  type ExecutorContext,
} from "../services/rankflow/taskExecutors";
import { createLogger } from "../lib/logger";
import type { RankflowProfile } from "@shared/schema";

const log = createLogger("RankflowWorker");

/**
 * Weekly job: generate plans and auto-process AI tasks.
 * Load-controlled: processes max N clients per run, prioritized by tier.
 */
export async function processRankFlowPlans(): Promise<{
  processed: number; skipped: number; created: number;
  ai_completed: number; batches_created: number;
  /** Tasks whose real output is ready but is not yet live on the customer's
   *  site (needs CMS access). Deliberately separate from ai_completed. */
  ai_awaiting_implementation: number;
  /** Tasks automation could not do, converted to real manual_admin tasks. */
  ai_handed_to_human: number;
}> {
  const month = new Date().toISOString().slice(0, 7);
  const allProfiles = await storage.listEnabledRankFlowProfiles();
  const sorted = prioritizeProfiles(allProfiles);
  const batch = sorted.slice(0, WORKER_LIMITS.plan_generation_max_clients);

  let processed = 0;
  let skipped = 0;
  let created = 0;
  let ai_completed = 0;
  let ai_awaiting_implementation = 0;
  let ai_handed_to_human = 0;
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
      const result = await autoProcessAITasks(plan.id, remaining, profile);
      ai_completed += result.completed;
      ai_awaiting_implementation += result.awaiting_implementation;
      ai_handed_to_human += result.handed_to_human;
      // Every task the executor touched consumed budget, whatever its outcome.
      totalAiProcessed +=
        result.completed + result.awaiting_implementation + result.handed_to_human;
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

  return {
    processed,
    skipped,
    created,
    ai_completed,
    batches_created,
    ai_awaiting_implementation,
    ai_handed_to_human,
  };
}

/**
 * Auto-execute AI tasks with a cap on total processed.
 *
 * ─── What changed and why ────────────────────────────────────────────
 *
 * This function used to "complete" every AI task by writing a single canned
 * sentence — `[AI-generated] Task "X" completed by AI engine.` — with no URL,
 * no output and no work performed. On Starter that stub covered 12 of the 13
 * monthly tasks a $349/mo customer was billed for, while the product page
 * promised "Each month we optimize pages, build listings, and improve your
 * local SEO".
 *
 * Now each task is routed to a real executor (server/services/rankflow/
 * taskExecutors.ts) which does verifiable work against the client's actual
 * website. The outcome decides the task's fate, and the three outcomes are
 * kept strictly distinct so nothing is ever reported as done that wasn't:
 *
 *   deliverable_ready    → the artifact IS the deliverable (content briefs).
 *                          QA runs on the real output; auto-approve on pass.
 *   needs_implementation → real output produced, but it still has to be
 *                          applied to the customer's site by someone with CMS
 *                          access. Parked in `qa_review`. NOT counted as
 *                          completed, because from the customer's point of
 *                          view the change is not live.
 *   needs_human          → we could not do the work. The task becomes a real
 *                          manual_admin fulfillment task carrying the concrete
 *                          blocker. No proof is written and nothing is
 *                          reported as completed.
 *
 * `page_create` is deliberately NOT executed here. Its real work happens in
 * ContentFlow (see processRankFlowPlans above, which creates the draft and
 * dispatches generation); the old code additionally stamped the canned proof
 * onto it, which overwrote a genuine pipeline with a fake completion.
 */
async function autoProcessAITasks(
  planId: number,
  maxTasks: number,
  profile: RankflowProfile,
): Promise<{ completed: number; awaiting_implementation: number; handed_to_human: number }> {
  const pendingAI = await storage.listPendingAITasks(planId);
  // page_create is owned by the ContentFlow pipeline — never stub it here.
  const executable = pendingAI.filter((t) => isExecutableTaskType(t.type));
  const toProcess = executable.slice(0, maxTasks);

  let completed = 0;
  let awaiting_implementation = 0;
  let handed_to_human = 0;

  if (toProcess.length === 0) {
    return { completed, awaiting_implementation, handed_to_human };
  }

  // Business facts come from the client record, never from a model — a
  // hallucinated phone number in JSON-LD on a customer's live site would be
  // actively harmful.
  const client = await storage.getClientById(profile.client_id);
  const ctx: ExecutorContext = {
    profile,
    businessName: client?.business_name || "",
    phone: client?.contact_phone ?? null,
    websiteUrl: profile.website_url || client?.website_url || null,
    tradeType: client?.trade_type ?? null,
  };

  for (const task of toProcess) {
    try {
      await storage.assignRankflowTask(task.id, "ai_engine");
      await storage.startRankflowTask(task.id);

      const outcome = await executeTask(task, ctx);

      // No executor for this type — hand it over rather than inventing proof.
      if (!outcome) {
        await storage.handOffRankflowTaskToHuman(
          task.id,
          `No automated executor exists for task type "${task.type}".`,
          "no_executor",
        );
        handed_to_human++;
        continue;
      }

      if (outcome.disposition === "needs_human") {
        await storage.handOffRankflowTaskToHuman(
          task.id,
          outcome.summary,
          outcome.blocker || "unknown",
        );
        handed_to_human++;
        log.info(
          `[rankflow-worker] Task ${task.id} (${task.type}) could not be automated — handed to admin: ${outcome.blocker}`,
        );
        continue;
      }

      // Real work happened. Persist the structured artifact alongside the
      // human-readable proof, then run QA against the ACTUAL output.
      await storage.saveRankflowTaskArtifact(task.id, outcome.artifact);
      await storage.submitRankflowTask(task.id, outcome.proof);

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

      if (!qaResult.overall_passed) {
        log.info(`[rankflow-worker] Task ${task.id} (${task.type}) failed QA — held in qa_review`);
        continue;
      }

      if (outcome.disposition === "deliverable_ready") {
        // The deliverable is complete on delivery — nothing has to happen on
        // the customer's site — so this genuinely counts as done.
        await storage.approveRankflowTask(task.id, task.estimated_cost || undefined);
        completed++;
        log.info(`[rankflow-worker] Task ${task.id} (${task.type}) delivered: ${outcome.summary}`);
      } else {
        // needs_implementation: real output, but not live on the customer's
        // site. updateRankflowTaskQA already parked it in `qa_review`; leaving
        // it there is the honest state. Explicitly NOT counted as completed.
        awaiting_implementation++;
        log.info(
          `[rankflow-worker] Task ${task.id} (${task.type}) produced output awaiting implementation: ${outcome.summary}`,
        );
      }
    } catch (err: any) {
      log.error(`[rankflow-worker] AI task ${task.id} error:`, err.message);
    }
  }

  return { completed, awaiting_implementation, handed_to_human };
}
