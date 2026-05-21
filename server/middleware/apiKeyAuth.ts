/**
 * API-key authentication + quota + rate-limit middleware (Wave AJ-2).
 *
 * Mount on any route that accepts the public API:
 *   app.use("/api/v1", apiKeyAuth);
 *
 * Pipeline on each request:
 *   1. Parse `Authorization: Bearer wfx_…` header.
 *   2. Look up the key by SHA-256 hash.
 *   3. Reject if key.status !== "active".
 *   4. Look up the owner's subscription; reject if status is not
 *      trial|active.
 *   5. Check monthly quota — reject 429 + Retry-After if exhausted.
 *   6. Token-bucket atomic decrement — reject 429 if bucket empty.
 *   7. Attach req.apiKey + req.apiUser for downstream handlers.
 *   8. Patch res.end to fire-and-forget a usage_log row + counter bumps.
 *
 * Rate-limit headers are set on EVERY response (success and error), per
 * the IETF draft (X-RateLimit-Limit, X-RateLimit-Remaining,
 * X-RateLimit-Reset). 429 responses additionally carry Retry-After.
 *
 * The token-bucket algorithm here is the simple "lazy refill" variant:
 *   bucket.tokens = min(capacity, bucket.tokens + (now - last) * refill_rate)
 *   if tokens >= 1: tokens -= 1, allow; else: reject
 * The whole read-modify-write is wrapped in a Postgres transaction +
 * SELECT FOR UPDATE to keep concurrent requests for the same key honest.
 */

import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { apiKeys, apiSubscriptions, apiUsageLogs, apiRateLimitBuckets } from "@shared/schema";
import type { ApiKey, ApiSubscription } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { sha256Hex, isPlausibleApiKey } from "../lib/apiKeys";
import { createLogger } from "../lib/logger";
import { getApiTier } from "@shared/pricing/apiTiers";

const log = createLogger("ApiKeyAuth");

/* ─── Express request augmentation ─── */
declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
      apiUser?: { id: number; tier: string };
      apiSubscription?: ApiSubscription;
    }
  }
}

interface RateLimitSnapshot {
  limit: number;
  remaining: number;
  resetEpochMs: number;
}

function setRateLimitHeaders(res: Response, snap: RateLimitSnapshot): void {
  res.setHeader("X-RateLimit-Limit", String(snap.limit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, snap.remaining)));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(snap.resetEpochMs / 1000)));
}

function extractBearerToken(req: Request): string | null {
  const header = req.get("authorization") || req.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  return match[1].trim();
}

/**
 * Refill + atomically decrement the token bucket for a key. Creates the
 * bucket lazily on first call. Returns the post-decrement snapshot, or
 * null if the bucket was empty (reject).
 */
interface BucketConsumeResult {
  allowed: boolean;
  snap: RateLimitSnapshot;
}

async function consumeBucketToken(
  keyId: string,
  tierRateLimitPerMinute: number,
): Promise<BucketConsumeResult> {
  const capacity = Math.max(1, tierRateLimitPerMinute);
  const refillPerSec = Math.max(1, Math.floor(tierRateLimitPerMinute / 60) || 1);

  return await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(apiRateLimitBuckets)
      .where(eq(apiRateLimitBuckets.key_id, keyId))
      .for("update")
      .limit(1);

    const now = Date.now();

    if (existing.length === 0) {
      // First request — initialise full bucket and immediately spend 1.
      const tokens = capacity - 1;
      await tx.insert(apiRateLimitBuckets).values({
        key_id: keyId,
        tokens,
        refill_rate_per_sec: refillPerSec,
        capacity,
        last_refill_at: new Date(now),
      });
      const msToFull = ((capacity - tokens) / refillPerSec) * 1000;
      return {
        allowed: true,
        snap: { limit: capacity, remaining: tokens, resetEpochMs: now + Math.ceil(msToFull) },
      };
    }

    const bucket = existing[0];
    const elapsedSec = Math.max(
      0,
      (now - new Date(bucket.last_refill_at).getTime()) / 1000,
    );
    const refilled = Math.min(
      bucket.capacity,
      bucket.tokens + Math.floor(elapsedSec * bucket.refill_rate_per_sec),
    );

    if (refilled < 1) {
      const msToOne = Math.max(
        0,
        Math.ceil((1000 * (1 - refilled)) / Math.max(1, bucket.refill_rate_per_sec)),
      );
      // Persist the refill calculation even on reject — keeps tokens monotonic.
      await tx
        .update(apiRateLimitBuckets)
        .set({ tokens: refilled, last_refill_at: new Date(now) })
        .where(eq(apiRateLimitBuckets.key_id, keyId));
      return {
        allowed: false,
        snap: { limit: bucket.capacity, remaining: 0, resetEpochMs: now + msToOne },
      };
    }

    const tokens = refilled - 1;
    await tx
      .update(apiRateLimitBuckets)
      .set({ tokens, last_refill_at: new Date(now) })
      .where(eq(apiRateLimitBuckets.key_id, keyId));
    const msToFull =
      ((bucket.capacity - tokens) / Math.max(1, bucket.refill_rate_per_sec)) * 1000;
    return {
      allowed: true,
      snap: { limit: bucket.capacity, remaining: tokens, resetEpochMs: now + Math.ceil(msToFull) },
    };
  });
}

