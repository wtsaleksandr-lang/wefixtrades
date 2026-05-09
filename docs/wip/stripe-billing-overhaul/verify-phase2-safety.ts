/**
 * Phase 2 safety verification — charge.refunded + payment_intent.payment_failed.
 *
 * Self-contained, no real DB, no real Stripe API. Spins up a minimal
 * express app with stripeBillingRoutes mounted, stubs the storage
 * methods the new handlers touch, and asserts:
 *
 *   charge.refunded:
 *     1. Signed charge.refunded → 200, not duplicate
 *     2. Refund row created with type='refund' and negative amount
 *     3. Full refund of active monthly service flips status → cancelled
 *     4. Partial refund leaves service status untouched
 *     5. Replay → 200 { duplicate: true }, no second refund row
 *
 *   payment_intent.payment_failed:
 *     6. PI failure (no invoice) → row flipped to 'failed' with metadata
 *     7. PI failure WITH invoice → no-op (subscription path skip)
 *     8. PI failure with no matching row → no-op (warning only)
 *     9. Replay → 200 { duplicate: true }, no double-mutation
 *
 * Usage:
 *   npx tsx scripts/verify-stripe-phase2-safety.ts
 */

import crypto from "crypto";

/* ── ENV setup BEFORE imports that read process.env ── */
const FRESH_WEBHOOK_SECRET = "whsec_" + crypto.randomBytes(32).toString("hex");
process.env.SMTP_HOST = "";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";
process.env.DATABASE_URL = "postgresql://localhost:5432/dummy_no_connect";
process.env.STRIPE_SECRET_KEY = "sk_test_dummy_for_phase2_verify";
process.env.STRIPE_BILLING_WEBHOOK_SECRET = FRESH_WEBHOOK_SECRET;
process.env.SESSION_SECRET = "phase2-verify-session-secret";
process.env.NODE_ENV = "development";

const express = (await import("express")).default;
const Stripe = (await import("stripe")).default;
const { storage } = await import("../server/storage");

/* ── In-memory test stores ── */
type Row = Record<string, any>;
const memClients = new Map<number, Row>();
const memServices = new Map<number, Row>();
const memPayments: Row[] = [];
const memActivity: Row[] = [];
const processed = new Map<string, { event_type: string; processed_at: Date }>();
let paymentIdSeq = 1000;
let activityIdSeq = 5000;

/* ── Stub storage methods the handler touches ── */
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
(storage as any).findPaymentByStripePaymentIntent = async (piId: string) => {
  return memPayments.find((p) => p.stripe_payment_intent_id === piId);
};
(storage as any).findClientByStripeCustomerId = async (cid: string) => {
  for (const c of memClients.values()) if (c.stripe_customer_id === cid) return c;
  return undefined;
};
(storage as any).getClientServiceById = async (id: number) => memServices.get(id);
(storage as any).updateClientService = async (id: number, patch: any) => {
  const cs = memServices.get(id);
  if (cs) Object.assign(cs, patch, { updated_at: new Date() });
  return cs;
};
(storage as any).updateClientPayment = async (id: number, patch: any) => {
  const p = memPayments.find((x) => x.id === id);
  if (p) Object.assign(p, patch, { updated_at: new Date() });
  return p;
};
(storage as any).createClientPayment = async (data: any) => {
  const row = { id: paymentIdSeq++, created_at: new Date(), ...data };
  memPayments.push(row);
  return row;
};
(storage as any).logAdminActivity = async (entry: any) => {
  const row = { id: activityIdSeq++, created_at: new Date(), ...entry };
  memActivity.push(row);
  return row;
};
(storage as any).getClientById = async (id: number) => memClients.get(id);

/* ── Build app ── */
const { registerStripeBillingRoutes } = await import("../server/routes/stripeBillingRoutes");
const app = express();
app.use(express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf; } }));
app.use(express.urlencoded({ extended: false }));
registerStripeBillingRoutes(app);

