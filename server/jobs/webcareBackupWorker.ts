/**
 * WebCare Backup + Malware Scan Worker.
 *
 * Runs WEEKLY (Sunday 02:00 UTC). For every active WebCare client_service:
 *   1. captures a content backup (server/services/webcare/backupService.ts)
 *   2. runs a malware scan (server/services/webcare/malwareScanner.ts)
 *   3. prunes backups past their retention window, deleting the stored
 *      object first so nothing is orphaned in object storage.
 *
 * WEEKLY, not nightly. The notification copy used to say "Nightly backup
 * couldn't complete" for a job that did not exist. Weekly is what we
 * actually run, so weekly is what everything says.
 *
 * Idempotent per week via client_service.metadata.last_backup_week, so a
 * scheduler restart mid-run does not double-capture.
 *
 * Wrapped by `runJob()` in the scheduler — retry-with-backoff and the
 * job-log row come from that wrapper.
 */

import { db } from "../db";
import { clients, clientServices } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { loadWebcareContext, runBackupNow, runMalwareScanNow } from "../services/webcare/runners";
import { pruneExpiredBackups } from "../services/webcare/backupService";

const log = createLogger("WebCareBackupWorker");

export interface BackupWorkerResult {
  servicesProcessed: number;
  servicesSkipped: number;
  backupsSucceeded: number;
  backupsFailed: number;
  scansSucceeded: number;
  scansFailed: number;
  findingsFound: number;
  prunedBackups: number;
  errors: number;
}

/** ISO week key, e.g. "2026-W35". */
export function getWeekKey(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO-8601: week 1 is the week containing the first Thursday.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function processWebcareBackups(): Promise<BackupWorkerResult> {
  const weekKey = getWeekKey();
  log.info(`Starting WebCare backup + scan sweep for ${weekKey}`);

  const result: BackupWorkerResult = {
    servicesProcessed: 0,
    servicesSkipped: 0,
    backupsSucceeded: 0,
    backupsFailed: 0,
    scansSucceeded: 0,
    scansFailed: 0,
    findingsFound: 0,
    prunedBackups: 0,
    errors: 0,
  };

  const rows = await db
    .select({
      cs_id: clientServices.id,
      cs_client_id: clientServices.client_id,
      cs_metadata: clientServices.metadata,
    })
    .from(clientServices)
    .innerJoin(clients, eq(clientServices.client_id, clients.id))
    .where(
      and(
        sql`${clientServices.service_id} LIKE 'webcare%'`,
        eq(clientServices.status, "active"),
        eq(clientServices.enabled, true),
      ),
    );

  for (const row of rows) {
    try {
      const csMeta = (row.cs_metadata as Record<string, any>) || {};
      if (csMeta.last_backup_week === weekKey) {
        result.servicesSkipped += 1;
        continue;
      }

      const ctx = await loadWebcareContext(row.cs_client_id);
      if (!ctx) {
        result.servicesSkipped += 1;
        continue;
      }
      result.servicesProcessed += 1;

      const backup = await runBackupNow(ctx, "scheduled");
      if (backup.ok) result.backupsSucceeded += 1;
      else result.backupsFailed += 1;

      const scan = await runMalwareScanNow(ctx, "scheduled");
      if (scan.ok) result.scansSucceeded += 1;
      else result.scansFailed += 1;

      await db
        .update(clientServices)
        .set({
          metadata: { ...csMeta, last_backup_week: weekKey, last_backup_at: new Date().toISOString() },
          updated_at: new Date(),
        } as any)
        .where(eq(clientServices.id, row.cs_id));
    } catch (err: any) {
      log.error(`Error processing cs#${row.cs_id}`, { error: err.message });
      result.errors += 1;
    }
  }

  try {
    const pruned = await pruneExpiredBackups();
    result.prunedBackups = pruned.deleted;
    if (pruned.failed > 0) {
      log.warn(`${pruned.failed} expired backups could not be deleted from object storage — will retry next sweep`);
    }
  } catch (err: any) {
    log.error("Retention prune failed", { error: err.message });
    result.errors += 1;
  }

  log.info(
    `Complete: ${result.servicesProcessed} processed, ${result.servicesSkipped} skipped, ` +
    `${result.backupsSucceeded} backups ok / ${result.backupsFailed} failed, ` +
    `${result.scansSucceeded} scans ok / ${result.scansFailed} failed, ` +
    `${result.prunedBackups} pruned, ${result.errors} errors`,
  );

  return result;
}
