/**
 * MapGuard Task Engine
 *
 * Core service for creating, managing, and querying MapGuard tasks.
 * Handles audit-to-task mapping, status transitions, and operational summaries.
 */

import { db } from "../db";
import { mapguardTasks, mapguardTaskActivity } from "@shared/schemas/mapguard";
import { clients, fulfillmentTasks } from "@shared/schemas/adminCrm";
import { auditReports, jobLogs } from "@shared/schemas/db";
import { eq, and, sql, desc, asc, isNull } from "drizzle-orm";
import {
  AUDIT_ISSUE_TO_TASK,
  MAPGUARD_TASK_TYPES,
  MAPGUARD_STATUS_TRANSITIONS,
  isExecutionTask,
  getPlanLimit,
  getPlanLabel,
  DEFAULT_EXECUTION_LIMIT,
  type MapguardTaskType,
  type MapguardTaskStatus,
  type MapguardSourceType,
} from "@shared/mapguardTypes";
import type { InsertMapguardTask, MapguardTask } from "@shared/schemas/mapguard";
import { clientServices, serviceCatalog } from "@shared/schemas/adminCrm";
import { getRecommendedSupplier, MAPGUARD_SUPPLIERS, ASSIGNMENT_TEMPLATES, type SupplierRecommendation } from "@shared/mapguardSuppliers";
import { getLastClientActivityDate } from "./mapguardRetention";

/* ═══════════════════════════════════════════
   EXECUTION LIMIT CONTROL
   ═══════════════════════════════════════════ */

/** Get the active MapGuard plan tier for a client */
export async function getClientPlan(clientId: number): Promise<{ serviceId: string; limit: number; label: string }> {
  // Find the active monthly MapGuard service (basic or pro)
  const [svc] = await db.select({ service_id: clientServices.service_id })
    .from(clientServices)
    .where(and(
      eq(clientServices.client_id, clientId),
      eq(clientServices.status, "active"),
      eq(clientServices.enabled, true),
      sql`${clientServices.service_id} IN ('mapguard-basic', 'mapguard-pro')`,
    ))
    .orderBy(desc(clientServices.created_at))
    .limit(1);

  const serviceId = svc?.service_id || "mapguard-basic";
  return {
    serviceId,
    limit: getPlanLimit(serviceId),
    label: getPlanLabel(serviceId),
  };
}

/** Count execution tasks completed or in-progress this month */
export async function getMonthlyExecutionCount(clientId: number): Promise<number> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const EXEC_TYPES = `'gbp_optimization','citation_cleanup','review_issue_response','competitor_reaction','profile_content_update','photo_upload','post_scheduling','suspension_support'`;

  const [row] = await db.select({ count: sql<number>`count(*)::int` })
    .from(mapguardTasks)
    .where(and(
      eq(mapguardTasks.client_id, clientId),
      sql`${mapguardTasks.task_type} IN (${sql.raw(EXEC_TYPES)})`,
      sql`${mapguardTasks.status} IN ('in_progress', 'waiting_supplier', 'needs_review', 'completed')`,
      sql`(${mapguardTasks.updated_at} >= ${monthStart} OR ${mapguardTasks.completed_at} >= ${monthStart})`,
    ));

  return row?.count || 0;
}

export interface ExecutionUsage {
  used: number;
  limit: number;
  remaining: number;
  plan_label: string;
  at_limit: boolean;
  backlog_count: number;
  upgrade_recommended: boolean;
}

/** Get full execution usage for a client */
export async function getExecutionUsage(clientId: number): Promise<ExecutionUsage> {
  const plan = await getClientPlan(clientId);
  const used = await getMonthlyExecutionCount(clientId);
  const atLimit = used >= plan.limit;

  // Count backlog: execution-type tasks in pending/ready that can't proceed
  const EXEC_TYPES = `'gbp_optimization','citation_cleanup','review_issue_response','competitor_reaction','profile_content_update','photo_upload','post_scheduling','suspension_support'`;
  const [backlogRow] = await db.select({ count: sql<number>`count(*)::int` })
    .from(mapguardTasks)
    .where(and(
      eq(mapguardTasks.client_id, clientId),
      sql`${mapguardTasks.task_type} IN (${sql.raw(EXEC_TYPES)})`,
      sql`${mapguardTasks.status} IN ('pending', 'ready')`,
    ));
  const backlogCount = backlogRow?.count || 0;

  return {
    used,
    limit: plan.limit,
    remaining: Math.max(0, plan.limit - used),
    plan_label: plan.label,
    at_limit: atLimit,
    backlog_count: backlogCount,
    upgrade_recommended: atLimit && backlogCount >= 1,
  };
}