const PORT = 5294;
const server = app.listen(PORT, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const baseUrl = `http://127.0.0.1:${PORT}`;

let pass = 0;
let fail = 0;
const record = (step: string, ok: boolean, detail: string) => {
  console.log(`  ${ok ? "✓" : "✗"} ${step} — ${detail}`);
  ok ? pass++ : fail++;
};

function makeChargeRefundedEvent(opts: {
  eventId: string;
  chargeId: string;
  paymentIntentId: string;
  customerId: string;
  amount: number;
  amountRefunded: number;
  refundId: string;
}): { body: string; sig: string } {
  const event = {
    id: opts.eventId,
    object: "event",
    api_version: "2025-01-27.acacia",
    created: Math.floor(Date.now() / 1000),
    type: "charge.refunded",
    data: { object: {
      id: opts.chargeId,
      object: "charge",
      payment_intent: opts.paymentIntentId,
      customer: opts.customerId,
      amount: opts.amount,
      amount_refunded: opts.amountRefunded,
      currency: "usd",
      refunded: opts.amountRefunded === opts.amount,
      refunds: { object: "list", data: [{ id: opts.refundId, object: "refund", amount: opts.amountRefunded }] },
    } },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  };
  const body = JSON.stringify(event);
  const sig = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: FRESH_WEBHOOK_SECRET });
  return { body, sig };
}

function makePaymentIntentFailedEvent(opts: {
  eventId: string;
  paymentIntentId: string;
  invoiceId: string | null;
  customerId: string;
  amount: number;
  failureCode: string;
  failureMessage: string;
}): { body: string; sig: string } {
  const event = {
    id: opts.eventId,
    object: "event",
    api_version: "2025-01-27.acacia",
    created: Math.floor(Date.now() / 1000),
    type: "payment_intent.payment_failed",
    data: { object: {
      id: opts.paymentIntentId,
      object: "payment_intent",
      customer: opts.customerId,
      invoice: opts.invoiceId,
      amount: opts.amount,
      currency: "usd",
      status: "requires_payment_method",
      last_payment_error: {
        type: "card_error",
        code: opts.failureCode,
        decline_code: null,
        message: opts.failureMessage,
      },
    } },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  };
  const body = JSON.stringify(event);
  const sig = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: FRESH_WEBHOOK_SECRET });
  return { body, sig };
}

