/**
 * Reputation storage helpers extracted from server/storage.ts.
 *
 * Pure functions over `db` — no `this`, no cross-method calls (intra-module
 * helpers call each other directly). The DatabaseStorage class re-exports
 * these through thin wrappers so the public API stays byte-identical.
 *
 * Tables touched: review_requests, review_request_suppression,
 * review_response_edits, monitored_reviews, google_business_locations,
 * clients (widget token + reputation-sync lookups), client_services
 * (reputation service lookup).
 *
 * Powers the ReputationShield product:
 *   - outbound review-request lifecycle (send / follow-up / suppression)
 *   - inbound monitored-review ingest + response-edit audit trail
 *   - multi-location Google Business Profile mapping
 *   - public widget endpoints (token issuance, displayed reviews)
 *
 * Scope note: the per-platform Reviews table (raw Google/Facebook
 * sync rows) lives in ./reviews.ts. This module covers the
 * review-request lifecycle and the curated monitored-review feed
 * that the inbox UI consumes.
 */

import crypto from "crypto";
import { db } from "../db";
import {
  reviewRequests,
  reviewRequestSuppression,
  reviewResponseEdits,
  monitoredReviews,
  googleBusinessLocations,
  clients,
  clientServices,
  type ReviewRequest, type InsertReviewRequest,
  type MonitoredReview, type InsertMonitoredReview,
  type GoogleLocation, type InsertGoogleLocation,
  type Client,
} from "@shared/schema";
import { and, desc, eq, lte, sql } from "drizzle-orm";

// ═══════════════════════════════════════════════
// Review Requests
// ═══════════════════════════════════════════════

export async function createReviewRequest(data: InsertReviewRequest): Promise<ReviewRequest> {
  const [row] = await db.insert(reviewRequests).values(data).returning();
  return row;
}

export async function findReviewRequestByIdempotencyKey(key: string): Promise<ReviewRequest | undefined> {
  const [row] = await db.select().from(reviewRequests)
    .where(eq(reviewRequests.idempotency_key, key))
    .limit(1);
  return row;
}

export async function getReviewRequestByDedupKey(key: string): Promise<ReviewRequest | undefined> {
  const [row] = await db.select().from(reviewRequests)
    .where(eq(reviewRequests.dedup_key, key))
    .limit(1);
  return row;
}

export async function getReviewRequestByToken(token: string): Promise<ReviewRequest | undefined> {
  const [row] = await db.select().from(reviewRequests)
    .where(eq(reviewRequests.access_token, token))
    .limit(1);
  return row;
}

export async function getReviewRequestById(id: number): Promise<ReviewRequest | undefined> {
  const [row] = await db.select().from(reviewRequests)
    .where(eq(reviewRequests.id, id))
    .limit(1);
  return row;
}

export async function fetchDueReviewRequests(limit = 20): Promise<ReviewRequest[]> {
  const now = new Date();
  return db.select().from(reviewRequests)
    .where(and(
      eq(reviewRequests.status, "pending"),
      lte(reviewRequests.run_at, now),
      sql`${reviewRequests.attempts} < ${reviewRequests.max_attempts}`,
    ))
    .orderBy(reviewRequests.run_at)
    .limit(limit);
}

export async function fetchDueReviewFollowups(limit = 20): Promise<ReviewRequest[]> {
  const now = new Date();
  return db.select().from(reviewRequests)
    .where(and(
      eq(reviewRequests.status, "sent"),
      sql`${reviewRequests.next_followup_at} IS NOT NULL`,
      lte(reviewRequests.next_followup_at, now),
      sql`${reviewRequests.sequence_step} < 2`,
    ))
    .orderBy(reviewRequests.next_followup_at)
    .limit(limit);
}

export async function updateReviewRequest(id: number, updates: Record<string, any>): Promise<ReviewRequest | undefined> {
  const [row] = await db.update(reviewRequests)
    .set({ ...updates, updated_at: new Date() })
    .where(eq(reviewRequests.id, id))
    .returning();
  return row;
}

