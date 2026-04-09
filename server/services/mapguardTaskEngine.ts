/**
 * MapGuard Task Engine
 *
 * Core service for creating, managing, and querying MapGuard tasks.
 * Handles audit-to-task mapping, status transitions, and operational summaries.
 */

import { db } from "../db";
import { mapguardTasks, mapguardTaskActivity } from "@shared/schemas/mapguard";
import { clients } from "@shared/schemas/adminCrm";
import { auditReports } from "@shared/schemas/db";
import { eq, and, sql, desc, asc, isNull } from "drizzle-orm";
import {
  AUDIT_ISSUE_TO_TASK,
  MAPGUARD_TASK_TYPES,
  MAPGUARD_STATUS_TRANSITIONS,
  type MapguardTaskType,
  type MapguardTaskStatus,
  type MapguardSourceType,
} from "@shared/mapguardTypes";
import type { InsertMapguardTask, MapguardTask } from "@shared/schemas/mapguard";

/* ═══════════════════════════════════════════
   TASK CRUD
   ═══════════════════════════════════════════ */

export async function createMapguardTask(
  data: InsertMapguardTask,
  actor?: { type: string; name: string }
): Promise<MapguardTask> {
  const [task] = await db.insert(mapguardTasks).values(data).returning();

  // Log creation
  await db.insert(mapguardTaskActivity).values({
    task_id: task.id,
    action: "created",
    actor_type: actor?.type || (data.created_by_system ? "system" : "human"),
    actor_name: actor?.name || (data.created_by_system ? "mapguard-engine" : null),
    to_status: data.status || "pending",
    summary: `Task created: ${data.title}`,
    metadata: { task_type: data.task_type, source_type: data.source_type },
  });

  return task;
}

export async function updateMapguardTaskStatus(
  taskId: number,
  newStatus: MapguardTaskStatus,
  opts?: {
    next_step_hint?: string;
    waiting_on?: string | null;
    actor?: { type: string; name: string };
    summary?: string;
  }
): Promise<MapguardTask | null> {
  // Fetch current task
  const [current] = await db.select().from(mapguardTasks).where(eq(mapguardTasks.id, taskId)).limit(1);
  if (!current) return null;

  const currentStatus = current.status as MapguardTaskStatus;

  // Validate transition
  const allowed = MAPGUARD_STATUS_TRANSITIONS[currentStatus];
  if (!allowed?.includes(newStatus)) {
    throw new Error(`Invalid status transition: ${currentStatus} → ${newStatus}`);
  }

  // Build update
  const updates: Record<string, any> = {
    status: newStatus,
    updated_at: new Date(),
  };

  if (opts?.next_step_hint !== undefined) updates.next_step_hint = opts.next_step_hint;
  if (opts?.waiting_on !== undefined) updates.waiting_on = opts.waiting_on;

  // Auto-set waiting_on based on status
  if (newStatus === "waiting_supplier") updates.waiting_on = "supplier";
  else if (newStatus === "waiting_client") updates.waiting_on = "client";
  else if (newStatus === "needs_review") updates.waiting_on = "internal";
  else if (["completed", "cancelled"].includes(newStatus)) updates.waiting_on = null;

  // Auto-set completed_at
  if (newStatus === "completed" && !current.completed_at) {
    updates.completed_at = new Date();
  }

  const [updated] = await db.update(mapguardTasks).set(updates).where(eq(mapguardTasks.id, taskId)).returning();

  // Log activity
  await db.insert(mapguardTaskActivity).values({
    task_id: taskId,
    action: "status_changed",
    actor_type: opts?.actor?.type || "human",
    actor_name: opts?.actor?.name || null,
    from_status: currentStatus,
    to_status: newStatus,
    summary: opts?.summary || `Status changed: ${currentStatus} → ${newStatus}`,
  });

  return updated;
}

export async function updateMapguardTaskResult(
  taskId: number,
  resultData: Record<string, any>,
  actor?: { type: string; name: string }
): Promise<MapguardTask | null> {
  const [updated] = await db.update(mapguardTasks).set({
    result_data: resultData,
    updated_at: new Date(),
  }).where(eq(mapguardTasks.id, taskId)).returning();

  if (!updated) return null;

  await db.insert(mapguardTaskActivity).values({
    task_id: taskId,
    action: "result_attached",
    actor_type: actor?.type || "human",
    actor_name: actor?.name || null,
    summary: "Result data attached",
    metadata: { keys: Object.keys(resultData) },
  });

  return updated;
}