/** Async fire-and-forget — never let logging block the response. */
function logUsageAsync(row: {
  key_id: string;
  user_id: number;
  endpoint: string;
  method: string;
  status_code: number;
  response_ms: number;
  bytes_out: number | null;
  ip: string | null;
  user_agent: string | null;
}): void {
  void db
    .insert(apiUsageLogs)
    .values({
      key_id: row.key_id,
      user_id: row.user_id,
      endpoint: row.endpoint,
      method: row.method,
      status_code: row.status_code,
      response_ms: row.response_ms,
      bytes_out: row.bytes_out,
      ip: row.ip,
      user_agent: row.user_agent,
    })
    .catch((err) => log.warn("usage log insert failed", { error: err?.message }));

  // Counter bumps run in parallel — also non-blocking.
  void db
    .update(apiKeys)
    .set({
      last_used_at: new Date(),
      total_calls: sql`${apiKeys.total_calls} + 1`,
    })
    .where(eq(apiKeys.id, row.key_id))
    .catch((err) => log.warn("api_keys counter bump failed", { error: err?.message }));

  void db
    .update(apiSubscriptions)
    .set({
      monthly_calls_used: sql`${apiSubscriptions.monthly_calls_used} + 1`,
      updated_at: new Date(),
    })
    .where(eq(apiSubscriptions.user_id, row.user_id))
    .catch((err) => log.warn("api_subscriptions counter bump failed", { error: err?.message }));
}

/* ─── The middleware ─── */
export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const started = Date.now();
  const token = extractBearerToken(req);
  if (!isPlausibleApiKey(token)) {
    res.status(401).json({ error: "missing_or_malformed_api_key" });
    return;
  }

  let keyRow: ApiKey | undefined;
  try {
    const rows = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.hash, sha256Hex(token!)))
      .limit(1);
    keyRow = rows[0];
  } catch (err: any) {
    log.error("key lookup failed", { error: err?.message });
    res.status(500).json({ error: "auth_lookup_failed" });
    return;
  }

  if (!keyRow) {
    res.status(401).json({ error: "invalid_api_key" });
    return;
  }
  if (keyRow.status !== "active") {
    res.status(403).json({ error: `key_${keyRow.status}` });
    return;
  }
  if (keyRow.expires_at && new Date(keyRow.expires_at).getTime() < Date.now()) {
    res.status(403).json({ error: "key_expired" });
    return;
  }

  // Subscription check.
  const subRows = await db
    .select()
    .from(apiSubscriptions)
    .where(eq(apiSubscriptions.user_id, keyRow.user_id))
    .limit(1);
  const sub = subRows[0];
  if (!sub) {
    res.status(403).json({ error: "no_subscription" });
    return;
  }
  if (sub.status !== "active" && sub.status !== "trial") {
    res.status(403).json({ error: `subscription_${sub.status}` });
    return;
  }

  // Quota check.
  const tier = getApiTier(keyRow.tier) ?? getApiTier(sub.tier);
  if (!tier) {
    res.status(500).json({ error: "unknown_tier", tier: keyRow.tier });
    return;
  }

  const quotaResetEpochMs = new Date(sub.reset_at).getTime();
  const quotaSnap: RateLimitSnapshot = {
    limit: sub.monthly_call_quota,
    remaining: Math.max(0, sub.monthly_call_quota - sub.monthly_calls_used),
    resetEpochMs: quotaResetEpochMs,
  };
  if (sub.monthly_calls_used >= sub.monthly_call_quota) {
    const retryAfter = Math.max(0, Math.ceil((quotaResetEpochMs - Date.now()) / 1000));
    setRateLimitHeaders(res, quotaSnap);
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ error: "monthly_quota_exhausted", retry_after_seconds: retryAfter });
    return;
  }

  // Token bucket check.
  let bucket: { allowed: boolean; snap: RateLimitSnapshot };
  try {
    bucket = await consumeBucketToken(keyRow.id, tier.rateLimitPerMinute);
  } catch (err: any) {
    log.error("bucket consume failed", { error: err?.message, key_id: keyRow.id });
    res.status(500).json({ error: "rate_limiter_error" });
    return;
  }
  if (!bucket.allowed) {
    setRateLimitHeaders(res, bucket.snap);
    const retryAfter = Math.max(0, Math.ceil((bucket.snap.resetEpochMs - Date.now()) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ error: "rate_limit_exceeded", retry_after_seconds: retryAfter });
    return;
  }
  setRateLimitHeaders(res, bucket.snap);
  // Also surface monthly quota in extension headers so SDKs can show "X-of-Y this month".
  res.setHeader("X-Quota-Limit", String(quotaSnap.limit));
  res.setHeader("X-Quota-Remaining", String(quotaSnap.remaining));
  res.setHeader("X-Quota-Reset", String(Math.ceil(quotaSnap.resetEpochMs / 1000)));

  req.apiKey = keyRow;
  req.apiSubscription = sub;
  req.apiUser = { id: keyRow.user_id, tier: keyRow.tier };

  // Hook response end for usage logging.
  let bytesOut = 0;
  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);
  res.write = ((chunk: any, ...rest: any[]) => {
    if (chunk) bytesOut += Buffer.byteLength(typeof chunk === "string" ? chunk : chunk);
    return origWrite(chunk, ...rest);
  }) as typeof res.write;
  res.end = ((chunk?: any, ...rest: any[]) => {
    if (chunk) bytesOut += Buffer.byteLength(typeof chunk === "string" ? chunk : chunk);
    try {
      logUsageAsync({
        key_id: keyRow!.id,
        user_id: keyRow!.user_id,
        endpoint: `${req.method} ${req.baseUrl || ""}${req.path}`,
        method: req.method,
        status_code: res.statusCode,
        response_ms: Date.now() - started,
        bytes_out: bytesOut || null,
        ip: req.ip || null,
        user_agent: req.get("user-agent") || null,
      });
    } catch (err: any) {
      log.warn("usage hook failed", { error: err?.message });
    }
    return origEnd(chunk, ...rest);
  }) as typeof res.end;

  next();
}