/** Check if a task can proceed to execution. Returns null if OK, or a reason string if blocked. */
export async function checkExecutionGate(clientId: number, taskType: string): Promise<string | null> {
  if (!isExecutionTask(taskType)) return null; // non-execution tasks always pass

  const usage = await getExecutionUsage(clientId);
  if (usage.at_limit) {
    return `Execution limit reached (${usage.used}/${usage.limit} on ${usage.plan_label} plan). Consider upgrading for more monthly optimizations.`;
  }
  return null;
}

/* ═══════════════════════════════════════════
   COST TRACKING & SUPPLIER RECOMMENDATIONS
   ═══════════════════════════════════════════ */

export interface ClientCostSummary {
  total_cost_cents: number;
  task_count: number;
  avg_cost_cents: number;
  revenue_cents: number;
  margin_cents: number;
  margin_pct: number;
  by_supplier: Array<{ supplier: string; cost_cents: number; count: number }>;
}

export async function getClientCostSummary(clientId: number): Promise<ClientCostSummary> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const rows = await db.select({
    assigned_to: mapguardTasks.assigned_to,
    cost_cents: mapguardTasks.cost_cents,
  })
  .from(mapguardTasks)
  .where(and(
    eq(mapguardTasks.client_id, clientId),
    sql`${mapguardTasks.cost_cents} > 0`,
    sql`${mapguardTasks.status} IN ('in_progress', 'waiting_supplier', 'needs_review', 'completed')`,
    sql`(${mapguardTasks.updated_at} >= ${monthStart} OR ${mapguardTasks.completed_at} >= ${monthStart})`,
  ));

  const bySupplier = new Map<string, { cost: number; count: number }>();
  let total = 0;

  for (const row of rows) {
    const name = row.assigned_to || "Unassigned";
    const cost = row.cost_cents || 0;
    total += cost;
    const existing = bySupplier.get(name) || { cost: 0, count: 0 };
    existing.cost += cost;
    existing.count += 1;
    bySupplier.set(name, existing);
  }

  // Get monthly revenue from client's MapGuard plan
  const [revenueRow] = await db.select({ price_cents: clientServices.price_cents })
    .from(clientServices)
    .where(and(
      eq(clientServices.client_id, clientId),
      eq(clientServices.status, "active"),
      sql`${clientServices.service_id} IN ('mapguard-basic', 'mapguard-pro')`,
    ))
    .orderBy(desc(clientServices.created_at))
    .limit(1);

  const revenue = revenueRow?.price_cents || 0;
  const margin = revenue - total;

  return {
    total_cost_cents: total,
    task_count: rows.length,
    avg_cost_cents: rows.length > 0 ? Math.round(total / rows.length) : 0,
    revenue_cents: revenue,
    margin_cents: margin,
    margin_pct: revenue > 0 ? Math.round((margin / revenue) * 100) : 0,
    by_supplier: Array.from(bySupplier.entries()).map(([supplier, { cost, count }]) => ({
      supplier,
      cost_cents: cost,
      count,
    })),
  };
}

export function getSupplierRecommendation(taskType: string): SupplierRecommendation | null {
  return getRecommendedSupplier(taskType as any);
}

export interface SupplierPerformance {
  name: string;
  type: string;
  tasks_completed: number;
  tasks_total: number;
  total_cost_cents: number;
  avg_rating: number | null;
}