export async function updateMapguardTask(
  taskId: number,
  updates: Partial<InsertMapguardTask>
): Promise<MapguardTask | null> {
  const [updated] = await db.update(mapguardTasks).set({
    ...updates,
    updated_at: new Date(),
  }).where(eq(mapguardTasks.id, taskId)).returning();
  return updated || null;
}

/* ═══════════════════════════════════════════
   TASK QUERIES
   ═══════════════════════════════════════════ */

export async function listMapguardTasks(opts: {
  clientId: number;
  status?: string;
  taskType?: string;
  limit?: number;
  offset?: number;
}): Promise<(MapguardTask & { client_name?: string })[]> {
  const { clientId, status, taskType, limit = 50, offset = 0 } = opts;
  const conditions = [eq(mapguardTasks.client_id, clientId)];
  if (status) conditions.push(eq(mapguardTasks.status, status));
  if (taskType) conditions.push(eq(mapguardTasks.task_type, taskType));

  const rows = await db.select({
    id: mapguardTasks.id,
    client_id: mapguardTasks.client_id,
    client_service_id: mapguardTasks.client_service_id,
    audit_report_id: mapguardTasks.audit_report_id,
    task_type: mapguardTasks.task_type,
    title: mapguardTasks.title,
    description: mapguardTasks.description,
    source_type: mapguardTasks.source_type,
    created_by_system: mapguardTasks.created_by_system,
    status: mapguardTasks.status,
    priority: mapguardTasks.priority,
    sort_order: mapguardTasks.sort_order,
    waiting_on: mapguardTasks.waiting_on,
    next_step_hint: mapguardTasks.next_step_hint,
    scheduled_for: mapguardTasks.scheduled_for,
    due_at: mapguardTasks.due_at,
    completed_at: mapguardTasks.completed_at,
    input_data: mapguardTasks.input_data,
    expected_output: mapguardTasks.expected_output,
    validation_rules: mapguardTasks.validation_rules,
    result_data: mapguardTasks.result_data,
    supplier_type: mapguardTasks.supplier_type,
    supplier_ref: mapguardTasks.supplier_ref,
    assigned_to: mapguardTasks.assigned_to,
    cost_cents: mapguardTasks.cost_cents,
    escalation_flag: mapguardTasks.escalation_flag,
    metadata: mapguardTasks.metadata,
    created_at: mapguardTasks.created_at,
    updated_at: mapguardTasks.updated_at,
    client_name: clients.business_name,
  })
  .from(mapguardTasks)
  .leftJoin(clients, eq(mapguardTasks.client_id, clients.id))
  .where(and(...conditions))
  .orderBy(
    asc(mapguardTasks.sort_order),
    desc(mapguardTasks.priority),
    asc(mapguardTasks.created_at),
  )
  .limit(limit)
  .offset(offset);

  return rows as any;
}

export async function getMapguardTaskById(taskId: number): Promise<MapguardTask | null> {
  const [task] = await db.select().from(mapguardTasks).where(eq(mapguardTasks.id, taskId)).limit(1);
  return task || null;
}

export async function getTaskActivity(taskId: number, limit = 20) {
  return db.select().from(mapguardTaskActivity)
    .where(eq(mapguardTaskActivity.task_id, taskId))
    .orderBy(desc(mapguardTaskActivity.created_at))
    .limit(limit);
}

/* ═══════════════════════════════════════════
   OPERATIONAL SUMMARY
   ═══════════════════════════════════════════ */

export interface MapguardTaskSummary {
  total: number;
  pending: number;
  ready: number;
  in_progress: number;
  waiting_supplier: number;
  waiting_client: number;
  needs_review: number;
  blocked: number;
  completed: number;
  cancelled: number;
  overdue: number;
  next_recommended: {
    id: number;
    title: string;
    task_type: string;
    priority: string;
    next_step_hint: string | null;
  } | null;
}

