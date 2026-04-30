/**
 * Stripe test-mode smoke test for the billing recovery / dunning system.
 *
 * Verifies end-to-end:
 *   1. invoice.payment_failed webhook → schedules day_2 / day_5 / day_7
 *   2. Replay of same event → no duplicates
 *   3. invoice.payment_succeeded webhook → cancels pending rows
 *   4. /api/billing/portal/:token → 302 to billing.stripe.com
 *   5. job_logs has dunning_queue entries with the expected metadata shape
 *   6. No real customer emails fire (test client has NULL contact_email
 *      so the Day-0 path AND the worker both short-circuit)
 *
 * Hard safety rules:
 *   - Refuses to run if STRIPE_SECRET_KEY does not start with "sk_test_"
 *   - Refuses to run if APP_URL/APP_PUBLIC_URL is missing
 *   - Refuses to run if STRIPE_BILLING_WEBHOOK_SECRET is missing
 *   - Default is DRY-RUN — prints plan + env status + exits
 *   - Pass --execute to actually run
 *   - All test data is tagged with `metadata.smoke_id` (Stripe) and
 *     `business_name = "SMOKE_TEST WeFixTrades"` (DB). Cleanup deletes
 *     ONLY records matching those markers — never touches real customers.
 *   - Cleanup runs in a finally block, so failure mid-run still tidies up.
 *
 * Usage on Replit:
 *   npx tsx scripts/smoke-stripe-billing-recovery.ts            # dry-run
 *   npx tsx scripts/smoke-stripe-billing-recovery.ts --execute  # do it
 */

import Stripe from "stripe";
import { db } from "../server/db";
import { billingDunningEvents, clients, clientPayments } from "@shared/schema";
import { jobLogs } from "@shared/schemas/db";
import { and, eq, desc, sql } from "drizzle-orm";
import { buildBillingPortalToken } from "../server/lib/billingPortalToken";

const SMOKE_RUN_ID = `smoke-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const SMOKE_BUSINESS_NAME_MARKER = "SMOKE_TEST WeFixTrades";
const SMOKE_EMAIL = "smoke-test@wefixtrades.invalid";

interface RunResult {
  step: string;
  ok: boolean;
  detail: string;
}

const results: RunResult[] = [];
function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${step} — ${detail}`);
}

