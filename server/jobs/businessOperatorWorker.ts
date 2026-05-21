/**
 * Business Operator AI worker — hourly cron entrypoint (Wave W-AV-1).
 *
 * Registered in server/jobs/scheduler.ts at `15 * * * *`. Thin wrapper
 * around businessOperatorAgent.runBusinessOperatorTick() so the job_logs
 * row metadata gets the structured TickResult.
 */

import { runBusinessOperatorTick } from "../services/businessOperatorAgent";
import { createLogger } from "../lib/logger";

const log = createLogger("BusinessOperatorWorker");

export async function runBusinessOperatorJob() {
  log.info("[BO-AI] Starting hourly Business Operator tick...");
  const result = await runBusinessOperatorTick();
  log.info("[BO-AI] Tick finished", { result });
  return result;
}
