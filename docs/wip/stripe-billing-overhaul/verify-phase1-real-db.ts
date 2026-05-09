/**
 * Phase 1 — REAL DB verification.
 *
 * Verifies the Stripe webhook Phase 1 safety fixes (idempotency table,
 * payment_intent storage, subscription metadata persistence, pending →
 * active flip) against an actual Postgres database connected via
 * DATABASE_URL and a running app server.
 *
 * Unlike scripts/verify-stripe-phase1-safety.ts and
 * scripts/smoke-billing-recovery-local.ts (which use in-memory stubs),
 * this script:
 *   - Talks to real Postgres via the same Drizzle client the app uses
 *   - POSTs synthetic signed webhooks to the actually-running app server
 *   - Reads back rows from real tables to assert behavior
 *   - Cleans up every row it inserted, in FK-safe order, in a finally block
 *
 * SAFETY GUARANTEES (enforced before any DB write):
 *   1. Refuses to run if NODE_ENV=production
 *   2. Refuses if STRIPE_BILLING_WEBHOOK_SECRET is missing (would mean
 *      we can't sign webhooks the running server will accept)
 *   3. Uses only synthetic Stripe ids (cs_test_phase1verify_*, pi_…, sub_…,
 *      cus_…, evt_…) — no real Stripe ids touched
 *   4. Does NOT call any Stripe API. No SDK methods are invoked beyond
 *      `Stripe.webhooks.generateTestHeaderString()` (pure local crypto).
 *   5. Test client's contact_email lives on `phase1-test.invalid` so any
 *      SMTP delivery the running server attempts will bounce, not reach
 *      a real recipient.
 *
 * Required env:
 *   DATABASE_URL                       — same Postgres the running server uses
 *   STRIPE_BILLING_WEBHOOK_SECRET      — same secret the running server has
 *   SERVER_URL (optional)              — default http://127.0.0.1:5000
 *
 * Usage on Replit (server running on port 5000):
 *   STRIPE_BILLING_WEBHOOK_SECRET=whsec_... npx tsx \
 *     scripts/verify-stripe-phase1-replit-db.ts
 *
 * Exits 0 on full pass, non-zero on any failure. Cleanup always runs.
 */

/* eslint-disable no-console */

import crypto from "crypto";
import Stripe from "stripe";

/* ─── 0. Hard guards ─────────────────────────────────────────────── */
if (process.env.NODE_ENV === "production") {
  console.error("✗ REFUSING TO RUN: NODE_ENV=production. This script writes test rows to the live DB and is dev/staging only.");
  process.exit(2);
}

const SERVER_URL = process.env.SERVER_URL || "http://127.0.0.1:5000";
const WEBHOOK_SECRET = process.env.STRIPE_BILLING_WEBHOOK_SECRET || "";
if (!WEBHOOK_SECRET) {
  console.error("✗ STRIPE_BILLING_WEBHOOK_SECRET must be set (must match the running server's secret so signed webhooks are accepted).");
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error("✗ DATABASE_URL must be set.");
  process.exit(2);
}

/* ─── 1. Imports that read process.env (Drizzle pool reads DATABASE_URL) ── */
const { db } = await import("../server/db");
const {
  clients, clientServices, clientPayments, serviceCatalog,
  processedStripeEvents, users, passwordResetTokens, adminActivityLog,
} = await import("@shared/schema");
const { eq, sql, inArray, and } = await import("drizzle-orm");

/* ─── 2. Per-run identifiers (unique, traceable, easy to audit) ───── */
const RUN_ID = crypto.randomBytes(6).toString("hex");                 // 12-char tag
const TAG_PREFIX = `phase1verify_${RUN_ID}`;
const TEST_SERVICE_ID = `__phase1_test_${RUN_ID}`;
const TEST_EMAIL      = `phase1-test-${RUN_ID}@phase1-test.invalid`;
const STRIPE_CUSTOMER = `cus_test_${TAG_PREFIX}`;
const STRIPE_SESSION  = `cs_test_${TAG_PREFIX}`;
const STRIPE_PI       = `pi_test_${TAG_PREFIX}`;
const STRIPE_SUB      = `sub_test_${TAG_PREFIX}`;
const STRIPE_EVENT    = `evt_test_${TAG_PREFIX}`;

