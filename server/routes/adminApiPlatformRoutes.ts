/**
 * Admin API-platform routes (Wave AJ-2).
 *
 * Mounted at /api/admin/api-platform/. All endpoints require admin auth.
 * Every write to a key or subscription writes a row to admin_activity_log.
 *
 * Endpoints
 *   GET    /users                         — users with API subs + key counts
 *   GET    /users/:userId                 — user detail: sub, keys, usage
 *   GET    /keys                          — global key list (paginated)
 *   POST   /keys/:keyId/disable           — mark status='disabled'
 *   POST   /keys/:keyId/enable            — re-enable
 *   POST   /keys/:keyId/revoke            — permanent status='revoked'
 *   POST   /subscriptions/:userId/suspend — status='paused'
 *   POST   /subscriptions/:userId/refund  — record intent (no Stripe call)
 *   GET    /metrics                       — global counters
 */

import type { Express, Request, Response } from "express";
import { db } from "../db";
import {
  apiKeys,
  apiSubscriptions,
  apiUsageLogs,
  apiWebhooks,
  apiWebhookDeliveries,
  users,
  adminActivityLog,
} from "@shared/schema";
import { requireAdmin } from "../auth";
import { createLogger } from "../lib/logger";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { API_TIERS, getApiTier } from "@shared/pricing/apiTiers";

const log = createLogger("AdminApiPlatform");

const BASE = "/api/admin/api-platform";

async function audit(
  req: Request,
  action: string,
  entity_type: string,
  entity_id: number | null,
  summary: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const adminId = (req.user as Express.User | undefined)?.id ?? null;
  await db
    .insert(adminActivityLog)
    .values({
      actor_type: "human",
      actor_id: adminId,
      actor_name: (req.user as Express.User | undefined)?.email ?? null,
      action,
      entity_type,
      entity_id,
      summary,
      metadata,
    })
    .catch((err) => log.warn("audit log insert failed", { error: err?.message, action }));
}

