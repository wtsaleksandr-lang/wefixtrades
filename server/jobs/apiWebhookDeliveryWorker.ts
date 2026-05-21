/**
 * API Webhook Delivery Worker (Wave AQ-3).
 *
 * Drains the api_webhook_deliveries queue. Runs every 30s via the
 * scheduler. Per-tick:
 *
 *   1. SELECT pending rows with next_attempt_at <= now() (cap N per tick).
 *   2. For each, look up the subscription's url + secret.
 *   3. Sign the payload with HMAC-SHA256, POST it with a 10s timeout.
 *   4. On 2xx → status='succeeded', stamp succeeded_at.
 *      On non-2xx or transport error → bump attempt_count, set
 *      next_attempt_at via the retry ladder. If we just hit the cap,
 *      status='dead'.
 *
 * Idempotency on restart: rows are claimed-in-place by atomically
 * advancing their status. If the worker dies mid-POST, the row stays
 * 'pending' and the next tick will retry it. We do NOT mark a row as
 * 'in_flight' because postgres-only locking with `FOR UPDATE SKIP
 * LOCKED` inside a worker transaction would prevent the same row from
 * being picked up by two ticks of the same process — but a crash
 * between the lock release and the response write would leave the row
 * stuck. Idempotency at the subscriber side (event_id) is the
 * authoritative dedup mechanism.
 */

import { db } from "../db";
import { apiWebhooks, apiWebhookDeliveries } from "@shared/schema";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import {
  computeNextAttemptAt,
  signWebhookPayload,
  MAX_DELIVERY_ATTEMPTS,
} from "../services/apiWebhookDispatcher";
import { createLogger } from "../lib/logger";

const log = createLogger("ApiWebhookDeliveryWorker");

/** How many deliveries to attempt per worker tick. */
const BATCH_SIZE = 25;

/** HTTP timeout per delivery POST. */
const DELIVERY_TIMEOUT_MS = 10_000;

export interface ApiWebhookDeliveryWorkerResult {
  processed: number;
  succeeded: number;
  failed: number;
  dead: number;
  no_subscription: number;
}

