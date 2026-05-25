/**
 * Citation Tracker daily scan worker.
 *
 * Runs once per day (03:00 UTC by default) and iterates every active
 * citation_tracker_subscriptions row, checking each tracked directory
 * for NAP drift, new auto-spawn listings, and removals. See
 * server/services/citationTracker/monitor.ts for the per-sub logic.
 */
import { runDailyScan } from "../services/citationTracker/monitor";
import { createLogger } from "../lib/logger";

const log = createLogger("citation-tracker-daily-scan");

export async function processCitationTrackerDailyScan(): Promise<void> {
  log.info("citation tracker daily scan starting");
  const stats = await runDailyScan();
  log.info("citation tracker daily scan finished", { ...stats });
}
