/**
 * MapGuard Weekly Update Worker
 *
 * Sends soft weekly update emails to all active MapGuard clients.
 * Designed for retention — always sends, even when nothing changed.
 */

import { sendAllWeeklyUpdates } from "../services/mapguardRetention";

export async function processMapguardWeeklyUpdates(): Promise<{
  sent: number;
  skipped: number;
  errors: number;
}> {
  console.log("[mapguard-retention] Starting weekly client updates...");
  return sendAllWeeklyUpdates();
}
