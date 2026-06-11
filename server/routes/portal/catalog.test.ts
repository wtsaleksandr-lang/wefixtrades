/**
 * Checkout provisioning-order tests — session FIRST, CRM rows after.
 *
 * Night-audit P-C P1 / P-B P1 (2026-06-11): the portal catalog subscribe
 * route (and the public checkout route) used to create client_services /
 * client_payments / onboarding / fulfillment-task rows BEFORE calling
 * `stripe.checkout.sessions.create`. Any session-create failure (invalid
 * payment-method types — the exact checkout P0, archived price, Stripe
 * outage) stranded phantom "pending" rows in the CRM, and real customers
 * who hit the 500 existed as phantom onboarding clients with open tasks.
 *
 * These tests drive the REAL /api/portal/catalog/subscribe handler (both
 * the single-service and bundle paths) with an injected fake Stripe client
 * (via the exported stripeClientFactory seam) and spied storage methods:
 *
 *   1. BEHAVIORAL: sessions.create throws → the response is an error AND
 *      ZERO CRM row-writes happened (no client_service, no payment, no
 *      onboarding submission, no fulfillment task).
 *   2. BEHAVIORAL: sessions.create succeeds → every CRM row-write happens
 *      AFTER the session exists, rows are keyed to the session id, and the
 *      session metadata still carries the webhook contract
 *      (crm_client_id + service_catalog_id).
 *   3. DELIBERATE-FAILURE FIXTURE (behavioral): a re-implementation of the
 *      OLD rows-then-session order trips the zero-rows invariant — proving
 *      the gate catches the regression, not merely that it runs.
 *   4. SOURCE CONTRACT: in catalog.ts (both paths) and
 *      publicCheckoutRoutes.ts, `checkout.sessions.create(` must appear
 *      BEFORE any row-creating storage call. A deliberate old-order source
 *      fixture proves the checker flags the inverted order.
 *
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 * Runnable standalone:
 *
 *   npx tsx server/routes/portal/catalog.test.ts
 *
 * Wired into CI as `npm run check:checkout-provisioning-order`.
 * Uses node:assert/strict, no test-runner dependency. No network, no DB —
 * db.select is stubbed and the fake Stripe client never leaves the process.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* Module-load prerequisites (same pattern as trialLifecycleWorker.test.ts):
 * server/db.ts throws without a DATABASE_URL; the route 503s without a
 * STRIPE_SECRET_KEY. Neither is ever used for real IO here. */
process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";
process.env.STRIPE_SECRET_KEY ??= "sk_test_stub_never_dialled";
process.env.APP_URL ??= "https://test.example.com";

const { registerPortalCatalogRoutes, stripeClientFactory } = await import("./catalog");
const { storage } = await import("../../storage");
const { db } = await import("../../db");
const { ALL_BUNDLES } = await import("@shared/pricing");