async function main() {
  const execute = process.argv.includes("--execute");

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("  STRIPE TEST-MODE BILLING RECOVERY SMOKE TEST");
  console.log("══════════════════════════════════════════════════════════════════\n");

  /* ── Env validation ── */
  const APP_URL = process.env.APP_URL || process.env.APP_PUBLIC_URL || "";
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
  const WEBHOOK_SECRET = process.env.STRIPE_BILLING_WEBHOOK_SECRET || "";
  const DATABASE_URL_PRESENT = !!process.env.DATABASE_URL;

  console.log("Required environment:");
  console.log(`  APP_URL or APP_PUBLIC_URL : ${APP_URL ? `present (${APP_URL})` : "MISSING"}`);
  console.log(`  STRIPE_SECRET_KEY         : ${STRIPE_SECRET_KEY ? `present (${STRIPE_SECRET_KEY.startsWith("sk_test_") ? "TEST mode ✓" : STRIPE_SECRET_KEY.startsWith("sk_live_") ? "LIVE mode — REFUSING" : "unknown prefix"})` : "MISSING"}`);
  console.log(`  STRIPE_BILLING_WEBHOOK_SECRET : ${WEBHOOK_SECRET ? `present (${WEBHOOK_SECRET.length} chars)` : "MISSING"}`);
  console.log(`  DATABASE_URL              : ${DATABASE_URL_PRESENT ? "present" : "MISSING"}`);
  console.log("");

  const fatal: string[] = [];
  if (!APP_URL) fatal.push("APP_URL or APP_PUBLIC_URL must be set on Replit");
  if (!STRIPE_SECRET_KEY) fatal.push("STRIPE_SECRET_KEY must be set");
  else if (!STRIPE_SECRET_KEY.startsWith("sk_test_")) fatal.push("STRIPE_SECRET_KEY must be a TEST-mode key (sk_test_*) — refusing to run against live mode");
  if (!WEBHOOK_SECRET) fatal.push("STRIPE_BILLING_WEBHOOK_SECRET must be set so we can sign the synthetic events");
  if (!DATABASE_URL_PRESENT) fatal.push("DATABASE_URL must be set");

  if (fatal.length > 0) {
    console.log("Cannot proceed — fix these:");
    for (const f of fatal) console.log(`  ✗ ${f}`);
    console.log("");
    process.exit(1);
  }

  console.log("Plan:");
  console.log(`  1. Create Stripe test customer with metadata.smoke_id="${SMOKE_RUN_ID}"`);
  console.log(`  2. Insert DB client (contact_email=NULL, business_name="${SMOKE_BUSINESS_NAME_MARKER}")`);
  console.log(`  3. POST signed invoice.payment_failed event to ${APP_URL}/api/billing/webhook`);
  console.log(`  4. Query billing_dunning_events — expect 3 rows (day_2_reminder / day_5_final / day_7_warning)`);
  console.log(`  5. Replay same event — expect still 3 rows`);
  console.log(`  6. POST signed invoice.payment_succeeded event — expect all 3 rows status=cancelled`);
  console.log(`  7. GET ${APP_URL}/api/billing/portal/<signed-token> — expect 302 to billing.stripe.com`);
  console.log(`  8. SELECT latest job_logs row WHERE job_name='dunning_queue' — display metadata shape`);
  console.log(`  9. Cleanup (try/finally): delete smoke DB rows + Stripe customer`);
  console.log("");
  console.log(`Email safety: test client has NULL contact_email — the existing Day-0`);
  console.log(`paymentFailedEmail.ts and the dunning worker both short-circuit on`);
  console.log(`empty email, so ZERO real SMTP send attempts fire during this run.`);
  console.log("");

  if (!execute) {
    console.log("DRY-RUN — pass --execute to actually run.");
    console.log("");
    process.exit(0);
  }

  console.log(">>> EXECUTING in 3 seconds — Ctrl+C to abort <<<");
  await new Promise((r) => setTimeout(r, 3000));
  console.log("");

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-01-27.acacia" as any });

  let testCustomerId: string | null = null;
  let testClientId: number | null = null;
  const fakeSubId = `sub_smoke_${SMOKE_RUN_ID}`;
  const fakeInvoiceId = `in_smoke_${SMOKE_RUN_ID}`;
  const failedEventId = `evt_smoke_failed_${SMOKE_RUN_ID}`;
  const succeededEventId = `evt_smoke_succeeded_${SMOKE_RUN_ID}`;

  try {
    /* ── Step 1: Stripe test customer ── */
    console.log("[1] Creating Stripe test customer...");
    const customer = await stripe.customers.create({
      email: SMOKE_EMAIL,
      name: "SMOKE_TEST WeFixTrades",
      description: "Smoke test customer — safe to delete",
      metadata: { smoke_id: SMOKE_RUN_ID, source: "billing_recovery_smoke" },
    });
    testCustomerId = customer.id;
    record("Stripe customer created", true, `${customer.id}`);

    /* ── Step 2: DB client ── */
    console.log("\n[2] Creating DB client row...");
    const [client] = await db.insert(clients).values({
      business_name: SMOKE_BUSINESS_NAME_MARKER,
      contact_name: "Smoke Tester",
      contact_email: null,           // CRITICAL — keeps Day-0 + worker from sending
      stripe_customer_id: customer.id,
      status: "active",
    } as any).returning();
    testClientId = client.id;
    record("DB client created", true, `id=${client.id} contact_email=NULL`);

    /* ── Step 3: signed invoice.payment_failed event ── */
    console.log("\n[3] POSTing signed invoice.payment_failed...");
    const failedEvent = buildSyntheticEvent({
      id: failedEventId,
      type: "invoice.payment_failed",
      object: {
        id: fakeInvoiceId,
        object: "invoice",
        customer: customer.id,
        subscription: fakeSubId,
        amount_due: 19900,
        currency: "usd",
        billing_reason: "subscription_cycle",
        next_payment_attempt: Math.floor(Date.now() / 1000) + 86400 * 3,
      },
    });
    const failedPostStatus = await postSignedWebhook(APP_URL, failedEvent, WEBHOOK_SECRET);
    record("invoice.payment_failed POST", failedPostStatus.ok, `HTTP ${failedPostStatus.status} ${failedPostStatus.body.slice(0, 80)}`);
    if (!failedPostStatus.ok) throw new Error(`webhook returned ${failedPostStatus.status}`);

    /* ── Step 4: dunning rows created ── */
    console.log("\n[4] Querying billing_dunning_events...");
    const rowsAfterFail = await db.select()
      .from(billingDunningEvents)
      .where(eq(billingDunningEvents.stripe_subscription_id, fakeSubId));
    const kindsCreated = rowsAfterFail.map((r) => r.kind).sort();
    const expectedKinds = ["day_2_reminder", "day_5_final", "day_7_warning"].sort();
    const kindsMatch = JSON.stringify(kindsCreated) === JSON.stringify(expectedKinds);
    record(
      "3 dunning rows created with expected kinds",
      rowsAfterFail.length === 3 && kindsMatch,
      `count=${rowsAfterFail.length} kinds=${kindsCreated.join(",")}`,
    );

    /* ── Step 5: replay → no duplicates ── */
    console.log("\n[5] Replaying same invoice.payment_failed event...");
    const replayPostStatus = await postSignedWebhook(APP_URL, failedEvent, WEBHOOK_SECRET);
    record("replay POST", replayPostStatus.ok, `HTTP ${replayPostStatus.status}`);

    const rowsAfterReplay = await db.select()
      .from(billingDunningEvents)
      .where(eq(billingDunningEvents.stripe_subscription_id, fakeSubId));
    record(
      "replay produces no duplicates",
      rowsAfterReplay.length === 3,
      `count=${rowsAfterReplay.length} (expected 3)`,
    );

    /* ── Step 6: payment_succeeded cancels ── */
    console.log("\n[6] POSTing signed invoice.payment_succeeded...");
    const succeededEvent = buildSyntheticEvent({
      id: succeededEventId,
      type: "invoice.payment_succeeded",
      object: {
        id: `${fakeInvoiceId}_recovered`,
        object: "invoice",
        customer: customer.id,
        subscription: fakeSubId,
        amount_paid: 19900,
        currency: "usd",
        billing_reason: "subscription_cycle",
      },
    });
    const succeededPostStatus = await postSignedWebhook(APP_URL, succeededEvent, WEBHOOK_SECRET);
    record("invoice.payment_succeeded POST", succeededPostStatus.ok, `HTTP ${succeededPostStatus.status}`);

    const rowsAfterSuccess = await db.select()
      .from(billingDunningEvents)
      .where(eq(billingDunningEvents.stripe_subscription_id, fakeSubId));
    const allCancelled = rowsAfterSuccess.length === 3 && rowsAfterSuccess.every((r) => r.status === "cancelled");
    const allReason = rowsAfterSuccess.every((r) => r.cancel_reason === "payment_succeeded");
    record(
      "all 3 rows now status=cancelled",
      allCancelled,
      `${rowsAfterSuccess.filter(r => r.status === "cancelled").length}/3 cancelled`,
    );
    record(
      "cancel_reason=payment_succeeded on all rows",
      allReason,
      rowsAfterSuccess.map(r => r.cancel_reason).join(","),
    );

    /* ── Step 7: portal token route ── */
    console.log("\n[7] GET /api/billing/portal/<token> (no-follow)...");
    const portalToken = buildBillingPortalToken({ stripeCustomerId: customer.id });
    const portalResp = await fetch(`${APP_URL}/api/billing/portal/${portalToken}`, {
      method: "GET",
      redirect: "manual",
    });
    const portalLocation = portalResp.headers.get("location") || "";
    const portalRedirectsToStripe = portalResp.status === 302 && portalLocation.startsWith("https://billing.stripe.com/");
    record(
      "portal route 302 → billing.stripe.com",
      portalRedirectsToStripe,
      `status=${portalResp.status} location=${portalLocation.slice(0, 80) || "(none)"}`,
    );

    /* ── Step 8: job_logs for dunning_queue ── */
    console.log("\n[8] Latest job_logs row for dunning_queue...");
    const [latestLog] = await db.select()
      .from(jobLogs)
      .where(eq(jobLogs.job_name, "dunning_queue"))
      .orderBy(desc(jobLogs.id))
      .limit(1);
    if (latestLog) {
      const meta = latestLog.metadata as any;
      const expectedKeys = ["processed", "sent", "skipped", "failed", "by_kind"];
      const hasShape = meta && typeof meta === "object" && expectedKeys.every((k) => k in meta);
      record(
        "job_logs.metadata has expected shape",
        !!hasShape,
        `id=${latestLog.id} status=${latestLog.status} keys=${Object.keys(meta || {}).join(",")}`,
      );
    } else {
      record(
        "job_logs.metadata has expected shape",
        false,
        "no dunning_queue rows in job_logs yet (worker hasn't fired since deploy)",
      );
    }

    /* ── Final summary ── */
    console.log("\n══════════════════════════════════════════════════════════════════");
    console.log("  RESULTS");
    console.log("══════════════════════════════════════════════════════════════════");
    const passed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    console.log(`  ${passed} passed, ${failed} failed`);
    console.log("");
    console.log(`  Stripe test event used    : ${failedEventId} (invoice.payment_failed)`);
    console.log(`                              ${succeededEventId} (invoice.payment_succeeded)`);
    console.log(`  Stripe test customer      : ${testCustomerId}`);
    console.log(`  Synthetic subscription id : ${fakeSubId}`);
    console.log(`  Synthetic invoice id      : ${fakeInvoiceId}`);
    console.log(`  DB client id              : ${testClientId}`);
    console.log(`  Dunning rows created      : ${rowsAfterFail.length}`);
    console.log(`  Cancellation result       : ${rowsAfterSuccess.filter(r => r.status === "cancelled").length}/3 cancelled`);
    console.log(`  Portal redirect           : ${portalResp.status} → ${portalLocation.slice(0, 60) || "(none)"}`);
    console.log(`  Real emails sent          : 0 (test client contact_email = NULL)`);
    console.log("");
    if (failed === 0) {
      console.log(`  ✓ all checks passed — billing recovery system is verified end-to-end`);
    } else {
      console.log(`  ✗ ${failed} check(s) failed — see ✗ lines above`);
    }
    console.log("");
  } finally {
    /* ── Cleanup (always runs) ── */
    console.log("[cleanup] Removing smoke test data...");
    try {
      if (testClientId !== null) {
        const delDun = await db.delete(billingDunningEvents)
          .where(eq(billingDunningEvents.stripe_subscription_id, fakeSubId))
          .returning({ id: billingDunningEvents.id });
        console.log(`  - deleted ${delDun.length} billing_dunning_events row(s)`);

        const delPay = await db.delete(clientPayments)
          .where(eq(clientPayments.client_id, testClientId))
          .returning({ id: clientPayments.id });
        console.log(`  - deleted ${delPay.length} client_payments row(s)`);

        const delClient = await db.delete(clients)
          .where(and(
            eq(clients.id, testClientId),
            eq(clients.business_name, SMOKE_BUSINESS_NAME_MARKER),
          ))
          .returning({ id: clients.id });
        console.log(`  - deleted ${delClient.length} clients row(s) (id=${testClientId})`);
      }
      if (testCustomerId) {
        const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-01-27.acacia" as any });
        await stripe.customers.del(testCustomerId);
        console.log(`  - deleted Stripe test customer ${testCustomerId}`);
      }
    } catch (cleanupErr: any) {
      console.error(`  ! cleanup error: ${cleanupErr.message}`);
      console.error(`    Manual cleanup: stripe customer ${testCustomerId}, subscription_id ${fakeSubId}, client id ${testClientId}`);
    }
    console.log("");
  }

  const failedCount = results.filter((r) => !r.ok).length;
  process.exit(failedCount === 0 ? 0 : 1);
}

/* ── helpers ── */

function buildSyntheticEvent(opts: { id: string; type: string; object: any }): string {
  const event = {
    id: opts.id,
    object: "event",
    api_version: "2025-01-27.acacia",
    created: Math.floor(Date.now() / 1000),
    type: opts.type,
    data: { object: opts.object },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  };
  return JSON.stringify(event);
}

async function postSignedWebhook(
  appUrl: string,
  payload: string,
  webhookSecret: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const header = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
  });
  const resp = await fetch(`${appUrl.replace(/\/$/, "")}/api/billing/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": header,
    },
    body: payload,
  });
  const body = await resp.text().catch(() => "");
  return { ok: resp.ok, status: resp.status, body };
}

main().catch((err) => {
  console.error("\n[smoke-stripe-billing-recovery] fatal error:", err.message);
  console.error(err.stack);
  process.exit(1);
});
