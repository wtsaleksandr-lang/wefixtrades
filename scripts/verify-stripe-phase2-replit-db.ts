/**
 * Phase 2 — REAL DB verification (charge.refunded only for now).
 *
 * Mirrors scripts/verify-stripe-phase1-replit-db.ts. Inserts isolated
 * test fixtures into the real Postgres, posts a synthetic signed
 * charge.refunded webhook to the running app server, reads back rows
 * to assert behavior, then cleans up.
 *
 * SAFETY GUARANTEES:
 *   1. Refuses to run if NODE_ENV=production
 *   2. Refuses if STRIPE_BILLING_WEBHOOK_SECRET is missing
 *   3. Uses only synthetic Stripe ids
 *   4. Does NOT call any Stripe API
 *   5. Test client's contact_email lives on phase2-test.invalid
 *
 * Required env:
 *   DATABASE_URL                    — same Postgres the running server uses
 *   STRIPE_BILLING_WEBHOOK_SECRET   — same secret the running server has
 *   SERVER_URL (optional)           — default http://127.0.0.1:5001
 *
 * Phase 2-Commit-B will extend this with payment_intent.payment_failed.
 */

/* eslint-disable no-console */

import crypto from "crypto";
import Stripe from "stripe";

if (process.env.NODE_ENV === "production") {
  console.error("✗ REFUSING TO RUN: NODE_ENV=production. This script writes test rows and is dev/staging only.");
  process.exit(2);
}

const SERVER_URL = process.env.SERVER_URL || "http://127.0.0.1:5001";
const WEBHOOK_SECRET = process.env.STRIPE_BILLING_WEBHOOK_SECRET || "";
if (!WEBHOOK_SECRET) {
  console.error("✗ STRIPE_BILLING_WEBHOOK_SECRET must be set.");
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error("✗ DATABASE_URL must be set.");
  process.exit(2);
}

const { db } = await import("../server/db");
const {
  clients, clientServices, clientPayments, serviceCatalog,
  processedStripeEvents, adminActivityLog,
} = await import("@shared/schema");
const { eq, and } = await import("drizzle-orm");

const RUN_ID = crypto.randomBytes(6).toString("hex");
const TAG = `phase2refund_${RUN_ID}`;
const TEST_SERVICE_ID = `__phase2_test_${RUN_ID}`;
const TEST_EMAIL      = `phase2-test-${RUN_ID}@phase2-test.invalid`;
const STRIPE_CUSTOMER = `cus_test_${TAG}`;
const STRIPE_PI       = `pi_test_${TAG}`;
const STRIPE_CHARGE   = `ch_test_${TAG}`;
const STRIPE_REFUND   = `re_test_${TAG}`;
const STRIPE_EVENT    = `evt_test_${TAG}`;

console.log("══════════════════════════════════════════════════════════════════");
console.log(`  PHASE 2 — REAL DB VERIFICATION (charge.refunded, run ${RUN_ID})`);
console.log("══════════════════════════════════════════════════════════════════");
console.log(`  DATABASE_URL  : ${maskDsn(process.env.DATABASE_URL!)}`);
console.log(`  SERVER_URL    : ${SERVER_URL}`);
console.log(`  Test service  : ${TEST_SERVICE_ID}`);
console.log(`  Stripe event  : ${STRIPE_EVENT}`);
console.log("");

let pass = 0;
let fail = 0;
const record = (step: string, ok: boolean, detail: string) => {
  console.log(`  ${ok ? "✓" : "✗"} ${step} — ${detail}`);
  ok ? pass++ : fail++;
};

const created: {
  serviceId?: string;
  clientId?: number;
  clientServiceId?: number;
  originatingPaymentId?: number;
  refundPaymentId?: number;
} = {};