function buildReviewRequestConditions(opts: { clientId?: number; status?: string; triggerSource?: string; hasFeedback?: boolean; dueForFollowup?: boolean }) {
  const conditions = [];
  if (opts.clientId) conditions.push(eq(reviewRequests.client_id, opts.clientId));
  if (opts.status) conditions.push(eq(reviewRequests.status, opts.status));
  if (opts.triggerSource) conditions.push(eq(reviewRequests.trigger_source, opts.triggerSource));
  if (opts.hasFeedback === true) conditions.push(sql`${reviewRequests.internal_feedback} IS NOT NULL`);
  if (opts.hasFeedback === false) conditions.push(sql`${reviewRequests.internal_feedback} IS NULL`);
  if (opts.dueForFollowup) {
    conditions.push(eq(reviewRequests.status, "sent"));
    conditions.push(sql`${reviewRequests.next_followup_at} IS NOT NULL`);
    conditions.push(lte(reviewRequests.next_followup_at, new Date()));
    conditions.push(sql`${reviewRequests.sequence_step} < 2`);
  }
  return conditions.length ? and(...conditions) : undefined;
}

export async function listReviewRequests(
  clientIdOrOpts: number | { clientId?: number; status?: string; triggerSource?: string; hasFeedback?: boolean; dueForFollowup?: boolean; limit?: number; offset?: number } = {},
  limitArg?: number,
): Promise<ReviewRequest[]> {
  const opts = typeof clientIdOrOpts === "number"
    ? { clientId: clientIdOrOpts, limit: limitArg }
    : clientIdOrOpts;
  const { limit = 50, offset = 0 } = opts;
  const where = buildReviewRequestConditions(opts);
  return db.select().from(reviewRequests)
    .where(where)
    .orderBy(desc(reviewRequests.created_at))
    .limit(limit)
    .offset(offset);
}

export async function countReviewRequests(opts: { clientId?: number; status?: string; triggerSource?: string; hasFeedback?: boolean; dueForFollowup?: boolean } = {}): Promise<number> {
  const where = buildReviewRequestConditions(opts);
  const [row] = await db.select({ count: sql<number>`count(*)::int` })
    .from(reviewRequests)
    .where(where);
  return row?.count ?? 0;
}

export async function getReviewRequestStats(): Promise<{ total: number; pending: number; sent: number; clicked: number; routed_positive: number; routed_negative: number; feedback_captured: number; completed: number; failed: number; stopped: number; due_for_followup: number }> {
  const now = new Date();
  const [row] = await db.select({
    total: sql<number>`count(*)::int`,
    pending: sql<number>`count(*) filter (where ${reviewRequests.status} = 'pending')::int`,
    sent: sql<number>`count(*) filter (where ${reviewRequests.status} = 'sent')::int`,
    clicked: sql<number>`count(*) filter (where ${reviewRequests.status} = 'clicked')::int`,
    routed_positive: sql<number>`count(*) filter (where ${reviewRequests.status} = 'routed_positive')::int`,
    routed_negative: sql<number>`count(*) filter (where ${reviewRequests.status} = 'routed_negative')::int`,
    feedback_captured: sql<number>`count(*) filter (where ${reviewRequests.status} = 'feedback_captured')::int`,
    completed: sql<number>`count(*) filter (where ${reviewRequests.status} = 'completed')::int`,
    failed: sql<number>`count(*) filter (where ${reviewRequests.status} = 'failed')::int`,
    stopped: sql<number>`count(*) filter (where ${reviewRequests.status} = 'stopped')::int`,
    due_for_followup: sql<number>`count(*) filter (where ${reviewRequests.status} = 'sent' and ${reviewRequests.next_followup_at} is not null and ${reviewRequests.next_followup_at} <= ${now} and ${reviewRequests.sequence_step} < 2)::int`,
  }).from(reviewRequests);
  return row || { total: 0, pending: 0, sent: 0, clicked: 0, routed_positive: 0, routed_negative: 0, feedback_captured: 0, completed: 0, failed: 0, stopped: 0, due_for_followup: 0 };
}

export async function stopReviewRequestsForBooking(bookingId: number): Promise<void> {
  await db.update(reviewRequests)
    .set({ status: "stopped", updated_at: new Date() })
    .where(and(
      eq(reviewRequests.booking_id, bookingId),
      sql`${reviewRequests.status} IN ('pending', 'sent')`,
    ));
}

// ═══════════════════════════════════════════════
// Review-request suppression (DNC)
// ═══════════════════════════════════════════════

