/**
 * /api/v1/webhooks — webhook subscription management.
 *
 * The dispatch worker that actually delivers events is a separate
 * follow-up (Wave AJ-7). This PR only ships the management surface:
 * create / list / delete subscriptions and store the signing secret.
 *
 * Returned secret is plaintext at creation only; subsequent reads
 * return it redacted to `whsec_********_<last4>`.
 *
 * Tier gate: POST honors ApiTier.webhookQuota. Dev tier = 0 (always
 * blocked). -1 means unlimited.
 */
import type { Router, Request, Response } from "express";
import { z } from "zod";
import crypto from "crypto";
import { db } from "../../db";
import { apiWebhooks } from "@shared/schema";
import { and, count as countFn, desc, eq } from "drizzle-orm";
import { fail, ok } from "./envelope";
import { getApiTier } from "@shared/pricing/apiTiers";
import { generateCuid } from "../../lib/apiKeys";
import { createLogger } from "../../lib/logger";

const log = createLogger("ApiV1.Webhooks");

const KNOWN_EVENTS = [
  "submission.created",
  "calculator.created",
  "calculator.updated",
  "calculator.deleted",
  "calculator.paused",
  "calculator.resumed",
] as const;

const createBody = z.object({
  url: z.string().url().refine((u) => /^https?:\/\//.test(u), { message: "url must be http(s)" }),
  events: z.array(z.enum(KNOWN_EVENTS)).min(1, "at least one event is required"),
});

function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString("base64url").replace(/[-_]/g, "")}`;
}

function redactSecret(secret: string): string {
  if (!secret) return "";
  const tail = secret.slice(-4);
  return `whsec_${"*".repeat(8)}_${tail}`;
}

function toApiWebhook(row: typeof apiWebhooks.$inferSelect, opts: { reveal?: boolean } = {}) {
  return {
    id: row.id,
    url: row.url,
    events: row.events,
    status: row.status,
    secret: opts.reveal ? row.secret : redactSecret(row.secret),
    last_delivery_at: row.last_delivery_at,
    last_delivery_status: row.last_delivery_status,
    total_deliveries: row.total_deliveries,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function registerV1WebhooksRoutes(router: Router): void {
  /* ─── GET /webhooks ─── */
  router.get("/webhooks", async (req: Request, res: Response) => {
    const apiUser = req.apiUser;
    if (!apiUser) return fail(req, res, 401, { code: "unauthenticated", message: "API key required." });
    try {
      const rows = await db
        .select()
        .from(apiWebhooks)
        .where(eq(apiWebhooks.user_id, apiUser.id))
        .orderBy(desc(apiWebhooks.created_at));
      return ok(req, res, {
        data: rows.map((r) => toApiWebhook(r)),
        total: rows.length,
      });
    } catch (err: any) {
      log.error("list webhooks failed", { error: err?.message, userId: apiUser.id });
      return fail(req, res, 500, { code: "internal_error", message: "Failed to list webhooks." });
    }
  });

  /* ─── POST /webhooks ─── */
  router.post("/webhooks", async (req: Request, res: Response) => {
    const apiUser = req.apiUser;
    if (!apiUser) return fail(req, res, 401, { code: "unauthenticated", message: "API key required." });
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return fail(req, res, 400, { code: "invalid_body", message: "Invalid request body.", details: parsed.error.flatten() });
    }
    try {
      const tier = getApiTier(apiUser.tier);
      if (!tier) return fail(req, res, 500, { code: "unknown_tier", message: `Unknown tier: ${apiUser.tier}` });
      if (tier.webhookQuota === 0) {
        return fail(req, res, 403, {
          code: "tier_limit_exceeded",
          message: "Your tier does not include webhooks. Upgrade to Starter or higher.",
          limit: 0,
        });
      }
      if (tier.webhookQuota !== -1) {
        const [c] = await db
          .select({ n: countFn(apiWebhooks.id).as("n") })
          .from(apiWebhooks)
          .where(and(eq(apiWebhooks.user_id, apiUser.id), eq(apiWebhooks.status, "active")));
        const current = Number(c?.n ?? 0);
        if (current >= tier.webhookQuota) {
          return fail(req, res, 403, {
            code: "tier_limit_exceeded",
            message: `Your tier allows up to ${tier.webhookQuota} webhook${tier.webhookQuota === 1 ? "" : "s"}.`,
            limit: tier.webhookQuota,
            current,
          });
        }
      }

      const secret = generateWebhookSecret();
      const [row] = await db
        .insert(apiWebhooks)
        .values({
          id: generateCuid(),
          user_id: apiUser.id,
          url: parsed.data.url,
          secret,
          events: parsed.data.events,
          status: "active",
        })
        .returning();

      return ok(req, res, {
        ...toApiWebhook(row, { reveal: true }),
        warning: "Store this signing secret securely — it will not be shown again.",
      }, 201);
    } catch (err: any) {
      log.error("create webhook failed", { error: err?.message, userId: apiUser.id });
      return fail(req, res, 500, { code: "internal_error", message: "Failed to create webhook." });
    }
  });

  /* ─── DELETE /webhooks/:id ─── */
  router.delete("/webhooks/:id", async (req: Request, res: Response) => {
    const apiUser = req.apiUser;
    if (!apiUser) return fail(req, res, 401, { code: "unauthenticated", message: "API key required." });
    const id = String(req.params.id);
    if (!id) return fail(req, res, 400, { code: "invalid_id", message: "Invalid webhook id." });
    try {
      const [row] = await db
        .update(apiWebhooks)
        .set({ status: "revoked", updated_at: new Date() })
        .where(and(eq(apiWebhooks.id, id), eq(apiWebhooks.user_id, apiUser.id)))
        .returning();
      if (!row) return fail(req, res, 404, { code: "not_found", message: "Webhook not found." });
      return ok(req, res, { id: row.id, status: row.status });
    } catch (err: any) {
      log.error("delete webhook failed", { error: err?.message, userId: apiUser.id, id });
      return fail(req, res, 500, { code: "internal_error", message: "Failed to delete webhook." });
    }
  });
}