console.log("══════════════════════════════════════════════════════════════════");
console.log(`  PHASE 1 — REAL DB VERIFICATION (run ${RUN_ID})`);
console.log("══════════════════════════════════════════════════════════════════");
console.log(`  DATABASE_URL  : ${maskDsn(process.env.DATABASE_URL!)}`);
console.log(`  SERVER_URL    : ${SERVER_URL}`);
console.log(`  Test service  : ${TEST_SERVICE_ID}`);
console.log(`  Test email    : ${TEST_EMAIL}`);
console.log(`  Stripe event  : ${STRIPE_EVENT}`);
console.log("");

let pass = 0;
let fail = 0;
const record = (step: string, ok: boolean, detail: string) => {
  console.log(`  ${ok ? "✓" : "✗"} ${step} — ${detail}`);
  ok ? pass++ : fail++;
};

/* ─── 3. Track inserted IDs for cleanup ─────────────────────────── */
const created: {
  serviceId?: string;
  clientId?: number;
  clientServiceId?: number;
  clientPaymentId?: number;
  userIdCreatedByWebhook?: number;
} = {};

async function cleanup() {
  console.log("\n[cleanup] Removing test rows…");
  try {
    // password_reset_tokens — created by the account-welcome email path
    if (created.userIdCreatedByWebhook) {
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.user_id, created.userIdCreatedByWebhook));
    }
    // admin_activity_log — entries written by the webhook for our test entities
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
    if (created.clientPaymentId) {
      await db.delete(clientPayments).where(eq(clientPayments.id, created.clientPaymentId));
    }
    if (created.clientServiceId) {
      await db.delete(clientServices).where(eq(clientServices.id, created.clientServiceId));
    }
    if (created.clientId) {
      // Null out user_id first to avoid FK chain trouble
      await db.update(clients).set({ user_id: null }).where(eq(clients.id, created.clientId));
      await db.delete(clients).where(eq(clients.id, created.clientId));
    }
    if (created.userIdCreatedByWebhook) {
      await db.delete(users).where(eq(users.id, created.userIdCreatedByWebhook));
    }
    if (created.serviceId) {
      await db.delete(serviceCatalog).where(eq(serviceCatalog.id, created.serviceId));
    }
    // processed_stripe_events for our event id
    await db.delete(processedStripeEvents).where(eq(processedStripeEvents.stripe_event_id, STRIPE_EVENT));
    console.log("[cleanup] Done.");
  } catch (err: any) {
    console.error(`[cleanup] FAILED: ${err.message}`);
    console.error("[cleanup] You may need to delete these rows manually:");
    console.error(`  service_catalog.id          = '${created.serviceId ?? "(none)"}'`);
    console.error(`  clients.id                  = ${created.clientId ?? "(none)"}`);
    console.error(`  client_services.id          = ${created.clientServiceId ?? "(none)"}`);
    console.error(`  client_payments.id          = ${created.clientPaymentId ?? "(none)"}`);
    console.error(`  users.id                    = ${created.userIdCreatedByWebhook ?? "(none)"}`);
    console.error(`  processed_stripe_events     = stripe_event_id = '${STRIPE_EVENT}'`);
  }
}