export async function isReviewRequestSuppressed(
  clientId: number,
  customerEmail: string | null,
  customerPhone: string | null,
): Promise<boolean> {
  if (!customerEmail && !customerPhone) return false;
  // Email lowercased at the boundary so a plain equality match hits the
  // unique index. The DB index is no longer on lower() (Drizzle-kit had
  // an operator-class bug there); we enforce case-insensitivity here.
  const normalizedEmail = customerEmail ? customerEmail.trim().toLowerCase() : null;
  const conditions: any[] = [];
  if (normalizedEmail) {
    conditions.push(eq(reviewRequestSuppression.customer_email, normalizedEmail));
  }
  if (customerPhone) {
    conditions.push(eq(reviewRequestSuppression.customer_phone, customerPhone));
  }
  const [row] = await db.select({ id: reviewRequestSuppression.id })
    .from(reviewRequestSuppression)
    .where(and(
      eq(reviewRequestSuppression.client_id, clientId),
      sql`(${sql.join(conditions, sql` OR `)})`,
    ))
    .limit(1);
  return !!row;
}

export async function addReviewRequestSuppression(data: {
  client_id: number;
  customer_email?: string | null;
  customer_phone?: string | null;
  reason?: string;
  source?: string;
  suppressed_by?: number | null;
  metadata?: any;
}): Promise<{ id: number }> {
  // Normalize email to lowercase before insert so the unique index works
  // as case-insensitive. See isReviewRequestSuppressed for the matching
  // lookup-side normalization.
  const normalizedEmail = data.customer_email
    ? data.customer_email.trim().toLowerCase()
    : null;
  const [row] = await db.insert(reviewRequestSuppression).values({
    client_id: data.client_id,
    customer_email: normalizedEmail,
    customer_phone: data.customer_phone ?? null,
    reason: data.reason ?? null,
    source: data.source ?? "manual",
    suppressed_by: data.suppressed_by ?? null,
    metadata: data.metadata ?? null,
  }).returning({ id: reviewRequestSuppression.id });
  return row!;
}

export async function listReviewRequestSuppression(
  clientId: number,
  opts: { limit?: number; offset?: number } = {},
): Promise<Array<{
  id: number;
  customer_email: string | null;
  customer_phone: string | null;
  reason: string | null;
  source: string;
  created_at: Date | null;
}>> {
  const rows = await db.select({
    id: reviewRequestSuppression.id,
    customer_email: reviewRequestSuppression.customer_email,
    customer_phone: reviewRequestSuppression.customer_phone,
    reason: reviewRequestSuppression.reason,
    source: reviewRequestSuppression.source,
    created_at: reviewRequestSuppression.created_at,
  })
    .from(reviewRequestSuppression)
    .where(eq(reviewRequestSuppression.client_id, clientId))
    .orderBy(desc(reviewRequestSuppression.created_at))
    .limit(opts.limit ?? 100)
    .offset(opts.offset ?? 0);
  return rows;
}

export async function removeReviewRequestSuppression(clientId: number, id: number): Promise<boolean> {
  const result = await db.delete(reviewRequestSuppression)
    .where(and(
      eq(reviewRequestSuppression.id, id),
      eq(reviewRequestSuppression.client_id, clientId),
    ))
    .returning({ id: reviewRequestSuppression.id });
  return result.length > 0;
}

// ═══════════════════════════════════════════════
// Multi-location Google Business Profile
// ═══════════════════════════════════════════════

export async function listGoogleLocations(clientId: number): Promise<GoogleLocation[]> {
  return db.select()
    .from(googleBusinessLocations)
    .where(eq(googleBusinessLocations.client_id, clientId))
    .orderBy(desc(googleBusinessLocations.is_primary), googleBusinessLocations.location_name);
}

export async function addGoogleLocation(data: InsertGoogleLocation): Promise<GoogleLocation> {
  // If marked primary on insert, demote any existing primary first.
  if (data.is_primary) {
    await db.update(googleBusinessLocations)
      .set({ is_primary: false, updated_at: new Date() })
      .where(and(
        eq(googleBusinessLocations.client_id, data.client_id),
        eq(googleBusinessLocations.is_primary, true),
      ));
  }
  const [row] = await db.insert(googleBusinessLocations).values(data).returning();
  return row!;
}

