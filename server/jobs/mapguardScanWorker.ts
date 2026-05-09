/**
 * MapGuard Weekly Scan Worker
 *
 * Runs the recurring monitoring scan for all active MapGuard clients.
 * Called by the scheduler on a weekly cadence.
 */

import { isMapguardBatchScanRunning, runMapguardBatchScan } from "../services/mapguardMonitor";
import { createLogger } from "../lib/logger";

const log = createLogger("MapguardScan");

export async function processMapguardScans(): Promise<{
  scanned: number;
  errors: number;
  tasksCreated: number;
  skipped?: boolean;
}> {
  // If an admin started a manual batch and it's still running, skip
  // the cron tick rather than throwing — the manual run already
  // covers the entire active client set.
  if (isMapguardBatchScanRunning()) {
    log.warn("[mapguard-scan] Skipping cron tick — batch scan already in progress (admin-triggered)");
    return { scanned: 0, errors: 0, tasksCreated: 0, skipped: true };
  }

  log.info("[mapguard-scan] Starting weekly MapGuard monitoring scan...");

  const result = await runMapguardBatchScan();

  log.info(`[mapguard-scan] Complete: ${result.scanned} clients scanned, ${result.errors} errors, ${result.tasksCreated} tasks created`);

  return {
    scanned: result.scanned,
    errors: result.errors,
    tasksCreated: result.tasksCreated,
  };
}