let exitCode = 0;
try {
  /* ─── 4. Verify processed_stripe_events table exists ─────────── */
  console.log("[1] processed_stripe_events table exists");
  const tableProbe = await db.execute(
    sql`SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'processed_stripe_events' LIMIT 1`,
  );
  const tableExists = (tableProbe as any).rows?.length === 1 || (tableProbe as any).length === 1;
  record("table processed_stripe_events", tableExists, tableExists ? "exists" : "MISSING — run migrations/0002_processed_stripe_events.sql");
  if (!tableExists) throw new Error("Phase 1 migration not applied — abort");

  // Verify the unique constraint and the processed_at index
  const idxProbe = await db.execute(sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'processed_stripe_events'
  `);
  const indexNames: string[] = ((idxProbe as any).rows ?? idxProbe ?? []).map((r: any) => r.indexname);
  record(
    "unique index on stripe_event_id",
    indexNames.some((n) => n.includes("stripe_event_id")),
    `indexes=[${indexNames.join(", ")}]`,
  );
  record(
    "processed_at index",
    indexNames.includes("idx_processed_stripe_events_processed_at"),
    indexNames.includes("idx_processed_stripe_events_processed_at") ? "present" : "MISSING",
  );

  /* ─── 5. Insert test fixtures (real DB) ──────────────────────── */
  console.log("\n[2] Inserting test fixtures");
  await db.insert(serviceCatalog).values({
    id: TEST_SERVICE_ID,
    name: `__Phase1 Verify (${RUN_ID})`,
    category: "leads",
    default_price: 9700,
    billing_period: "monthly",
    delivery_pattern: "always_on",
    is_active: true,
    sort_order: 9999,
  });
  created.serviceId = TEST_SERVICE_ID;

  const [insertedClient] = await db.insert(clients).values({
    business_name: `__Phase1 Verify Client (${RUN_ID})`,
    contact_name: "Phase 1 Tester",
    contact_email: TEST_EMAIL,
    status: "lead",
    source: "manual",
    stripe_customer_id: STRIPE_CUSTOMER,
  }).returning({ id: clients.id });
  created.clientId = insertedClient.id;

  const [insertedCs] = await db.insert(clientServices).values({
    client_id: insertedClient.id,
    service_id: TEST_SERVICE_ID,
    status: "pending",
    enabled: true,
    fulfillment_mode: "internal",
    price_cents: 9700,
    billing_period: "monthly",
    metadata: { phase1_test_run: RUN_ID } as any,
  }).returning({ id: clientServices.id });
  created.clientServiceId = insertedCs.id;

  const [insertedPay] = await db.insert(clientPayments).values({
    client_id: insertedClient.id,
    client_service_id: insertedCs.id,
    type: "invoice",
    amount_cents: 9700,
    status: "pending",
    description: `__Phase1 Verify Payment (${RUN_ID})`,
    actor_type: "system",
    metadata: { phase1_test_run: RUN_ID } as any,
  }).returning({ id: clientPayments.id });
  created.clientPaymentId = insertedPay.id;

  console.log(
    `  fixtures: service_catalog.id=${TEST_SERVICE_ID}` +
    ` clients.id=${insertedClient.id}` +
    ` client_services.id=${insertedCs.id}` +
    ` client_payments.id=${insertedPay.id}`,
  );

  /* ─── 6. Build and sign synthetic checkout.session.completed ── */
  const eventBody = JSON.stringify({
    id: STRIPE_EVENT,
    object: "event",
    api_version: "2025-01-27.acacia",
    created: Math.floor(Date.now() / 1000),
    type: "checkout.session.completed",
    data: { object: {
      id: STRIPE_SESSION,
      object: "checkout.session",
      customer: STRIPE_CUSTOMER,
      payment_intent: STRIPE_PI,
      subscription: STRIPE_SUB,
      amount_total: 9700,
      currency: "usd",
      mode: "subscription",
      payment_status: "paid",
      status: "complete",
      metadata: {
        crm_client_id: String(insertedClient.id),
        service_catalog_id: TEST_SERVICE_ID,
        source: "public_checkout",
      },
    } },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  });
  const sig = Stripe.webhooks.generateTestHeaderString({ payload: eventBody, secret: WEBHOOK_SECRET });

  /* ─── 7. POST first delivery ──────────────────────────────────── */
  console.log("\n[3] First webhook delivery");
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
  if (r1.status !== 200) throw new Error("First delivery failed — abort");

  // Wait for fire-and-forget side effects (account creation, emails, etc.)
  await new Promise((r) => setTimeout(r, 1500));

  /* ─── 8. Verify DB state ─────────────────────────────────────── */
  console.log("\n[4] DB assertions after first delivery");

  // 8a. processed_stripe_events row
  const pseRows = await db.select().from(processedStripeEvents).where(eq(processedStripeEvents.stripe_event_id, STRIPE_EVENT));
  record(
    "processed_stripe_events row inserted",
    pseRows.length === 1,
    `rows=${pseRows.length} event_type=${pseRows[0]?.event_type}`,
  );

  // 8b. client_services flipped pending → active + has subscription id
  const [csAfter] = await db.select().from(clientServices).where(eq(clientServices.id, insertedCs.id));
  record(
    "client_services.status pending → active",
    csAfter?.status === "active",
    `status=${csAfter?.status}`,
  );
  const csMeta = (csAfter?.metadata as Record<string, any>) ?? {};
  record(
    "client_services.metadata.stripe_subscription_id stored",
    csMeta.stripe_subscription_id === STRIPE_SUB,
    `stripe_subscription_id=${csMeta.stripe_subscription_id}`,
  );
  record(
    "client_services.metadata preserves prior fields",
    csMeta.phase1_test_run === RUN_ID,
    `phase1_test_run=${csMeta.phase1_test_run}`,
  );
  record(
    "client_services.started_at populated",
    !!csAfter?.started_at,
    `started_at=${csAfter?.started_at}`,
  );

  // 8c. client_payments correct ids
  const [payAfter] = await db.select().from(clientPayments).where(eq(clientPayments.id, insertedPay.id));
  record(
    "client_payments.status pending → paid",
    payAfter?.status === "paid",
    `status=${payAfter?.status}`,
  );
  record(
    "client_payments.stripe_payment_intent_id is REAL pi_, not session id",
    payAfter?.stripe_payment_intent_id === STRIPE_PI,
    `stripe_payment_intent_id=${payAfter?.stripe_payment_intent_id}`,
  );
  const payMeta = (payAfter?.metadata as Record<string, any>) ?? {};
  record(
    "client_payments.metadata.stripe_checkout_session_id is the session id",
    payMeta.stripe_checkout_session_id === STRIPE_SESSION,
    `stripe_checkout_session_id=${payMeta.stripe_checkout_session_id}`,
  );

  // Capture any user the webhook created so cleanup can remove it.
  const [refreshedClient] = await db.select().from(clients).where(eq(clients.id, insertedClient.id));
  if (refreshedClient?.user_id) {
    created.userIdCreatedByWebhook = refreshedClient.user_id;
  }

  /* ─── 9. Replay — must be deduped ────────────────────────────── */
  console.log("\n[5] Replay same event id");
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

  // 9a. Still exactly one processed_stripe_events row for this event id
  const pseAfterReplay = await db.select().from(processedStripeEvents).where(eq(processedStripeEvents.stripe_event_id, STRIPE_EVENT));
  record(
    "no duplicate row in processed_stripe_events",
    pseAfterReplay.length === 1,
    `rows=${pseAfterReplay.length}`,
  );
  // 9b. client_payments was not double-mutated
  const [payAfterReplay] = await db.select().from(clientPayments).where(eq(clientPayments.id, insertedPay.id));
  record(
    "client_payments.status still paid (not re-mutated)",
    payAfterReplay?.status === "paid",
    `status=${payAfterReplay?.status}`,
  );
} catch (err: any) {
  console.error(`\n✗ ABORTED: ${err.message}`);
  exitCode = 1;
} finally {
  await cleanup();
  // Close pool so the process exits cleanly
  try {
    const { pool } = await import("../server/db");
    await pool.end();
  } catch { /* noop */ }
}

console.log("\n══════════════════════════════════════════════════════════════════");
console.log(`  REAL DB VERIFICATION RESULTS — ${pass} passed, ${fail} failed`);
console.log("══════════════════════════════════════════════════════════════════\n");
process.exit(exitCode === 0 ? (fail === 0 ? 0 : 1) : exitCode);

/* ─── helpers ─────────────────────────────────────────────────── */
function maskDsn(dsn: string): string {
  return dsn.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
}