export async function updateGoogleLocation(id: number, updates: Partial<InsertGoogleLocation>): Promise<GoogleLocation | undefined> {
  const [row] = await db.update(googleBusinessLocations)
    .set({ ...updates, updated_at: new Date() })
    .where(eq(googleBusinessLocations.id, id))
    .returning();
  return row;
}

export async function setPrimaryGoogleLocation(clientId: number, locationId: number): Promise<boolean> {
  // Demote current primary, promote the target, in a single transaction.
  return await db.transaction(async (tx) => {
    await tx.update(googleBusinessLocations)
      .set({ is_primary: false, updated_at: new Date() })
      .where(and(
        eq(googleBusinessLocations.client_id, clientId),
        eq(googleBusinessLocations.is_primary, true),
      ));
    const updated = await tx.update(googleBusinessLocations)
      .set({ is_primary: true, updated_at: new Date() })
      .where(and(
        eq(googleBusinessLocations.id, locationId),
        eq(googleBusinessLocations.client_id, clientId),
      ))
      .returning({ id: googleBusinessLocations.id });
    return updated.length > 0;
  });
}

export async function removeGoogleLocation(clientId: number, locationId: number): Promise<boolean> {
  const result = await db.delete(googleBusinessLocations)
    .where(and(
      eq(googleBusinessLocations.id, locationId),
      eq(googleBusinessLocations.client_id, clientId),
    ))
    .returning({ id: googleBusinessLocations.id });
  return result.length > 0;
}

// ═══════════════════════════════════════════════
// Rate-limit counters
// ═══════════════════════════════════════════════

/**
 * Count successful review-request sends today (UTC) for a client.
 * Used by the service layer to enforce the daily SMS/email cap.
 */
export async function countReviewRequestSendsToday(clientId: number, channel?: "sms" | "email"): Promise<number> {
  const conditions: any[] = [
    eq(reviewRequests.client_id, clientId),
    sql`${reviewRequests.sent_at} >= date_trunc('day', NOW())`,
    sql`${reviewRequests.status} IN ('sent', 'delivered')`,
  ];
  if (channel) conditions.push(eq(reviewRequests.channel, channel));
  const [row] = await db.select({ n: sql<number>`COUNT(*)::int` })
    .from(reviewRequests)
    .where(and(...conditions));
  return row?.n ?? 0;
}

// ═══════════════════════════════════════════════
// Response edit audit
// ═══════════════════════════════════════════════

export async function appendReviewResponseEdit(data: {
  monitored_review_id: number;
  edited_by?: number | null;
  edit_kind: string;
  old_text?: string | null;
  new_text?: string | null;
  reason?: string | null;
  metadata?: any;
}): Promise<{ id: number }> {
  const [row] = await db.insert(reviewResponseEdits).values({
    monitored_review_id: data.monitored_review_id,
    edited_by: data.edited_by ?? null,
    edit_kind: data.edit_kind,
    old_text: data.old_text ?? null,
    new_text: data.new_text ?? null,
    reason: data.reason ?? null,
    metadata: data.metadata ?? null,
  }).returning({ id: reviewResponseEdits.id });
  return row!;
}

export async function listReviewResponseEdits(monitoredReviewId: number): Promise<Array<{
  id: number;
  edited_by: number | null;
  edit_kind: string;
  old_text: string | null;
  new_text: string | null;
  reason: string | null;
  created_at: Date | null;
}>> {
  return db.select({
    id: reviewResponseEdits.id,
    edited_by: reviewResponseEdits.edited_by,
    edit_kind: reviewResponseEdits.edit_kind,
    old_text: reviewResponseEdits.old_text,
    new_text: reviewResponseEdits.new_text,
    reason: reviewResponseEdits.reason,
    created_at: reviewResponseEdits.created_at,
  })
    .from(reviewResponseEdits)
    .where(eq(reviewResponseEdits.monitored_review_id, monitoredReviewId))
    .orderBy(desc(reviewResponseEdits.created_at));
}

// ═══════════════════════════════════════════════
// Monitored Reviews
// ═══════════════════════════════════════════════

