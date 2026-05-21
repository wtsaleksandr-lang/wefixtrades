/**
 * Portal API-keys routes (Wave AJ-2).
 *
 * Mounted at /api/portal/api-keys/. Auth: logged-in user (requireClient).
 * Users manage their own keys; all writes scoped to req.user.id.
 *
 * Endpoints
 *   GET    /             — list MY keys (redacted to prefix)
 *   POST   /             — create a new key; returns FULL plaintext ONCE
 *   POST   /:keyId/rotate — rotate; returns new full key once, old revoked
 *   DELETE /:keyId       — soft revoke
 *   GET    /subscription — my subscription state + usage this period
 *   GET    /usage        — my usage logs (last 30d, paginated)
 *
 * SECURITY: the plaintext key value is RETURNED only by POST / (create)
 * and POST /:keyId/rotate. Every other read returns prefix only. The
 * full key is never logged or persisted in cleartext.
 */

import type { Express, Request, Response } from "express";
import { db } from "../db";
import { apiKeys, apiSubscriptions, apiUsageLogs } from "@shared/schema";
import { requireClient } from "../auth";
import { createLogger } from "../lib/logger";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { generateApiKey, generateCuid } from "../lib/apiKeys";
import { getApiTier, DEFAULT_API_TIER_ID } from "@shared/pricing/apiTiers";
import { z } from "zod";

const log = createLogger("PortalApiKeys");
const BASE = "/api/portal/api-keys";

const createKeyBody = z.object({
  name: z.string().min(1).max(120),
  expires_at: z.string().datetime().optional().nullable(),
});

/** Ensure a subscription row exists for this user — default free trial. */
async function ensureSubscription(userId: number) {
  const [existing] = await db
    .select()
    .from(apiSubscriptions)
    .where(eq(apiSubscriptions.user_id, userId))
    .limit(1);
  if (existing) return existing;

  const tier = getApiTier(DEFAULT_API_TIER_ID)!;
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const [created] = await db
    .insert(apiSubscriptions)
    .values({
      id: generateCuid(),
      user_id: userId,
      tier: tier.id,
      status: "trial",
      monthly_call_quota: tier.monthlyCallQuota,
      monthly_calls_used: 0,
      current_period_start: now,
      current_period_end: periodEnd,
      reset_at: periodEnd,
    })
    .returning();
  return created;
}

