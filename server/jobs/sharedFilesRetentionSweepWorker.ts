/**
 * Wave BA-7 — shared-files retention sweep.
 *
 * Daily worker (wired at 04:15 UTC in scheduler.ts as
 * `shared_files_retention_sweep`). For each covered file-bearing table
 * it finds rows older than the default 180-day retention window that
 * are NOT pinned by an admin in `retention_overrides`, and stamps
 * `deleted_at = now()`.
 *
 * Hard constraints this wave (BA-7):
 *   - Soft-delete only. No row DELETE, no blob purge. The blob purge
 *     pass lives in BA-7b with its own audit + retry surface.
 *   - Idempotent. Re-running the sweep on the same day must produce no
 *     additional deletions — guaranteed by the `deleted_at IS NULL`
 *     candidate filter.
 *   - 180-day default is hardcoded this wave. BA-7b will surface a
 *     per-tenant policy override (TODO below).
 *
 * Pin semantics:
 *   - retention_overrides row with retained_until IS NULL → indefinite pin
 *   - retention_overrides row with retained_until > now() → temporary pin
 *   - retention_overrides row with retained_until <= now() → expired,
 *     row sweeps normally
 *   - no retention_overrides row → row sweeps when older than 180 days
 *
 * Per-table candidate logic lives in the COVERED_TABLES registry below so
 * BA-7b can plug in `calculator_lead_attachments` / `email_attachments`
 * by appending a single entry (and the matching migration).
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import { writeAudit } from "../lib/auditLog";
import { createLogger } from "../lib/logger";

const log = createLogger("SharedFilesRetentionSweep");

/** Default retention window in days. TODO BA-7b: make per-tenant. */
const DEFAULT_RETENTION_DAYS = 180;

interface PerTableResult {
  scanned: number;
  soft_deleted: number;
  pinned_skipped: number;
}

interface SweepSummary {
  scanned: number;
  soft_deleted: number;
  pinned_skipped: number;
  per_table: Record<string, PerTableResult>;
}

/**
 * Covered tables registry. Each entry describes how to find sweep
 * candidates and stamp deleted_at for one source table.
 *
 *   - file_table:    name used in retention_overrides.file_table
 *   - id_column:     the source table's primary key column name
 *   - created_column: the column used for the 180-day window
 *   - candidate_extra: optional extra SQL fragment AND-joined onto the
 *     candidate predicate. e.g. `attachments is not null` for the
 *     assistant_messages table where rows without attachments are
 *     not customer-shared files.
 */
interface CoveredTable {
  file_table: string;
  id_column: string;
  created_column: string;
  candidate_extra?: string;
}

const COVERED_TABLES: readonly CoveredTable[] = [
  {
    file_table: "voicemails",
    id_column: "id",
    created_column: "created_at",
  },
  {
    file_table: "assistant_messages",
    id_column: "id",
    created_column: "created_at",
    // Only sweep rows that actually carry a customer-shared file.
    // Plain text replies don't count.
    candidate_extra: "attachments is not null",
  },
] as const;

/**
 * Run the sweep across every covered table. Returns the rolled-up
 * summary, also written to the audit log under the
 * `shared_files_retention_sweep` action.
 */
