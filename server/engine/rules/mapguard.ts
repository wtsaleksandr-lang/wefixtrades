/**
 * MapGuard routing rules.
 *
 * Three rules read mapguard_snapshots and route active MapGuard clients
 * onto two queues:
 *
 *   ops_attention   — engineering/operations should look (failed scans,
 *                     Serper outage)
 *   account_health  — account/CSM should look (score regression
 *                     visible to the customer)
 *
 * Every rule is read-only; the routing worker is the only writer. Rules
 * also produce explicit `resolutions` for entities that have cleared,
 * scoped to the rule_name so a rule cannot accidentally clear another
 * rule's still-valid event on the same queue.
 *
 * No LLM judgement here — these are deterministic threshold checks.
 */

import { db } from "../../db";
import { mapguardSnapshots } from "@shared/schemas/mapguardMonitoring";
import { clients, clientServices, serviceCatalog } from "@shared/schemas/adminCrm";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  BATCH_LIMIT_MAPGUARD,
  MAPGUARD_FAIL_STREAK,
  MAPGUARD_SCORE_DROP,
  MAPGUARD_SCORE_DROP_DAYS,
  MAPGUARD_SERPER_ERROR_RATE,
} from "../thresholds";
import type { QueueAssignment, RuleResult } from "../types";

const ENTITY_TYPE = "mapguard_client";

/** Active MapGuard client identity returned from the discovery query. */
interface ActiveMapguardClient {
  client_id: number;
  business_name: string;
}

/**
 * One row of recent snapshot data needed by all three rules. Pulled in
 * a single query then partitioned per-client so we do at most one DB
 * round-trip for the discovery + one for the snapshot history.
 */
interface SnapshotRow {
  client_id: number;
  captured_at: Date;
  score_total: number | null;
  scan_metadata: unknown;
}

/* ─── Discovery ────────────────────────────────────────────────────── */

async function loadActiveMapguardClients(): Promise<ActiveMapguardClient[]> {
  const rows = await db
    .select({
      client_id: clients.id,
      business_name: clients.business_name,
    })
    .from(clientServices)
    .innerJoin(clients, eq(clientServices.client_id, clients.id))
    .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .where(
      and(
        eq(clientServices.status, "active"),
        eq(clientServices.enabled, true),
        sql`${serviceCatalog.id} LIKE 'mapguard%'`,
      ),
    )
    .orderBy(clients.id)
    .limit(BATCH_LIMIT_MAPGUARD);

  return rows;
}

/**
 * Last N snapshots per client, partitioned in JS rather than via a
 * window function for portability with the rest of the codebase. We
 * fetch the last 30 days of snapshots — enough to cover both the
 * 7-day score-drop window and the consecutive-failure streak.
 */
async function loadRecentSnapshots(
  clientIds: number[],
): Promise<Map<number, SnapshotRow[]>> {
  if (clientIds.length === 0) return new Map();

  const cutoff = new Date(Date.now() - MAPGUARD_SCORE_DROP_DAYS * 2 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      client_id: mapguardSnapshots.client_id,
      captured_at: mapguardSnapshots.captured_at,
      score_total: mapguardSnapshots.score_total,
      scan_metadata: mapguardSnapshots.scan_metadata,
    })
    .from(mapguardSnapshots)
    .where(
      and(
        sql`${mapguardSnapshots.client_id} = ANY(${clientIds})`,
        sql`${mapguardSnapshots.captured_at} >= ${cutoff}`,
      ),
    )
    .orderBy(desc(mapguardSnapshots.captured_at));

  const byClient = new Map<number, SnapshotRow[]>();
  for (const row of rows) {
    const list = byClient.get(row.client_id) ?? [];
    list.push(row);
    byClient.set(row.client_id, list);
  }
  return byClient;
}

/* ─── Rule helpers ─────────────────────────────────────────────────── */

/** True when a snapshot's scan_metadata.errors records a Places API failure. */
function isFailedScan(snapshot: SnapshotRow): boolean {
  const errors = errorList(snapshot);
  return errors.some((e) => e === "places_api_failed");
}

/** Parse Serper keyword error rate from metadata. Returns null if no Serper data. */
function serperErrorRate(snapshot: SnapshotRow): number | null {
  const errors = errorList(snapshot);
  for (const entry of errors) {
    const m = /^serper_keyword_errors:(\d+)\/(\d+)$/.exec(entry);
    if (m) {
      const errored = Number.parseInt(m[1]!, 10);
      const total = Number.parseInt(m[2]!, 10);
      if (total > 0) return errored / total;
    }
  }
  return null;
}

function errorList(snapshot: SnapshotRow): string[] {
  const meta = snapshot.scan_metadata as { errors?: unknown } | null;
  if (!meta || !Array.isArray(meta.errors)) return [];
  return meta.errors.filter((e): e is string => typeof e === "string");
}

/* ─── Rule 1: mapguard_scan_failed ─────────────────────────────────── */

export const RULE_SCAN_FAILED = "mapguard_scan_failed";

