/**
 * AdFlow Monthly Report Worker
 *
 * Fires on the 2nd of each month at 13:00 UTC. Sends performance
 * reports for all active AdFlow services that have current-month
 * metrics entered via the admin metrics form.
 *
 * The real implementation lives in server/services/adflowReports.ts.
 */
import { sendAllAdflowReports } from "../services/adflowReports";
import { createLogger } from "../lib/logger";

const log = createLogger("AdflowReport");

export async function processAdflowReports(): Promise<{
  sent: number;
  skipped: number;
  errors: string[];
  skipped_missing_current_report: number;
  skipped_already_sent: number;
  skipped_unsubscribed: number;
  skipped_other: number;
}> {
  log.info("[adflow-report] Starting monthly report batch...");
  const result = await sendAllAdflowReports();
  return {
    ...result,
    errors: result.errors, // string[] as returned from sendAllAdflowReports
  };
}
