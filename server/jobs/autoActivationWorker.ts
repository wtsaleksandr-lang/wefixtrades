/**
 * Auto-Activation Worker
 *
 * Runs on a 5-minute cron. Scans all client_services in "onboarding"
 * status, runs the appropriate readiness checker, and auto-activates
 * services whose conditions are fully met.
 *
 * When activating:
 *  1. Marks remaining human_review_required go-live tasks as "delivered"
 *     with actor_type "system"
 *  2. Updates the client_service status to "active"
 *  3. Triggers the completion cascade (client status promotion)
 *  4. Logs to adminActivityLog with actor_type "system"
 *
 * Returns aggregate counts that flow into job_logs.metadata for audit.
 */

import { db } from "../db";
import { storage } from "../storage";
import {
  clientServices, fulfillmentTasks,
  type ClientService,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { checkReadiness, isManualService } from "../services/readinessChecker";

const log = createLogger("AutoActivation");

interface AutoActivationResult {
  checked: number;
  activated: number;
  skipped: number;
  errors: number;
}

/**
 * Mark all human_review_required tasks for a client_service as "delivered"
 * with actor_type "system". These are the go-live gate tasks that the
 * auto-activation worker handles programmatically.
 */
async function completeGoLiveTasks(clientServiceId: number): Promise<number> {
  const tasks = await db.select()
    .from(fulfillmentTasks)
    .where(and(
      eq(fulfillmentTasks.client_service_id, clientServiceId),
      eq(fulfillmentTasks.human_review_required, true),
      sql`${fulfillmentTasks.status} NOT IN ('delivered', 'cancelled')`,
    ));

  let completed = 0;
  for (const task of tasks) {
    await storage.updateFulfillmentTask(task.id, {
      status: "delivered",
      actor_type: "system",
      completed_at: new Date(),
      last_action: "Auto-completed by auto-activation worker",
      last_action_at: new Date(),
    } as any);
    completed++;
  }

  return completed;
}

/**
 * Process a single client service for auto-activation.
 */
async function processService(cs: ClientService): Promise<"activated" | "skipped" | "error"> {
  try {
    // Skip manual services
    if (isManualService(cs.service_id)) {
      log.debug(`Skipping manual service ${cs.service_id} (cs ${cs.id})`);
      return "skipped";
    }

    const result = await checkReadiness(cs);

    // null means no checker exists for this service type
    if (!result) {
      log.debug(`No readiness checker for ${cs.service_id} (cs ${cs.id})`);
      return "skipped";
    }

    if (!result.ready) {
      log.debug(`Not ready: ${cs.service_id} (cs ${cs.id})`, {
        issues: result.issues.join("; "),
      });
      return "skipped";
    }

    // All readiness checks passed — activate the service
    log.info(`Auto-activating ${cs.service_id} (cs ${cs.id}, client ${cs.client_id})`);

    // Step 1: Complete remaining go-live tasks
    const tasksCompleted = await completeGoLiveTasks(cs.id);
    if (tasksCompleted > 0) {
      log.info(`Completed ${tasksCompleted} go-live task(s) for cs ${cs.id}`);
    }

    // Step 2: Update client_service status to "active"
    await storage.updateClientService(cs.id, {
      status: "active",
      started_at: new Date(),
    });

    // Step 3: Trigger completion cascade (may promote client status)
    const cascade = await storage.checkAndCompleteService(cs.id);
    if (cascade.clientActivated) {
      log.info(`Client ${cs.client_id} auto-promoted to active status`);
    }

    // Step 4: Log to activity log
    await storage.logAdminActivity({
      actor_type: "system",
      actor_id: null,
      actor_name: "AutoActivation Worker",
      action: "service.auto_activated",
      entity_type: "client_service",
      entity_id: cs.id,
      summary: `Auto-activated: all readiness checks passed. ${tasksCompleted} go-live task(s) completed.`,
    });

    return "activated";
  } catch (err: any) {
    log.error(`Error processing cs ${cs.id} (${cs.service_id})`, { error: err.message });
    return "error";
  }
}

/**
 * Main entry point. Called by the scheduler every 5 minutes.
 */
export async function processAutoActivation(): Promise<AutoActivationResult> {
  const result: AutoActivationResult = { checked: 0, activated: 0, skipped: 0, errors: 0 };

  // Find all client_services in "onboarding" status
  const onboardingServices = await db.select()
    .from(clientServices)
    .where(eq(clientServices.status, "onboarding"));

  log.info(`Found ${onboardingServices.length} service(s) in onboarding status`);

  for (const cs of onboardingServices) {
    result.checked++;
    const outcome = await processService(cs);

    switch (outcome) {
      case "activated":
        result.activated++;
        break;
      case "skipped":
        result.skipped++;
        break;
      case "error":
        result.errors++;
        break;
    }
  }

  log.info("Auto-activation run complete", {
    checked: result.checked,
    activated: result.activated,
    skipped: result.skipped,
    errors: result.errors,
  });

  return result;
}
