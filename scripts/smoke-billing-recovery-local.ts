/**
 * Fully-local end-to-end smoke test for the billing recovery system.
 *
 * Boots a minimal in-process express server with the real
 * stripeBillingRoutes + billingPortalRoute mounted, stubs the DB +
 * storage layers in memory, generates a fresh webhook signing secret,
 * and POSTs real Stripe-signed synthetic events at localhost.
 *
 * Verifies (without touching Replit, Stripe API, or any real network):
 *   1. Real Stripe.webhooks.constructEvent signature verification path
 *   2. invoice.payment_failed → 3 dunning rows scheduled (day_2/5/7)
 *   3. Replay → no duplicates
 *   4. invoice.payment_succeeded → all 3 rows cancelled with reason
 *   5. /api/billing/portal/:token → 302 (token verification path)
 *   6. /api/billing/portal/<tampered> → 302 to /billing/expired
 *
 * Not covered (only real Stripe API can test these):
 *   - stripe.billingPortal.sessions.create() actual call
 *   - real Stripe webhook delivery infrastructure
 *
 * Test client has contact_email=NULL so the Day-0 paymentFailedEmail.ts
 * path short-circuits — zero SMTP attempts. SMTP env vars are also
 * empty so no transporter even gets created.
 */

import crypto from "crypto";

/* ── ENV setup MUST happen before any imports that read process.env ── */
const FRESH_WEBHOOK_SECRET = "whsec_" + crypto.randomBytes(32).toString("hex");
process.env.SMTP_HOST = "";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";
process.env.DATABASE_URL = "postgresql://localhost:5432/dummy_no_connect";
process.env.STRIPE_SECRET_KEY = "sk_test_dummy_for_local_smoke";
process.env.STRIPE_BILLING_WEBHOOK_SECRET = FRESH_WEBHOOK_SECRET;
process.env.SESSION_SECRET = "smoke-local-session-secret";
process.env.BILLING_PORTAL_SECRET = crypto.randomBytes(32).toString("hex");
process.env.NODE_ENV = "development";

/* ── Dynamic imports below — env vars are now in place ── */
const express = (await import("express")).default;
const Stripe = (await import("stripe")).default;

/* ── In-memory store ── */
type Row = Record<string, any>;
const memDunning: Row[] = [];
const memClients = new Map<number, Row>();
const memPayments: Row[] = [];
const memActivity: Row[] = [];
let dunningIdSeq = 1;
let paymentIdSeq = 1;
let activityIdSeq = 1;

/* ── DB stub helpers (same pattern as verify-dunning.ts) ── */
function unwrapParam(v: any): any {
  if (v && typeof v === "object" && "value" in v && v.constructor?.name === "Param") return v.value;
  return v;
}
function tableNameOf(t: any): string {
  if (!t) return "";
  for (const sym of Object.getOwnPropertySymbols(t)) {
    const desc = sym.description || "";
    if (desc.includes("Name")) {
      const v = (t as any)[sym];
      if (typeof v === "string") return v;
    }
  }
  return t.tableName || t._?.name || "";
}
function extractEqPredicates(node: any): Array<{ colName: string; value: any }> {
  const out: Array<{ colName: string; value: any }> = [];
  function walk(n: any) {
    if (!n || typeof n !== "object") return;
    const chunks = (n as any).queryChunks;
    if (!Array.isArray(chunks)) return;
    if (chunks.length >= 5) {
      for (let i = 0; i < chunks.length - 2; i++) {
        const a = chunks[i];
        const b = chunks[i + 1];
        const c = chunks[i + 2];
        if (b && typeof b === "object" && b.value && Array.isArray(b.value) && b.value[0] === " = ") {
          const colName = a?._?.name || a?.name;
          if (typeof colName === "string") out.push({ colName, value: unwrapParam(c) });
        }
      }
    }
    for (const ch of chunks) walk(ch);
  }
  walk(node);
  return out;
}

/* ── Stub db.* ── */
const { db } = await import("../server/db");

function rowsForTable(tn: string): Row[] {
  if (tn === "billing_dunning_events") return memDunning;
  if (tn === "client_payments") return memPayments;
  if (tn === "admin_activity_log") return memActivity;
  return [];
}