export async function findMonitoredReviewByDedupKey(dedupKey: string): Promise<MonitoredReview | undefined> {
  const [row] = await db.select().from(monitoredReviews)
    .where(eq(monitoredReviews.dedup_key, dedupKey))
    .limit(1);
  return row;
}

export async function upsertMonitoredReview(data: InsertMonitoredReview): Promise<{ review: MonitoredReview; isNew: boolean }> {
  // Check if already exists
  const existing = await findMonitoredReviewByDedupKey(data.dedup_key);
  if (existing) {
    // Update if response was added or review text changed
    const updates: Record<string, any> = { last_synced_at: new Date(), updated_at: new Date() };
    let changed = false;

    if (data.response_text && !existing.response_text) {
      updates.response_text = data.response_text;
      updates.response_date = data.response_date;
      updates.response_added = true;
      changed = true;
    }
    if (data.review_text && data.review_text !== existing.review_text) {
      updates.review_text = data.review_text;
      changed = true;
    }
    if (data.raw_payload) {
      updates.raw_payload = data.raw_payload;
    }
    // Backfill google_review_name if we now have it but didn't before
    if (data.google_review_name && !existing.google_review_name) {
      updates.google_review_name = data.google_review_name;
    }

    const [updated] = await db.update(monitoredReviews)
      .set(updates)
      .where(eq(monitoredReviews.id, existing.id))
      .returning();
    return { review: updated, isNew: false };
  }

  // Insert new
  const [row] = await db.insert(monitoredReviews).values(data).returning();
  return { review: row, isNew: true };
}

export async function getMonitoredReviewById(id: number): Promise<MonitoredReview | undefined> {
  const [row] = await db.select().from(monitoredReviews)
    .where(eq(monitoredReviews.id, id))
    .limit(1);
  return row;
}

export async function updateMonitoredReview(id: number, updates: Record<string, any>): Promise<MonitoredReview | undefined> {
  const [row] = await db.update(monitoredReviews)
    .set({ ...updates, updated_at: new Date() })
    .where(eq(monitoredReviews.id, id))
    .returning();
  return row;
}

export async function listMonitoredReviews(opts: { clientId?: number; platform?: string; isNew?: boolean; minRating?: number; maxRating?: number; limit?: number; offset?: number } = {}): Promise<MonitoredReview[]> {
  const { clientId, platform, isNew, minRating, maxRating, limit = 50, offset = 0 } = opts;
  const conditions = [];
  if (clientId) conditions.push(eq(monitoredReviews.client_id, clientId));
  if (platform) conditions.push(eq(monitoredReviews.platform, platform));
  if (isNew !== undefined) conditions.push(eq(monitoredReviews.is_new, isNew));
  if (minRating) conditions.push(sql`${monitoredReviews.rating} >= ${minRating}`);
  if (maxRating) conditions.push(sql`${monitoredReviews.rating} <= ${maxRating}`);
  const where = conditions.length ? and(...conditions) : undefined;
  return db.select().from(monitoredReviews)
    .where(where)
    .orderBy(desc(monitoredReviews.published_at))
    .limit(limit).offset(offset);
}

export async function countMonitoredReviews(opts: { clientId?: number; isNew?: boolean } = {}): Promise<number> {
  const conditions = [];
  if (opts.clientId) conditions.push(eq(monitoredReviews.client_id, opts.clientId));
  if (opts.isNew !== undefined) conditions.push(eq(monitoredReviews.is_new, opts.isNew));
  const where = conditions.length ? and(...conditions) : undefined;
  const [row] = await db.select({ count: sql<number>`count(*)::int` })
    .from(monitoredReviews).where(where);
  return row?.count ?? 0;
}

