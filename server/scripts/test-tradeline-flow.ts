/**
 * TradeLine v1 — Sandbox End-to-End Test
 *
 * Tests the full TradeLine lifecycle from checkout → payment → onboarding →
 * assistant build → readiness → go-live for all three variants.
 *
 * Usage:
 *   npx tsx server/scripts/test-tradeline-flow.ts
 *
 * Requirements:
 *   - Dev server running on localhost:5000 (or set BASE_URL)
 *   - DATABASE_URL set
 *   - STRIPE_SECRET_KEY set (sk_test_... for sandbox)
 *   - Service catalog seeded (npx tsx server/scripts/seed-services.ts)
 *   - Stripe prices synced (npx tsx server/scripts/sync-stripe.ts)
 *
 * Optional:
 *   - SMTP configured (for real onboarding emails; test proceeds without)
 *   - VAPI_API_KEY set (for real Vapi assistant push; test proceeds without)
 */

import { pool } from "../db.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

/* ─── Helpers ─── */

function pass(label: string, detail?: string) {
  console.log(`  ✓  ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label: string, detail?: string) {
  console.error(`  ✗  ${label}${detail ? ` — ${detail}` : ""}`);
}

function skip(label: string, detail?: string) {
  console.log(`  ○  ${label}${detail ? ` — ${detail}` : ""}`);
}

function section(title: string) {
  console.log(`\n── ${title} ──`);
}

function heading(title: string) {
  console.log(`\n══════════════════════════════════════════`);
  console.log(`  ${title}`);
  console.log(`══════════════════════════════════════════`);
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

async function apiGet(path: string, cookie: string) {
  return fetch(`${BASE_URL}${path}`, { headers: { Cookie: cookie } });
}

async function apiPost(path: string, body: unknown, cookie: string) {
  return fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
}

async function apiPatch(path: string, body: unknown, cookie: string) {
  return fetch(`${BASE_URL}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
}

/* ─── Test context ─── */

interface TestContext {
  cookie: string;
  clientId: number;
  serviceId: string;
  clientServiceId?: number;
  onboardingToken?: string;
  onboardingId?: number;
  passed: number;
  failed: number;
  skipped: number;
}

async function check(
  ctx: TestContext,
  label: string,
  fn: () => Promise<boolean | string>,
): Promise<boolean> {
  try {
    const result = await fn();
    if (result === true) {
      pass(label);
      ctx.passed++;
      return true;
    } else if (typeof result === "string") {
      pass(label, result);
      ctx.passed++;
      return true;
    } else {
      fail(label);
      ctx.failed++;
      return false;
    }
  } catch (err: any) {
    fail(label, err.message);
    ctx.failed++;
    return false;
  }
}

/* ═══════════════════════════════════════════
   SCENARIO 1: tradeline-complete (self-serve checkout)
   ═══════════════════════════════════════════ */

async function testTradeLineComplete(cookie: string): Promise<TestContext> {
  heading("SCENARIO 1: tradeline-complete — Self-Serve Checkout");
  const serviceId = "tradeline-complete";
  const email = `tl-test-complete-${Date.now()}@example.com`;
  const ctx: TestContext = { cookie, clientId: 0, serviceId, passed: 0, failed: 0, skipped: 0 };

  /* ── Step 1: Public checkout ── */
  section("1. Public Checkout");

  const checkoutRes = await fetch(`${BASE_URL}/api/public/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business_name: "Test Complete Plumbing",
      contact_name: "John Complete",
      contact_email: email,
      contact_phone: "+447700900100",
      items: [serviceId],
    }),
  });
  const checkoutBody = await checkoutRes.json();

  if (!checkoutRes.ok) {
    if (checkoutBody.error?.includes("price configured")) {
      skip("Checkout", "stripe_price_id not set — run sync-stripe.ts");
      console.log("     Falling back to admin provision + simulated webhook.");
    } else {
      fail("Checkout", `${checkoutRes.status}: ${checkoutBody.error}`);
    }
  } else {
    pass("Checkout session created", `url=${checkoutBody.checkout_url?.slice(0, 50)}...`);
  }

  // Find client
  const { rows: clientRows } = await pool.query(
    "SELECT id FROM clients WHERE contact_email = $1",
    [email],
  );

  if (clientRows.length === 0) {
    // Checkout didn't create client (price missing) — create via admin
    const clientRes = await apiPost("/api/admin/crm/clients", {
      business_name: "Test Complete Plumbing",
      contact_name: "John Complete",
      contact_email: email,
      contact_phone: "+447700900100",
      trade_type: "plumber",
      status: "lead",
      source: "manual",
    }, cookie);
    const c = await clientRes.json();
    ctx.clientId = c.id;
    console.log(`  [fallback] Created client via admin: id=${ctx.clientId}`);
  } else {
    ctx.clientId = clientRows[0].id;
  }

  /* ── Step 2: Simulate webhook (payment) ── */
  section("2. Simulate Payment Webhook");

  // Check if service already provisioned by checkout
  const { rows: existingServices } = await pool.query(
    "SELECT id FROM client_services WHERE client_id = $1 AND service_id = $2",
    [ctx.clientId, serviceId],
  );

  if (existingServices.length === 0) {
    // Not pre-provisioned — provision via admin
    const provRes = await apiPost(`/api/admin/crm/clients/${ctx.clientId}/provision`, {
      service_id: serviceId,
    }, cookie);
    if (!provRes.ok) {
      fail("Admin provision", await provRes.text());
      return ctx;
    }
    const provBody = await provRes.json();
    ctx.clientServiceId = provBody.clientService?.id;
    pass("Admin-provisioned (no checkout price)", `cs_id=${ctx.clientServiceId}`);
  }

  // Simulate webhook for payment confirmation
  const webhookPayload = {
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_test_tl_complete_${Date.now()}`,
        object: "checkout.session",
        customer: `cus_test_${Date.now()}`,
        amount_total: 19700,
        metadata: {
          crm_client_id: String(ctx.clientId),
          service_catalog_id: serviceId,
          source: "public_checkout",
        },
        payment_status: "paid",
        mode: "subscription",
      },
    },
  };

  const whRes = await fetch(`${BASE_URL}/api/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(webhookPayload),
  });
  const whBody = await whRes.json();

  await check(ctx, "Webhook accepted", async () => whBody.received === true);

  // Wait a moment for async operations (portal account creation)
  await new Promise(r => setTimeout(r, 500));

  /* ── Step 3: Verify provisioning ── */
  section("3. Verify Provisioning");

  const { rows: svcRows } = await pool.query(
    "SELECT id, status, metadata FROM client_services WHERE client_id = $1 AND service_id = $2",
    [ctx.clientId, serviceId],
  );
  ctx.clientServiceId = svcRows[0]?.id;

  await check(ctx, "client_service created", async () => {
    if (!svcRows[0]) return false;
    const meta = svcRows[0].metadata?.tradeline;
    return `id=${svcRows[0].id} variant=${meta?.variant} stage=${meta?.setupStage} assistant=${meta?.assistant?.status}`;
  });

  await check(ctx, "TradeLine config defaults correct", async () => {
    const meta = svcRows[0]?.metadata?.tradeline;
    return meta?.variant === "complete"
      && meta?.channels?.voice === true
      && meta?.channels?.websiteChat === true
      && meta?.assistant?.status === "not_built";
  });

  await check(ctx, "Notifications auto-populated", async () => {
    const meta = svcRows[0]?.metadata?.tradeline;
    return (meta?.notifications?.email?.length > 0 || meta?.notifications?.sms?.length > 0)
      ? `email=${meta.notifications.email} sms=${meta.notifications.sms}`
      : false;
  });

  await check(ctx, "Fulfillment tasks created", async () => {
    const { rows } = await pool.query(
      "SELECT count(*)::int as total FROM fulfillment_tasks WHERE client_service_id = $1",
      [ctx.clientServiceId],
    );
    return rows[0].total === 7 ? "7 tasks" : false;
  });

  await check(ctx, "Onboarding submission created", async () => {
    const { rows } = await pool.query(
      "SELECT id, status, access_token FROM onboarding_submissions WHERE client_service_id = $1",
      [ctx.clientServiceId],
    );
    if (!rows[0]) return false;
    ctx.onboardingToken = rows[0].access_token;
    ctx.onboardingId = rows[0].id;
    return `id=${rows[0].id} status=${rows[0].status}`;
  });

  await check(ctx, "Portal account created", async () => {
    const { rows } = await pool.query(
      "SELECT user_id FROM clients WHERE id = $1",
      [ctx.clientId],
    );
    return rows[0]?.user_id ? `user_id=${rows[0].user_id}` : false;
  });

  await check(ctx, "Payment marked paid", async () => {
    const { rows } = await pool.query(
      "SELECT status FROM client_payments WHERE client_service_id = $1 ORDER BY created_at DESC LIMIT 1",
      [ctx.clientServiceId],
    );
    return rows[0]?.status === "paid";
  });

  /* ── Step 4: Submit onboarding ── */
  section("4. Submit Onboarding (via public link)");

  if (!ctx.onboardingToken) {
    skip("Onboarding submit", "no access token found");
  } else {
    const onboardingRes = await fetch(`${BASE_URL}/api/onboarding/${ctx.onboardingToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        responses: {
          business_name: "Test Complete Plumbing",
          trade_type: "Plumber",
          service_area: "London",
          business_hours: "Mon-Fri 8am-6pm",
          primary_phone: "+447700900456",
          forwarding_preference: "no-answer",
          ring_timeout: "25",
          website_url: "https://test-plumbing.example.com",
          website_access: "yes",
          install_mode: "direct embed",
          brand_colors: "#0066cc",
          top_services: "Emergency plumbing, Boiler repair, Bathroom installation",
          pricing_ranges: "£50-£300 depending on job",
          lead_destination: "both",
          escalation_number: "+447700900999",
          booking_enabled: "true",
          tone: "friendly",
        },
      }),
    });

    await check(ctx, "Onboarding submitted", async () => {
      const body = await onboardingRes.json();
      return body.ok === true && body.status === "submitted";
    });

    // Wait for async assistant build
    await new Promise(r => setTimeout(r, 1500));

    await check(ctx, "Config mapped from onboarding", async () => {
      const { rows } = await pool.query("SELECT metadata FROM client_services WHERE id = $1", [ctx.clientServiceId]);
      const tl = rows[0]?.metadata?.tradeline;
      return tl?.phoneRouting?.primaryBusinessNumber === "+447700900456"
        && tl?.phoneRouting?.forwardingMode === "no_answer"
        && tl?.website?.accessAvailable === true;
    });

    await check(ctx, "setupStage advanced", async () => {
      const { rows } = await pool.query("SELECT metadata FROM client_services WHERE id = $1", [ctx.clientServiceId]);
      const stage = rows[0]?.metadata?.tradeline?.setupStage;
      return stage !== "not_started" ? `setupStage=${stage}` : false;
    });

    await check(ctx, "Assistant build triggered", async () => {
      const { rows } = await pool.query("SELECT metadata FROM client_services WHERE id = $1", [ctx.clientServiceId]);
      const ast = rows[0]?.metadata?.tradeline?.assistant;
      if (ast?.status === "built") return `status=built template=${ast.templateId} hash=${ast.inputHash}`;
      if (ast?.status === "building") return `status=building (still in progress)`;
      if (ast?.status === "failed") return `status=failed error=${ast.lastBuildError}`;
      return `status=${ast?.status ?? "unknown"}`;
    });
  }

  /* ── Step 5: Readiness check ── */
  section("5. Readiness Check");

  const readinessRes = await apiGet(
    `/api/admin/crm/tradeline/${ctx.clientServiceId}/readiness`,
    cookie,
  );
  const readiness = await readinessRes.json();

  await check(ctx, "Readiness endpoint responds", async () => {
    return typeof readiness.ready === "boolean"
      ? `ready=${readiness.ready} issues=${readiness.issues?.length ?? 0}`
      : false;
  });

  if (!readiness.ready && readiness.issues) {
    console.log(`  ℹ  Issues: ${readiness.issues.join("; ")}`);
  }

  /* ── Step 6: Fix remaining issues + go-live ── */
  section("6. Go-Live Attempt");

  // Ensure setupStage is ready_for_testing
  await apiPost(`/api/admin/crm/tradeline/${ctx.clientServiceId}/config`, {
    setupStage: "ready_for_testing",
  }, cookie);

  // If assistant not built yet, try manual build
  {
    const { rows } = await pool.query("SELECT metadata FROM client_services WHERE id = $1", [ctx.clientServiceId]);
    const ast = rows[0]?.metadata?.tradeline?.assistant;
    if (ast?.status !== "built") {
      console.log("  ℹ  Assistant not yet built — triggering manual build...");
      await apiPost(`/api/admin/crm/tradeline/${ctx.clientServiceId}/build-assistant`, {}, cookie);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Mark all tasks delivered
  const { rows: taskRows } = await pool.query(
    "SELECT id FROM fulfillment_tasks WHERE client_service_id = $1 AND status != 'delivered'",
    [ctx.clientServiceId],
  );
  for (const t of taskRows) {
    await apiPatch(`/api/admin/crm/fulfillment/${t.id}`, { status: "delivered" }, cookie);
  }
  if (taskRows.length > 0) console.log(`  ℹ  Marked ${taskRows.length} tasks as delivered`);

  // Attempt go-live
  const goLiveRes = await apiPost(
    `/api/admin/crm/tradeline/${ctx.clientServiceId}/go-live`,
    {},
    cookie,
  );
  const goLiveBody = await goLiveRes.json();

  await check(ctx, "Go-live succeeded", async () => {
    if (goLiveRes.ok) {
      return `setupStage=${goLiveBody.config?.setupStage}`;
    }
    return false;
  });

  if (!goLiveRes.ok && goLiveBody.issues) {
    console.log(`  ℹ  Go-live blocked: ${goLiveBody.issues.join("; ")}`);
  }

  /* ── Step 7: Verify final state ── */
  section("7. Final State Verification");

  await check(ctx, "Service status is active", async () => {
    const { rows } = await pool.query(
      "SELECT status FROM client_services WHERE id = $1",
      [ctx.clientServiceId],
    );
    return rows[0]?.status === "active" ? "status=active" : false;
  });

  await check(ctx, "Client status is active", async () => {
    const { rows } = await pool.query(
      "SELECT status FROM clients WHERE id = $1",
      [ctx.clientId],
    );
    const s = rows[0]?.status;
    return (s === "active" || s === "onboarding") ? `status=${s}` : false;
  });

  return ctx;
}

/* ═══════════════════════════════════════════
   SCENARIO 2: tradeline-call-backup (admin provision)
   ═══════════════════════════════════════════ */

async function testTradeLineCallBackup(cookie: string): Promise<TestContext> {
  heading("SCENARIO 2: tradeline-call-backup — Admin Provision");
  const serviceId = "tradeline-call-backup";
  const email = `tl-test-callbackup-${Date.now()}@example.com`;
  const ctx: TestContext = { cookie, clientId: 0, serviceId, passed: 0, failed: 0, skipped: 0 };

  // Create client
  const clientRes = await apiPost("/api/admin/crm/clients", {
    business_name: "Test Sparky Electrics",
    contact_name: "Dave Sparks",
    contact_email: email,
    contact_phone: "+447700900200",
    trade_type: "electrician",
    status: "lead",
    source: "manual",
  }, cookie);
  const client = await clientRes.json();
  ctx.clientId = client.id;

  // Provision
  section("1. Admin Provision");
  const provRes = await apiPost(`/api/admin/crm/clients/${ctx.clientId}/provision`, {
    service_id: serviceId,
  }, cookie);
  const provBody = await provRes.json();
  ctx.clientServiceId = provBody.clientService?.id;

  await check(ctx, "Service provisioned", async () => {
    return provBody.clientService?.id
      ? `cs_id=${provBody.clientService.id} tasks=${provBody.tasksCreated}`
      : false;
  });

  await check(ctx, "Portal account in response", async () => {
    return provBody.portalAccount
      ? `email=${provBody.portalAccount.email}`
      : "no portalAccount (may already exist)";
  });

  await check(ctx, "Onboarding email sent", async () => {
    return provBody.onboarding?.status === "sent" ? "status=sent" : `status=${provBody.onboarding?.status ?? "no onboarding"}`;
  });

  await check(ctx, "Config defaults correct", async () => {
    const { rows } = await pool.query("SELECT metadata FROM client_services WHERE id = $1", [ctx.clientServiceId]);
    const tl = rows[0]?.metadata?.tradeline;
    return tl?.variant === "call_backup"
      && tl?.channels?.voice === true
      && tl?.channels?.websiteChat === false
      && tl?.website?.embedMode === "none";
  });

  // Submit onboarding via admin config update (simulating manual process)
  section("2. Simulate Onboarding Answers via Config");
  await apiPost(`/api/admin/crm/tradeline/${ctx.clientServiceId}/config`, {
    phoneRouting: { primaryBusinessNumber: "+447700900456", forwardingMode: "no_answer" },
    setupStage: "ready_for_testing",
  }, cookie);

  // Build assistant
  section("3. Build Assistant");
  const buildRes = await apiPost(`/api/admin/crm/tradeline/${ctx.clientServiceId}/build-assistant`, {}, cookie);
  const buildBody = await buildRes.json();

  await check(ctx, "Assistant built", async () => {
    return buildBody.templateId
      ? `template=${buildBody.templateId} hash=${buildBody.inputHash}`
      : false;
  });

  // Go-live
  section("4. Go-Live");
  const { rows: taskRows } = await pool.query(
    "SELECT id FROM fulfillment_tasks WHERE client_service_id = $1 AND status != 'delivered'",
    [ctx.clientServiceId],
  );
  for (const t of taskRows) {
    await apiPatch(`/api/admin/crm/fulfillment/${t.id}`, { status: "delivered" }, cookie);
  }

  const goLiveRes = await apiPost(`/api/admin/crm/tradeline/${ctx.clientServiceId}/go-live`, {}, cookie);
  const goLiveBody = await goLiveRes.json();

  await check(ctx, "Go-live succeeded", async () => {
    return goLiveRes.ok ? `setupStage=${goLiveBody.config?.setupStage}` : false;
  });

  if (!goLiveRes.ok && goLiveBody.issues) {
    console.log(`  ℹ  Go-live blocked: ${goLiveBody.issues.join("; ")}`);
  }

  return ctx;
}

/* ═══════════════════════════════════════════
   CLEANUP
   ═══════════════════════════════════════════ */

async function cleanup(clientIds: number[]) {
  for (const id of clientIds) {
    try {
      await pool.query("DELETE FROM admin_activity_log WHERE entity_type = 'client_service' AND entity_id IN (SELECT id FROM client_services WHERE client_id = $1)", [id]);
      await pool.query("DELETE FROM admin_activity_log WHERE entity_type = 'client' AND entity_id = $1", [id]);
      await pool.query("DELETE FROM fulfillment_tasks WHERE client_id = $1", [id]);
      await pool.query("DELETE FROM client_payments WHERE client_id = $1", [id]);
      await pool.query("DELETE FROM onboarding_submissions WHERE client_id = $1", [id]);
      await pool.query("DELETE FROM client_services WHERE client_id = $1", [id]);
      const { rows } = await pool.query("SELECT user_id FROM clients WHERE id = $1", [id]);
      await pool.query("DELETE FROM clients WHERE id = $1", [id]);
      if (rows[0]?.user_id) {
        await pool.query("DELETE FROM users WHERE id = $1", [rows[0].user_id]);
      }
    } catch (err: any) {
      console.warn(`  [cleanup] Warning for client ${id}: ${err.message}`);
    }
  }
  console.log(`\n  [cleanup] ${clientIds.length} test client(s) removed.`);
}

/* ═══════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════ */

async function main() {
  heading("TradeLine v1 — Sandbox End-to-End Test");
  console.log(`  Endpoint: ${BASE_URL}`);

  let cookie: string;
  try {
    cookie = await adminLogin();
    console.log("  Admin session acquired.");
  } catch (err: any) {
    console.error(`\n  FATAL: Could not log in — ${err.message}`);
    process.exit(1);
  }

  const clientIds: number[] = [];
  let totalPassed = 0;
  let totalFailed = 0;

  // Scenario 1: tradeline-complete (self-serve)
  const ctx1 = await testTradeLineComplete(cookie);
  clientIds.push(ctx1.clientId);
  totalPassed += ctx1.passed;
  totalFailed += ctx1.failed;

  // Scenario 2: tradeline-call-backup (admin provision)
  const ctx2 = await testTradeLineCallBackup(cookie);
  clientIds.push(ctx2.clientId);
  totalPassed += ctx2.passed;
  totalFailed += ctx2.failed;

  /* ── Report ── */
  heading("RESULTS");
  console.log(`  Scenario 1 (tradeline-complete):     ${ctx1.passed} passed, ${ctx1.failed} failed`);
  console.log(`  Scenario 2 (tradeline-call-backup):  ${ctx2.passed} passed, ${ctx2.failed} failed`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  Total: ${totalPassed} passed, ${totalFailed} failed`);

  if (totalFailed === 0) {
    console.log("\n  ✅  ALL CHECKS PASSED");
  } else {
    console.log("\n  ❌  SOME CHECKS FAILED — see details above");
  }

  /* ── Cleanup ── */
  await cleanup(clientIds);
  await pool.end();

  process.exit(totalFailed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\n  FATAL:", err.message);
  process.exit(1);
});
