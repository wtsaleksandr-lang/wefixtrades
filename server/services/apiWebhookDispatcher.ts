/**
 * API Webhook Dispatcher (Wave AQ-3).
 *
 * AJ-6 / PR #401 shipped the webhook subscription MANAGEMENT surface
 * (create / list / delete via /api/v1/webhooks). This module ships the
 * actual event DISPATCH:
 *
 *   1. `emitApiWebhookEvent({ userId, type, data })` — fire-and-forget,
 *      called from anywhere in the codebase when an interesting thing
 *      happens for a user who might have webhooks.
 *   2. We look up all active api_webhooks owned by that user whose
 *      `events` array includes the event type.
 *   3. For each match, we enqueue ONE api_webhook_deliveries row with
 *      the fully-built JSON payload. Delivery is async — the worker
 *      drains the queue every 30s.
 *
 * Why fire-and-forget? Event emit sits on the request hot path. We never
 * want a slow webhook subscription to delay a customer's lead-submission
 * response. Errors at emit time are logged and swallowed.
 *
 * HMAC: the dispatcher does NOT sign at enqueue time. Signing happens in
 * the worker at POST time so the signed timestamp matches the actual
 * delivery moment (which is what subscribers verify against). The
 * signature header format is `t=<unix>,v1=<hex>` — Stripe convention.
 */

import crypto from "crypto";
import { db } from "../db";
import { apiWebhooks, apiWebhookDeliveries } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { generateCuid } from "../lib/apiKeys";

const log = createLogger("ApiWebhookDispatcher");

/* ─── Public event-type union ─────────────────────────────────────────
 * Mirrored from KNOWN_EVENTS in server/routes/apiV1/webhooksRoutes.ts.
 * Keep these in sync when adding new event types.
 * ───────────────────────────────────────────────────────────────── */
export type ApiWebhookEventType =
  | "submission.created"
  | "calculator.created"
  | "calculator.updated"
  | "calculator.deleted"
  | "calculator.paused"
  | "calculator.resumed"
  | "calculator.archived";

export interface EmitApiWebhookEventInput {
  /** Owner of the subscriptions. If null/undefined we skip — no fan-out target. */
  userId: number | null | undefined;
  type: ApiWebhookEventType;
  /** Free-form event payload. Goes into payload.data verbatim. */
  data: Record<string, unknown>;
}

interface WebhookPayload {
  id: string;
  type: ApiWebhookEventType;
  created_at: string;
  data: Record<string, unknown>;
}

/**
 * Fire-and-forget event emit. Looks up matching webhook subscriptions
 * for `userId` and enqueues one delivery row per match. Never throws —
 * all errors are logged.
 */
export async function emitApiWebhookEvent(
  input: EmitApiWebhookEventInput,
): Promise<{ enqueued: number }> {
  const { userId, type, data } = input;
  if (userId == null) return { enqueued: 0 };

  try {
    // Subscriptions matching: active rows for this user whose events array
    // contains the type. jsonb @> filters server-side for cheap matching.
    const subs = await db
      .select({
        id: apiWebhooks.id,
        url: apiWebhooks.url,
        events: apiWebhooks.events,
      })
      .from(apiWebhooks)
      .where(
        and(
          eq(apiWebhooks.user_id, userId),
          eq(apiWebhooks.status, "active"),
          sql`${apiWebhooks.events} @> ${JSON.stringify([type])}::jsonb`,
        ),
      );

    if (subs.length === 0) return { enqueued: 0 };

    const eventId = `evt_${generateCuid()}`;
    const payload: WebhookPayload = {
      id: eventId,
      type,
      created_at: new Date().toISOString(),
      data,
    };

    await db.insert(apiWebhookDeliveries).values(
      subs.map((s) => ({
        webhook_id: s.id,
        event_id: eventId,
        event_type: type,
        payload: payload as unknown as Record<string, unknown>,
        status: "pending" as const,
        attempt_count: 0,
        next_attempt_at: new Date(),
      })),
    );

    log.info("event enqueued", {
      type,
      user_id: userId,
      subscriptions: subs.length,
      event_id: eventId,
    });
    return { enqueued: subs.length };
  } catch (err: any) {
    // Fire-and-forget. Never let emit failures bubble up to the caller.
    log.error("emit failed", { error: err?.message, type, user_id: userId });
    return { enqueued: 0 };
  }
}

/* ─── Retry policy ────────────────────────────────────────────────────
 * 5 attempts with the schedule below. After the 5th attempt fails the
 * row is marked 'dead' and never retried again until admin replay.
 * ───────────────────────────────────────────────────────────────── */
export const RETRY_BACKOFF_MS = [
  1 * 60_000, //   1m  — first retry
  5 * 60_000, //   5m
  30 * 60_000, //  30m
  2 * 60 * 60_000, // 2h
  12 * 60 * 60_000, // 12h
] as const;

export const MAX_DELIVERY_ATTEMPTS = RETRY_BACKOFF_MS.length;

/* ─── HMAC signing ────────────────────────────────────────────────────
 * Stripe-style header: `t=<unix_seconds>,v1=<hex>`. Subscribers verify
 * by recomputing HMAC-SHA256 of `${t}.${rawBody}` with their secret and
 * comparing with crypto.timingSafeEqual against v1.
 *
 * Exported so the worker (and tests) can build the same header.
 * ───────────────────────────────────────────────────────────────── */
export function signWebhookPayload(
  secret: string,
  body: string,
  timestampSec: number = Math.floor(Date.now() / 1000),
): { header: string; timestamp: number; signature: string } {
  const signedPayload = `${timestampSec}.${body}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");
  return {
    header: `t=${timestampSec},v1=${signature}`,
    timestamp: timestampSec,
    signature,
  };
}

/** Constant-time verification helper. Exported for parity tests + dev docs. */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string,
  toleranceSec = 300,
): boolean {
  try {
    const parts = Object.fromEntries(
      header.split(",").map((kv) => {
        const i = kv.indexOf("=");
        return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
      }),
    );
    const t = Number.parseInt(String(parts.t ?? ""), 10);
    const v1 = String(parts.v1 ?? "");
    if (!Number.isFinite(t) || !v1) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - t) > toleranceSec) return false;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${t}.${body}`, "utf8")
      .digest("hex");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(v1, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Compute next_attempt_at for a delivery that just failed.
 * Returns null when the retry ladder is exhausted (caller should mark 'dead').
 */
export function computeNextAttemptAt(attemptCount: number): Date | null {
  if (attemptCount >= MAX_DELIVERY_ATTEMPTS) return null;
  const ms = RETRY_BACKOFF_MS[attemptCount];
  return new Date(Date.now() + ms);
}
