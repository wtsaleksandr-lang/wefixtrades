/**
 * Routing worker.
 *
 * Cron entry point for the Rules & Routing Engine. Runs the rule
 * evaluator, applies the per-queue requeue policy from
 * docs/rules-routing-engine-plan.md §5d, writes routing_events, and
 * logs newly created events to admin_activity_log.
 *
 * Behavior contract:
 * - Read-only against existing entity tables (does not mutate
 *   fulfillment_tasks, support_tickets, etc.). Phase 4 of the plan
 *   adds controlled mutations; this worker stays in Phase 2 territory.
 * - Idempotent. createRoutingEvent dedupes against existing
 *   active/snoozed rows; this worker layers a requeue gate on top so
 *   acknowledged events don't silently re-fire until the per-queue
 *   threshold has elapsed.
 * - Overlap-safe. The scheduler also overlap-guards via runJob's
 *   in-process flag, but a stricter cross-process check via jobLogs is
 *   honored here so a long DB cycle on a slow box can't double-fire
 *   if someone happens to hand-trigger the worker.
 */

import { db } from "../db";
import { jobLogs } from "@shared/schemas/db";
import { adminActivityLog } from "@shared/schemas/adminCrm";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import { and, desc, eq, sql } from "drizzle-orm";
import { runAllRules } from "./evaluator";
import { REQUEUE_THRESHOLD_MS, ROUTING_WORKER_OVERLAP_MS } from "./thresholds";
import type { QueueAssignment } from "./types";

const log = createLogger("RoutingWorker");
const JOB_NAME = "routing_engine";

interface CycleStats {
  evaluated: number;
  events_created: number;
  events_resolved: number;
  events_requeued: number;
  events_suppressed_by_ack: number;
  rule_pass_ms: number;
  total_ms: number;
}

/**
 * Public cron entry point. Wraps the cycle in an overlap guard and a
 * jobLogs entry, mirroring the pattern in
 * server/jobs/scheduler.ts:runJob — but with the stricter overlap
 * check the plan calls for.
 */
export async function processRoutingEngine(): Promise<CycleStats> {
  const overlapping = await isAnotherCycleRunning();
  if (overlapping) {
    log.info("[routing-engine] Skipping cycle — previous run still active");
    return emptyStats();
  }

  const startedAt = new Date();
  const start = Date.now();

  let logId: number | null = null;
  try {
    const entry = await storage.createJobLog({
      job_name: JOB_NAME,
      status: "running",
      started_at: startedAt,
      metadata: null,
    });
    logId = entry.id;
  } catch (err: any) {
    // jobLogs is best-effort here — the cycle itself doesn't depend on
    // having a log entry. Surface the failure and continue so a single
    // bad insert doesn't take routing offline.
    log.error("[routing-engine] Failed to create job log entry", { error: err.message });
  }

  try {
    const stats = await runCycle(start);
    if (logId !== null) {
      await storage.updateJobLog(logId, {
        status: "completed",
        finished_at: new Date(),
        metadata: { ...stats },
      });
    }
    log.info("[routing-engine] Cycle complete", { ...stats });
    return stats;
  } catch (err: any) {
    log.error("[routing-engine] Cycle failed", { error: err.message });
    if (logId !== null) {
      await storage.updateJobLog(logId, {
        status: "failed",
        finished_at: new Date(),
        error_message: err.message,
      }).catch(() => { /* swallow secondary error */ });
    }
    throw err;
  }
}

/* ─── Cycle internals ──────────────────────────────────────────────── */

async function runCycle(start: number): Promise<CycleStats> {
  const ruleStart = Date.now();
  const { assignments, resolutions } = await runAllRules();
  const rulePassMs = Date.now() - ruleStart;

  let created = 0;
  let resolved = 0;
  let requeued = 0;
  let suppressed = 0;

  // Apply assignments. Each one passes through the requeue gate before
  // hitting createRoutingEvent (which itself dedupes against active/
  // snoozed rows — see storage.ts).
  for (const assignment of assignments) {
    const decision = await applyAssignment(assignment);
    if (decision === "created") created++;
    else if (decision === "requeued") requeued++;
    else if (decision === "suppressed_by_ack") suppressed++;
  }

  // Apply resolutions. Scoped by rule_name so one rule cannot clear
  // another rule's still-valid event when they share a queue.
  for (const r of resolutions) {
    await storage.systemResolveRoutingEvent(r.entity_type, r.entity_id, r.queue, r.rule_name);
    resolved++;
  }

  return {
    evaluated: assignments.length + resolutions.length,
    events_created: created,
    events_resolved: resolved,
    events_requeued: requeued,
    events_suppressed_by_ack: suppressed,
    rule_pass_ms: rulePassMs,
    total_ms: Date.now() - start,
  };
}