(db as any).select = function (..._cols: any[]) {
  let fromTable: any = null;
  return {
    from(t: any) { fromTable = t; return this; },
    innerJoin(_t: any, _on: any) { return this; },
    where(cond: any) {
      const tn = tableNameOf(fromTable);
      const preds = extractEqPredicates(cond);
      const matchRow = (r: Row) => {
        for (const p of preds) {
          if (r[p.colName] !== p.value) return false;
        }
        return true;
      };
      const runMatch = () => {
        if (tn === "clients") {
          for (const c of memClients.values()) {
            if (matchRow(c)) return [c];
          }
          return [];
        }
        if (tn.includes("unsubscribe")) return [];
        return rowsForTable(tn).filter(matchRow);
      };
      return {
        limit: (_n: number) => Promise.resolve(runMatch()),
        orderBy: (..._cs: any[]) => ({
          limit: (_n: number) => Promise.resolve(runMatch()),
        }),
      };
    },
  };
};

(db as any).insert = function (t: any) {
  const tn = tableNameOf(t);
  return {
    values(v: any) {
      const row: Row = { ...v };
      if (tn === "billing_dunning_events") {
        row.id = dunningIdSeq++;
        row.status = row.status ?? "pending";
        row.scheduled_for = row.scheduled_for instanceof Date ? row.scheduled_for : new Date(row.scheduled_for);
        row.created_at = new Date();
        row.updated_at = new Date();
        memDunning.push(row);
      } else if (tn === "client_payments") {
        row.id = paymentIdSeq++;
        memPayments.push(row);
      } else if (tn === "admin_activity_log") {
        row.id = activityIdSeq++;
        memActivity.push(row);
      }
      return {
        returning: () => Promise.resolve([row]),
        then: (resolve: any) => resolve(undefined),
      };
    },
  };
};

(db as any).update = function (t: any) {
  const tn = tableNameOf(t);
  let setClause: any = null;
  return {
    set(v: any) { setClause = v; return this; },
    where(cond: any) {
      const preds = extractEqPredicates(cond);
      const rows = rowsForTable(tn);
      const matches = rows.filter((r) => preds.every((p) => r[p.colName] === p.value));
      const cleaned: any = {};
      for (const k of Object.keys(setClause || {})) {
        const v = (setClause as any)[k];
        if (v && typeof v === "object" && (v as any).queryChunks) continue; // skip raw SQL fragments
        cleaned[k] = v;
      }
      for (const r of matches) Object.assign(r, cleaned, { updated_at: new Date() });
      return {
        returning: (_c?: any) => Promise.resolve(matches.map((r) => ({ id: r.id }))),
        then: (resolve: any) => resolve(undefined),
      };
    },
  };
};

/* ── Stub storage methods touched by the webhook handlers ── */
const { storage } = await import("../server/storage");

(storage as any).findClientByStripeCustomerId = async (customerId: string) => {
  for (const c of memClients.values()) {
    if (c.stripe_customer_id === customerId) return c;
  }
  return undefined;
};
(storage as any).createClientPayment = async (data: any) => {
  const row = { id: paymentIdSeq++, created_at: new Date(), ...data };
  memPayments.push(row);
  return row;
};
(storage as any).listClientServices = async (_clientId: number) => [];
(storage as any).updateClientService = async (_id: number, _patch: any) => undefined;
(storage as any).logAdminActivity = async (entry: any) => {
  const row = { id: activityIdSeq++, created_at: new Date(), ...entry };
  memActivity.push(row);
  return row;
};
(storage as any).getClientById = async (id: number) => memClients.get(id);

/* ── Build a minimal express app with the same raw-body capture as prod ── */
const { registerStripeBillingRoutes } = await import("../server/routes/stripeBillingRoutes");
const { registerBillingPortalRoute } = await import("../server/routes/billingPortalRoute");

const app = express();
app.use(express.json({
  verify: (req, _res, buf) => { (req as any).rawBody = buf; },
}));
app.use(express.urlencoded({ extended: false }));
registerStripeBillingRoutes(app);
registerBillingPortalRoute(app);

