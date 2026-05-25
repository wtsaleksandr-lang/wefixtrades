/**
 * Async job queue storage helpers extracted from server/storage.ts.
 *
 * Pure functions over `db` — no `this`, no cross-method calls (intra-module
 * helpers call each other directly). The DatabaseStorage class re-exports
 * these through thin wrappers so the public API stays byte-identical.
 *
 * Tables touched: job_logs, notification_queue, followup_jobs.
 *
 * Scope: generic async job-execution scaffolding shared across QuoteQuick
 * surfaces — job-log audit rows (createJobLog/updateJobLog), the
 * notification queue (enqueue/fetchDue/update/list/recent-count), and the
 * follow-up scheduler (enqueueJobs/fetchDue/update/list/cancelForLead).
 * All three tables follow the same status/attempts/max_attempts polling
 * pattern, which is why they live together.
 */

import { db } from "../db";
import {
  jobLogs,
  notificationQueue,
  followupJobs,
  type JobLog, type InsertJobLog,
  type NotificationQueue, type InsertNotificationQueue,
  type FollowupJob, type InsertFollowupJob,
} from "@shared/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

export async function createJobLog(data: InsertJobLog): Promise<JobLog> {
  const [log] = await db.insert(jobLogs).values(data).returning();
  return log;
}

export async function updateJobLog(id: number, updates: Partial<InsertJobLog>): Promise<void> {
  await db.update(jobLogs).set(updates).where(eq(jobLogs.id, id));
}

export async function enqueueNotification(data: InsertNotificationQueue): Promise<NotificationQueue> {
  const [notif] = await db.insert(notificationQueue).values(data).returning();
  return notif;
}

export async function fetchDueNotifications(limit = 20): Promise<NotificationQueue[]> {
  return db.select().from(notificationQueue)
    .where(and(
      eq(notificationQueue.status, 'pending'),
      sql`${notificationQueue.attempts} < ${notificationQueue.max_attempts}`,
    ))
    .orderBy(notificationQueue.created_at)
    .limit(limit);
}

export async function updateNotification(id: number, updates: Record<string, any>): Promise<void> {
  await db.update(notificationQueue).set(updates).where(eq(notificationQueue.id, id));
}

export async function getNotificationLogs(calculatorId: number, limit = 50): Promise<NotificationQueue[]> {
  return db.select().from(notificationQueue)
    .where(eq(notificationQueue.calculator_id, calculatorId))
    .orderBy(desc(notificationQueue.created_at))
    .limit(limit);
}

export async function getRecentNotificationCount(calculatorId: number, windowMinutes: number): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  const [result] = await db.select({ count: sql<number>`count(*)::int` })
    .from(notificationQueue)
    .where(and(
      eq(notificationQueue.calculator_id, calculatorId),
      gte(notificationQueue.created_at, since),
    ));
  return result?.count || 0;
}

export async function enqueueFollowupJobs(data: InsertFollowupJob[]): Promise<FollowupJob[]> {
  if (data.length === 0) return [];
  return db.insert(followupJobs).values(data).returning();
}

export async function fetchDueFollowups(limit = 20): Promise<FollowupJob[]> {
  const now = new Date();
  return db.select().from(followupJobs)
    .where(and(
      eq(followupJobs.status, 'pending'),
      lte(followupJobs.run_at, now),
      sql`${followupJobs.attempts} < ${followupJobs.max_attempts}`,
    ))
    .orderBy(followupJobs.run_at)
    .limit(limit);
}

export async function updateFollowupJob(id: number, updates: Record<string, any>): Promise<void> {
  await db.update(followupJobs).set(updates).where(eq(followupJobs.id, id));
}

export async function getFollowupLogs(calculatorId: number, limit = 50): Promise<FollowupJob[]> {
  return db.select().from(followupJobs)
    .where(eq(followupJobs.calculator_id, calculatorId))
    .orderBy(desc(followupJobs.created_at))
    .limit(limit);
}

export async function cancelFollowupsForLead(leadId: number): Promise<void> {
  await db.update(followupJobs)
    .set({ status: 'cancelled' })
    .where(and(eq(followupJobs.lead_id, leadId), eq(followupJobs.status, 'pending')));
}