export async function processApiWebhookDeliveries(): Promise<ApiWebhookDeliveryWorkerResult> {
  const result: ApiWebhookDeliveryWorkerResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    dead: 0,
    no_subscription: 0,
  };

  // Pull due-now rows. The partial index `idx_api_webhook_deliveries_pending_due`
  // covers this exact query (status = 'pending' is implicit in the index WHERE).
  const due = await db
    .select()
    .from(apiWebhookDeliveries)
    .where(
      and(
        eq(apiWebhookDeliveries.status, "pending"),
        lte(apiWebhookDeliveries.next_attempt_at, new Date()),
      ),
    )
    .orderBy(asc(apiWebhookDeliveries.next_attempt_at))
    .limit(BATCH_SIZE);

  if (due.length === 0) return result;

  log.info(`[webhook-delivery] draining ${due.length} row(s)`);

  for (const row of due) {
    result.processed++;
    try {
      // Resolve subscription. If it was revoked/deleted between enqueue and
      // delivery, mark the row succeeded-with-skip (status 'dead') so we don't
      // keep re-trying a subscription that's gone.
      const [sub] = await db
        .select({
          url: apiWebhooks.url,
          secret: apiWebhooks.secret,
          status: apiWebhooks.status,
        })
        .from(apiWebhooks)
        .where(eq(apiWebhooks.id, row.webhook_id))
        .limit(1);

      if (!sub || sub.status !== "active") {
        await db
          .update(apiWebhookDeliveries)
          .set({
            status: "dead",
            last_error: !sub ? "subscription_not_found" : `subscription_${sub.status}`,
            attempt_count: row.attempt_count + 1,
          })
          .where(eq(apiWebhookDeliveries.id, row.id));
        result.no_subscription++;
        result.dead++;
        continue;
      }

      // Serialize the payload exactly as it'll be signed. Stable JSON ordering
      // is not strictly required (subscribers verify against the raw body bytes
      // we ship, not a reconstructed version), but we keep it consistent for
      // logging + replay sanity.
      const body = JSON.stringify(row.payload);
      const { header: signatureHeader } = signWebhookPayload(sub.secret, body);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

      let responseStatus: number | null = null;
      let responseBody: string | null = null;
      let transportError: string | null = null;

      try {
        const res = await fetch(sub.url, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "WeFixTrades-Webhook/1.0",
            "X-WFT-Signature": signatureHeader,
            "X-WFT-Event-Id": row.event_id,
            "X-WFT-Event-Type": row.event_type,
          },
          body,
        });
        responseStatus = res.status;
        // Cap stored body at 4 KB — subscribers can return large error pages
        // we don't want to bloat the DB on.
        const text = await res.text().catch(() => "");
        responseBody = text.length > 4096 ? text.slice(0, 4096) : text;
      } catch (err: any) {
        transportError = err?.name === "AbortError" ? "timeout" : String(err?.message || err);
      } finally {
        clearTimeout(timer);
      }

      const ok = responseStatus !== null && responseStatus >= 200 && responseStatus < 300;
      const nextAttemptCount = row.attempt_count + 1;

      if (ok) {
        await db
          .update(apiWebhookDeliveries)
          .set({
            status: "succeeded",
            attempt_count: nextAttemptCount,
            last_response_status: responseStatus,
            last_response_body: responseBody,
            last_error: null,
            succeeded_at: new Date(),
          })
          .where(eq(apiWebhookDeliveries.id, row.id));
        // Mirror onto api_webhooks for the "last delivery" admin display.
        await db
          .update(apiWebhooks)
          .set({
            last_delivery_at: new Date(),
            last_delivery_status: responseStatus,
            total_deliveries: sql`${apiWebhooks.total_deliveries} + 1`,
            updated_at: new Date(),
          })
          .where(eq(apiWebhooks.id, row.webhook_id));
        result.succeeded++;
      } else {
        const nextAt = computeNextAttemptAt(nextAttemptCount);
        const terminal = nextAt === null;
        await db
          .update(apiWebhookDeliveries)
          .set({
            status: terminal ? "dead" : "pending",
            attempt_count: nextAttemptCount,
            next_attempt_at: nextAt ?? row.next_attempt_at,
            last_response_status: responseStatus,
            last_response_body: responseBody,
            last_error: transportError,
          })
          .where(eq(apiWebhookDeliveries.id, row.id));
        await db
          .update(apiWebhooks)
          .set({
            last_delivery_at: new Date(),
            last_delivery_status: responseStatus,
            total_deliveries: sql`${apiWebhooks.total_deliveries} + 1`,
            updated_at: new Date(),
          })
          .where(eq(apiWebhooks.id, row.webhook_id));
        if (terminal) result.dead++;
        else result.failed++;
      }
    } catch (err: any) {
      log.error("delivery row error", { id: row.id, error: err?.message });
      // Don't leave the row hot-stuck. Mark it failed; the next tick (or
      // admin replay) can retry. attempt_count bump avoids infinite loops.
      const nextAttemptCount = row.attempt_count + 1;
      const nextAt = computeNextAttemptAt(nextAttemptCount);
      await db
        .update(apiWebhookDeliveries)
        .set({
          status: nextAt === null ? "dead" : "pending",
          attempt_count: nextAttemptCount,
          next_attempt_at: nextAt ?? row.next_attempt_at,
          last_error: `worker_exception: ${err?.message ?? "unknown"}`,
        })
        .where(eq(apiWebhookDeliveries.id, row.id));
      if (nextAt === null) result.dead++;
      else result.failed++;
    }
  }

  log.info(
    `[webhook-delivery] complete: ${result.succeeded} ok, ${result.failed} retrying, ${result.dead} dead (${result.processed} processed, MAX_ATTEMPTS=${MAX_DELIVERY_ATTEMPTS})`,
  );
  return result;
}
