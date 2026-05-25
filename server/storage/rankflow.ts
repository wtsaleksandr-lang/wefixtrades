/**
 * RankFlow storage helpers extracted from server/storage.ts.
 *
 * Pure functions over `db` — no `this`, no cross-method calls. The
 * DatabaseStorage class re-exports these through thin wrappers so the
 * public API (used by ~151 consumers) stays byte-identical.
 *
 * Tables touched: rankflow_profiles, rankflow_monthly_plans,
 * rankflow_tasks, rankflow_qa_checks, rankflow_progress,
 * rankflow_vendor_batches, rankflow_keywords, rankflow_rankings,
 * rankflow_pages, rankflow_signals.
 *
 * Powers the RankFlow product (local-SEO monthly task engine: monthly
 * plans + per-client tasks executed AI/in-house/outsourced, QA flow,
 * vendor batching, keyword rank tracking, page indexing, signal
 * summaries).
 */

import { db } from "../db";
import {
  rankflowProfiles, rankflowMonthlyPlans, rankflowTasks, rankflowQaChecks,
  rankflowProgress, rankflowVendorBatches, rankflowKeywords, rankflowRankings,
  rankflowPages, rankflowSignals,
  type RankflowProfile, type InsertRankflowProfile,
  type RankflowMonthlyPlan, type InsertRankflowMonthlyPlan,
  type RankflowTask, type InsertRankflowTask,
  type RankflowQaCheck, type InsertRankflowQaCheck,
  type RankflowProgress, type InsertRankflowProgress,
  type RankflowVendorBatch, type InsertRankflowVendorBatch,
  type RankflowKeyword, type InsertRankflowKeyword,
  type RankflowRanking, type InsertRankflowRanking,
  type RankflowPage, type InsertRankflowPage,
  type RankflowSignal, type InsertRankflowSignal,
} from "@shared/schema";
import { and, desc, eq, sql } from "drizzle-orm";

// ─── Profile ────────────────────────────────────────────────────────────

export async function getRankFlowProfile(clientId: number): Promise<RankflowProfile | undefined> {
  const [row] = await db.select().from(rankflowProfiles).where(eq(rankflowProfiles.client_id, clientId)).limit(1);
  return row;
}

export async function upsertRankFlowProfile(clientId: number, data: Partial<InsertRankflowProfile>): Promise<RankflowProfile> {
  const existing = await getRankFlowProfile(clientId);
  if (existing) {
    const [updated] = await db.update(rankflowProfiles)
      .set({ ...data, updated_at: new Date() })
      .where(eq(rankflowProfiles.client_id, clientId))
      .returning();
    return updated;
  }
  const [created] = await db.insert(rankflowProfiles)
    .values({ ...data, client_id: clientId } as InsertRankflowProfile)
    .returning();
  return created;
}

export async function listEnabledRankFlowProfiles(): Promise<RankflowProfile[]> {
  return db.select().from(rankflowProfiles).where(eq(rankflowProfiles.enabled, true));
}

// ─── Monthly Plans ──────────────────────────────────────────────────────

export async function createMonthlyPlan(data: InsertRankflowMonthlyPlan): Promise<RankflowMonthlyPlan> {
  const [row] = await db.insert(rankflowMonthlyPlans).values(data).returning();
  return row;
}

export async function getMonthlyPlan(clientId: number, month: string): Promise<RankflowMonthlyPlan | undefined> {
  const [row] = await db.select().from(rankflowMonthlyPlans)
    .where(and(eq(rankflowMonthlyPlans.client_id, clientId), eq(rankflowMonthlyPlans.month, month)))
    .limit(1);
  return row;
}

export async function updateMonthlyPlanStatus(planId: number, status: string): Promise<void> {
  await db.update(rankflowMonthlyPlans).set({ status }).where(eq(rankflowMonthlyPlans.id, planId));
}

// ─── Tasks ──────────────────────────────────────────────────────────────

export async function createRankFlowTask(data: InsertRankflowTask): Promise<RankflowTask> {
  const [row] = await db.insert(rankflowTasks).values(data).returning();
  return row;
}