export async function getMapguardTaskSummary(clientId: number): Promise<MapguardTaskSummary> {
  // Status counts
  const statusRows = await db.select({
    status: mapguardTasks.status,
    count: sql<number>`count(*)::int`,
  })
  .from(mapguardTasks)
  .where(eq(mapguardTasks.client_id, clientId))
  .groupBy(mapguardTasks.status);

  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of statusRows) {
    counts[row.status] = row.count;
    total += row.count;
  }

  // Overdue count
  const [overdueRow] = await db.select({ count: sql<number>`count(*)::int` })
    .from(mapguardTasks)
    .where(and(
      eq(mapguardTasks.client_id, clientId),
      sql`${mapguardTasks.due_at} < NOW()`,
      sql`${mapguardTasks.status} NOT IN ('completed', 'cancelled')`,
    ));

  // Next recommended task: highest-priority non-terminal task
  const PRIORITY_ORDER = sql`CASE ${mapguardTasks.priority}
    WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`;

  const [nextTask] = await db.select({
    id: mapguardTasks.id,
    title: mapguardTasks.title,
    task_type: mapguardTasks.task_type,
    priority: mapguardTasks.priority,
    next_step_hint: mapguardTasks.next_step_hint,
  })
  .from(mapguardTasks)
  .where(and(
    eq(mapguardTasks.client_id, clientId),
    sql`${mapguardTasks.status} IN ('ready', 'in_progress', 'needs_review', 'pending')`,
  ))
  .orderBy(PRIORITY_ORDER, asc(mapguardTasks.sort_order))
  .limit(1);

  return {
    total,
    pending: counts.pending || 0,
    ready: counts.ready || 0,
    in_progress: counts.in_progress || 0,
    waiting_supplier: counts.waiting_supplier || 0,
    waiting_client: counts.waiting_client || 0,
    needs_review: counts.needs_review || 0,
    blocked: counts.blocked || 0,
    completed: counts.completed || 0,
    cancelled: counts.cancelled || 0,
    overdue: overdueRow?.count || 0,
    next_recommended: nextTask || null,
  };
}

/* ═══════════════════════════════════════════
   AUDIT → TASK GENERATION
   ═══════════════════════════════════════════
   Reads audit report data and creates MapGuard
   tasks for detected issues.
   ═══════════════════════════════════════════ */

export async function createTasksFromAudit(
  clientId: number,
  auditReportId: string,
  opts?: { clientServiceId?: number }
): Promise<MapguardTask[]> {
  // Fetch the audit report
  const [report] = await db.select().from(auditReports)
    .where(eq(auditReports.id, auditReportId))
    .limit(1);

  if (!report) throw new Error(`Audit report not found: ${auditReportId}`);

  const auditData = report.audit_data as Record<string, any>;
  if (!auditData) throw new Error("Audit report has no data");

  const detectedIssues: string[] = auditData.detectedIssues || [];
  if (detectedIssues.length === 0) return [];

  const createdTasks: MapguardTask[] = [];
  const seenTypes = new Set<string>();
  let sortOrder = 0;

  for (const issue of detectedIssues) {
    const mapping = AUDIT_ISSUE_TO_TASK[issue];
    if (!mapping) continue;

    // Avoid duplicate task types from different issues mapping to same type
    const dedupKey = `${mapping.task_type}:${mapping.title}`;
    if (seenTypes.has(dedupKey)) continue;
    seenTypes.add(dedupKey);

    sortOrder++;

    // Extract relevant input data from audit
    const inputData: Record<string, any> = { source_issue: issue };
    for (const key of mapping.input_keys) {
      if (auditData[key] !== undefined) {
        inputData[key] = auditData[key];
      }
    }

    // Include scores summary
    if (auditData.scores) {
      inputData.scores_summary = {
        total: auditData.scores.total,
        grade: auditData.scores.grade,
      };
    }

    const task = await createMapguardTask({
      client_id: clientId,
      client_service_id: opts?.clientServiceId ?? null,
      audit_report_id: auditReportId,
      task_type: mapping.task_type,
      title: mapping.title,
      description: MAPGUARD_TASK_TYPES[mapping.task_type].description,
      source_type: "audit",
      created_by_system: true,
      status: "pending",
      priority: mapping.priority,
      sort_order: sortOrder,
      waiting_on: null,
      next_step_hint: mapping.next_step_hint,
      input_data: inputData,
    }, { type: "system", name: "audit-to-task-mapper" });

    createdTasks.push(task);
  }

  // Always create a baseline audit review task first if any issues found
  if (createdTasks.length > 0 && !seenTypes.has("baseline_audit_review:Review full audit and prioritize actions")) {
    const baselineTask = await createMapguardTask({
      client_id: clientId,
      client_service_id: opts?.clientServiceId ?? null,
      audit_report_id: auditReportId,
      task_type: "baseline_audit_review",
      title: "Review full audit and prioritize actions",
      description: MAPGUARD_TASK_TYPES.baseline_audit_review.description,
      source_type: "audit",
      created_by_system: true,
      status: "pending",
      priority: "high",
      sort_order: 0,
      waiting_on: "internal",
      next_step_hint: `${detectedIssues.length} issues detected. Review audit report, confirm findings, and prioritize the ${createdTasks.length} generated tasks.`,
      input_data: {
        business_name: report.business_name,
        detected_issues: detectedIssues,
        scores: auditData.scores,
        total_tasks_generated: createdTasks.length,
      },
    }, { type: "system", name: "audit-to-task-mapper" });

    createdTasks.unshift(baselineTask);
  }

  return createdTasks;
}
