/**
 * MapGuard Weekly Update Worker
 *
 * Sends soft weekly update emails to all active MapGuard clients.
 * Designed for retention — always sends, even when nothing changed.
 */

import { sendAllWeeklyUpdates } from "../services/mapguardRetention";
import { createLogger } from "../lib/logger";

const log = createLogger("MapguardRetention");

export async function processMapguardWeeklyUpdates(): Promise<{
  sent: number;
  skipped: number;
  errors: number;
}> {
  log.info("[mapguard-retention] Starting weekly client updates...");
  return sendAllWeeklyUpdates();
}
