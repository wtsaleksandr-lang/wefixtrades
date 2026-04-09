import { storage } from "../storage";
import { generateMonthlyPlan } from "../services/rankflow/planGenerator";
import { generateTasksFromPlan } from "../services/rankflow/taskGenerator";

/**
 * Weekly job: for each enabled RankFlow profile, generate a monthly plan
 * and tasks if one doesn't exist for the current month.
 */
export async function processRankFlowPlans(): Promise<{ processed: number; skipped: number; created: number }> {
  const month = new Date().toISOString().slice(0, 7);
  const profiles = await storage.listEnabledRankFlowProfiles();

  let processed = 0;
  let skipped = 0;
  let created = 0;

  for (const profile of profiles) {
    processed++;

    // Skip if plan already exists for this month
    const existing = await storage.getMonthlyPlan(profile.client_id, month);
    if (existing) {
      skipped++;
      continue;
    }

    try {
      const planData = generateMonthlyPlan(profile);

      const plan = await storage.createMonthlyPlan({
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
    }
  }

  return { processed, skipped, created };
}
