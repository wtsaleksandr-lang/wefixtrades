/**
 * SocialSync storage helpers extracted from server/storage.ts.
 *
 * Pure functions over `db` — no `this`, no cross-method calls. The
 * DatabaseStorage class re-exports these through thin wrappers so the
 * public API (used by ~151 consumers) stays byte-identical.
 *
 * Tables touched: socialsync_profiles, socialsync_topics, socialsync_posts,
 * socialsync_publish_queue, socialsync_activity_logs,
 * socialsync_platform_connections.
 */

import { db } from "../db";
import {
  socialsyncProfiles,
  socialsyncTopics,
  socialsyncPosts,
  socialsyncPublishQueue,
  socialsyncActivityLogs,
  socialsyncPlatformConnections,
  type SocialSyncProfile, type InsertSocialSyncProfile,
  type SocialSyncTopic, type InsertSocialSyncTopic,
  type SocialSyncPost, type InsertSocialSyncPost,
  type SocialSyncQueueItem, type InsertSocialSyncQueueItem,
  type SocialSyncActivityLog, type InsertSocialSyncActivityLog,
  type SocialSyncConnection, type InsertSocialSyncConnection,
} from "@shared/schema";
import { and, desc, eq, lte, sql } from "drizzle-orm";

export async function upsertSocialSyncProfile(data: InsertSocialSyncProfile): Promise<SocialSyncProfile> {
  const [row] = await db.insert(socialsyncProfiles).values(data)
    .onConflictDoUpdate({ target: socialsyncProfiles.client_id, set: { ...data, updated_at: new Date() } })
    .returning();
  return row;
}

export async function getSocialSyncProfile(clientId: number): Promise<SocialSyncProfile | undefined> {
  const [row] = await db.select().from(socialsyncProfiles)
    .where(eq(socialsyncProfiles.client_id, clientId))
    .limit(1);
  return row;
}

export async function createSocialSyncTopic(data: InsertSocialSyncTopic): Promise<SocialSyncTopic> {
  const [row] = await db.insert(socialsyncTopics).values(data).returning();
  return row;
}

export async function createSocialSyncTopics(data: InsertSocialSyncTopic[]): Promise<SocialSyncTopic[]> {
  if (data.length === 0) return [];
  return db.insert(socialsyncTopics).values(data).returning();
}

export async function listSocialSyncTopics(clientId: number, status?: string): Promise<SocialSyncTopic[]> {
  const conditions = [eq(socialsyncTopics.client_id, clientId)];
  if (status) conditions.push(eq(socialsyncTopics.status, status));
  return db.select().from(socialsyncTopics)
    .where(and(...conditions))
    .orderBy(desc(socialsyncTopics.created_at));
}

export async function updateSocialSyncTopic(id: number, updates: Partial<InsertSocialSyncTopic>): Promise<SocialSyncTopic | undefined> {
  const [row] = await db.update(socialsyncTopics)
    .set({ ...updates, updated_at: new Date() })
    .where(eq(socialsyncTopics.id, id))
    .returning();
  return row;
}

export async function createSocialSyncPost(data: InsertSocialSyncPost): Promise<SocialSyncPost> {
  const [row] = await db.insert(socialsyncPosts).values(data).returning();
  return row;
}

export async function listSocialSyncPosts(clientId: number, opts: { status?: string; platform?: string; limit?: number; offset?: number } = {}): Promise<SocialSyncPost[]> {
  const { status, platform, limit = 50, offset = 0 } = opts;
  const conditions = [eq(socialsyncPosts.client_id, clientId)];
  if (status) conditions.push(eq(socialsyncPosts.status, status));
  if (platform) conditions.push(eq(socialsyncPosts.platform, platform));
  return db.select().from(socialsyncPosts)
    .where(and(...conditions))
    .orderBy(desc(socialsyncPosts.created_at))
    .limit(limit)
    .offset(offset);
}

export async function getSocialSyncPostById(id: number): Promise<SocialSyncPost | undefined> {
  const [row] = await db.select().from(socialsyncPosts)
    .where(eq(socialsyncPosts.id, id))
    .limit(1);
  return row;
}

export async function updateSocialSyncPost(id: number, updates: Partial<InsertSocialSyncPost>): Promise<SocialSyncPost | undefined> {
  const [row] = await db.update(socialsyncPosts)
    .set({ ...updates, updated_at: new Date() })
    .where(eq(socialsyncPosts.id, id))
    .returning();
  return row;
}