export async function listTasksByClient(clientId: number): Promise<RankflowTask[]> {
  return db.select().from(rankflowTasks)
    .where(eq(rankflowTasks.client_id, clientId))
    .orderBy(desc(rankflowTasks.created_at));
}

export async function listTasksByPlan(planId: number): Promise<RankflowTask[]> {
  return db.select().from(rankflowTasks)
    .where(eq(rankflowTasks.plan_id, planId))
    .orderBy(rankflowTasks.priority);
}

export async function updateRankFlowTaskStatus(taskId: number, status: string): Promise<RankflowTask | undefined> {
  const updates: Record<string, any> = { status };
  if (status === "done") updates.completed_at = new Date();
  const [row] = await db.update(rankflowTasks).set(updates).where(eq(rankflowTasks.id, taskId)).returning();
  return row;
}

export async function getRankFlowTaskById(taskId: number): Promise<RankflowTask | undefined> {
  const [row] = await db.select().from(rankflowTasks).where(eq(rankflowTasks.id, taskId)).limit(1);
  return row;
}

export async function assignRankflowTask(taskId: number, assignedTo: string): Promise<RankflowTask | undefined> {
  const [row] = await db.update(rankflowTasks).set({
    status: "assigned",
    assigned_to: assignedTo,
    assigned_at: new Date(),
  }).where(eq(rankflowTasks.id, taskId)).returning();
  return row;
}

export async function startRankflowTask(taskId: number): Promise<RankflowTask | undefined> {
  const [row] = await db.update(rankflowTasks).set({
    status: "in_progress",
  }).where(eq(rankflowTasks.id, taskId)).returning();
  return row;
}

export async function submitRankflowTask(taskId: number, proofData: any): Promise<RankflowTask | undefined> {
  const [row] = await db.update(rankflowTasks).set({
    status: "submitted",
    submitted_at: new Date(),
    proof_data: proofData,
  }).where(eq(rankflowTasks.id, taskId)).returning();
  return row;
}

export async function updateRankflowTaskQA(taskId: number, qaStatus: string, qaNotes: string | null): Promise<RankflowTask | undefined> {
  const [row] = await db.update(rankflowTasks).set({
    status: "qa_review",
    qa_status: qaStatus,
    qa_notes: qaNotes,
  }).where(eq(rankflowTasks.id, taskId)).returning();
  return row;
}

export async function approveRankflowTask(taskId: number, actualCost?: string): Promise<RankflowTask | undefined> {
  const updates: Record<string, any> = {
    status: "done",
    qa_status: "passed",
    completed_at: new Date(),
  };
  if (actualCost !== undefined) updates.actual_cost = actualCost;
  const [row] = await db.update(rankflowTasks).set(updates).where(eq(rankflowTasks.id, taskId)).returning();
  return row;
}

export async function rejectRankflowTask(taskId: number, rejectionReason: string): Promise<RankflowTask | undefined> {
  const [row] = await db.update(rankflowTasks).set({
    status: "assigned",
    qa_status: "failed",
    rejection_reason: rejectionReason,
    submitted_at: null,
    proof_data: null,
  }).where(eq(rankflowTasks.id, taskId)).returning();
  return row;
}

export async function listPendingAITasks(planId: number): Promise<RankflowTask[]> {
  return db.select().from(rankflowTasks).where(
    and(
      eq(rankflowTasks.plan_id, planId),
      eq(rankflowTasks.execution_mode, "ai"),
      eq(rankflowTasks.status, "pending"),
    )
  );
}

// ─── QA Checks ──────────────────────────────────────────────────────────

export async function createQACheck(data: InsertRankflowQaCheck): Promise<RankflowQaCheck> {
  const [row] = await db.insert(rankflowQaChecks).values(data).returning();
  return row;
}

export async function listQAChecks(taskId: number): Promise<RankflowQaCheck[]> {
  return db.select().from(rankflowQaChecks).where(eq(rankflowQaChecks.task_id, taskId));
}

// ─── Monthly Progress ───────────────────────────────────────────────────