let passed = 0;
let failed = 0;
async function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${label}`);
  } catch (err: any) {
    failed++;
    console.error(`  FAIL ${label}: ${err?.message ?? err}`);
  }
}

/* ═══ Harness: spied storage + stubbed db + fake Stripe ═══ */

const TEST_CLIENT_ID = 42;
const calls: Array<{ name: string; args: any[] }> = [];
function spy<T extends (...a: any[]) => any>(name: string, impl: T): T {
  return ((...args: any[]) => {
    calls.push({ name, args });
    return impl(...args);
  }) as T;
}

/** The storage methods that create CRM rows for a checkout. */
const ROW_WRITERS = [
  "createClientService",
  "createClientPayment",
  "createOnboardingSubmission",
  "createFulfillmentTask",
  "updateTradeLineConfig",
] as const;

function rowWriteCalls() {
  return calls.filter((c) => (ROW_WRITERS as readonly string[]).includes(c.name));
}

/** THE invariant: a failed session-create must leave zero CRM rows. */
function assertNoRowsCreated() {
  const writes = rowWriteCalls();
  assert.equal(
    writes.length,
    0,
    `session-create failed but ${writes.length} CRM row-write(s) happened ` +
      `(${writes.map((c) => c.name).join(", ")}) — phantom pending rows stranded`,
  );
}

/* db.select stub — the route resolves the client_id (select with a fields
 * object) and fetches the client row (select with no args). Nothing here
 * ever reaches a real database. */
const clientRow = {
  id: TEST_CLIENT_ID,
  business_name: "Provisioning Order Test Co",
  contact_email: "porder@test.example.com",
  contact_phone: null,
  stripe_customer_id: "cus_test_existing",
  status: "active",
};
(db as any).select = (fields?: unknown) => ({
  from: () => ({
    where: () => ({
      limit: async () => (fields ? [{ id: TEST_CLIENT_ID }] : [clientRow]),
    }),
  }),
});

/* storage spies — generic active service fixture for any catalog id, so the
 * single path AND every tier of a real bundle resolve a Stripe price. */
let nextRowId = 100;
function svcFixture(id: string) {
  return {
    id,
    name: `Service ${id}`,
    is_active: true,
    billing_period: "monthly",
    default_price: 9900,
    stripe_price_id: `price_${id}`,
    stripe_yearly_price_id: null,
    tiers: null,
  };
}
const TASK_TEMPLATE = {
  title: "Kickoff",
  description: "Start the engagement",
  sort_order: 1,
  default_priority: "normal",
  default_handled_by: "internal",
  default_waiting_on: null,
  human_review_required: false,
  sla_days: 3,
};
const s: any = storage;
s.getServiceById = spy("getServiceById", async (id: string) => svcFixture(id));
s.findClientServiceByServiceId = spy("findClientServiceByServiceId", async () => null);
s.updateClient = spy("updateClient", async () => clientRow);
s.createClientService = spy("createClientService", async (row: any) => ({ id: nextRowId++, ...row }));
s.createClientPayment = spy("createClientPayment", async (row: any) => ({ id: nextRowId++, ...row }));
s.getOnboardingTemplate = spy("getOnboardingTemplate", async () => ({ id: 7 }));
s.createOnboardingSubmission = spy("createOnboardingSubmission", async (row: any) => ({ id: nextRowId++, ...row }));
s.getTaskTemplates = spy("getTaskTemplates", async () => [TASK_TEMPLATE]);
s.createFulfillmentTask = spy("createFulfillmentTask", async (row: any) => ({ id: nextRowId++, ...row }));
s.updateTradeLineConfig = spy("updateTradeLineConfig", async () => undefined);

/* Fake Stripe via the stripeClientFactory seam. */
let sessionsCreateImpl: (params: any) => Promise<any> = async () => {
  throw new Error("sessionsCreateImpl not set for this test");
};
const fakeStripe = {
  customers: {
    create: spy("stripe.customers.create", async () => ({ id: "cus_test_fresh" })),
  },
  checkout: {
    sessions: {
      create: spy("stripe.checkout.sessions.create", (params: any) => sessionsCreateImpl(params)),
    },
  },
};
stripeClientFactory.create = () => fakeStripe as any;

/* Capture the real route handler off a fake Express app. */
const handlers: Record<string, Function> = {};
const recordRoute =
  (method: string) =>
  (path: string, ...fns: any[]) => {
    handlers[`${method} ${path}`] = fns[fns.length - 1];
  };
const fakeApp: any = {
  post: recordRoute("POST"),
  get: recordRoute("GET"),
  put: recordRoute("PUT"),
  patch: recordRoute("PATCH"),
  delete: recordRoute("DELETE"),
  use: () => {},
};
registerPortalCatalogRoutes(fakeApp);
const subscribe = handlers["POST /api/portal/catalog/subscribe"];
assert.ok(subscribe, "POST /api/portal/catalog/subscribe must be registered");

function makeReq(body: any) {
  return {
    user: { id: 7, role: "client" },
    adminImpersonating: false,
    body,
    protocol: "https",
    get: () => "test.example.com",
  } as any;
}
function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => ((res.statusCode = code), res);
  res.json = (payload: any) => ((res.body = payload), res);
  return res;
}

const TEST_BUNDLE = ALL_BUNDLES[0];
assert.ok(TEST_BUNDLE?.includes?.length, "shared/pricing must expose at least one bundle with includes");

async function main() {
  /* ═══ 1. Session-create FAILURE → zero rows ═══ */

  await check("single-service: sessions.create throws → 500 and ZERO CRM rows", async () => {
    calls.length = 0;
    sessionsCreateImpl = async () => {
      const err: any = new Error("Stripe exploded (generic transport error)");
      throw err;
    };
    const res = makeRes();
    await subscribe(makeReq({ service_id: "mapguard-pro", billing_period: "monthly" }), res);
    assert.ok(
      calls.some((c) => c.name === "stripe.checkout.sessions.create"),
      "sessions.create must actually have been attempted (otherwise this test proves nothing)",
    );
    assert.equal(res.statusCode, 500);
    assert.ok(res.body?.error, "customer gets an error payload");
    assertNoRowsCreated();
  });

  await check("single-service: inactive-price throw → 409 price_unavailable and ZERO CRM rows", async () => {
    calls.length = 0;
    sessionsCreateImpl = async () => {
      const err: any = new Error("The price specified is inactive.");
      err.type = "StripeInvalidRequestError";
      throw err;
    };
    const res = makeRes();
    await subscribe(makeReq({ service_id: "webfix-pro", billing_period: "monthly" }), res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body?.error_code, "price_unavailable");
    assertNoRowsCreated();
  });

  await check("bundle: sessions.create throws → 500 and ZERO CRM rows", async () => {
    calls.length = 0;
    sessionsCreateImpl = async () => {
      throw new Error("The payment method type provided: us_bank_account is invalid");
    };
    const res = makeRes();
    await subscribe(makeReq({ bundle_id: TEST_BUNDLE.id }), res);
    assert.ok(calls.some((c) => c.name === "stripe.checkout.sessions.create"));
    assert.equal(res.statusCode, 500);
    assertNoRowsCreated();
  });

  /* ═══ 2. Session-create SUCCESS → rows created AFTER, webhook contract kept ═══ */

  await check("single-service: success → rows AFTER session, keyed to session id, webhook metadata intact", async () => {
    calls.length = 0;
    let capturedParams: any = null;
    sessionsCreateImpl = async (params: any) => {
      capturedParams = params;
      return { id: "cs_test_single_ok", url: "https://checkout.stripe.com/c/pay/cs_test_single_ok" };
    };
    const res = makeRes();
    await subscribe(makeReq({ service_id: "mapguard-pro", billing_period: "monthly" }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.checkout_url, "https://checkout.stripe.com/c/pay/cs_test_single_ok");
    assert.equal(res.body?.session_id, "cs_test_single_ok");

    // The webhook finds rows by crm_client_id + service_catalog_id — that
    // contract must survive the reorder.
    assert.equal(capturedParams.metadata.crm_client_id, String(TEST_CLIENT_ID));
    assert.equal(capturedParams.metadata.service_catalog_id, "mapguard-pro");

    // Every row-write happened, and every one AFTER sessions.create.
    const sessionIdx = calls.findIndex((c) => c.name === "stripe.checkout.sessions.create");
    assert.ok(sessionIdx !== -1);
    for (const writer of ["createClientService", "createClientPayment", "createOnboardingSubmission", "createFulfillmentTask"]) {
      const idx = calls.findIndex((c) => c.name === writer);
      assert.ok(idx !== -1, `${writer} must still run on the success path`);
      assert.ok(idx > sessionIdx, `${writer} must run AFTER checkout.sessions.create (got index ${idx} vs session ${sessionIdx})`);
    }

    // Rows are keyed to the session and still pre-payment.
    const csArgs = calls.find((c) => c.name === "createClientService")!.args[0];
    assert.equal(csArgs.status, "pending");
    assert.equal(csArgs.client_id, TEST_CLIENT_ID);
    assert.equal(csArgs.metadata?.stripe_session_id, "cs_test_single_ok");
    const payArgs = calls.find((c) => c.name === "createClientPayment")!.args[0];
    assert.equal(payArgs.status, "pending");
    assert.equal(payArgs.amount_cents, 9900);
  });

  await check("bundle: success → one pending service+payment per tier, all AFTER session", async () => {
    calls.length = 0;
    let capturedParams: any = null;
    sessionsCreateImpl = async (params: any) => {
      capturedParams = params;
      return { id: "cs_test_bundle_ok", url: "https://checkout.stripe.com/c/pay/cs_test_bundle_ok" };
    };
    const res = makeRes();
    await subscribe(makeReq({ bundle_id: TEST_BUNDLE.id }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.session_id, "cs_test_bundle_ok");

    const tierIds = TEST_BUNDLE.includes.map((i: any) => i.tierId);
    assert.equal(capturedParams.metadata.service_catalog_id, tierIds.join(","));
    assert.equal(capturedParams.line_items.length, tierIds.length);

    const sessionIdx = calls.findIndex((c) => c.name === "stripe.checkout.sessions.create");
    const serviceWrites = calls.filter((c) => c.name === "createClientService");
    const paymentWrites = calls.filter((c) => c.name === "createClientPayment");
    assert.equal(serviceWrites.length, tierIds.length, "one client_service per included tier");
    assert.equal(paymentWrites.length, tierIds.length, "one pending payment per included tier");
    for (const w of [...serviceWrites, ...paymentWrites]) {
      assert.ok(calls.indexOf(w) > sessionIdx, `${w.name} must run AFTER checkout.sessions.create`);
      assert.equal(w.args[0].status, "pending");
    }
    for (const w of serviceWrites) {
      assert.equal(w.args[0].metadata?.stripe_session_id, "cs_test_bundle_ok");
      assert.equal(w.args[0].metadata?.bundle_id, TEST_BUNDLE.id);
    }
  });

  /* ═══ 3. Deliberate-failure fixture (behavioral) ═══ */

  await check("DELIBERATE-FAILURE: the OLD rows-then-session order trips the zero-rows invariant", async () => {
    calls.length = 0;
    // Faithful re-implementation of the pre-fix order: provision first,
    // then sessions.create throws (the exact P0 failure mode).
    async function legacyOrderSubscribe() {
      const cs: any = await (storage as any).createClientService({
        client_id: TEST_CLIENT_ID,
        service_id: "mapguard-pro",
        status: "pending",
      });
      await (storage as any).createClientPayment({
        client_id: TEST_CLIENT_ID,
        client_service_id: cs.id,
        status: "pending",
      });
      throw new Error("The payment method type provided: us_bank_account is invalid");
    }
    await assert.rejects(legacyOrderSubscribe());
    // Sanity: the legacy order really did write rows before failing…
    assert.ok(rowWriteCalls().length > 0, "fixture must actually strand rows, or the gate proves nothing");
    // …and THE GATE catches it.
    assert.throws(() => assertNoRowsCreated(), /phantom pending rows/);
  });

  /* ═══ 4. Source contract — session-first order pinned in BOTH routes ═══ */

  const here = dirname(fileURLToPath(import.meta.url));
  const catalogSrc = readFileSync(join(here, "catalog.ts"), "utf8");
  const publicSrc = readFileSync(join(here, "..", "publicCheckoutRoutes.ts"), "utf8");

  /** Returns violations: any CRM row-writer appearing before sessions.create in the block. */
  function sessionFirstViolations(blockLabel: string, block: string): string[] {
    const violations: string[] = [];
    const sessionIdx = block.indexOf("checkout.sessions.create(");
    if (sessionIdx === -1) {
      violations.push(`${blockLabel}: checkout.sessions.create( not found`);
      return violations;
    }
    for (const writer of ROW_WRITERS) {
      const idx = block.indexOf(`${writer}(`);
      if (idx !== -1 && idx < sessionIdx) {
        violations.push(
          `${blockLabel}: ${writer}( appears BEFORE checkout.sessions.create( — ` +
            `provisioning-before-session strands phantom rows on any session failure`,
        );
      }
    }
    return violations;
  }

  await check("source contract: catalog.ts bundle path creates the session before any CRM row", () => {
    const start = catalogSrc.indexOf("if (bundle_id) {");
    const end = catalogSrc.indexOf("if (!service_id");
    assert.ok(start !== -1 && end > start, "bundle block anchors must exist in catalog.ts");
    assert.deepEqual(sessionFirstViolations("catalog.ts bundle path", catalogSrc.slice(start, end)), []);
  });

  await check("source contract: catalog.ts single-service path creates the session before any CRM row", () => {
    const start = catalogSrc.indexOf("if (!service_id");
    const end = catalogSrc.indexOf('app.get("/api/portal/catalog"');
    assert.ok(start !== -1 && end > start, "single-path anchors must exist in catalog.ts");
    assert.deepEqual(sessionFirstViolations("catalog.ts single path", catalogSrc.slice(start, end)), []);
  });

  await check("source contract: publicCheckoutRoutes.ts creates the session before any CRM row", () => {
    const start = publicSrc.indexOf('app.post("/api/public/checkout"');
    assert.ok(start !== -1);
    const block = publicSrc.slice(start);
    assert.deepEqual(sessionFirstViolations("publicCheckoutRoutes.ts", block), []);
    // The lead→onboarding status flip must also wait for a real session.
    const sessionIdx = block.indexOf("checkout.sessions.create(");
    const flipIdx = block.indexOf('status: "onboarding"');
    assert.ok(flipIdx === -1 || flipIdx > sessionIdx, "client status flip must happen after sessions.create");
  });

  await check("DELIBERATE-FAILURE: the checker flags an old-order source snippet", () => {
    const legacySnippet = `
      const cs = await storage.createClientService({ status: "pending" });
      await storage.createClientPayment({ status: "pending" });
      const session = await stripe.checkout.sessions.create({ mode });
    `;
    const violations = sessionFirstViolations("legacy fixture", legacySnippet);
    assert.ok(
      violations.length >= 2,
      "restoring the old rows-before-session order must fail the source contract",
    );
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