export function registerPortalApiKeysRoutes(app: Express): void {
  /* ─── GET / ──────────────────────────────────────────────────────── */
  app.get(BASE, requireClient, async (req: Request, res: Response) => {
    const userId = (req.user as Express.User).id;
    try {
      const rows = await db
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          prefix: apiKeys.prefix,
          tier: apiKeys.tier,
          status: apiKeys.status,
          total_calls: apiKeys.total_calls,
          last_used_at: apiKeys.last_used_at,
          created_at: apiKeys.created_at,
          expires_at: apiKeys.expires_at,
        })
        .from(apiKeys)
        .where(eq(apiKeys.user_id, userId))
        .orderBy(desc(apiKeys.created_at));
      res.json({ keys: rows });
    } catch (err: any) {
      log.error("list keys failed", { error: err?.message, userId });
      res.status(500).json({ error: "list_keys_failed" });
    }
  });

  /* ─── POST / — create new key, returns plaintext once ───────────── */
  app.post(BASE, requireClient, async (req: Request, res: Response) => {
    const userId = (req.user as Express.User).id;
    const parsed = createKeyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", details: parsed.error.format() });
      return;
    }
    try {
      const sub = await ensureSubscription(userId);
      if (sub.status !== "active" && sub.status !== "trial") {
        res.status(403).json({ error: `subscription_${sub.status}` });
        return;
      }
      const { full, prefix, hash } = generateApiKey();
      const id = generateCuid();
      const [created] = await db
        .insert(apiKeys)
        .values({
          id,
          user_id: userId,
          name: parsed.data.name,
          prefix,
          hash,
          tier: sub.tier,
          status: "active",
          expires_at: parsed.data.expires_at ? new Date(parsed.data.expires_at) : null,
        })
        .returning();
      res.status(201).json({
        key: {
          id: created.id,
          name: created.name,
          prefix: created.prefix,
          tier: created.tier,
          status: created.status,
          created_at: created.created_at,
          expires_at: created.expires_at,
        },
        plaintext: full,
        warning: "Store this value securely — it will not be shown again.",
      });
    } catch (err: any) {
      log.error("create key failed", { error: err?.message, userId });
      res.status(500).json({ error: "create_key_failed" });
    }
  });

  /* ─── POST /:keyId/rotate — issue new, revoke old ──────────────── */
  app.post(`${BASE}/:keyId/rotate`, requireClient, async (req: Request, res: Response) => {
    const userId = (req.user as Express.User).id;
    const keyId = String(req.params.keyId);
    try {
      const [existing] = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.user_id, userId)))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "key_not_found" });
        return;
      }
      const { full, prefix, hash } = generateApiKey();
      const newId = generateCuid();
      const created = await db.transaction(async (tx) => {
        await tx
          .update(apiKeys)
          .set({ status: "revoked" })
          .where(eq(apiKeys.id, existing.id));
        const [row] = await tx
          .insert(apiKeys)
          .values({
            id: newId,
            user_id: userId,
            name: existing.name,
            prefix,
            hash,
            tier: existing.tier,
            status: "active",
            expires_at: existing.expires_at,
            metadata: { rotated_from: existing.id },
          })
          .returning();
        return row;
      });
      res.json({
        key: {
          id: created.id,
          name: created.name,
          prefix: created.prefix,
          tier: created.tier,
          status: created.status,
          created_at: created.created_at,
          expires_at: created.expires_at,
        },
        plaintext: full,
        warning: "Old key revoked. Store this value securely — it will not be shown again.",
      });
    } catch (err: any) {
      log.error("rotate key failed", { error: err?.message, userId, keyId });
      res.status(500).json({ error: "rotate_key_failed" });
    }
  });

  /* ─── DELETE /:keyId — soft revoke ──────────────────────────────── */
  app.delete(`${BASE}/:keyId`, requireClient, async (req: Request, res: Response) => {
    const userId = (req.user as Express.User).id;
    const keyId = String(req.params.keyId);
    try {
      const [updated] = await db
        .update(apiKeys)
        .set({ status: "revoked" })
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.user_id, userId)))
        .returning();
      if (!updated) {
        res.status(404).json({ error: "key_not_found" });
        return;
      }
      res.json({ ok: true });
    } catch (err: any) {
      log.error("revoke key failed", { error: err?.message, userId, keyId });
      res.status(500).json({ error: "revoke_key_failed" });
    }
  });

  /* ─── GET /subscription ──────────────────────────────────────────── */
  app.get(`${BASE}/subscription`, requireClient, async (req: Request, res: Response) => {
    const userId = (req.user as Express.User).id;
    try {
      const sub = await ensureSubscription(userId);
      const tier = getApiTier(sub.tier);
      res.json({
        subscription: sub,
        tier,
        usage_this_period: {
          calls_used: sub.monthly_calls_used,
          calls_quota: sub.monthly_call_quota,
          remaining: Math.max(0, sub.monthly_call_quota - sub.monthly_calls_used),
          reset_at: sub.reset_at,
        },
      });
    } catch (err: any) {
      log.error("subscription failed", { error: err?.message, userId });
      res.status(500).json({ error: "subscription_failed" });
    }
  });

  /* ─── GET /usage ──────────────────────────────────────────────────
   * Paginated. Restricted to last 30 days regardless of caller params.
   * ─────────────────────────────────────────────────────────────── */
  app.get(`${BASE}/usage`, requireClient, async (req: Request, res: Response) => {
    const userId = (req.user as Express.User).id;
    const limit = Math.min(200, Math.max(1, Number.parseInt(String(req.query.limit ?? "100"), 10) || 100));
    const offset = Math.max(0, Number.parseInt(String(req.query.offset ?? "0"), 10) || 0);
    try {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const rows = await db
        .select()
        .from(apiUsageLogs)
        .where(and(eq(apiUsageLogs.user_id, userId), gte(apiUsageLogs.created_at, since)))
        .orderBy(desc(apiUsageLogs.created_at))
        .limit(limit)
        .offset(offset);
      const [totalRow] = await db
        .select({ n: count(apiUsageLogs.id).as("n") })
        .from(apiUsageLogs)
        .where(and(eq(apiUsageLogs.user_id, userId), gte(apiUsageLogs.created_at, since)));
      res.json({
        usage: rows,
        total: Number(totalRow?.n ?? 0),
        limit,
        offset,
        window_days: 30,
      });
    } catch (err: any) {
      log.error("usage failed", { error: err?.message, userId });
      res.status(500).json({ error: "usage_failed" });
    }
  });
}