try {
  /* ─── Test A: full refund of an active monthly subscription ─── */
  console.log("\n[A] Full refund of active monthly subscription");
  memClients.clear();
  memServices.clear();
  memPayments.length = 0;
  memActivity.length = 0;
  processed.clear();
  paymentIdSeq = 1000;

  memClients.set(7001, {
    id: 7001,
    business_name: "PHASE2 Test Co",
    contact_name: "Phase 2 Tester",
    contact_email: null,
    stripe_customer_id: "cus_phase2_full",
  });
  memServices.set(8001, {
    id: 8001,
    client_id: 7001,
    service_id: "test-monthly-service",
    status: "active",
    billing_period: "monthly",
    metadata: {},
  });
  memPayments.push({
    id: 9001,
    client_id: 7001,
    client_service_id: 8001,
    type: "invoice",
    amount_cents: 9700,
    status: "paid",
    stripe_payment_intent_id: "pi_phase2_full",
    description: "Test Service — monthly",
    metadata: {},
  });

  const evtFull = makeChargeRefundedEvent({
    eventId: "evt_phase2_chargefull",
    chargeId: "ch_phase2_full",
    paymentIntentId: "pi_phase2_full",
    customerId: "cus_phase2_full",
    amount: 9700,
    amountRefunded: 9700,
    refundId: "re_phase2_full",
  });
  const rA = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": evtFull.sig },
    body: evtFull.body,
  });
  const jA = await rA.json();
  record("first delivery → 200, not duplicate", rA.status === 200 && (jA as any).duplicate !== true, `HTTP ${rA.status} body=${JSON.stringify(jA)}`);

  await new Promise((r) => setTimeout(r, 200));

  const refundRowFull = memPayments.find((p) => p.type === "refund");
  record(
    "refund row created with type='refund' and negative amount",
    !!refundRowFull && refundRowFull.amount_cents === -9700 && refundRowFull.status === "refunded",
    `refund row=${refundRowFull ? `id=${refundRowFull.id} amount=${refundRowFull.amount_cents} status=${refundRowFull.status}` : "(none)"}`,
  );
  record(
    "refund row stores stripe_payment_intent_id (real PI, not session id)",
    refundRowFull?.stripe_payment_intent_id === "pi_phase2_full",
    `pi=${refundRowFull?.stripe_payment_intent_id}`,
  );
  record(
    "refund row metadata.stripe_charge_id stores the charge id",
    refundRowFull?.metadata?.stripe_charge_id === "ch_phase2_full",
    `stripe_charge_id=${refundRowFull?.metadata?.stripe_charge_id}`,
  );
  record(
    "originating payment marked status='refunded' on full refund",
    memPayments.find((p) => p.id === 9001)?.status === "refunded",
    `status=${memPayments.find((p) => p.id === 9001)?.status}`,
  );
  record(
    "active monthly service flipped to cancelled on full refund",
    memServices.get(8001)?.status === "cancelled" && !!memServices.get(8001)?.cancelled_at,
    `status=${memServices.get(8001)?.status} cancelled_at=${memServices.get(8001)?.cancelled_at}`,
  );

  /* ─── Test B: partial refund leaves service alone ─── */
  console.log("\n[B] Partial refund of active monthly subscription");
  memClients.clear();
  memServices.clear();
  memPayments.length = 0;
  processed.clear();
  paymentIdSeq = 1000;

  memClients.set(7002, {
    id: 7002,
    business_name: "PHASE2 Test Co Two",
    contact_email: null,
    stripe_customer_id: "cus_phase2_partial",
  });
  memServices.set(8002, {
    id: 8002,
    client_id: 7002,
    service_id: "test-monthly-service",
    status: "active",
    billing_period: "monthly",
    metadata: {},
  });
  memPayments.push({
    id: 9002,
    client_id: 7002,
    client_service_id: 8002,
    type: "invoice",
    amount_cents: 9700,
    status: "paid",
    stripe_payment_intent_id: "pi_phase2_partial",
    description: "Test Service — monthly",
    metadata: {},
  });

  const evtPartial = makeChargeRefundedEvent({
    eventId: "evt_phase2_chargepartial",
    chargeId: "ch_phase2_partial",
    paymentIntentId: "pi_phase2_partial",
    customerId: "cus_phase2_partial",
    amount: 9700,
    amountRefunded: 3000,
    refundId: "re_phase2_partial",
  });
  const rB = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": evtPartial.sig },
    body: evtPartial.body,
  });
  await new Promise((r) => setTimeout(r, 200));
  const refundRowPartial = memPayments.find((p) => p.type === "refund");
  record(
    "partial refund creates negative-amount row",
    !!refundRowPartial && refundRowPartial.amount_cents === -3000,
    `amount=${refundRowPartial?.amount_cents}`,
  );
  record(
    "partial refund leaves originating payment status='paid'",
    memPayments.find((p) => p.id === 9002)?.status === "paid",
    `status=${memPayments.find((p) => p.id === 9002)?.status}`,
  );
  record(
    "partial refund leaves service status='active' (no cancellation)",
    memServices.get(8002)?.status === "active",
    `status=${memServices.get(8002)?.status}`,
  );

  /* ─── Test C: replay → duplicate ─── */
  console.log("\n[C] Replay protection (charge.refunded)");
  const beforeCount = memPayments.length;
  const rC = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": evtPartial.sig },
    body: evtPartial.body,
  });
  const jC = await rC.json();
  record("replay → 200 { duplicate: true }", rC.status === 200 && (jC as any).duplicate === true, `HTTP ${rC.status} body=${JSON.stringify(jC)}`);
  await new Promise((r) => setTimeout(r, 200));
  record("no second refund row inserted on replay", memPayments.length === beforeCount, `count before=${beforeCount} after=${memPayments.length}`);

  /* ─── Test D: payment_intent.payment_failed (one-time, no invoice) ─── */
  console.log("\n[D] payment_intent.payment_failed — one-time (no invoice)");
  memClients.clear();
  memServices.clear();
  memPayments.length = 0;
  processed.clear();
  paymentIdSeq = 1000;

  memClients.set(7003, {
    id: 7003,
    business_name: "PHASE2 PI Failure Co",
    contact_email: null,
    stripe_customer_id: "cus_phase2_pifail",
  });
  memPayments.push({
    id: 9003,
    client_id: 7003,
    type: "payment",
    amount_cents: 19900,
    status: "pending",
    stripe_payment_intent_id: "pi_phase2_pifail_onetime",
    description: "One-time setup fee",
    metadata: {},
  });

  const evtPiOneTime = makePaymentIntentFailedEvent({
    eventId: "evt_phase2_pifail_onetime",
    paymentIntentId: "pi_phase2_pifail_onetime",
    invoiceId: null,
    customerId: "cus_phase2_pifail",
    amount: 19900,
    failureCode: "card_declined",
    failureMessage: "Your card was declined.",
  });
  const rD = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": evtPiOneTime.sig },
    body: evtPiOneTime.body,
  });
  await new Promise((r) => setTimeout(r, 200));
  const rD_json = await rD.json();
  record("first delivery → 200, not duplicate", rD.status === 200 && (rD_json as any).duplicate !== true, `HTTP ${rD.status} body=${JSON.stringify(rD_json)}`);

  const piRow = memPayments.find((p) => p.id === 9003);
  record(
    "one-time PI failure flips client_payments.status → 'failed'",
    piRow?.status === "failed",
    `status=${piRow?.status}`,
  );
  record(
    "metadata.last_failure_code populated",
    piRow?.metadata?.last_failure_code === "card_declined",
    `last_failure_code=${piRow?.metadata?.last_failure_code}`,
  );
  record(
    "metadata.last_failure_message populated",
    piRow?.metadata?.last_failure_message === "Your card was declined.",
    `last_failure_message=${piRow?.metadata?.last_failure_message}`,
  );
  record(
    "metadata.last_failure_at timestamp populated (ISO string)",
    typeof piRow?.metadata?.last_failure_at === "string" && piRow.metadata.last_failure_at.includes("T"),
    `last_failure_at=${piRow?.metadata?.last_failure_at}`,
  );

  /* ─── Test E: payment_intent.payment_failed WITH invoice (subscription path) ─── */
  console.log("\n[E] payment_intent.payment_failed — WITH invoice (must skip)");
  // Don't reset processed — we need a fresh event id
  paymentIdSeq = 2000;
  memPayments.length = 0;
  memPayments.push({
    id: 9004,
    client_id: 7003,
    type: "invoice",
    amount_cents: 9700,
    status: "paid", // pre-existing; subscription handler will manage it
    stripe_payment_intent_id: "pi_phase2_pifail_subscription",
    description: "Sub renewal",
    metadata: {},
  });

  const evtPiSub = makePaymentIntentFailedEvent({
    eventId: "evt_phase2_pifail_subscription",
    paymentIntentId: "pi_phase2_pifail_subscription",
    invoiceId: "in_phase2_attached",
    customerId: "cus_phase2_pifail",
    amount: 9700,
    failureCode: "card_declined",
    failureMessage: "Test subscription decline.",
  });
  const rE = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": evtPiSub.sig },
    body: evtPiSub.body,
  });
  await new Promise((r) => setTimeout(r, 200));
  record("PI with invoice → 200 (handled, then no-op)", rE.status === 200, `HTTP ${rE.status}`);
  const piSubRow = memPayments.find((p) => p.id === 9004);
  record(
    "PI WITH invoice does NOT flip status (subscription path owns it)",
    piSubRow?.status === "paid",
    `status=${piSubRow?.status} (must remain 'paid')`,
  );

  /* ─── Test F: payment_intent.payment_failed with no matching row ─── */
  console.log("\n[F] payment_intent.payment_failed — no matching client_payments row");
  paymentIdSeq = 3000;
  memPayments.length = 0;
  // Intentionally do NOT seed any row matching the event PI id

  const evtPiOrphan = makePaymentIntentFailedEvent({
    eventId: "evt_phase2_pifail_orphan",
    paymentIntentId: "pi_phase2_pifail_orphan",
    invoiceId: null,
    customerId: "cus_phase2_pifail",
    amount: 5000,
    failureCode: "expired_card",
    failureMessage: "Card expired.",
  });
  const rF = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": evtPiOrphan.sig },
    body: evtPiOrphan.body,
  });
  await new Promise((r) => setTimeout(r, 200));
  record("orphan PI → 200 (handled, no-op)", rF.status === 200, `HTTP ${rF.status}`);
  record("no rows mutated for orphan PI", memPayments.length === 0, `payments=${memPayments.length}`);

  /* ─── Test G: replay of PI failure ─── */
  console.log("\n[G] Replay protection (payment_intent.payment_failed)");
  const rG = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": evtPiOneTime.sig },
    body: evtPiOneTime.body,
  });
  const jG = await rG.json();
  record("replay → 200 { duplicate: true }", rG.status === 200 && (jG as any).duplicate === true, `HTTP ${rG.status} body=${JSON.stringify(jG)}`);
} finally {
  server.close();
}

console.log("\n══════════════════════════════════════════════════════════════════");
console.log(`  PHASE 2 (charge.refunded + payment_intent.payment_failed) — ${pass} passed, ${fail} failed`);
console.log("══════════════════════════════════════════════════════════════════\n");
process.exit(fail === 0 ? 0 : 1);