function evalScanFailed(
  client: ActiveMapguardClient,
  snapshots: SnapshotRow[],
): QueueAssignment | null {
  if (snapshots.length < MAPGUARD_FAIL_STREAK) return null;

  // Snapshots are pre-sorted DESC by captured_at — check the head.
  const recent = snapshots.slice(0, MAPGUARD_FAIL_STREAK);
  const allFailed = recent.every(isFailedScan);
  if (!allFailed) return null;

  return {
    entity_type: ENTITY_TYPE,
    entity_id: client.client_id,
    queue: "ops_attention",
    rule_name: RULE_SCAN_FAILED,
    priority: "high",
    owner_type: "admin",
    summary: `MapGuard scan failed ${recent.length} times in a row for ${client.business_name}`,
    requires_human: true,
    metadata: {
      consecutive_failures: recent.length,
      latest_errors: errorList(recent[0]!),
      latest_captured_at: recent[0]!.captured_at,
    },
  };
}

/* ─── Rule 2: mapguard_score_dropped ───────────────────────────────── */

export const RULE_SCORE_DROPPED = "mapguard_score_dropped";

function evalScoreDropped(
  client: ActiveMapguardClient,
  snapshots: SnapshotRow[],
): QueueAssignment | null {
  if (snapshots.length < 2) return null;

  const latest = snapshots[0]!;
  if (latest.score_total === null) return null;

  // Find the most recent snapshot that is at least N days older than
  // the latest. The history list is DESC, so walk forward.
  const windowCutoff = latest.captured_at.getTime() - MAPGUARD_SCORE_DROP_DAYS * 24 * 60 * 60 * 1000;
  const baseline = snapshots.find(
    (s) => s !== latest && s.score_total !== null && s.captured_at.getTime() <= windowCutoff,
  );
  if (!baseline || baseline.score_total === null) return null;

  const delta = latest.score_total - baseline.score_total;
  if (delta >= -MAPGUARD_SCORE_DROP) return null;

  return {
    entity_type: ENTITY_TYPE,
    entity_id: client.client_id,
    queue: "account_health",
    rule_name: RULE_SCORE_DROPPED,
    priority: "high",
    owner_type: "admin",
    summary: `${client.business_name}: MapGuard score dropped ${Math.abs(delta)} points in ${MAPGUARD_SCORE_DROP_DAYS}d`,
    requires_human: true,
    metadata: {
      score_now: latest.score_total,
      score_baseline: baseline.score_total,
      score_delta: delta,
      window_days: MAPGUARD_SCORE_DROP_DAYS,
      latest_captured_at: latest.captured_at,
      baseline_captured_at: baseline.captured_at,
    },
  };
}

/* ─── Rule 3: mapguard_serper_outage ───────────────────────────────── */

export const RULE_SERPER_OUTAGE = "mapguard_serper_outage";

function evalSerperOutage(
  client: ActiveMapguardClient,
  snapshots: SnapshotRow[],
): QueueAssignment | null {
  if (snapshots.length === 0) return null;

  const latest = snapshots[0]!;
  const rate = serperErrorRate(latest);
  if (rate === null || rate <= MAPGUARD_SERPER_ERROR_RATE) return null;

  return {
    entity_type: ENTITY_TYPE,
    entity_id: client.client_id,
    queue: "ops_attention",
    rule_name: RULE_SERPER_OUTAGE,
    // Outage is system-recoverable on the next clean scan, so owner is
    // system rather than admin — humans only need to step in if the
    // event survives long enough to hit the requeue threshold.
    priority: "normal",
    owner_type: "system",
    summary: `${client.business_name}: Serper errors at ${(rate * 100).toFixed(0)}% on latest scan`,
    requires_human: false,
    metadata: {
      serper_error_rate: rate,
      latest_errors: errorList(latest),
      latest_captured_at: latest.captured_at,
    },
  };
}

/* ─── Public entry point ───────────────────────────────────────────── */

/**
 * Evaluate every MapGuard rule against the current snapshot history.
 *
 * Returns assignments for active conditions and resolutions for any
 * client whose condition no longer holds. Each rule's resolution is
 * scoped to its own rule_name so the worker can system-resolve
 * precisely without disturbing other rules sharing the same queue.
 */
export async function runMapguardRules(): Promise<RuleResult> {
  const activeClients = await loadActiveMapguardClients();
  if (activeClients.length === 0) {
    return { assignments: [], resolutions: [] };
  }

  const snapshotsByClient = await loadRecentSnapshots(activeClients.map((c) => c.client_id));

  const assignments: QueueAssignment[] = [];
  const resolutions: RuleResult["resolutions"] = [];

  for (const client of activeClients) {
    const snapshots = snapshotsByClient.get(client.client_id) ?? [];

    const failed = evalScanFailed(client, snapshots);
    if (failed) assignments.push(failed);
    else resolutions.push({
      entity_type: ENTITY_TYPE, entity_id: client.client_id,
      queue: "ops_attention", rule_name: RULE_SCAN_FAILED,
    });

    const dropped = evalScoreDropped(client, snapshots);
    if (dropped) assignments.push(dropped);
    else resolutions.push({
      entity_type: ENTITY_TYPE, entity_id: client.client_id,
      queue: "account_health", rule_name: RULE_SCORE_DROPPED,
    });

    const outage = evalSerperOutage(client, snapshots);
    if (outage) assignments.push(outage);
    else resolutions.push({
      entity_type: ENTITY_TYPE, entity_id: client.client_id,
      queue: "ops_attention", rule_name: RULE_SERPER_OUTAGE,
    });
  }

  return { assignments, resolutions };
}
