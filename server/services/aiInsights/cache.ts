/**
 * AI Insights — 24h DB-backed cache (Wave 7).
 *
 * Stores the most-recent Claude-generated insights result per client and
 * returns it on subsequent reads if `expires_at > now()`. Otherwise the
 * route layer regenerates and persists a fresh entry.
 *
 * One row per client (we delete previous rows on insert to keep the table
 * tiny). The expires_at index supports a future cleanup job; for now we
 * just rely on overwrite-on-write.
 */
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "../../db";
import { aiInsightsCache, aiInsightsDismissedActions } from "@shared/schema";
import type { AiInsightsResult } from "./insightGenerator";
import { createLogger } from "../../lib/logger";
import crypto from "crypto";

const log = createLogger("AiInsightsCache");

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function getCached(clientId: number): Promise<AiInsightsResult | null> {
  try {
    const [row] = await db
      .select({
        result_json: aiInsightsCache.result_json,
        generated_at: aiInsightsCache.generated_at,
        expires_at: aiInsightsCache.expires_at,
        model: aiInsightsCache.model,
      })
      .from(aiInsightsCache)
      .where(and(
        eq(aiInsightsCache.client_id, clientId),
        gt(aiInsightsCache.expires_at, new Date()),
      ))
      .orderBy(desc(aiInsightsCache.generated_at))
      .limit(1);

    if (!row) return null;

    const blob = row.result_json as any;
    return {
      summary: blob.summary,
      actions: blob.actions,
      generatedAt: row.generated_at,
      cacheKey: blob.cacheKey ?? "",
      model: row.model ?? "unknown",
    };
  } catch (err: any) {
    log.warn("ai_insights cache read failed — treating as miss", { error: err?.message });
    return null;
  }
}

export async function persist(clientId: number, result: AiInsightsResult): Promise<void> {
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
  try {
    // Delete previous entries for this client (keep the table small —
    // we only ever need the latest result per client).
    await db.delete(aiInsightsCache).where(eq(aiInsightsCache.client_id, clientId));
    await db.insert(aiInsightsCache).values({
      client_id: clientId,
      result_json: {
        summary: result.summary,
        actions: result.actions,
        cacheKey: result.cacheKey,
      } as any,
      generated_at: result.generatedAt,
      expires_at: expiresAt,
      model: result.model,
    });
  } catch (err: any) {
    log.warn("ai_insights cache write failed — non-fatal", { error: err?.message });
  }
}

/** Returns the timestamp of the most recent cache entry for rate-limit
 *  decisions (refresh endpoint enforces "max 1/hr/customer"). */
export async function getLastGeneratedAt(clientId: number): Promise<Date | null> {
  try {
    const [row] = await db
      .select({ generated_at: aiInsightsCache.generated_at })
      .from(aiInsightsCache)
      .where(eq(aiInsightsCache.client_id, clientId))
      .orderBy(desc(aiInsightsCache.generated_at))
      .limit(1);
    return row?.generated_at ?? null;
  } catch {
    return null;
  }
}

/* ─── Dismissed actions ─── */

export function hashActionTitle(title: string): string {
  return crypto.createHash("sha256").update(title.trim().toLowerCase()).digest("hex");
}

export async function listDismissedHashes(clientId: number): Promise<Set<string>> {
  try {
    const rows = await db
      .select({ hash: aiInsightsDismissedActions.action_title_hash })
      .from(aiInsightsDismissedActions)
      .where(eq(aiInsightsDismissedActions.client_id, clientId));
    return new Set(rows.map(r => r.hash));
  } catch (err: any) {
    log.warn("dismissed-actions read failed — returning empty", { error: err?.message });
    return new Set();
  }
}

export async function dismissAction(clientId: number, actionTitle: string): Promise<void> {
  const hash = hashActionTitle(actionTitle);
  try {
    // No unique idx — guard against duplicate inserts at the app layer.
    const [existing] = await db
      .select({ id: aiInsightsDismissedActions.id })
      .from(aiInsightsDismissedActions)
      .where(and(
        eq(aiInsightsDismissedActions.client_id, clientId),
        eq(aiInsightsDismissedActions.action_title_hash, hash),
      ))
      .limit(1);
    if (existing) return;
    await db.insert(aiInsightsDismissedActions).values({
      client_id: clientId,
      action_title_hash: hash,
      action_title: actionTitle.slice(0, 200),
    });
  } catch (err: any) {
    // onConflictDoNothing may not match an existing unique constraint here
    // (no unique idx), so we tolerate duplicate inserts silently.
    if (!/duplicate|unique/i.test(err?.message ?? "")) {
      log.warn("dismiss action insert failed", { error: err?.message });
    }
  }
}