type AssignmentDecision =
  | "created"             // brand new active event landed
  | "updated"             // existing active/snoozed row touched (createRoutingEvent dedup)
  | "requeued"            // ack'd previously, threshold elapsed → fresh active event
  | "suppressed_by_ack";  // ack'd recently, requeue threshold not yet elapsed

/**
 * Decide what to do with one rule-emitted assignment, then act.
 *
 * Requeue policy (plan §5d):
 *   1. If the most recent admin_acknowledged event for this
 *      (entity, queue, rule) is still within the queue's requeue
 *      threshold, suppress — admin has handled it, give them time.
 *   2. Otherwise, call createRoutingEvent. The storage method:
 *      - returns the existing row (status updated_at bumped) if an
 *        active/snoozed event for this key already exists
 *      - inserts a fresh row otherwise (covering both first-time
 *        creates and post-ack requeues)
 *   3. New rows get an admin_activity_log audit entry with
 *      actor_type=system.
 */
async function applyAssignment(a: QueueAssignment): Promise<AssignmentDecision> {
  const threshold = REQUEUE_THRESHOLD_MS[a.queue];
  if (threshold === undefined) {
    throw new Error(
      `routing-engine: queue "${a.queue}" has no entry in REQUEUE_THRESHOLD_MS — add one to thresholds.ts`,
    );
  }

  const lastAck = await storage.getLastAcknowledgedRoutingEvent(
    a.entity_type, a.entity_id, a.queue, a.rule_name,
  );

  let isRequeue = false;
  if (lastAck && lastAck.acknowledged_at) {
    const ackAge = Date.now() - lastAck.acknowledged_at.getTime();
    if (ackAge < threshold) {
      // Still inside the silence window — and since admin_acknowledged
      // is terminal for that instance, createRoutingEvent would happily
      // insert a duplicate. Skip explicitly.
      return "suppressed_by_ack";
    }
    isRequeue = true;
  }

  // Build the row to insert. Supplementary engine fields ride in
  // metadata so the existing routing_events DB shape doesn't need to
  // change for Phase 2 to ship.
  const summary = isRequeue && lastAck?.acknowledged_at
    ? `Re-flagged: still unresolved after acknowledgement on ${lastAck.acknowledged_at.toISOString()}. ${a.summary}`
    : a.summary;

  const event = await storage.createRoutingEvent({
    entity_type: a.entity_type,
    entity_id: a.entity_id,
    queue: a.queue,
    rule_name: a.rule_name,
    priority: a.priority,
    summary,
    metadata: {
      owner_type: a.owner_type,
      requires_human: a.requires_human,
      current_status: a.current_status ?? null,
      requeue_of_event_id: isRequeue ? lastAck?.id ?? null : null,
      ...(a.metadata ?? {}),
    },
  });

  // createRoutingEvent updates instead of insert when an active/
  // snoozed row already exists. The reliable signal of a fresh
  // insert is that the DB sets created_at and updated_at together;
  // the short-circuit update path only bumps updated_at, so even a
  // 100ms gap means we hit an existing row.
  const isNewRow =
    event.created_at !== null &&
    event.updated_at !== null &&
    Math.abs(event.updated_at.getTime() - event.created_at.getTime()) < 100;
  if (isNewRow) {
    await db.insert(adminActivityLog).values({
      actor_type: "system",
      actor_id: null,
      actor_name: "routing_engine",
      action: isRequeue ? "routing.requeued" : "routing.queued",
      entity_type: a.entity_type,
      entity_id: a.entity_id,
      summary,
      metadata: {
        queue: a.queue,
        rule_name: a.rule_name,
        priority: a.priority,
        owner_type: a.owner_type,
        routing_event_id: event.id,
      },
    });
    return isRequeue ? "requeued" : "created";
  }

  return "updated";
}

/* ─── Overlap guard ────────────────────────────────────────────────── */

async function isAnotherCycleRunning(): Promise<boolean> {
  const cutoff = new Date(Date.now() - ROUTING_WORKER_OVERLAP_MS);
  const [row] = await db
    .select({ id: jobLogs.id, started_at: jobLogs.started_at })
    .from(jobLogs)
    .where(
      and(
        eq(jobLogs.job_name, JOB_NAME),
        eq(jobLogs.status, "running"),
        sql`${jobLogs.started_at} > ${cutoff}`,
      ),
    )
    .orderBy(desc(jobLogs.started_at))
    .limit(1);
  return Boolean(row);
}

function emptyStats(): CycleStats {
  return {
    evaluated: 0,
    events_created: 0,
    events_resolved: 0,
    events_requeued: 0,
    events_suppressed_by_ack: 0,
    rule_pass_ms: 0,
    total_ms: 0,
  };
}
