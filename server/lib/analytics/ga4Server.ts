/**
 * Google Analytics 4 — server-side Measurement Protocol.
 *
 * Some funnel-critical events happen entirely server-side (Stripe
 * webhooks, scheduled jobs, server-rendered transactional emails) and
 * have no browser to fire `gtag('event', …)` from. The Measurement
 * Protocol is GA4's REST surface for posting those events directly.
 *
 *   POST https://www.google-analytics.com/mp/collect
 *       ?measurement_id=G-XXXXXXX&api_secret=...
 *
 *   { client_id, events: [{ name, params }] }
 *
 * Hard rules:
 *
 *   - SERVER-ONLY module. The API secret is loaded from
 *     `GA4_MEASUREMENT_PROTOCOL_API_SECRET` (Doppler) at call time and
 *     MUST never reach the client bundle. A CI guard
 *     (`scripts/check-no-mp-secret-in-client.mjs`) enforces this.
 *   - Production only. Dev/staging never call the live endpoint, so
 *     funnel numbers stay clean.
 *   - Fire-and-forget — wrapped in try/catch, never throws. Stripe
 *     webhook latency must not depend on GA's response.
 *   - `client_id` is required by the MP spec. For pure-server events
 *     (no browser context) we synthesise a stable opaque id from the
 *     entity-level identifier the caller passes (e.g. Stripe customer
 *     id). That preserves per-customer unique-user counts without
 *     leaking anything identifying back to GA.
 */

import crypto from "node:crypto";
import { createLogger } from "../logger";

const log = createLogger("Ga4Server");

const MP_URL = "https://www.google-analytics.com/mp/collect";

interface Ga4EventParams {
  [key: string]: string | number | boolean | null | undefined;
}

interface SendOptions {
  /**
   * Stable per-user identifier. GA4 requires this. For browser events
   * it's the `_ga` cookie; for server events we deterministically derive
   * one from a stable upstream id (Stripe customer id is ideal — same
   * customer's purchases collapse to one "user" in GA reports).
   */
  clientId: string;
  name: string;
  params?: Ga4EventParams;
}

/**
 * Hash an arbitrary stable id into a GA-shaped `client_id` (10-digit
 * timestamp + 10-digit random suffix style — GA accepts any non-empty
 * string under 128 chars, but mimicking the shape avoids tripping any
 * future filters).
 *
 * Idempotent: same input → same output.
 */
export function clientIdFromStableId(stableId: string): string {
  const hash = crypto.createHash("sha256").update(stableId).digest("hex");
  // 10 digits "." 10 digits, mimicking GA4's GA1.1.<random>.<timestamp>
  const a = parseInt(hash.slice(0, 8), 16) % 10_000_000_000;
  const b = parseInt(hash.slice(8, 16), 16) % 10_000_000_000;
  return `${a}.${b}`;
}

/**
 * Send a single GA4 event via the Measurement Protocol.
 *
 * Returns silently on any failure path (missing env, non-prod, fetch
 * error, non-2xx). Logs at debug/warn for diagnostics but never throws
 * — calling code can `void sendGA4Event(...)` safely from anywhere.
 */
export async function sendGA4Event({ clientId, name, params }: SendOptions): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;

  const measurementId = process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_MEASUREMENT_PROTOCOL_API_SECRET;
  if (!measurementId || !apiSecret) {
    // Soft-warn once per process startup happens elsewhere; here we
    // stay quiet to avoid flooding logs on every webhook.
    return;
  }

  if (!clientId || !name) return;

  const url = `${MP_URL}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  const body = JSON.stringify({
    client_id: clientId,
    events: [{ name, params: params ?? {} }],
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        log.warn("GA4 MP non-2xx response", { status: res.status, eventName: name, body: txt.slice(0, 200) });
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    log.warn("GA4 MP request failed", {
      eventName: name,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