export async function getMonitoredReviewStats(clientId?: number): Promise<{ total: number; averageRating: number; newCount: number; withResponse: number; byRating: Record<number, number> }> {
  const cond = clientId ? eq(monitoredReviews.client_id, clientId) : undefined;
  const [row] = await db.select({
    total: sql<number>`count(*)::int`,
    averageRating: sql<number>`coalesce(round(avg(${monitoredReviews.rating})::numeric, 2), 0)::float`,
    newCount: sql<number>`count(*) filter (where ${monitoredReviews.is_new} = true)::int`,
    withResponse: sql<number>`count(*) filter (where ${monitoredReviews.response_text} is not null)::int`,
    r1: sql<number>`count(*) filter (where ${monitoredReviews.rating} = 1)::int`,
    r2: sql<number>`count(*) filter (where ${monitoredReviews.rating} = 2)::int`,
    r3: sql<number>`count(*) filter (where ${monitoredReviews.rating} = 3)::int`,
    r4: sql<number>`count(*) filter (where ${monitoredReviews.rating} = 4)::int`,
    r5: sql<number>`count(*) filter (where ${monitoredReviews.rating} = 5)::int`,
  }).from(monitoredReviews).where(cond);
  return {
    total: row?.total ?? 0,
    averageRating: row?.averageRating ?? 0,
    newCount: row?.newCount ?? 0,
    withResponse: row?.withResponse ?? 0,
    byRating: { 1: row?.r1 ?? 0, 2: row?.r2 ?? 0, 3: row?.r3 ?? 0, 4: row?.r4 ?? 0, 5: row?.r5 ?? 0 },
  };
}

export async function markMonitoredReviewsAcknowledged(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await db.update(monitoredReviews)
    .set({ is_new: false, updated_at: new Date() })
    .where(sql`${monitoredReviews.id} = ANY(ARRAY[${sql.raw(ids.join(","))}]::int[])`);
}

export async function listClientsForReviewSync(limit = 20): Promise<Client[]> {
  return db.select().from(clients)
    .where(and(
      sql`(${clients.google_place_id} IS NOT NULL OR ${clients.facebook_page_url} IS NOT NULL)`,
      sql`${clients.status} IN ('active', 'onboarding')`,
    ))
    .orderBy(sql`${clients.last_review_sync_at} ASC NULLS FIRST`)
    .limit(limit);
}

export async function getClientReputationService(clientId: number): Promise<{ serviceId: string; status: string; metadata: any } | null> {
  const [row] = await db.select({
    serviceId: clientServices.service_id,
    status: clientServices.status,
    metadata: clientServices.metadata,
  }).from(clientServices)
    .where(and(
      eq(clientServices.client_id, clientId),
      sql`${clientServices.service_id} LIKE 'reputationshield-%'`,
      sql`${clientServices.status} IN ('active', 'onboarding', 'pending')`,
    ))
    .limit(1);
  return row ?? null;
}

export async function getClientByWidgetToken(token: string): Promise<Client | undefined> {
  const [row] = await db.select().from(clients)
    .where(eq(clients.widget_token, token))
    .limit(1);
  return row;
}

export async function ensureWidgetToken(clientId: number): Promise<string> {
  const [existing] = await db.select({ widget_token: clients.widget_token })
    .from(clients).where(eq(clients.id, clientId)).limit(1);
  if (existing?.widget_token) return existing.widget_token;
  const token = crypto.randomUUID().replace(/-/g, "");
  await db.update(clients).set({ widget_token: token, updated_at: new Date() })
    .where(eq(clients.id, clientId));
  return token;
}

export async function getWidgetReviews(clientId: number, minRating: number, limit: number): Promise<{ reviewer_name: string; rating: number; review_text: string | null; published_at: Date | null; platform: string }[]> {
  return db.select({
    reviewer_name: monitoredReviews.reviewer_name,
    rating: monitoredReviews.rating,
    review_text: monitoredReviews.review_text,
    published_at: monitoredReviews.published_at,
    platform: monitoredReviews.platform,
  }).from(monitoredReviews)
    .where(and(
      eq(monitoredReviews.client_id, clientId),
      sql`${monitoredReviews.rating} >= ${minRating}`,
      sql`${monitoredReviews.review_text} IS NOT NULL`,
      sql`length(${monitoredReviews.review_text}) > 10`,
    ))
    .orderBy(desc(monitoredReviews.published_at))
    .limit(limit);
}

export async function countReviewsMissingGoogleName(clientId?: number): Promise<number> {
  const conditions = [
    eq(monitoredReviews.platform, "google"),
    sql`${monitoredReviews.google_review_name} IS NULL`,
    sql`${monitoredReviews.response_text} IS NULL`,
  ];
  if (clientId) conditions.push(eq(monitoredReviews.client_id, clientId));
  const [row] = await db.select({ count: sql<number>`count(*)::int` })
    .from(monitoredReviews).where(and(...conditions));
  return row?.count ?? 0;
}