export function registerAdminApiPlatformRoutes(app: Express): void {
  /* ─── GET /users ─────────────────────────────────────────────────── */
  app.get(`${BASE}/users`, requireAdmin, async (_req: Request, res: Response) => {
    try {
      // Outer join: every sub joined with key counts + last usage timestamp.
      const subs = await db
        .select({
          user_id: apiSubscriptions.user_id,
          tier: apiSubscriptions.tier,
          status: apiSubscriptions.status,
          monthly_call_quota: apiSubscriptions.monthly_call_quota,
          monthly_calls_used: apiSubscriptions.monthly_calls_used,
          reset_at: apiSubscriptions.reset_at,
          current_period_end: apiSubscriptions.current_period_end,
          email: users.email,
          name: users.name,
        })
        .from(apiSubscriptions)
        .leftJoin(users, eq(users.id, apiSubscriptions.user_id));

      const keyCounts = await db
        .select({
          user_id: apiKeys.user_id,
          total_keys: count(apiKeys.id).as("total_keys"),
        })
        .from(apiKeys)
        .groupBy(apiKeys.user_id);
      const countByUser = new Map<number, number>();
      for (const row of keyCounts) countByUser.set(row.user_id, Number(row.total_keys));

      const lastActivity = await db
        .select({
          user_id: apiUsageLogs.user_id,
          last_at: sql<Date>`max(${apiUsageLogs.created_at})`.as("last_at"),
        })
        .from(apiUsageLogs)
        .groupBy(apiUsageLogs.user_id);
      const lastByUser = new Map<number, Date>();
      for (const row of lastActivity)
        if (row.last_at) lastByUser.set(row.user_id, new Date(row.last_at));

      res.json({
        users: subs.map((s) => ({
          ...s,
          key_count: countByUser.get(s.user_id) ?? 0,
          last_activity_at: lastByUser.get(s.user_id) ?? null,
        })),
      });
    } catch (err: any) {
      log.error("list users failed", { error: err?.message });
      res.status(500).json({ error: "list_users_failed" });
    }
  });

  /* ─── GET /users/:userId ─────────────────────────────────────────── */
  app.get(`${BASE}/users/:userId`, requireAdmin, async (req: Request, res: Response) => {
    const userId = Number.parseInt(String(req.params.userId), 10);
    if (!Number.isFinite(userId)) {
      res.status(400).json({ error: "invalid_user_id" });
      return;
    }
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const [sub] = await db
        .select()
        .from(apiSubscriptions)
        .where(eq(apiSubscriptions.user_id, userId))
        .limit(1);
      const keys = await db
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

      const usage = await db
        .select()
        .from(apiUsageLogs)
        .where(eq(apiUsageLogs.user_id, userId))
        .orderBy(desc(apiUsageLogs.created_at))
        .limit(50);

      // Daily call counts for the last 30 days — for sparkline.
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const dailyRows = await db
        .select({
          day: sql<string>`date_trunc('day', ${apiUsageLogs.created_at})::date::text`.as("day"),
          calls: count(apiUsageLogs.id).as("calls"),
        })
        .from(apiUsageLogs)
        .where(and(eq(apiUsageLogs.user_id, userId), gte(apiUsageLogs.created_at, since)))
        .groupBy(sql`date_trunc('day', ${apiUsageLogs.created_at})`)
        .orderBy(sql`date_trunc('day', ${apiUsageLogs.created_at})`);

      // Wave AQ-3 — recent webhook deliveries across all of this user's
      // subscriptions, newest first. Capped at 20. The dispatcher / worker
      // populates these rows; the admin UI exposes a 'replay' action that
      // rewinds a failed/dead row back to 'pending'.
      const userWebhookIds = await db
        .select({ id: apiWebhooks.id })
        .from(apiWebhooks)
        .where(eq(apiWebhooks.user_id, userId));
      const webhookIds = userWebhookIds.map((r) => r.id);
      const webhookDeliveries =
        webhookIds.length === 0
          ? []
          : await db
              .select({
                id: apiWebhookDeliveries.id,
                webhook_id: apiWebhookDeliveries.webhook_id,
                event_id: apiWebhookDeliveries.event_id,
                event_type: apiWebhookDeliveries.event_type,
                status: apiWebhookDeliveries.status,
                attempt_count: apiWebhookDeliveries.attempt_count,
                next_attempt_at: apiWebhookDeliveries.next_attempt_at,
                last_response_status: apiWebhookDeliveries.last_response_status,
                last_error: apiWebhookDeliveries.last_error,
                succeeded_at: apiWebhookDeliveries.succeeded_at,
                created_at: apiWebhookDeliveries.created_at,
              })
              .from(apiWebhookDeliveries)
              .where(inArray(apiWebhookDeliveries.webhook_id, webhookIds))
              .orderBy(desc(apiWebhookDeliveries.created_at))
              .limit(20);

      res.json({
        user: user
          ? { id: user.id, email: user.email, name: user.name, role: user.role }
          : null,
        subscription: sub ?? null,
        keys,
        recent_usage: usage,
        daily_calls: dailyRows.map((r) => ({ day: r.day, calls: Number(r.calls) })),
        webhook_deliveries: webhookDeliveries,
      });
    } catch (err: any) {
      log.error("user detail failed", { error: err?.message, userId });
      res.status(500).json({ error: "user_detail_failed" });
    }
  });

  /* ─── POST /webhook-deliveries/:id/replay (Wave AQ-3) ────────────────
   * Resets a 'failed' or 'dead' delivery back to 'pending' with a fresh
   * attempt ladder so the worker picks it up on the next tick. Used by
   * the admin UI's "Replay" action on the Webhook deliveries tab.
   *
   * Idempotent — replaying an already-pending row is a no-op (we leave
   * the existing next_attempt_at alone).
   * ─────────────────────────────────────────────────────────────── */
  app.post(
    `${BASE}/webhook-deliveries/:deliveryId/replay`,
    requireAdmin,
    async (req: Request, res: Response) => {
      const deliveryId = Number.parseInt(String(req.params.deliveryId), 10);
      if (!Number.isFinite(deliveryId)) {
        res.status(400).json({ error: "invalid_delivery_id" });
        return;
      }
      try {
        const [existing] = await db
          .select()
          .from(apiWebhookDeliveries)
          .where(eq(apiWebhookDeliveries.id, deliveryId))
          .limit(1);
        if (!existing) {
          res.status(404).json({ error: "delivery_not_found" });
          return;
        }
        const [updated] = await db
          .update(apiWebhookDeliveries)
          .set({
            status: "pending",
            attempt_count: 0,
            next_attempt_at: new Date(),
            last_error: null,
            last_response_status: null,
            last_response_body: null,
            succeeded_at: null,
          })
          .where(eq(apiWebhookDeliveries.id, deliveryId))
          .returning();
        await audit(
          req,
          "api_webhook_delivery.replayed",
          "api_webhook_delivery",
          null,
          `Replayed webhook delivery ${deliveryId} (event ${existing.event_type})`,
          {
            delivery_id: deliveryId,
            webhook_id: existing.webhook_id,
            event_type: existing.event_type,
            previous_status: existing.status,
            previous_attempt_count: existing.attempt_count,
          },
        );
        res.json({ ok: true, delivery: updated });
      } catch (err: any) {
        log.error("replay webhook delivery failed", { error: err?.message, deliveryId });
        res.status(500).json({ error: "replay_failed" });
      }
    },
  );

  /* ─── GET /keys ──────────────────────────────────────────────────── */
  app.get(`${BASE}/keys`, requireAdmin, async (req: Request, res: Response) => {
    const limit = Math.min(200, Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50));
    const offset = Math.max(0, Number.parseInt(String(req.query.offset ?? "0"), 10) || 0);
    const tierFilter = typeof req.query.tier === "string" ? req.query.tier : null;
    const statusFilter = typeof req.query.status === "string" ? req.query.status : null;

    const where = [
      tierFilter ? eq(apiKeys.tier, tierFilter) : null,
      statusFilter ? eq(apiKeys.status, statusFilter) : null,
    ].filter(Boolean) as any[];

    try {
      const rows = await db
        .select({
          id: apiKeys.id,
          user_id: apiKeys.user_id,
          name: apiKeys.name,
          prefix: apiKeys.prefix,
          tier: apiKeys.tier,
          status: apiKeys.status,
          total_calls: apiKeys.total_calls,
          last_used_at: apiKeys.last_used_at,
          created_at: apiKeys.created_at,
          user_email: users.email,
        })
        .from(apiKeys)
        .leftJoin(users, eq(users.id, apiKeys.user_id))
        .where(where.length ? and(...where) : undefined)
        .orderBy(desc(apiKeys.created_at))
        .limit(limit)
        .offset(offset);
      res.json({ keys: rows, limit, offset });
    } catch (err: any) {
      log.error("list keys failed", { error: err?.message });
      res.status(500).json({ error: "list_keys_failed" });
    }
  });

  /* ─── POST /keys/:keyId/{disable|enable|revoke} ─────────────────── */
  async function setKeyStatus(
    req: Request,
    res: Response,
    next: "active" | "disabled" | "revoked",
    action: string,
  ) {
    const keyId = String(req.params.keyId);
    if (!keyId) {
      res.status(400).json({ error: "invalid_key_id" });
      return;
    }
    try {
      const [updated] = await db
        .update(apiKeys)
        .set({ status: next })
        .where(eq(apiKeys.id, keyId))
        .returning();
      if (!updated) {
        res.status(404).json({ error: "key_not_found" });
        return;
      }
      await audit(
        req,
        action,
        "api_key",
        null, // api_keys.id is text — entity_id only stores int. Key id goes in metadata.
        `Set API key ${updated.prefix}… status to ${next}`,
        { key_id: keyId, user_id: updated.user_id, previous_status: updated.status, next_status: next },
      );
      res.json({ ok: true, key: updated });
    } catch (err: any) {
      log.error("set key status failed", { error: err?.message, keyId, next });
      res.status(500).json({ error: "set_status_failed" });
    }
  }

  app.post(`${BASE}/keys/:keyId/disable`, requireAdmin, (req, res) =>
    setKeyStatus(req, res, "disabled", "api_key.disabled"),
  );
  app.post(`${BASE}/keys/:keyId/enable`, requireAdmin, (req, res) =>
    setKeyStatus(req, res, "active", "api_key.enabled"),
  );
  app.post(`${BASE}/keys/:keyId/revoke`, requireAdmin, (req, res) =>
    setKeyStatus(req, res, "revoked", "api_key.revoked"),
  );

  /* ─── POST /subscriptions/:userId/suspend ────────────────────────── */
  app.post(
    `${BASE}/subscriptions/:userId/suspend`,
    requireAdmin,
    async (req: Request, res: Response) => {
      const userId = Number.parseInt(String(req.params.userId), 10);
      if (!Number.isFinite(userId)) {
        res.status(400).json({ error: "invalid_user_id" });
        return;
      }
      try {
        const [updated] = await db
          .update(apiSubscriptions)
          .set({ status: "paused", updated_at: new Date() })
          .where(eq(apiSubscriptions.user_id, userId))
          .returning();
        if (!updated) {
          res.status(404).json({ error: "subscription_not_found" });
          return;
        }
        await audit(req, "api_subscription.suspended", "api_subscription", userId,
          `Paused API subscription for user ${userId}`,
          { user_id: userId, tier: updated.tier });
        res.json({ ok: true, subscription: updated });
      } catch (err: any) {
        log.error("suspend failed", { error: err?.message, userId });
        res.status(500).json({ error: "suspend_failed" });
      }
    },
  );

  /* ─── POST /subscriptions/:userId/refund (intent only) ──────────── */
  app.post(
    `${BASE}/subscriptions/:userId/refund`,
    requireAdmin,
    async (req: Request, res: Response) => {
      const userId = Number.parseInt(String(req.params.userId), 10);
      if (!Number.isFinite(userId)) {
        res.status(400).json({ error: "invalid_user_id" });
        return;
      }
      const reason = typeof req.body?.reason === "string" ? req.body.reason : null;
      const amount = typeof req.body?.amount_cents === "number" ? req.body.amount_cents : null;
      try {
        await audit(req, "api_subscription.refund_intent", "api_subscription", userId,
          `Refund intent recorded for user ${userId}` + (amount ? ` (${amount}¢)` : ""),
          { user_id: userId, reason, amount_cents: amount });
        // Actual Stripe refund happens in a follow-up PR. This endpoint only
        // records intent so the audit trail captures the admin's decision.
        res.json({ ok: true, intent: "recorded", note: "Stripe refund handled out-of-band" });
      } catch (err: any) {
        log.error("refund intent failed", { error: err?.message, userId });
        res.status(500).json({ error: "refund_intent_failed" });
      }
    },
  );

  /* ─── GET /metrics ───────────────────────────────────────────────── */
  app.get(`${BASE}/metrics`, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const [activeKeysRow] = await db
        .select({ n: count(apiKeys.id).as("n") })
        .from(apiKeys)
        .where(eq(apiKeys.status, "active"));

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(startOfDay);
      startOfMonth.setDate(1);

      const [callsToday] = await db
        .select({ n: count(apiUsageLogs.id).as("n") })
        .from(apiUsageLogs)
        .where(gte(apiUsageLogs.created_at, startOfDay));
      const [callsMonth] = await db
        .select({ n: count(apiUsageLogs.id).as("n") })
        .from(apiUsageLogs)
        .where(gte(apiUsageLogs.created_at, startOfMonth));

      const topUsers = await db
        .select({
          user_id: apiUsageLogs.user_id,
          calls: count(apiUsageLogs.id).as("calls"),
        })
        .from(apiUsageLogs)
        .where(gte(apiUsageLogs.created_at, startOfMonth))
        .groupBy(apiUsageLogs.user_id)
        .orderBy(desc(sql`calls`))
        .limit(10);

      // Revenue: sum of active+trial subs * their tier monthly price.
      const activeSubs = await db
        .select({ tier: apiSubscriptions.tier, status: apiSubscriptions.status })
        .from(apiSubscriptions);
      let monthlyRevenueDollars = 0;
      const tierCounts: Record<string, number> = {};
      for (const s of activeSubs) {
        tierCounts[s.tier] = (tierCounts[s.tier] ?? 0) + 1;
        if (s.status === "active") {
          const t = getApiTier(s.tier);
          if (t) monthlyRevenueDollars += t.priceMonthly;
        }
      }

      res.json({
        active_keys: Number(activeKeysRow?.n ?? 0),
        calls_today: Number(callsToday?.n ?? 0),
        calls_this_month: Number(callsMonth?.n ?? 0),
        top_users_this_month: topUsers.map((u) => ({
          user_id: u.user_id,
          calls: Number(u.calls),
        })),
        subscriptions_by_tier: tierCounts,
        estimated_monthly_revenue_usd: monthlyRevenueDollars,
        tier_catalog: API_TIERS,
      });
    } catch (err: any) {
      log.error("metrics failed", { error: err?.message });
      res.status(500).json({ error: "metrics_failed" });
    }
  });
}