async function cleanup() {
  console.log("\n[cleanup] Removing test rows…");
  try {
    if (created.clientId) {
      await db.delete(adminActivityLog).where(and(
        eq(adminActivityLog.entity_type, "client"),
        eq(adminActivityLog.entity_id, created.clientId),
      ));
    }
    if (created.clientServiceId) {
      await db.delete(adminActivityLog).where(and(
        eq(adminActivityLog.entity_type, "client_service"),
        eq(adminActivityLog.entity_id, created.clientServiceId),
      ));
    }
    // Delete refund row first (created during the test), then originating
    if (created.refundPaymentId) {
      await db.delete(clientPayments).where(eq(clientPayments.id, created.refundPaymentId));
    }
    if (created.originatingPaymentId) {
      await db.delete(clientPayments).where(eq(clientPayments.id, created.originatingPaymentId));
    }
    if (created.clientServiceId) {
      await db.delete(clientServices).where(eq(clientServices.id, created.clientServiceId));
    }
    if (created.clientId) {
      await db.delete(clients).where(eq(clients.id, created.clientId));
    }
    if (created.serviceId) {
      await db.delete(serviceCatalog).where(eq(serviceCatalog.id, created.serviceId));
    }
    await db.delete(processedStripeEvents).where(eq(processedStripeEvents.stripe_event_id, STRIPE_EVENT));
    console.log("[cleanup] Done.");
  } catch (err: any) {
    console.error(`[cleanup] FAILED: ${err.message}`);
    console.error("Manual cleanup ids:", JSON.stringify(created));
    console.error(`processed_stripe_events.stripe_event_id = '${STRIPE_EVENT}'`);
  }
}