export async function upsertMonthlyProgress(clientId: number, month: string, data: Partial<InsertRankflowProgress>): Promise<RankflowProgress> {
  const [existing] = await db.select().from(rankflowProgress)
    .where(and(eq(rankflowProgress.client_id, clientId), eq(rankflowProgress.month, month)))
    .limit(1);
  if (existing) {
    const [updated] = await db.update(rankflowProgress)
      .set(data)
      .where(eq(rankflowProgress.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db.insert(rankflowProgress)
    .values({ client_id: clientId, month, ...data } as InsertRankflowProgress)
    .returning();
  return created;
}

export async function getMonthlyProgress(clientId: number, month: string): Promise<RankflowProgress | undefined> {
  const [row] = await db.select().from(rankflowProgress)
    .where(and(eq(rankflowProgress.client_id, clientId), eq(rankflowProgress.month, month)))
    .limit(1);
  return row;
}

// ─── Vendor Batches ─────────────────────────────────────────────────────

export async function createRankflowVendorBatch(data: InsertRankflowVendorBatch): Promise<RankflowVendorBatch> {
  const [row] = await db.insert(rankflowVendorBatches).values(data).returning();
  return row;
}

export async function getRankflowVendorBatch(batchId: number): Promise<RankflowVendorBatch | undefined> {
  const [row] = await db.select().from(rankflowVendorBatches).where(eq(rankflowVendorBatches.id, batchId)).limit(1);
  return row;
}

export async function listRankflowVendorBatches(filters?: { status?: string; vendor_type?: string }): Promise<RankflowVendorBatch[]> {
  const conditions = [];
  if (filters?.status) conditions.push(eq(rankflowVendorBatches.status, filters.status));
  if (filters?.vendor_type) conditions.push(eq(rankflowVendorBatches.vendor_type, filters.vendor_type));
  if (conditions.length > 0) {
    return db.select().from(rankflowVendorBatches)
      .where(and(...conditions))
      .orderBy(desc(rankflowVendorBatches.created_at));
  }
  return db.select().from(rankflowVendorBatches).orderBy(desc(rankflowVendorBatches.created_at));
}

export async function updateRankflowVendorBatchStatus(batchId: number, status: string, extra?: Record<string, any>): Promise<RankflowVendorBatch | undefined> {
  const updates: Record<string, any> = { status, updated_at: new Date(), ...extra };
  const [row] = await db.update(rankflowVendorBatches).set(updates).where(eq(rankflowVendorBatches.id, batchId)).returning();
  return row;
}

export async function submitRankflowVendorBatch(batchId: number, proofData: any): Promise<RankflowVendorBatch | undefined> {
  const [row] = await db.update(rankflowVendorBatches).set({
    status: "submitted",
    proof_data: proofData,
    submitted_at: new Date(),
    updated_at: new Date(),
  }).where(eq(rankflowVendorBatches.id, batchId)).returning();
  return row;
}

export async function linkTaskToBatch(taskId: number, batchId: number): Promise<void> {
  await db.update(rankflowTasks).set({ batch_id: batchId }).where(eq(rankflowTasks.id, taskId));
}

export async function listTasksByBatch(batchId: number): Promise<RankflowTask[]> {
  return db.select().from(rankflowTasks)
    .where(eq(rankflowTasks.batch_id, batchId))
    .orderBy(rankflowTasks.id);
}

export async function completeRankflowVendorBatch(batchId: number, actualCost?: string): Promise<RankflowVendorBatch | undefined> {
  const updates: Record<string, any> = {
    status: "completed",
    qa_status: "passed",
    completed_at: new Date(),
    updated_at: new Date(),
  };
  if (actualCost !== undefined) updates.actual_cost = actualCost;
  const [row] = await db.update(rankflowVendorBatches).set(updates).where(eq(rankflowVendorBatches.id, batchId)).returning();
  return row;
}

export async function listUnbatchedOutsourcedTasks(): Promise<RankflowTask[]> {
  return db.select().from(rankflowTasks).where(
    and(
      eq(rankflowTasks.execution_mode, "outsourced"),
      eq(rankflowTasks.status, "pending"),
      sql`${rankflowTasks.batch_id} IS NULL`,
    )
  );
}

export async function getVendorStats(vendorType?: string): Promise<{
  vendor_type: string;
  total_batches: number;
  completed: number;
  failed: number;
  avg_cost: number | null;
}[]> {
  const rows = await db.select({
    vendor_type: rankflowVendorBatches.vendor_type,
    total_batches: sql<number>`count(*)::int`,
    completed: sql<number>`count(*) filter (where ${rankflowVendorBatches.status} = 'completed')::int`,
    failed: sql<number>`count(*) filter (where ${rankflowVendorBatches.status} = 'failed')::int`,
    avg_cost: sql<number>`avg(${rankflowVendorBatches.actual_cost}::numeric)`,
  }).from(rankflowVendorBatches)
    .groupBy(rankflowVendorBatches.vendor_type);
  return rows.map(r => ({
    vendor_type: r.vendor_type,
    total_batches: r.total_batches,
    completed: r.completed,
    failed: r.failed,
    avg_cost: r.avg_cost ? Number(r.avg_cost) : null,
  }));
}

// ─── Tracking (Keywords / Rankings / Pages / Signals) ───────────────────

export async function createKeywords(data: InsertRankflowKeyword[]): Promise<RankflowKeyword[]> {
  if (data.length === 0) return [];
  const rows = await db.insert(rankflowKeywords).values(data).returning();
  return rows;
}

export async function listKeywordsByClient(clientId: number): Promise<RankflowKeyword[]> {
  return db.select().from(rankflowKeywords)
    .where(eq(rankflowKeywords.client_id, clientId))
    .orderBy(desc(rankflowKeywords.priority));
}

export async function insertRankingRecord(data: InsertRankflowRanking): Promise<RankflowRanking> {
  const [row] = await db.insert(rankflowRankings).values(data).returning();
  return row;
}

export async function getLastRankingForKeyword(keywordId: number): Promise<RankflowRanking | undefined> {
  const [row] = await db.select().from(rankflowRankings)
    .where(eq(rankflowRankings.keyword_id, keywordId))
    .orderBy(desc(rankflowRankings.checked_at))
    .limit(1);
  return row;
}

export async function upsertPage(clientId: number, url: string, data: Partial<InsertRankflowPage>): Promise<RankflowPage> {
  const [existing] = await db.select().from(rankflowPages)
    .where(and(eq(rankflowPages.client_id, clientId), eq(rankflowPages.url, url)))
    .limit(1);
  if (existing) {
    const [updated] = await db.update(rankflowPages)
      .set(data)
      .where(eq(rankflowPages.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db.insert(rankflowPages)
    .values({ client_id: clientId, url, ...data } as InsertRankflowPage)
    .returning();
  return created;
}

export async function listPagesByClient(clientId: number): Promise<RankflowPage[]> {
  return db.select().from(rankflowPages)
    .where(eq(rankflowPages.client_id, clientId))
    .orderBy(desc(rankflowPages.created_at));
}

export async function updatePageIndexStatus(pageId: number, indexed: boolean): Promise<void> {
  await db.update(rankflowPages).set({ indexed, last_checked_at: new Date() }).where(eq(rankflowPages.id, pageId));
}

export async function upsertSignalSummary(clientId: number, data: Partial<InsertRankflowSignal>): Promise<RankflowSignal> {
  const [existing] = await db.select().from(rankflowSignals)
    .where(eq(rankflowSignals.client_id, clientId))
    .limit(1);
  if (existing) {
    const [updated] = await db.update(rankflowSignals)
      .set({ ...data, last_updated: new Date() })
      .where(eq(rankflowSignals.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db.insert(rankflowSignals)
    .values({ client_id: clientId, ...data } as InsertRankflowSignal)
    .returning();
  return created;
}

export async function getSignalSummary(clientId: number): Promise<RankflowSignal | undefined> {
  const [row] = await db.select().from(rankflowSignals)
    .where(eq(rankflowSignals.client_id, clientId))
    .limit(1);
  return row;
}