export async function enqueueSocialSyncJob(data: InsertSocialSyncQueueItem): Promise<SocialSyncQueueItem> {
  const [row] = await db.insert(socialsyncPublishQueue).values(data).returning();
  return row;
}

export async function fetchDueSocialSyncJobs(limit = 20): Promise<SocialSyncQueueItem[]> {
  const now = new Date();
  return db.select().from(socialsyncPublishQueue)
    .where(and(
      eq(socialsyncPublishQueue.status, "pending"),
      lte(socialsyncPublishQueue.run_at, now),
      sql`${socialsyncPublishQueue.attempts} < ${socialsyncPublishQueue.max_attempts}`,
      sql`${socialsyncPublishQueue.locked_at} IS NULL`,
    ))
    .orderBy(socialsyncPublishQueue.run_at)
    .limit(limit);
}

export async function updateSocialSyncQueueItem(id: number, updates: Record<string, any>): Promise<void> {
  await db.update(socialsyncPublishQueue).set(updates).where(eq(socialsyncPublishQueue.id, id));
}

export async function listSocialSyncQueue(clientId: number): Promise<SocialSyncQueueItem[]> {
  return db.select().from(socialsyncPublishQueue)
    .where(eq(socialsyncPublishQueue.client_id, clientId))
    .orderBy(desc(socialsyncPublishQueue.created_at));
}

export async function createSocialSyncLog(data: InsertSocialSyncActivityLog): Promise<SocialSyncActivityLog> {
  const [row] = await db.insert(socialsyncActivityLogs).values(data).returning();
  return row;
}

export async function listSocialSyncLogs(clientId: number, limit = 50): Promise<SocialSyncActivityLog[]> {
  return db.select().from(socialsyncActivityLogs)
    .where(eq(socialsyncActivityLogs.client_id, clientId))
    .orderBy(desc(socialsyncActivityLogs.created_at))
    .limit(limit);
}

export async function upsertSocialSyncConnection(data: InsertSocialSyncConnection): Promise<SocialSyncConnection> {
  const existing = await db.select().from(socialsyncPlatformConnections)
    .where(and(
      eq(socialsyncPlatformConnections.client_id, data.client_id),
      eq(socialsyncPlatformConnections.platform, data.platform),
    ))
    .limit(1);
  if (existing.length > 0) {
    const [row] = await db.update(socialsyncPlatformConnections)
      .set({ ...data, updated_at: new Date() })
      .where(eq(socialsyncPlatformConnections.id, existing[0].id))
      .returning();
    return row;
  }
  const [row] = await db.insert(socialsyncPlatformConnections).values(data).returning();
  return row;
}

export async function listSocialSyncConnections(clientId: number): Promise<SocialSyncConnection[]> {
  return db.select().from(socialsyncPlatformConnections)
    .where(eq(socialsyncPlatformConnections.client_id, clientId))
    .orderBy(socialsyncPlatformConnections.platform);
}

export async function listEnabledSocialSyncProfiles(): Promise<SocialSyncProfile[]> {
  return db.select().from(socialsyncProfiles)
    .where(eq(socialsyncProfiles.enabled, true));
}

export async function listRecentSocialSyncPosts(clientId: number, limit = 30): Promise<SocialSyncPost[]> {
  return db.select().from(socialsyncPosts)
    .where(eq(socialsyncPosts.client_id, clientId))
    .orderBy(desc(socialsyncPosts.created_at))
    .limit(limit);
}

export async function listAllSocialSyncConnections(): Promise<SocialSyncConnection[]> {
  return db.select().from(socialsyncPlatformConnections)
    .where(sql`${socialsyncPlatformConnections.connection_status} IN ('connected', 'expiring_soon')`)
    .orderBy(socialsyncPlatformConnections.token_expires_at);
}

export async function fetchStaleSocialSyncLocks(thresholdMs: number): Promise<SocialSyncQueueItem[]> {
  const cutoff = new Date(Date.now() - thresholdMs);
  return db.select().from(socialsyncPublishQueue)
    .where(and(
      eq(socialsyncPublishQueue.status, "locked"),
      lte(socialsyncPublishQueue.locked_at, cutoff),
    ))
    .orderBy(socialsyncPublishQueue.locked_at)
    .limit(50);
}
