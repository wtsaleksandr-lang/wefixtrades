/**
 * MapGuard Monthly Report Worker
 *
 * Sends monthly reports for all active MapGuard clients.
 * Called by the scheduler on the 2nd of each month.
 */

import { sendAllMonthlyReports } from "../services/mapguardReports";

export async function processMapguardReports(): Promise<{
  sent: number;
  skipped: number;
  errors: number;
}> {
  console.log("[mapguard-report] Starting monthly report batch...");

  const result = await sendAllMonthlyReports();

  console.log(`[mapguard-report] Complete: ${result.sent} sent, ${result.skipped} skipped, ${result.errors.length} errors`);

  return {
    sent: result.sent,
    skipped: result.skipped,
    errors: result.errors.length,
  };
}
