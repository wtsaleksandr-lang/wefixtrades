/**
 * Phase 1 safety verification — webhook hard-fail + event idempotency.
 *
 * Self-contained, no real DB, no real Stripe API. Spins up a minimal
 * express app with stripeBillingRoutes mounted twice (once with
 * NODE_ENV=production-style guard, once with dev fallback) and asserts:
 *
 *   1. PROD + missing webhook secret           → 500
 *   2. PROD + missing stripe-signature header  → 400
 *   3. DEV + no secret + unsigned event        → 200 (fallback works)
 *   4. Same Stripe event id replayed           → 200 { duplicate: true }
 *
 * Items 4-6 from the Phase 1 spec (payment_intent storage, subscription
 * metadata, pending → active flip) are simple field/state changes within
 * provisionOrConfirmService — covered by typecheck and the existing
 * smoke-billing-recovery-local.ts harness with a deeper DB stub. This
 * script focuses on the route-level safety guarantees that are easiest
 * to misconfigure in prod.
 *
 * Usage:
 *   npx tsx scripts/verify-stripe-phase1-safety.ts
 *
 * Exits 0 on success, 1 on any failure.
 */

import crypto from "crypto";

/* ── ENV setup BEFORE imports that read process.env ── */
const FRESH_WEBHOOK_SECRET = "whsec_" + crypto.randomBytes(32).toString("hex");
process.env.SMTP_HOST = "";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";
process.env.DATABASE_URL = "postgresql://localhost:5432/dummy_no_connect";
process.env.STRIPE_SECRET_KEY = "sk_test_dummy_for_phase1_verify";
process.env.SESSION_SECRET = "phase1-verify-session-secret";

/* We deliberately leave NODE_ENV unset here so we can flip it per test
 * by re-invoking the verification script as a child process. To keep
 * the script flat (no child_process), we test prod-mode via env-var
 * mutation between requests — possible because the webhook handler
 * reads NODE_ENV / STRIPE_BILLING_WEBHOOK_SECRET at request time, not
 * at module load. */

const express = (await import("express")).default;
const Stripe = (await import("stripe")).default;
const { storage } = await import("../server/storage");

/* ── In-memory processed_stripe_events store ── */
const processed = new Map<string, { event_type: string; processed_at: Date }>();
(storage as any).findProcessedStripeEvent = async (eventId: string) => {
  const hit = processed.get(eventId);
  if (!hit) return undefined;
  return { id: 1, stripe_event_id: eventId, event_type: hit.event_type, processed_at: hit.processed_at, metadata: null };
};
(storage as any).markStripeEventProcessed = async (data: any) => {
  if (!processed.has(data.stripe_event_id)) {
    processed.set(data.stripe_event_id, { event_type: data.event_type, processed_at: new Date() });
  }
  return { id: 1, stripe_event_id: data.stripe_event_id, event_type: data.event_type, processed_at: new Date(), metadata: null };
};

/* ── Stub remaining storage methods the webhook may touch in dev replay ── */
(storage as any).findClientByStripeCustomerId = async () => undefined;
(storage as any).getClientById = async () => undefined;
(storage as any).logAdminActivity = async () => ({});
(storage as any).listClientServices = async () => [];

/* ── Build app ── */
const { registerStripeBillingRoutes } = await import("../server/routes/stripeBillingRoutes");

const app = express();
app.use(express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf; } }));
app.use(express.urlencoded({ extended: false }));
registerStripeBillingRoutes(app);

const PORT = 5193;
const server = app.listen(PORT, "127.0.0.1");
await new Promise((r) => server.once("listening", r));

let pass = 0;
let fail = 0;
function record(step: string, ok: boolean, detail: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${step} — ${detail}`);
  ok ? pass++ : fail++;
}

const baseUrl = `http://127.0.0.1:${PORT}`;

function makeEvent(id: string, type: string) {
  return JSON.stringify({
    id,
    object: "event",
    api_version: "2025-01-27.acacia",
    created: Math.floor(Date.now() / 1000),
    type,
    data: { object: { id: "obj_" + id, object: "checkout.session", customer: "cus_phase1_dummy", metadata: {} } },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  });
}

try {
  /* ─── Test 1: PROD + missing webhook secret → 500 ─── */
  console.log("\n[1] PROD without STRIPE_BILLING_WEBHOOK_SECRET");
  process.env.NODE_ENV = "production";
  delete process.env.STRIPE_BILLING_WEBHOOK_SECRET;
  const r1 = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=fake" },
    body: makeEvent("evt_phase1_no_secret", "checkout.session.completed"),
  });
  record("PROD without secret → 500", r1.status === 500, `HTTP ${r1.status}`);

  /* ─── Test 2: PROD with secret but missing signature → 400 ─── */
  console.log("\n[2] PROD without stripe-signature header");
  process.env.NODE_ENV = "production";
  process.env.STRIPE_BILLING_WEBHOOK_SECRET = FRESH_WEBHOOK_SECRET;
  const r2 = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: makeEvent("evt_phase1_no_sig", "checkout.session.completed"),
  });
  record("PROD without signature → 400", r2.status === 400, `HTTP ${r2.status}`);

  /* ─── Test 3: DEV + no secret + unsigned event → 200 ─── */
  console.log("\n[3] DEV mode unsigned fallback");
  process.env.NODE_ENV = "development";
  delete process.env.STRIPE_BILLING_WEBHOOK_SECRET;
  const r3 = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: makeEvent("evt_phase1_dev_unsigned", "checkout.session.completed"),
  });
  record("DEV unsigned → 200", r3.status === 200, `HTTP ${r3.status}`);

  /* ─── Test 4: Idempotency — replay returns { duplicate: true } ─── */
  console.log("\n[4] Idempotency replay");
  process.env.NODE_ENV = "development";
  process.env.STRIPE_BILLING_WEBHOOK_SECRET = FRESH_WEBHOOK_SECRET;
  const eventId = "evt_phase1_replay_test";
  const eventBody = makeEvent(eventId, "customer.source.expiring"); // safe no-op handler
  const sig = Stripe.webhooks.generateTestHeaderString({ payload: eventBody, secret: FRESH_WEBHOOK_SECRET });

  // First delivery — must NOT be marked duplicate
  const r4a = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": sig },
    body: eventBody,
  });
  const j4a = await r4a.json();
  record(
    "first delivery → 200 (not duplicate)",
    r4a.status === 200 && j4a.duplicate !== true,
    `HTTP ${r4a.status} body=${JSON.stringify(j4a)}`,
  );

  // Second delivery — SAME event id — must be duplicate
  const r4b = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": sig },
    body: eventBody,
  });
  const j4b = await r4b.json();
  record(
    "second delivery (same event id) → 200 { duplicate: true }",
    r4b.status === 200 && j4b.duplicate === true,
    `HTTP ${r4b.status} body=${JSON.stringify(j4b)}`,
  );

  /* ─── Test 5: extractStripeIds is internal, not exported. We verify it
   *  indirectly via behavior in the existing smoke. Documented for the
   *  reader. ─── */

} finally {
  server.close();
}

console.log("\n══════════════════════════════════════════════════════════════════");
console.log(`  PHASE 1 RESULTS — ${pass} passed, ${fail} failed`);
console.log("══════════════════════════════════════════════════════════════════\n");
process.exit(fail === 0 ? 0 : 1);
