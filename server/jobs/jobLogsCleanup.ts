/**
 * job_logs TTL cleanup. Deletes rows older than RETENTION_DAYS.
 *
 * The job_logs table grows quickly because per-minute workers each
 * write a row per tick. Without retention the table reaches millions
 * of rows in production within weeks and slows the workers + admin
 * dashboard queries.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import { jobLogs } from "@shared/schema";

const RETENTION_DAYS = 14;

export async function processJobLogsCleanup(): Promise<{ deleted: number; cutoff: string }> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(jobLogs)
    .where(sql`${jobLogs.started_at} < ${cutoff}`);

  // node-postgres exposes rowCount on the result; guard for shapes that don't.
  const deleted = (result as any)?.rowCount ?? 0;
  return { deleted, cutoff: cutoff.toISOString() };
}