let exitCode = 0;
try {
  /* ─── Insert test fixtures ─── */
  console.log("[1] Inserting test fixtures");
  await db.insert(serviceCatalog).values({
    id: TEST_SERVICE_ID,
    name: `__Phase2 Refund Verify (${RUN_ID})`,
    category: "leads",
    default_price: 9700,
    billing_period: "monthly",
    delivery_pattern: "always_on",
    is_active: true,
    sort_order: 9999,
  });
  created.serviceId = TEST_SERVICE_ID;

  const [insertedClient] = await db.insert(clients).values({
    business_name: `__Phase2 Refund Verify Client (${RUN_ID})`,
    contact_name: "Phase 2 Refund Tester",
    contact_email: TEST_EMAIL,
    status: "active",
    source: "manual",
    stripe_customer_id: STRIPE_CUSTOMER,
  }).returning({ id: clients.id });
  created.clientId = insertedClient.id;

  const [insertedCs] = await db.insert(clientServices).values({
    client_id: insertedClient.id,
    service_id: TEST_SERVICE_ID,
    status: "active",
    enabled: true,
    fulfillment_mode: "internal",
    price_cents: 9700,
    billing_period: "monthly",
    started_at: new Date(),
    metadata: { phase2_test_run: RUN_ID } as any,
  }).returning({ id: clientServices.id });
  created.clientServiceId = insertedCs.id;

  const [insertedPay] = await db.insert(clientPayments).values({
    client_id: insertedClient.id,
    client_service_id: insertedCs.id,
    type: "invoice",
    amount_cents: 9700,
    status: "paid",
    paid_at: new Date(),
    description: `__Phase2 Refund Verify Payment (${RUN_ID})`,
    stripe_payment_intent_id: STRIPE_PI,
    actor_type: "system",
    metadata: { phase2_test_run: RUN_ID } as any,
  }).returning({ id: clientPayments.id });
  created.originatingPaymentId = insertedPay.id;

  console.log(
    `  fixtures: service=${TEST_SERVICE_ID} client=${insertedClient.id} cs=${insertedCs.id} payment=${insertedPay.id}`,
  );

  /* ─── Build signed charge.refunded ─── */
  const eventBody = JSON.stringify({
    id: STRIPE_EVENT,
    object: "event",
    api_version: "2025-01-27.acacia",
    created: Math.floor(Date.now() / 1000),
    type: "charge.refunded",
    data: { object: {
      id: STRIPE_CHARGE,
      object: "charge",
      payment_intent: STRIPE_PI,
      customer: STRIPE_CUSTOMER,
      amount: 9700,
      amount_refunded: 9700,
      currency: "usd",
      refunded: true,
      refunds: { object: "list", data: [{ id: STRIPE_REFUND, object: "refund", amount: 9700 }] },
    } },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  });
  const sig = Stripe.webhooks.generateTestHeaderString({ payload: eventBody, secret: WEBHOOK_SECRET });

  /* ─── First delivery ─── */
  console.log("\n[2] First webhook delivery");
  const r1 = await fetch(`${SERVER_URL}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": sig },
    body: eventBody,
  });
  const j1 = await r1.json().catch(() => ({}));
  record(
    "first delivery → 200 (not duplicate)",
    r1.status === 200 && (j1 as any).duplicate !== true,
    `HTTP ${r1.status} body=${JSON.stringify(j1)}`,
  );
  if (r1.status !== 200) throw new Error("First delivery failed");

  await new Promise((r) => setTimeout(r, 1500));

  /* ─── Real-DB assertions ─── */
  console.log("\n[3] DB assertions after first delivery");

  // 3a. processed_stripe_events row
  const pse = await db.select().from(processedStripeEvents).where(eq(processedStripeEvents.stripe_event_id, STRIPE_EVENT));
  record("processed_stripe_events row inserted", pse.length === 1, `rows=${pse.length}`);

  // 3b. originating payment marked refunded
  const [origAfter] = await db.select().from(clientPayments).where(eq(clientPayments.id, insertedPay.id));
  record(
    "originating client_payments.status: paid → refunded",
    origAfter?.status === "refunded",
    `status=${origAfter?.status}`,
  );

  // 3c. new refund row exists with negative amount
  const refundRows = await db.select().from(clientPayments).where(and(
    eq(clientPayments.client_id, insertedClient.id),
    eq(clientPayments.type, "refund"),
  ));
  record(
    "refund row created (type='refund', amount<0)",
    refundRows.length === 1 && refundRows[0].amount_cents === -9700,
    `count=${refundRows.length} amount=${refundRows[0]?.amount_cents}`,
  );
  if (refundRows[0]) created.refundPaymentId = refundRows[0].id;

  // 3d. refund row has correct stripe ids
  const refundRow = refundRows[0];
  record(
    "refund row stripe_payment_intent_id is the real PI (not session id)",
    refundRow?.stripe_payment_intent_id === STRIPE_PI,
    `pi=${refundRow?.stripe_payment_intent_id}`,
  );
  const refMeta = (refundRow?.metadata as Record<string, any>) ?? {};
  record(
    "refund row metadata.stripe_charge_id stores the charge id",
    refMeta.stripe_charge_id === STRIPE_CHARGE,
    `stripe_charge_id=${refMeta.stripe_charge_id}`,
  );
  record(
    "refund row metadata.is_full_refund=true",
    refMeta.is_full_refund === true,
    `is_full_refund=${refMeta.is_full_refund}`,
  );

  // 3e. linked service flipped to cancelled
  const [csAfter] = await db.select().from(clientServices).where(eq(clientServices.id, insertedCs.id));
  record(
    "active monthly client_services flipped: active → cancelled",
    csAfter?.status === "cancelled" && !!csAfter?.cancelled_at,
    `status=${csAfter?.status} cancelled_at=${csAfter?.cancelled_at}`,
  );

  // 3f. cs metadata preserved
  const csMeta = (csAfter?.metadata as Record<string, any>) ?? {};
  record(
    "client_services.metadata.phase2_test_run preserved",
    csMeta.phase2_test_run === RUN_ID,
    `phase2_test_run=${csMeta.phase2_test_run}`,
  );

  /* ─── Replay → duplicate ─── */
  console.log("\n[4] Replay protection");
  const beforePse = pse.length;
  const r2 = await fetch(`${SERVER_URL}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": sig },
    body: eventBody,
  });
  const j2 = await r2.json().catch(() => ({}));
  record(
    "replay → 200 { duplicate: true }",
    r2.status === 200 && (j2 as any).duplicate === true,
    `HTTP ${r2.status} body=${JSON.stringify(j2)}`,
  );
  await new Promise((r) => setTimeout(r, 500));

  const pseAfter = await db.select().from(processedStripeEvents).where(eq(processedStripeEvents.stripe_event_id, STRIPE_EVENT));
  record("no duplicate processed_stripe_events row", pseAfter.length === beforePse, `rows=${pseAfter.length}`);

  const refundsAfter = await db.select().from(clientPayments).where(and(
    eq(clientPayments.client_id, insertedClient.id),
    eq(clientPayments.type, "refund"),
  ));
  record("no second refund row inserted on replay", refundsAfter.length === 1, `refund rows=${refundsAfter.length}`);
} catch (err: any) {
  console.error(`\n✗ ABORTED: ${err.message}`);
  exitCode = 1;
} finally {
  await cleanup();
  try {
    const { pool } = await import("../server/db");
    await pool.end();
  } catch { /* noop */ }
}

console.log("\n══════════════════════════════════════════════════════════════════");
console.log(`  PHASE 2 REAL-DB RESULTS — ${pass} passed, ${fail} failed`);
console.log("══════════════════════════════════════════════════════════════════\n");
process.exit(exitCode === 0 ? (fail === 0 ? 0 : 1) : exitCode);

function maskDsn(dsn: string): string {
  return dsn.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
}
