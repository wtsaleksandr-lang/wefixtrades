/**
 * Reviews storage helpers extracted from server/storage.ts.
 *
 * Pure functions over `db` — no `this`, no cross-method calls (intra-module
 * helpers call each other directly). The DatabaseStorage class re-exports
 * these through thin wrappers so the public API (used by ~151 consumers)
 * stays byte-identical.
 *
 * Tables touched: reviews, review_sync_logs.
 *
 * Scope note: this module covers the per-platform Reviews table only
 * (Google/Facebook review rows ingested by the sync workers).
 * Review-request lifecycle (review_requests, suppression, monitored_reviews,
 * google_business_locations) is a separate concern and remains in
 * storage.ts for now.
 */

import { db } from "../db";
import {
  reviews as reviewsTable,
  reviewSyncLogs,
  type Review, type InsertReview,
  type ReviewSyncLog, type InsertReviewSyncLog,
} from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";

export async function getReviewByExternalId(
  clientId: number,
  platform: string,
  externalId: string,
): Promise<Review | undefined> {
  const [row] = await db.select().from(reviewsTable)
    .where(and(
      eq(reviewsTable.client_id, clientId),
      eq(reviewsTable.platform, platform),
      eq(reviewsTable.external_review_id, externalId),
    ))
    .limit(1);
  return row;
}

export async function upsertReview(data: InsertReview): Promise<Review> {
  const existing = await getReviewByExternalId(data.client_id, data.platform, data.external_review_id);
  if (existing) {
    const [row] = await db.update(reviewsTable)
      .set({ ...data, updated_at: new Date() })
      .where(eq(reviewsTable.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db.insert(reviewsTable).values(data).returning();
  return row;
}

export async function listReviews(
  clientId: number,
  opts: { platform?: string; needsReply?: boolean; limit?: number } = {},
): Promise<Review[]> {
  const { platform, needsReply, limit = 50 } = opts;
  const conditions = [eq(reviewsTable.client_id, clientId)];
  if (platform) conditions.push(eq(reviewsTable.platform, platform));
  if (needsReply !== undefined) conditions.push(eq(reviewsTable.needs_reply, needsReply));
  return db.select().from(reviewsTable)
    .where(and(...conditions))
    .orderBy(desc(reviewsTable.review_time))
    .limit(limit);
}

export async function updateReview(id: number, updates: Partial<InsertReview>): Promise<Review | undefined> {
  const [row] = await db.update(reviewsTable)
    .set({ ...updates, updated_at: new Date() })
    .where(eq(reviewsTable.id, id))
    .returning();
  return row;
}

export async function createReviewSyncLog(data: InsertReviewSyncLog): Promise<ReviewSyncLog> {
  const [row] = await db.insert(reviewSyncLogs).values(data).returning();
  return row;
}
