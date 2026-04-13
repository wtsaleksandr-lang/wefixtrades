/**
 * MapGuard Weekly Scan Worker
 *
 * Runs the recurring monitoring scan for all active MapGuard clients.
 * Called by the scheduler on a weekly cadence.
 */

import { runMapguardBatchScan } from "../services/mapguardMonitor";

export async function processMapguardScans(): Promise<{
  scanned: number;
  errors: number;
  tasksCreated: number;
}> {
  console.log("[mapguard-scan] Starting weekly MapGuard monitoring scan...");

  const result = await runMapguardBatchScan();

  console.log(`[mapguard-scan] Complete: ${result.scanned} clients scanned, ${result.errors} errors, ${result.tasksCreated} tasks created`);

  return {
    scanned: result.scanned,
    errors: result.errors,
    tasksCreated: result.tasksCreated,
  };
}