export async function runSharedFilesRetentionSweep(): Promise<SweepSummary> {
  const cutoff = new Date(Date.now() - DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  log.info("Starting shared-files retention sweep", {
    cutoff: cutoff.toISOString(),
    retention_days: DEFAULT_RETENTION_DAYS,
    covered_tables: COVERED_TABLES.map((t) => t.file_table),
  });

  const perTable: Record<string, PerTableResult> = {};
  let totalScanned = 0;
  let totalSoftDeleted = 0;
  let totalPinnedSkipped = 0;

  for (const t of COVERED_TABLES) {
    try {
      const result = await sweepTable(t, cutoff);
      perTable[t.file_table] = result;
      totalScanned += result.scanned;
      totalSoftDeleted += result.soft_deleted;
      totalPinnedSkipped += result.pinned_skipped;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("Per-table sweep failed", { table: t.file_table, err: message });
      perTable[t.file_table] = { scanned: 0, soft_deleted: 0, pinned_skipped: 0 };
    }
  }

  const summary: SweepSummary = {
    scanned: totalScanned,
    soft_deleted: totalSoftDeleted,
    pinned_skipped: totalPinnedSkipped,
    per_table: perTable,
  };

  log.info("Shared-files retention sweep done", { ...summary });

  // System-actor audit row so the cross-cutting audit reader picks it up.
  // Fire-and-forget per writeAudit's contract.
  writeAudit({
    actorId: "cron",
    actorType: "system",
    action: "shared_files_retention_sweep",
    entityType: "retention_sweep",
    entityId: cutoff.toISOString().slice(0, 10),
    metadata: {
      retention_days: DEFAULT_RETENTION_DAYS,
      cutoff: cutoff.toISOString(),
      ...summary,
    },
  });

  return summary;
}

/**
 * Single-table pass. Counts the candidate set (rows older than the cutoff
 * with deleted_at IS NULL), counts the subset that is pinned, then
 * soft-deletes the rest in one UPDATE.
 *
 * The COVERED_TABLES entries are static, code-controlled values — not
 * user input — so interpolating identifiers into the SQL is safe here.
 * (Drizzle's `sql.identifier` would be nicer but the version pinned here
 * doesn't expose it for arbitrary column names; the static-allowlist
 * pattern is the same one calculatorAnalyticsRollupWorker uses.)
 */
async function sweepTable(t: CoveredTable, cutoff: Date): Promise<PerTableResult> {
  const cutoffIso = cutoff.toISOString();

  /* Build the candidate predicate. Identifiers come from the static
   * registry, so direct interpolation is safe. */
  const idCol = t.id_column;
  const createdCol = t.created_column;
  const extra = t.candidate_extra ? `and ${t.candidate_extra}` : "";

  // Total candidates older than cutoff and not already soft-deleted.
  const scannedRows = await db.execute(sql.raw(
    `select count(*)::text as cnt from ${t.file_table} ` +
    `where deleted_at is null ${extra} and ${createdCol} < '${cutoffIso}'::timestamp`,
  ));
  const scanned = parseCount(scannedRows);

  // Pinned subset — candidates that match a retention_overrides row with
  // retained_until > now() or null (indefinite).
  const pinnedRows = await db.execute(sql.raw(
    `select count(*)::text as cnt from ${t.file_table} f ` +
    `join retention_overrides ro on ro.file_table = '${t.file_table}' ` +
    `and ro.file_id = f.${idCol}::varchar ` +
    `where f.deleted_at is null ${extra ? `and f.${t.candidate_extra}` : ""} ` +
    `and f.${createdCol} < '${cutoffIso}'::timestamp ` +
    `and (ro.retained_until is null or ro.retained_until > now())`,
  ));
  const pinnedSkipped = parseCount(pinnedRows);

  const toDelete = scanned - pinnedSkipped;
  if (toDelete <= 0) {
    return { scanned, soft_deleted: 0, pinned_skipped: pinnedSkipped };
  }

  // Stamp deleted_at. Skip rows that are pinned via NOT EXISTS subquery.
  // deleted_at IS NULL guard makes the update idempotent on re-runs.
  const updateResult = await db.execute(sql.raw(
    `update ${t.file_table} f set deleted_at = now() ` +
    `where f.deleted_at is null ${extra ? `and f.${t.candidate_extra}` : ""} ` +
    `and f.${createdCol} < '${cutoffIso}'::timestamp ` +
    `and not exists (` +
      `select 1 from retention_overrides ro ` +
      `where ro.file_table = '${t.file_table}' ` +
      `and ro.file_id = f.${idCol}::varchar ` +
      `and (ro.retained_until is null or ro.retained_until > now())` +
    `)`,
  ));
  const softDeleted = parseRowCount(updateResult, toDelete);

  return {
    scanned,
    soft_deleted: softDeleted,
    pinned_skipped: pinnedSkipped,
  };
}

/** Normalize a count(*) row across driver variants. */
function parseCount(result: unknown): number {
  const rows = toRows<{ cnt?: string | number }>(result);
  if (rows.length === 0) return 0;
  const raw = rows[0]?.cnt;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Best-effort rowCount extraction for UPDATE; falls back to expected. */
function parseRowCount(result: unknown, expected: number): number {
  if (result && typeof result === "object" && "rowCount" in result) {
    const rc = (result as { rowCount?: number }).rowCount;
    if (typeof rc === "number" && rc >= 0) return rc;
  }
  return expected;
}

function toRows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === "object" && "rows" in r) {
    const rows = (r as { rows?: unknown[] }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
  return [];
}
