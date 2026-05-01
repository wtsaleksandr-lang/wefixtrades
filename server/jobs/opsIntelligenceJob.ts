/**
 * Ops Intelligence Job — daily background worker.
 *
 * Flow:
 *   1. Run all detectors → OpsSignal[] (deterministic, no AI)
 *   2. Pass signals to opsEngine → AI summarizes → stored in opsSnapshots
 *
 * This job is registered in scheduler.ts and runs daily at 07:00 UTC.
 * It follows the same pattern as weeklyReport.ts and aggregation.ts.
 */

import { runAllDetectors } from "../services/opsDetectors";
import { generateDailyOpsSummary } from "../services/opsEngine";
import { createLogger } from "../lib/logger";

const log = createLogger("OpsJob");

export interface OpsIntelligenceResult {
  signalCount: number;
  snapshotId: number | null;
  aiError?: string;
}

export async function runDailyOpsIntelligence(): Promise<OpsIntelligenceResult> {
  log.info("[opsJob] Starting daily ops intelligence run...");

  // Step 1: Run all detectors — pure SQL, no AI
  const signals = await runAllDetectors();
  log.info(`[opsJob] Detectors complete — ${signals.length} signals detected`);

  // Step 2: AI summarization — engine consumes signals only, no DB access
  const { snapshot, error } = await generateDailyOpsSummary(signals);

  if (error) {
    log.warn(`[opsJob] AI summarization failed: ${error}`);
  }

  const result: OpsIntelligenceResult = {
    signalCount: signals.length,
    snapshotId: snapshot?.id ?? null,
    ...(error ? { aiError: error } : {}),
  };

  log.info(`[opsJob] Daily ops run complete:`, { detail: result });
  return result;
}
