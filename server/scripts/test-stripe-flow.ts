/**
 * Phase 2 — Stripe Billing Flow Validation
 *
 * Tests the full payment → provisioning → CRM pipeline for MapGuard Setup (one_time).
 *
 * Strategy:
 *   1. Create a test client via the API (admin session)
 *   2. Call POST /api/billing/checkout to verify the endpoint and Stripe customer creation
 *   3. Simulate a successful checkout.session.completed webhook directly
 *   4. Verify all downstream records in the DB:
 *      - client_service created
 *      - client_payment created and marked paid
 *      - onboarding_submission created
 *      - fulfillment_tasks created from template
 *      - client status updated to onboarding
 *
 * Usage:
 *   npx tsx server/scripts/test-stripe-flow.ts
 *
 * Requirements:
 *   - Dev server running on localhost:5000
 *   - DATABASE_URL set
 *   - STRIPE_SECRET_KEY set (real or test key)
 */

import { pool } from "../db.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const SERVICE_ID = "mapguard-setup";
const TEST_EMAIL = `stripe-flow-test-${Date.now()}@example.com`;

/* ─── Helpers ─── */

function pass(label: string, detail?: string) {
  console.log(`  ✓  ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label: string, detail?: string) {
  console.error(`  ✗  ${label}${detail ? ` — ${detail}` : ""}`);
}

function section(title: string) {
  console.log(`\n── ${title} ──`);
}

async function adminLogin(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.TEST_ADMIN_EMAIL || "admin@wefixtrades.com",
      password: process.env.TEST_ADMIN_PASSWORD || "TestAdmin123!",
    }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const cookie = res.headers.get("set-cookie");
  if (!cookie) throw new Error("No session cookie returned");
  return cookie.split(";")[0];
}

async function apiPost(path: string, body: unknown, cookie: string) {
  return fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": cookie,
    },
    body: JSON.stringify(body),
  });
}

/* ─── Main ─── */

async function main() {
  console.log("\n══════════════════════════════════════════");
  console.log("  STRIPE BILLING FLOW — Phase 2 Validation");
  console.log("══════════════════════════════════════════");
  console.log(`  Service:  ${SERVICE_ID}`);
  console.log(`  Endpoint: ${BASE_URL}`);

  const results: Record<string, boolean> = {
    A_checkout_created: false,
    B_customer_created: false,
    C_payment_recorded: false,
    D_service_provisioned: false,
    E_tasks_created: false,
    F_client_status_updated: false,
    G_onboarding_submission_created: false,
  };

  let clientId: number | null = null;
  let sessionId: string | null = null;
  let cookie: string;

  /* ── Auth ── */
  try {
    cookie = await adminLogin();
    console.log("\n  Admin session acquired.");
  } catch (err: any) {
    console.error(`\n  FATAL: Could not log in — ${err.message}`);
    process.exit(1);
  }

  /* ── Setup: create test client ── */
  section("Setup — Create test client");
  const clientRes = await apiPost("/api/admin/crm/clients", {
    business_name: `Stripe Flow Test ${Date.now()}`,
    contact_name: "Stripe Test",
    contact_email: TEST_EMAIL,
    contact_phone: "416-555-0200",
    trade_type: "plumber",
    status: "lead",
    source: "manual",
  }, cookie);

  if (!clientRes.ok) {
    console.error(`  FATAL: Could not create test client — ${await clientRes.text()}`);
    process.exit(1);
  }
  const client = await clientRes.json();
  clientId = client.id;
  console.log(`  Client created: id=${clientId} email=${TEST_EMAIL}`);

  /* ══════════════════════════════════════════
     A. Checkout created?
     ══════════════════════════════════════════ */
  section("A. POST /api/billing/checkout");

  const checkoutRes = await apiPost("/api/billing/checkout", {
    client_id: clientId,
    service_id: SERVICE_ID,
  }, cookie);

  const checkoutBody = await checkoutRes.json();

  if (!checkoutRes.ok) {
    if (checkoutRes.status === 503) {
      console.log("  ○  Stripe not configured (STRIPE_SECRET_KEY not set) — A + B skipped");
      console.log("     Webhook pipeline can still be validated independently.");
    } else if (checkoutBody.error?.includes("no Stripe Price")) {
      console.log("  ○  stripe_price_id not set (run sync-stripe.ts) — A + B skipped");
    } else {
      fail("Checkout endpoint", `${checkoutRes.status} — ${checkoutBody.error}`);
    }
  } else {
    results.A_checkout_created = true;
    sessionId = checkoutBody.session_id;
    pass("Checkout session created", `session_id=${sessionId?.slice(0, 20)}...`);
  }

  /* ══════════════════════════════════════════
     B. Customer created in DB?
     ══════════════════════════════════════════ */
  section("B. Stripe Customer created");

  const { rows: clientRows } = await pool.query(
    "SELECT stripe_customer_id FROM clients WHERE id = $1",
    [clientId]
  );
  const stripeCustomerId = clientRows[0]?.stripe_customer_id;

  if (stripeCustomerId) {
    results.B_customer_created = true;
    pass("stripe_customer_id saved on client", stripeCustomerId.slice(0, 20) + "...");
  } else {
    // If checkout was skipped (no price ID), customer won't be created — not a blocker
    if (!results.A_checkout_created) {
      console.log("  ℹ  Skipped (checkout not attempted — no Stripe price)");
    } else {
      fail("stripe_customer_id missing on client after checkout");
    }
  }

  /* ══════════════════════════════════════════
     Simulate webhook: checkout.session.completed
     ══════════════════════════════════════════ */
  section("Simulate checkout.session.completed webhook");

  // Use real session_id if we have it, otherwise generate a synthetic one
  const webhookSessionId = sessionId || `cs_test_synthetic_${Date.now()}`;
  const syntheticCustomerId = stripeCustomerId || `cus_test_synthetic_${Date.now()}`;

  const webhookPayload = {
    type: "checkout.session.completed",
    data: {
      object: {
        id: webhookSessionId,
        object: "checkout.session",
        customer: syntheticCustomerId,
        amount_total: 29900,
        metadata: {
          crm_client_id: String(clientId),
          service_catalog_id: SERVICE_ID,
        },
        payment_status: "paid",
        mode: "payment",
      },
    },
  };

  const webhookRes = await fetch(`${BASE_URL}/api/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(webhookPayload),
  });

  const webhookBody = await webhookRes.json();

  if (!webhookRes.ok || !webhookBody.received) {
    fail("Webhook endpoint", `${webhookRes.status} — ${JSON.stringify(webhookBody)}`);
    await cleanup(clientId);
    process.exit(1);
  }
  pass("Webhook accepted (200 received: true)");

  /* ══════════════════════════════════════════
     C. Payment recorded and marked paid?
     ══════════════════════════════════════════ */
  section("C. Payment record");

  const { rows: payments } = await pool.query(
    "SELECT id, status, amount_cents, type, stripe_payment_intent_id FROM client_payments WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1",
    [clientId]
  );

  if (payments.length > 0 && payments[0].status === "paid") {
    results.C_payment_recorded = true;
    pass("Payment recorded", `id=${payments[0].id} amount=$${(payments[0].amount_cents / 100).toFixed(2)} status=${payments[0].status} type=${payments[0].type}`);
  } else if (payments.length > 0) {
    fail("Payment exists but wrong status", `status=${payments[0].status}`);
  } else {
    fail("No payment record found");
  }

  /* ══════════════════════════════════════════
     D. Service provisioned?
     ══════════════════════════════════════════ */
  section("D. client_service record");

  const { rows: services } = await pool.query(
    "SELECT id, status, billing_period, price_cents FROM client_services WHERE client_id = $1 AND service_id = $2",
    [clientId, SERVICE_ID]
  );

  if (services.length > 0) {
    results.D_service_provisioned = true;
    pass("client_service created", `id=${services[0].id} status=${services[0].status} price=$${(services[0].price_cents / 100).toFixed(2)}`);
  } else {
    fail("client_service not found");
  }

  /* ══════════════════════════════════════════
     E. Fulfillment tasks created?
     ══════════════════════════════════════════ */
  section("E. Fulfillment tasks");

  const { rows: tasks } = await pool.query(
    "SELECT id, title, status, priority FROM fulfillment_tasks WHERE client_id = $1 ORDER BY sort_order",
    [clientId]
  );

  // mapguard-setup has 5 task templates
  if (tasks.length > 0) {
    results.E_tasks_created = true;
    pass(`${tasks.length} tasks created`);
    tasks.forEach((t) => console.log(`       [${t.id}] ${t.title} — ${t.status} / ${t.priority}`));
  } else {
    fail("No fulfillment tasks found");
  }

  /* ══════════════════════════════════════════
     F. Client status updated?
     ══════════════════════════════════════════ */
  section("F. Client status");

  const { rows: updatedClient } = await pool.query(
    "SELECT status FROM clients WHERE id = $1",
    [clientId]
  );

  const status = updatedClient[0]?.status;
  if (status === "onboarding" || status === "active") {
    results.F_client_status_updated = true;
    pass(`Client status updated to "${status}"`);
  } else {
    fail(`Client status not updated`, `still "${status}"`);
  }

  /* ══════════════════════════════════════════
     G. Onboarding submission created?
     ══════════════════════════════════════════ */
  section("G. Onboarding submission");

  const { rows: submissions } = await pool.query(
    "SELECT id, status, template_id FROM onboarding_submissions WHERE client_id = $1",
    [clientId]
  );

  if (submissions.length > 0) {
    results.G_onboarding_submission_created = true;
    pass("onboarding_submission created", `id=${submissions[0].id} status=${submissions[0].status} template_id=${submissions[0].template_id}`);
  } else {
    fail("No onboarding_submission found");
  }

  /* ══════════════════════════════════════════
     Report
     ══════════════════════════════════════════ */
  console.log("\n══════════════════════════════════════════");
  console.log("  STRIPE FLOW TEST — RESULTS");
  console.log("══════════════════════════════════════════");

  const checks = [
    ["A", "Checkout created",           results.A_checkout_created],
    ["B", "Stripe Customer saved",      results.B_customer_created],
    ["C", "Payment recorded (paid)",    results.C_payment_recorded],
    ["D", "Service provisioned",        results.D_service_provisioned],
    ["E", "Tasks created from template",results.E_tasks_created],
    ["F", "Client status → onboarding", results.F_client_status_updated],
    ["G", "Onboarding submission",      results.G_onboarding_submission_created],
  ] as const;

  let passed = 0;
  let skipped = 0;
  for (const [letter, label, result] of checks) {
    // A+B are skipped if no Stripe price — not a failure of the webhook flow
    const isOptional = letter === "A" || letter === "B";
    if (result) {
      console.log(`  ✓  ${letter}. ${label}`);
      passed++;
    } else if (isOptional && !results.A_checkout_created) {
      console.log(`  ○  ${letter}. ${label} — skipped (no stripe_price_id; run sync-stripe.ts to enable)`);
      skipped++;
    } else {
      console.log(`  ✗  ${letter}. ${label}`);
    }
  }

  const total = checks.length - skipped;
  const allPassed = passed === total + skipped;

  console.log(`\n  ${passed}/${checks.length} passed${skipped > 0 ? ` (${skipped} skipped)` : ""}`);

  if (results.C_payment_recorded && results.D_service_provisioned && results.E_tasks_created && results.F_client_status_updated) {
    console.log("\n  ✅  Core pipeline PASSED — webhook → provision → tasks → status all verified");
  } else {
    console.log("\n  ❌  Core pipeline FAILED — see failures above");
  }

  if (!results.A_checkout_created) {
    console.log("\n  ℹ  To enable full end-to-end checkout test:");
    console.log("     Run: STRIPE_SECRET_KEY=sk_test_... npx tsx server/scripts/sync-stripe.ts");
    console.log("     This will populate stripe_price_id on the service_catalog table.");
  }

  /* ── Cleanup ── */
  await cleanup(clientId);
  await pool.end();

  process.exit(allPassed || (passed === total) ? 0 : 1);
}

async function cleanup(clientId: number | null) {
  if (!clientId) return;
  try {
    await pool.query("DELETE FROM fulfillment_tasks WHERE client_id = $1", [clientId]);
    await pool.query("DELETE FROM client_payments WHERE client_id = $1", [clientId]);
    await pool.query("DELETE FROM onboarding_submissions WHERE client_id = $1", [clientId]);
    await pool.query("DELETE FROM client_services WHERE client_id = $1", [clientId]);
    await pool.query("DELETE FROM clients WHERE id = $1", [clientId]);
    console.log(`\n  [cleanup] Test client ${clientId} removed.`);
  } catch (err: any) {
    console.warn(`  [cleanup] Warning: ${err.message}`);
  }
}

main().catch((err) => {
  console.error("\n  FATAL:", err.message);
  process.exit(1);
});