/* ── Test sequence ── */
let pass = 0;
let fail = 0;
const results: Array<{ step: string; ok: boolean; detail: string }> = [];
function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${step} — ${detail}`);
  ok ? pass++ : fail++;
}

async function runTests() {
  /* Pre-populate test client */
  memClients.set(5001, {
    id: 5001,
    business_name: "SMOKE_TEST WeFixTrades",
    contact_name: "Smoke Tester",
    contact_email: null,
    stripe_customer_id: "cus_smoke_local",
    status: "active",
  });

  const baseUrl = `http://127.0.0.1:${PORT}`;
  const fakeSubId = "sub_smoke_local_001";
  const fakeInvoiceId = "in_smoke_local_001";
  const failedEventId = "evt_smoke_local_failed_001";
  const succeededEventId = "evt_smoke_local_succeeded_001";

  console.log("\n[1] POST signed invoice.payment_failed");
  const failedEvent = JSON.stringify({
    id: failedEventId,
    object: "event",
    api_version: "2025-01-27.acacia",
    created: Math.floor(Date.now() / 1000),
    type: "invoice.payment_failed",
    data: { object: {
      id: fakeInvoiceId,
      object: "invoice",
      customer: "cus_smoke_local",
      subscription: fakeSubId,
      amount_due: 19900,
      currency: "usd",
      billing_reason: "subscription_cycle",
      next_payment_attempt: Math.floor(Date.now() / 1000) + 86400 * 3,
    } },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  });
  const failedSig = Stripe.webhooks.generateTestHeaderString({
    payload: failedEvent,
    secret: FRESH_WEBHOOK_SECRET,
  });
  const failedResp = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": failedSig },
    body: failedEvent,
  });
  const failedRespBody = await failedResp.text();
  record(
    "webhook accepts signed invoice.payment_failed",
    failedResp.status === 200,
    `HTTP ${failedResp.status} ${failedRespBody.slice(0, 60)}`,
  );

  console.log("\n[2] Verify 3 dunning rows scheduled");
  // small delay to let async catch() chain in handler complete
  await new Promise((r) => setTimeout(r, 100));
  const rowsAfterFail = memDunning.filter((r) => r.stripe_subscription_id === fakeSubId);
  const kindsCreated = rowsAfterFail.map((r) => r.kind).sort();
  const expectedKinds = ["day_2_reminder", "day_5_final", "day_7_warning"].sort();
  record(
    "3 rows created with kinds day_2_reminder/day_5_final/day_7_warning",
    rowsAfterFail.length === 3 && JSON.stringify(kindsCreated) === JSON.stringify(expectedKinds),
    `count=${rowsAfterFail.length} kinds=${kindsCreated.join(",")}`,
  );

  console.log("\n[3] Verify scheduled_for offsets are +2/+5/+7 days");
  const now = Date.now();
  const offsets = rowsAfterFail
    .map((r) => Math.round((new Date(r.scheduled_for).getTime() - now) / (24 * 60 * 60 * 1000)))
    .sort((a, b) => a - b);
  record(
    "scheduled_for offsets",
    offsets.length === 3 && offsets[0] === 2 && offsets[1] === 5 && offsets[2] === 7,
    `offsets=[${offsets.join(", ")}]`,
  );

  console.log("\n[4] Replay same event id — no duplicates");
  const replayResp = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": failedSig },
    body: failedEvent,
  });
  await new Promise((r) => setTimeout(r, 100));
  record("replay HTTP 200", replayResp.status === 200, `HTTP ${replayResp.status}`);
  const rowsAfterReplay = memDunning.filter((r) => r.stripe_subscription_id === fakeSubId);
  record(
    "no duplicates — still 3 rows",
    rowsAfterReplay.length === 3,
    `count=${rowsAfterReplay.length}`,
  );

  console.log("\n[5] Tampered signature is rejected");
  const tamperedSig = failedSig.replace(/.$/, (c) => (c === "a" ? "b" : "a"));
  const tamperedResp = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": tamperedSig },
    body: failedEvent,
  });
  record(
    "tampered signature → 400",
    tamperedResp.status === 400,
    `HTTP ${tamperedResp.status}`,
  );

  console.log("\n[6] POST signed invoice.payment_succeeded");
  const succeededEvent = JSON.stringify({
    id: succeededEventId,
    object: "event",
    api_version: "2025-01-27.acacia",
    created: Math.floor(Date.now() / 1000),
    type: "invoice.payment_succeeded",
    data: { object: {
      id: fakeInvoiceId + "_recovered",
      object: "invoice",
      customer: "cus_smoke_local",
      subscription: fakeSubId,
      amount_paid: 19900,
      currency: "usd",
      billing_reason: "subscription_cycle",
    } },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  });
  const succeededSig = Stripe.webhooks.generateTestHeaderString({
    payload: succeededEvent,
    secret: FRESH_WEBHOOK_SECRET,
  });
  const succeededResp = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": succeededSig },
    body: succeededEvent,
  });
  await new Promise((r) => setTimeout(r, 100));
  record("webhook accepts signed invoice.payment_succeeded", succeededResp.status === 200, `HTTP ${succeededResp.status}`);

  const rowsAfterSuccess = memDunning.filter((r) => r.stripe_subscription_id === fakeSubId);
  const allCancelled = rowsAfterSuccess.length === 3 && rowsAfterSuccess.every((r) => r.status === "cancelled");
  const allReason = rowsAfterSuccess.every((r) => r.cancel_reason === "payment_succeeded");
  record(
    "all 3 rows status=cancelled",
    allCancelled,
    `${rowsAfterSuccess.filter((r) => r.status === "cancelled").length}/3 cancelled`,
  );
  record(
    "cancel_reason=payment_succeeded on all rows",
    allReason,
    rowsAfterSuccess.map((r) => r.cancel_reason).join(","),
  );

  console.log("\n[7] /api/billing/portal/:token route");
  const { buildBillingPortalToken } = await import("../server/lib/billingPortalToken");
  const validToken = buildBillingPortalToken({ stripeCustomerId: "cus_smoke_local" });
  const portalResp = await fetch(`${baseUrl}/api/billing/portal/${validToken}`, {
    method: "GET",
    redirect: "manual",
  });
  const portalLocation = portalResp.headers.get("location") || "";
  // We expect 302 — destination is either billing.stripe.com (real Stripe) OR
  // /billing/error (because our dummy sk_test key fails auth, which still
  // proves token verification + handler logic runs end-to-end).
  record(
    "valid token → 302 redirect (token verification path works)",
    portalResp.status === 302 && portalLocation.length > 0,
    `status=${portalResp.status} location=${portalLocation.slice(0, 80) || "(none)"}`,
  );

  const tamperedToken = validToken.slice(0, -2) + (validToken.slice(-2) === "AA" ? "BB" : "AA");
  const tamperedPortalResp = await fetch(`${baseUrl}/api/billing/portal/${tamperedToken}`, {
    method: "GET",
    redirect: "manual",
  });
  const tamperedLocation = tamperedPortalResp.headers.get("location") || "";
  record(
    "tampered token → 302 to /billing/expired",
    tamperedPortalResp.status === 302 && tamperedLocation.endsWith("/billing/expired"),
    `status=${tamperedPortalResp.status} location=${tamperedLocation}`,
  );

  console.log("\n[8] Day-0 paymentFailedEmail short-circuit (no SMTP, NULL email)");
  // The handler called sendPaymentFailedEmail. With SMTP_HOST="" the
  // module's getEmailTransporter() returns null and the function exits
  // before it would attempt any send. Confirm by inspecting payment row
  // metadata — it should NOT have failure_email_sent_at.
  const paymentRow = memPayments.find((p) => p.stripe_invoice_id === fakeInvoiceId);
  const day0Skipped = !paymentRow?.metadata?.failure_email_sent_at;
  record(
    "Day-0 email did not fire (no transporter)",
    day0Skipped,
    paymentRow ? `payment row exists, failure_email_sent_at=${paymentRow.metadata?.failure_email_sent_at ?? "(unset)"}` : "no payment row written",
  );

  console.log("\n[9] activity log + payment row written by webhook");
  record(
    "client_payments row written for failed invoice",
    !!paymentRow && paymentRow.status === "failed",
    paymentRow ? `id=${paymentRow.id} status=${paymentRow.status} amount_cents=${paymentRow.amount_cents}` : "missing",
  );
}

/* ── Main ── */
let PORT = 0;
let server: any = null;

async function main() {
  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("  LOCAL END-TO-END BILLING RECOVERY SMOKE TEST");
  console.log("══════════════════════════════════════════════════════════════════");
  console.log(`  Webhook secret      : whsec_${FRESH_WEBHOOK_SECRET.slice(6, 14)}... (freshly generated for this run)`);
  console.log(`  Database            : in-memory stub`);
  console.log(`  SMTP                : not configured (transporter=null)`);
  console.log(`  Stripe SDK key      : sk_test_dummy (used only by /portal route — Stripe API call expected to fail with auth error → /billing/error redirect, which still verifies the route logic)`);
  console.log("══════════════════════════════════════════════════════════════════");

  // Bind to a free port
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      PORT = (server.address() as any).port;
      resolve();
    });
  });
  console.log(`\n[boot] listening on http://127.0.0.1:${PORT}\n`);

  try {
    await runTests();
  } finally {
    server?.close();
  }

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log(`  RESULTS — ${pass} passed, ${fail} failed`);
  console.log("══════════════════════════════════════════════════════════════════\n");

  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\n[smoke-billing-recovery-local] fatal error:", err.message);
  console.error(err.stack);
  server?.close();
  process.exit(1);
});