export async function getSupplierPerformance(): Promise<SupplierPerformance[]> {
  const rows = await db.select({
    assigned_to: mapguardTasks.assigned_to,
    supplier_type: mapguardTasks.supplier_type,
    status: mapguardTasks.status,
    cost_cents: mapguardTasks.cost_cents,
    metadata: mapguardTasks.metadata,
  })
  .from(mapguardTasks)
  .where(sql`${mapguardTasks.assigned_to} IS NOT NULL AND ${mapguardTasks.assigned_to} != ''`);

  const map = new Map<string, { type: string; completed: number; total: number; cost: number; ratings: number[]; }>();

  for (const row of rows) {
    const name = row.assigned_to || "Unknown";
    const entry = map.get(name) || { type: row.supplier_type || "unknown", completed: 0, total: 0, cost: 0, ratings: [] };
    entry.total++;
    if (row.status === "completed") entry.completed++;
    entry.cost += row.cost_cents || 0;
    const rating = (row.metadata as any)?.supplier_rating;
    if (typeof rating === "number") entry.ratings.push(rating);
    map.set(name, entry);
  }

  return Array.from(map.entries()).map(([name, d]) => ({
    name,
    type: d.type,
    tasks_completed: d.completed,
    tasks_total: d.total,
    total_cost_cents: d.cost,
    avg_rating: d.ratings.length > 0 ? Math.round((d.ratings.reduce((a, b) => a + b, 0) / d.ratings.length) * 10) / 10 : null,
  })).sort((a, b) => b.tasks_total - a.tasks_total);
}

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

  // Execution gate — check when moving to an active execution state
  if (["in_progress", "waiting_supplier"].includes(newStatus) && !["in_progress", "waiting_supplier", "needs_review"].includes(currentStatus)) {
    const gateBlock = await checkExecutionGate(current.client_id, current.task_type);
    if (gateBlock) {
      throw new Error(gateBlock);
    }
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

  // Phase-2.1: when a kickoff task completes, advance the tracking
  // fulfillment_task once all kickoff tasks for the service are done.
  if (newStatus === "completed" && current.client_service_id) {
    try {
      await maybeMarkKickoffDelivered(current.client_service_id);
    } catch (err: any) {
      console.warn(`[mapguard-kickoff] tracker advance failed for cs ${current.client_service_id}: ${err.message}`);
    }
  }

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
   SUPPLIER ASSIGNMENT
   ═══════════════════════════════════════════ */

export async function assignMapguardTask(
  taskId: number,
  assignment: {
    supplier_type: string;      // fiverr | agency | internal
    assigned_to: string;        // freelancer name, agency name, or internal owner
    supplier_ref?: string;      // Fiverr gig URL, agency ticket, etc.
    cost_cents?: number;
    handoff_notes?: string;     // Instructions for the supplier
    next_step_hint?: string;    // Updated guidance
  },
  actor: { type: string; name: string }
): Promise<MapguardTask | null> {
  const [current] = await db.select().from(mapguardTasks).where(eq(mapguardTasks.id, taskId)).limit(1);
  if (!current) return null;

  // Execution gate check
  const gateBlock = await checkExecutionGate(current.client_id, current.task_type);
  if (gateBlock) {
    throw new Error(gateBlock);
  }

  const currentStatus = current.status as MapguardTaskStatus;

  // Determine new status — move to waiting_supplier unless already there
  let newStatus: MapguardTaskStatus = currentStatus;
  if (["ready", "in_progress", "pending"].includes(currentStatus)) {
    newStatus = "waiting_supplier";
  }

  // Validate transition if status is changing
  if (newStatus !== currentStatus) {
    const allowed = MAPGUARD_STATUS_TRANSITIONS[currentStatus];
    if (!allowed?.includes(newStatus)) {
      throw new Error(`Cannot assign from status: ${currentStatus}`);
    }
  }

  const updates: Record<string, any> = {
    supplier_type: assignment.supplier_type,
    assigned_to: assignment.assigned_to,
    supplier_ref: assignment.supplier_ref || null,
    cost_cents: assignment.cost_cents ?? null,
    status: newStatus,
    waiting_on: "supplier",
    updated_at: new Date(),
  };

  if (assignment.next_step_hint) {
    updates.next_step_hint = assignment.next_step_hint;
  } else {
    updates.next_step_hint = `Assigned to ${assignment.assigned_to} (${assignment.supplier_type}). Waiting for deliverable.`;
  }

  // Store handoff notes in metadata
  if (assignment.handoff_notes) {
    const existingMeta = (current.metadata as Record<string, any>) || {};
    updates.metadata = {
      ...existingMeta,
      handoff_notes: assignment.handoff_notes,
      assigned_at: new Date().toISOString(),
      assigned_by: actor.name,
    };
  } else {
    const existingMeta = (current.metadata as Record<string, any>) || {};
    updates.metadata = {
      ...existingMeta,
      assigned_at: new Date().toISOString(),
      assigned_by: actor.name,
    };
  }

  const [updated] = await db.update(mapguardTasks).set(updates).where(eq(mapguardTasks.id, taskId)).returning();

  // Log assignment
  await db.insert(mapguardTaskActivity).values({
    task_id: taskId,
    action: "assigned",
    actor_type: actor.type,
    actor_name: actor.name,
    from_status: currentStatus,
    to_status: newStatus,
    summary: `Assigned to ${assignment.assigned_to} (${assignment.supplier_type})${assignment.handoff_notes ? ` — "${assignment.handoff_notes}"` : ""}`,
    metadata: {
      supplier_type: assignment.supplier_type,
      assigned_to: assignment.assigned_to,
      supplier_ref: assignment.supplier_ref,
      cost_cents: assignment.cost_cents,
    },
  });

  return updated;
}

/* ═══════════════════════════════════════════
   STRUCTURED RESULT SUBMISSION
   ═══════════════════════════════════════════ */

export async function submitMapguardResult(
  taskId: number,
  result: {
    summary: string;
    deliverable_type?: string;   // text | link | file | report
    deliverable_url?: string;    // link to deliverable (Fiverr delivery, Google Doc, etc.)
    deliverable_text?: string;   // text deliverable (description copy, review response draft, etc.)
    notes?: string;
  },
  actor: { type: string; name: string }
): Promise<MapguardTask | null> {
  const [current] = await db.select().from(mapguardTasks).where(eq(mapguardTasks.id, taskId)).limit(1);
  if (!current) return null;

  const currentStatus = current.status as MapguardTaskStatus;

  // Build structured result_data
  const resultData: Record<string, any> = {
    ...(current.result_data as Record<string, any> || {}),
    summary: result.summary,
    submitted_at: new Date().toISOString(),
    submitted_by: actor.name,
  };
  if (result.deliverable_type) resultData.deliverable_type = result.deliverable_type;
  if (result.deliverable_url) resultData.deliverable_url = result.deliverable_url;
  if (result.deliverable_text) resultData.deliverable_text = result.deliverable_text;
  if (result.notes) resultData.notes = result.notes;

  // Determine new status — auto-transition to needs_review
  let newStatus: MapguardTaskStatus = currentStatus;
  if (["in_progress", "waiting_supplier"].includes(currentStatus)) {
    newStatus = "needs_review";
  }

  const updates: Record<string, any> = {
    result_data: resultData,
    status: newStatus,
    waiting_on: "internal",
    next_step_hint: "Result submitted. Review the deliverable and approve, request changes, or reject.",
    updated_at: new Date(),
  };

  const [updated] = await db.update(mapguardTasks).set(updates).where(eq(mapguardTasks.id, taskId)).returning();

  // Log submission
  await db.insert(mapguardTaskActivity).values({
    task_id: taskId,
    action: "result_submitted",
    actor_type: actor.type,
    actor_name: actor.name,
    from_status: currentStatus,
    to_status: newStatus,
    summary: `Result submitted: ${result.summary}`,
    metadata: {
      deliverable_type: result.deliverable_type,
      has_url: !!result.deliverable_url,
      has_text: !!result.deliverable_text,
    },
  });

  return updated;
}

/* ═══════════════════════════════════════════
   REJECT / REQUEST FOLLOW-UP
   ═══════════════════════════════════════════ */

export async function rejectMapguardResult(
  taskId: number,
  rejection: {
    reason: string;
    send_back_to_supplier?: boolean; // true = waiting_supplier, false = in_progress (internal rework)
  },
  actor: { type: string; name: string }
): Promise<MapguardTask | null> {
  const [current] = await db.select().from(mapguardTasks).where(eq(mapguardTasks.id, taskId)).limit(1);
  if (!current) return null;

  const currentStatus = current.status as MapguardTaskStatus;

  // Should only reject from needs_review
  if (currentStatus !== "needs_review") {
    throw new Error(`Can only reject from needs_review, current status: ${currentStatus}`);
  }

  const newStatus: MapguardTaskStatus = rejection.send_back_to_supplier ? "waiting_supplier" : "in_progress";

  // Store rejection in result_data history
  const existingResult = (current.result_data as Record<string, any>) || {};
  const rejections = existingResult._rejections || [];
  rejections.push({
    reason: rejection.reason,
    rejected_at: new Date().toISOString(),
    rejected_by: actor.name,
  });

  const updates: Record<string, any> = {
    status: newStatus,
    waiting_on: rejection.send_back_to_supplier ? "supplier" : "internal",
    next_step_hint: rejection.send_back_to_supplier
      ? `Result rejected: ${rejection.reason}. Waiting for supplier revision.`
      : `Result rejected: ${rejection.reason}. Needs internal rework.`,
    result_data: { ...existingResult, _rejections: rejections },
    updated_at: new Date(),
  };

  const [updated] = await db.update(mapguardTasks).set(updates).where(eq(mapguardTasks.id, taskId)).returning();

  // Log rejection
  await db.insert(mapguardTaskActivity).values({
    task_id: taskId,
    action: "result_rejected",
    actor_type: actor.type,
    actor_name: actor.name,
    from_status: "needs_review",
    to_status: newStatus,
    summary: `Result rejected: ${rejection.reason}`,
    metadata: {
      send_back: rejection.send_back_to_supplier,
      rejection_count: rejections.length,
    },
  });

  return updated;
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
  execution: ExecutionUsage;
  last_client_activity: string | null;
  days_since_activity: number | null;
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

  const result = {
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
    execution: await getExecutionUsage(clientId),
    last_client_activity: null as string | null,
    days_since_activity: null as number | null,
    next_recommended: nextTask || null,
  };

  // Compute last client-visible activity
  try {
    const lastDate = await getLastClientActivityDate(clientId);
    if (lastDate) {
      result.last_client_activity = lastDate.toISOString();
      result.days_since_activity = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    }
  } catch { /* non-critical */ }

  return result;
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

/* ═══════════════════════════════════════════
   ACTIVATION KICKOFF (Phase-2 + Phase-2.1)
   ═══════════════════════════════════════════
   Called when a MapGuard service is paid/activated.

   - Idempotent via client_service.metadata.mapguard_kickoff_at
   - Backfills clients.metadata.place_id from clients.google_place_id
     (the monitor reads from metadata; onboarding writes the column)
   - mapguard-setup → 6 fixed kickoff tasks
   - mapguard-basic / mapguard-pro → 1 baseline_audit_review task
   - Creates ONE fulfillment_task tracker so the existing
     checkAndCompleteService() cascade can advance the service to
     "active"/"completed" once all kickoff mapguard_tasks are done
   - Triggers a first scan, wrapped in a job_logs row so we can see
     success/failure in the existing ops dashboard
   ═══════════════════════════════════════════ */

const KICKOFF_TRACKER_FLAG = "mapguard_kickoff_tracker";

const SETUP_KICKOFF_TASKS: Array<{
  task_type: MapguardTaskType;
  title: string;
  next_step_hint: string;
}> = [
  {
    task_type: "baseline_audit_review",
    title: "Review baseline visibility data",
    next_step_hint: "Run an audit (or import an existing one) and confirm the issues to address in this MapSetup sprint.",
  },
  {
    task_type: "gbp_optimization",
    title: "Optimize Google Business Profile",
    next_step_hint: "Categories, services, areas, business description (≤750 chars), keyword tuning.",
  },
  {
    task_type: "photo_upload",
    title: "Upload business photos",
    next_step_hint: "Storefront, team, and recent work photos. Optimize file names and tags.",
  },
  {
    task_type: "post_scheduling",
    title: "Publish initial GBP posts",
    next_step_hint: "Create and schedule 3–4 launch posts covering services + a CTA.",
  },
  {
    task_type: "citation_cleanup",
    title: "Audit and fix business citations",
    next_step_hint: "Check NAP consistency across major directories and submit corrections.",
  },
  {
    task_type: "manual_followup",
    title: "Send before/after visibility report",
    next_step_hint: "After the sprint, generate a before/after summary from snapshots and email the client.",
  },
];

/**
 * Phase-2.1: Run a logged first scan as a fire-and-forget job.
 * Writes start/finish rows to job_logs so success/failure is visible in
 * the same ops surface that the weekly cron uses. Never throws.
 */
async function runFirstScanWithLogging(clientId: number, clientServiceId: number): Promise<void> {
  let logId: number | null = null;
  try {
    const [log] = await db.insert(jobLogs).values({
      job_name: "mapguard_first_scan",
      status: "running",
      started_at: new Date(),
      metadata: { client_id: clientId, client_service_id: clientServiceId } as any,
    }).returning({ id: jobLogs.id });
    logId = log?.id ?? null;
  } catch (err: any) {
    console.warn(`[mapguard-kickoff] could not create job_log for first scan: ${err.message}`);
  }

  try {
    const { getActiveMapguardClients, runMapguardScan } = await import("./mapguardMonitor");
    const active = await getActiveMapguardClients();
    const target = active.find(c => c.client_id === clientId && c.client_service_id === clientServiceId);

    if (!target) {
      const reason = "service_not_active_or_no_place_id";
      console.log(`[mapguard-kickoff] first scan skipped (${reason}) for client ${clientId}`);
      if (logId != null) {
        await db.update(jobLogs).set({
          status: "completed",
          finished_at: new Date(),
          metadata: { client_id: clientId, client_service_id: clientServiceId, skipped: reason } as any,
        }).where(eq(jobLogs.id, logId));
      }
      return;
    }

    const result = await runMapguardScan(target);
    console.log(`[mapguard-kickoff] first scan completed for client ${clientId}: score=${result.snapshot.score_total}, tasks=${result.tasksCreated}`);
    if (logId != null) {
      await db.update(jobLogs).set({
        status: "completed",
        finished_at: new Date(),
        metadata: {
          client_id: clientId,
          client_service_id: clientServiceId,
          score: result.snapshot.score_total,
          tasks_created: result.tasksCreated,
          alerts_sent: result.alertsSent,
        } as any,
      }).where(eq(jobLogs.id, logId));
    }
  } catch (err: any) {
    console.error(`[mapguard-kickoff] first scan failed for client ${clientId}: ${err.message}`);
    if (logId != null) {
      try {
        await db.update(jobLogs).set({
          status: "failed",
          finished_at: new Date(),
          error_message: err.message,
        }).where(eq(jobLogs.id, logId));
      } catch { /* best effort */ }
    }
  }
}

/**
 * Phase-2.1: When a kickoff mapguard_task moves to "completed", check whether
 * all kickoff tasks for the same client_service are complete. If so, mark the
 * tracker fulfillment_task as "delivered" so the existing
 * checkAndCompleteService() cascade can flip the service status.
 */
async function maybeMarkKickoffDelivered(clientServiceId: number): Promise<void> {
  // Find the tracker row.
  const trackers = await db.select()
    .from(fulfillmentTasks)
    .where(eq(fulfillmentTasks.client_service_id, clientServiceId));

  const tracker = trackers.find(t => {
    const meta = (t.metadata as Record<string, any>) || {};
    return meta[KICKOFF_TRACKER_FLAG] === true;
  });
  if (!tracker || tracker.status === "delivered" || tracker.status === "cancelled") return;

  // Are there still uncompleted kickoff mapguard_tasks for this service?
  const [pending] = await db.select({ total: sql<number>`count(*)::int` })
    .from(mapguardTasks)
    .where(and(
      eq(mapguardTasks.client_service_id, clientServiceId),
      eq(mapguardTasks.created_by_system, true),
      sql`${mapguardTasks.status} NOT IN ('completed', 'cancelled')`,
    ));
  if ((pending?.total ?? 1) > 0) return;

  // All done — mark tracker delivered and let the existing cascade fire.
  await db.update(fulfillmentTasks)
    .set({
      status: "delivered",
      completed_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(fulfillmentTasks.id, tracker.id));

  // Drive the existing service-completion cascade. Imported lazily to avoid
  // a circular dep (storage imports kickoffMapguardService for the activation hook).
  try {
    const { storage } = await import("../storage");
    await storage.checkAndCompleteService(clientServiceId);
  } catch (err: any) {
    console.warn(`[mapguard-kickoff] checkAndCompleteService failed for cs ${clientServiceId}: ${err.message}`);
  }
}

export async function kickoffMapguardService(
  clientId: number,
  clientServiceId: number,
  serviceId: string,
): Promise<{ kickedOff: boolean; reason?: string; tasksCreated: number }> {
  if (!serviceId.startsWith("mapguard")) {
    return { kickedOff: false, reason: "not_mapguard", tasksCreated: 0 };
  }

  const [cs] = await db.select().from(clientServices)
    .where(eq(clientServices.id, clientServiceId))
    .limit(1);
  if (!cs) return { kickedOff: false, reason: "service_not_found", tasksCreated: 0 };

  const csMeta = (cs.metadata as Record<string, any>) || {};
  if (csMeta.mapguard_kickoff_at) {
    return { kickedOff: false, reason: "already_kicked_off", tasksCreated: 0 };
  }

  // Backfill place_id into clients.metadata if missing (monitor reads from there).
  try {
    const [client] = await db.select({
      google_place_id: clients.google_place_id,
      metadata: clients.metadata,
    }).from(clients).where(eq(clients.id, clientId)).limit(1);

    if (client) {
      const existingMeta = (client.metadata as Record<string, any>) || {};
      if (!existingMeta.place_id && client.google_place_id) {
        await db.update(clients)
          .set({
            metadata: { ...existingMeta, place_id: client.google_place_id },
            updated_at: new Date(),
          })
          .where(eq(clients.id, clientId));
      }
    }
  } catch (err: any) {
    console.warn(`[mapguard-kickoff] place_id backfill failed for client ${clientId}: ${err.message}`);
  }

  const created: MapguardTask[] = [];

  if (serviceId === "mapguard-setup") {
    let order = 1;
    for (const t of SETUP_KICKOFF_TASKS) {
      try {
        const task = await createMapguardTask({
          client_id: clientId,
          client_service_id: clientServiceId,
          task_type: t.task_type,
          title: t.title,
          description: MAPGUARD_TASK_TYPES[t.task_type].description,
          source_type: "system",
          created_by_system: true,
          status: "pending",
          priority: MAPGUARD_TASK_TYPES[t.task_type].default_priority,
          sort_order: order++,
          waiting_on: "internal",
          next_step_hint: t.next_step_hint,
        }, { type: "system", name: "mapguard-kickoff" });
        created.push(task);
      } catch (err: any) {
        console.warn(`[mapguard-kickoff] Failed to create ${t.task_type} for service ${clientServiceId}: ${err.message}`);
      }
    }
  } else {
    // Ongoing tier (basic / pro): just seed a baseline_audit_review task.
    try {
      const task = await createMapguardTask({
        client_id: clientId,
        client_service_id: clientServiceId,
        task_type: "baseline_audit_review",
        title: "Review baseline visibility and prioritize first month's work",
        description: MAPGUARD_TASK_TYPES.baseline_audit_review.description,
        source_type: "system",
        created_by_system: true,
        status: "pending",
        priority: "high",
        sort_order: 0,
        waiting_on: "internal",
        next_step_hint: "Run a fresh audit (admin → From Audit) or wait for the next weekly scan to seed monitoring.",
      }, { type: "system", name: "mapguard-kickoff" });
      created.push(task);
    } catch (err: any) {
      console.warn(`[mapguard-kickoff] Failed to create baseline task for service ${clientServiceId}: ${err.message}`);
    }
  }

  // Phase-2.1: tracker fulfillment_task so service completion can cascade
  // through the existing checkAndCompleteService() pipeline once all
  // kickoff mapguard_tasks reach "completed".
  try {
    await db.insert(fulfillmentTasks).values({
      client_service_id: clientServiceId,
      client_id: clientId,
      title: "MapGuard delivery (auto-tracked)",
      description: "Tracker row. Auto-marked delivered when all initial MapGuard kickoff tasks are completed.",
      status: "not_started",
      priority: "normal",
      sort_order: 999,
      handled_by: "internal",
      waiting_on: "internal",
      actor_type: "system",
      metadata: { [KICKOFF_TRACKER_FLAG]: true, kickoff_task_count: created.length } as any,
    });
  } catch (err: any) {
    console.warn(`[mapguard-kickoff] tracker fulfillment_task insert failed for cs ${clientServiceId}: ${err.message}`);
  }

  // Mark kickoff done so we don't double-fire on webhook replay.
  await db.update(clientServices)
    .set({
      metadata: {
        ...csMeta,
        mapguard_kickoff_at: new Date().toISOString(),
        mapguard_kickoff_tasks: created.length,
      } as any,
      updated_at: new Date(),
    } as any)
    .where(eq(clientServices.id, clientServiceId));

  // Phase-2.1: logged, non-blocking first scan. Failure is captured in
  // job_logs and never crashes the activation path.
  void runFirstScanWithLogging(clientId, clientServiceId);

  return { kickedOff: true, tasksCreated: created.length };
}
