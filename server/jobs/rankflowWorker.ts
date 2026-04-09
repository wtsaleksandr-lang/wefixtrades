import { storage } from "../storage";
import { generateMonthlyPlan } from "../services/rankflow/planGenerator";
import { generateTasksFromPlan } from "../services/rankflow/taskGenerator";
import { runQA } from "../services/rankflow/qaService";

/**
 * Weekly job: for each enabled RankFlow profile, generate a monthly plan
 * and tasks if one doesn't exist for the current month.
 * Then auto-process AI tasks through the full lifecycle.
 */
export async function processRankFlowPlans(): Promise<{ processed: number; skipped: number; created: number; ai_completed: number }> {
  const month = new Date().toISOString().slice(0, 7);
  const profiles = await storage.listEnabledRankFlowProfiles();

  let processed = 0;
  let skipped = 0;
  let created = 0;
  let ai_completed = 0;

  for (const profile of profiles) {
    processed++;

    // Skip if plan already exists for this month
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
          await storage.createRankFlowTask(t as any);
        }

        await storage.updateMonthlyPlanStatus(plan.id, "active");
        created++;

        console.log(`[rankflow-worker] Created plan for client ${profile.client_id} — ${month} — ${taskDefs.length} tasks`);
      } catch (err: any) {
        console.error(`[rankflow-worker] Failed for client ${profile.client_id}:`, err.message);
        continue;
      }
    }

    // Auto-process AI tasks for this plan
    if (plan) {
      const aiDone = await autoProcessAITasks(plan.id);
      ai_completed += aiDone;
    }
  }

  return { processed, skipped, created, ai_completed };
}

/**
 * Auto-execute AI tasks: assign → start → submit (with stub proof) → QA → approve if passed.
 * Only processes tasks with execution_mode === "ai" and status === "pending".
 */
async function autoProcessAITasks(planId: number): Promise<number> {
  const pendingAI = await storage.listPendingAITasks(planId);
  let completed = 0;

  for (const task of pendingAI) {
    try {
      // 1. Assign to AI
      await storage.assignRankflowTask(task.id, "ai_engine");

      // 2. Start
      await storage.startRankflowTask(task.id);

      // 3. Submit with stub proof (real AI generation will be added in Phase 2C)
      const stubProof = {
        urls: [],
        notes: `[AI-generated] Task "${task.title}" completed by AI engine. Content/output pending review.`,
      };
      await storage.submitRankflowTask(task.id, stubProof);

      // 4. Run QA
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

      // 5. Auto-approve if QA passed
      if (qaResult.overall_passed) {
        await storage.approveRankflowTask(task.id, task.estimated_cost || undefined);
        completed++;
        console.log(`[rankflow-worker] AI task ${task.id} auto-completed: "${task.title}"`);
      } else {
        console.log(`[rankflow-worker] AI task ${task.id} QA failed: ${qaNotes}`);
      }
    } catch (err: any) {
      console.error(`[rankflow-worker] AI task ${task.id} error:`, err.message);
    }
  }

  return completed;
}
