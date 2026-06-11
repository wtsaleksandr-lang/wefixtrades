/**
 * Payment-methods sweep regression test (P0 layer-3 siblings of PR #1681).
 *
 * The CA Stripe account cannot activate us_bank_account/cashapp, so any
 * hardcoded `payment_method_types` list containing them makes
 * stripe.checkout.sessions.create THROW — which killed admin billing
 * checkout, BookFlow invoice pay links, and both portal-catalog subscribe
 * paths in prod. The fix (this branch) removes the param so Stripe applies
 * the dashboard's dynamic payment-method configuration.
 *
 * This test mounts the REAL route modules (no route code is duplicated
 * here), stubs db + storage in memory (same pattern as
 * scripts/smoke-billing-recovery-local.ts / tests/publish-stripe-gate.test.ts),
 * and intercepts Stripe's wire layer by patching `https.request` — the seam
 * stripe-node deliberately keeps monkey-patchable (see the comment in
 * node_modules/stripe/cjs/net/NodeHttpClient.js). Every assertion therefore
 * runs against the LITERAL form-encoded params stripe-node would have sent
 * to api.stripe.com.
 *
 * Coverage (one case per fixed call site + gate proofs):
 *   1. POST /api/billing/checkout            → no payment_method_types on the wire
 *   2. POST /api/pay/:token/checkout         → no payment_method_types; Stripe-Account
 *                                              header still carries the Connect account
 *   3. POST /api/portal/catalog/subscribe    → single-service path: no payment_method_types
 *   4. POST /api/portal/catalog/subscribe    → bundle path: no payment_method_types
 *   5. DELIBERATE FAILURE — a real stripe-node client sending
 *      payment_method_types through the SAME interceptor MUST be flagged by
 *      the detector (proves re-adding the key at any site turns this suite
 *      red, not silently green).
 *   6. Sentry-1N — billing checkout maps an inactive/missing Stripe price to
 *      409 error_code=price_unavailable (mirrors PR #1673's portal-subscribe
 *      pattern), and a control proves unrelated Stripe errors still 500.
 *
 * No test-runner dep (assert/strict only), no live Stripe, no DB, no SMTP.
 * Excluded from `tsc --noEmit` (tsconfig excludes tests/). Run standalone:
 *
 *   npx tsx tests/payment-methods-sweep.test.ts
 */

import crypto from "crypto";
import { EventEmitter } from "events";
import querystring from "querystring";

/* ── ENV setup MUST happen before any imports that read process.env ── */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/dummy_no_connect";
process.env.STRIPE_SECRET_KEY = "sk_test_dummy_payment_methods_sweep";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(16).toString("hex");
process.env.NODE_ENV = "development";
process.env.APP_URL = "http://app.local.test";
process.env.SMTP_HOST = "";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";

const assert = (await import("node:assert/strict")).default;

/* ═══════════════════════════════════════════════════════════════════════
   Stripe wire interceptor — patch https.request before anything imports
   stripe. Captures { path, method, headers, params } of every outbound
   Stripe API call and answers with canned JSON.
   ═══════════════════════════════════════════════════════════════════════ */
const https = (await import("https")).default;

type StripeCall = {
  path: string;
  method: string;
  headers: Record<string, any>;
  params: querystring.ParsedUrlQuery;
};
const captured: StripeCall[] = [];
/** One-shot override for the next Stripe response (used by the 409 cases). */
let nextResponder: ((call: StripeCall) => { status: number; body: any }) | null = null;

function defaultResponse(call: StripeCall): { status: number; body: any } {
  if (call.path.startsWith("/v1/checkout/sessions")) {
    return {
      status: 200,
      body: {
        id: "cs_test_mock_1",
        object: "checkout.session",
        url: "https://checkout.stripe.com/c/pay/cs_test_mock_1",
      },
    };
  }
  if (call.path.startsWith("/v1/customers")) {
    return { status: 200, body: { id: "cus_mock_1", object: "customer" } };
  }
  return { status: 200, body: { id: "obj_mock", object: "unknown" } };
}

(https as any).request = function fakeStripeRequest(options: any) {
  const req: any = new EventEmitter();
  const chunks: string[] = [];
  req.setTimeout = () => req;
  req.destroy = () => req;
  req.abort = () => req;
  req.write = (d: any) => {
    chunks.push(String(d));
    return true;
  };
  req.end = () => {
    const call: StripeCall = {
      path: String(options.path || ""),
      method: String(options.method || "GET"),
      headers: options.headers || {},
      params: querystring.parse(chunks.join("")),
    };
    captured.push(call);
    const resp = nextResponder ? nextResponder(call) : defaultResponse(call);
    nextResponder = null;

    const res: any = new EventEmitter();
    res.statusCode = resp.status;
    res.headers = { "request-id": `req_mock_${captured.length}`, "content-type": "application/json" };
    res.setEncoding = () => res;
    setImmediate(() => {
      req.emit("response", res);
      setImmediate(() => {
        res.emit("data", JSON.stringify(resp.body));
        res.emit("end");
      });
    });
  };
  // NodeHttpClient writes the payload only after a 'socket' event whose
  // socket is not still connecting — hand it one on the next tick.
  setImmediate(() => req.emit("socket", { connecting: false }));
  return req;
};

/* ── The regression detector under proof ── */
function paymentMethodTypeKeys(params: querystring.ParsedUrlQuery): string[] {
  return Object.keys(params).filter(
    (k) => k === "payment_method_types" || k.startsWith("payment_method_types["),
  );
}
function assertNoPaymentMethodTypes(call: StripeCall): void {
  const offenders = paymentMethodTypeKeys(call.params);
  assert.equal(
    offenders.length,
    0,
    `payment_method_types leaked back into ${call.path} — keys on the wire: ${offenders.join(", ")}. ` +
      `Hardcoded method lists throw on this CA Stripe account (see PR #1681); ` +
      `omit the param and let the dashboard's dynamic payment-method config apply.`,
  );
}
/** Sessions.create calls made after a given high-water mark. */
function sessionCreatesSince(mark: number): StripeCall[] {
  return captured
    .slice(mark)
    .filter((c) => c.method === "POST" && c.path === "/v1/checkout/sessions");
}

/* ═══════════════════════════════════════════════════════════════════════
   In-memory db stub (same pattern as tests/publish-stripe-gate.test.ts)
   ═══════════════════════════════════════════════════════════════════════ */
type Row = Record<string, any>;
const memClients = new Map<number, Row>();
const memInvoices = new Map<number, Row>();
const memCalculators = new Map<number, Row>();

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
    if (chunks.length >= 3) {
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
function storeFor(tn: string): Map<any, Row> | null {
  if (tn === "clients") return memClients;
  if (tn === "bookflow_invoices") return memInvoices;
  if (tn === "calculators") return memCalculators;
  return null;
}
function rowsMatching(tn: string, cond: any): Row[] {
  const store = storeFor(tn);
  if (!store) return [];
  const preds = extractEqPredicates(cond);
  return [...store.values()].filter((r) => preds.every((p) => r[p.colName] === p.value));
}
function copies(rows: Row[]): Row[] {
  return rows.map((r) => ({ ...r }));
}

const { db } = await import("../server/db");
(db as any).select = function (..._cols: any[]) {
  let fromTable: any = null;
  return {
    from(t: any) {
      fromTable = t;
      return this;
    },
    where(cond: any) {
      const tn = tableNameOf(fromTable);
      const run = () => copies(rowsMatching(tn, cond));
      return {
        limit: (_n: number) => Promise.resolve(run()),
        orderBy: (..._cs: any[]) => ({ limit: (_n: number) => Promise.resolve(run()) }),
      };
    },
  };
};
(db as any).update = function (t: any) {
  const tn = tableNameOf(t);
  let setClause: any = null;
  return {
    set(v: any) {
      setClause = v;
      return this;
    },
    where(cond: any) {
      const apply = () => {
        const rows = rowsMatching(tn, cond);
        for (const r of rows) Object.assign(r, setClause);
        return rows;
      };
      return {
        returning: () => Promise.resolve(apply()),
        then: (resolve: any, reject?: any) => {
          try {
            return Promise.resolve(resolve(apply()));
          } catch (e) {
            return reject ? Promise.resolve(reject(e)) : Promise.reject(e);
          }
        },
      };
    },
  };
};

/* ═══════════════════════════════════════════════════════════════════════
   storage stubs — only the methods the three checkout paths touch
   ═══════════════════════════════════════════════════════════════════════ */
const memServices = new Map<string, Row>();
let csSeq = 7001;

const { storage } = await import("../server/storage");
(storage as any).getServiceById = async (id: string) => memServices.get(id) ?? null;
(storage as any).getClientById = async (id: number) => memClients.get(id) ?? null;
(storage as any).updateClient = async (id: number, patch: Row) => {
  const row = memClients.get(id);
  if (row) Object.assign(row, patch);
  return row;
};
(storage as any).findClientServiceByServiceId = async () => undefined;
(storage as any).createClientService = async (v: Row) => ({ id: csSeq++, ...v });
(storage as any).createClientPayment = async (v: Row) => ({ id: 9001, ...v });
(storage as any).getOnboardingTemplate = async () => null;
(storage as any).getTaskTemplates = async () => [];

/* ═══════════════════════════════════════════════════════════════════════
   Mount the REAL route modules on an in-process express app
   ═══════════════════════════════════════════════════════════════════════ */
const express = (await import("express")).default;
const { registerStripeBillingRoutes } = await import("../server/routes/stripeBillingRoutes");
const { registerBookflowRoutes } = await import("../server/routes/bookflowRoutes");
const { registerPortalCatalogRoutes } = await import("../server/routes/portal/catalog");
const { ALL_BUNDLES } = await import("../shared/pricing");

const app = express();
app.use(express.json());
/** Per-request identity injector — requireAdmin / requireClientStrict only
 *  read req.user (+ optional 2FA session flags, absent here = not blocked). */
let fakeUser: Row | null = null;
app.use((req: any, _res: any, next: any) => {
  if (fakeUser) req.user = fakeUser;
  next();
});
registerStripeBillingRoutes(app);
registerBookflowRoutes(app);
registerPortalCatalogRoutes(app);

const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", () => resolve()));
const port = (server.address() as any).port;

async function post(
  path: string,
  body: Row | null,
  user: Row | null,
): Promise<{ status: number; json: any }> {
  fakeUser = user;
  const r = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  fakeUser = null;
  let json: any = null;
  try {
    json = await r.json();
  } catch {
    /* non-JSON response — callers assert on status */
  }
  return { status: r.status, json };
}

/* ── Fixtures ── */
function seedAll() {
  memClients.clear();
  memInvoices.clear();
  memCalculators.clear();
  memServices.clear();

  // CRM client used by billing checkout (admin flow) and portal catalog
  // (linked to portal user 7). stripe_customer_id present so the only
  // Stripe call each route makes is checkout.sessions.create.
  memClients.set(501, {
    id: 501,
    user_id: 7,
    business_name: "Test Plumbing Co",
    contact_email: "owner@testplumbing.example",
    contact_phone: null,
    stripe_customer_id: "cus_mock_501",
  });

  // BookFlow invoice reachable via public pay-link token.
  memInvoices.set(77, {
    id: 77,
    client_id: 501,
    pay_link_token: "tok_pm_sweep",
    invoice_number: "INV-1001",
    status: "sent",
    total_cents: 25000,
    currency: "usd",
    customer_email: "customer@example.com",
  });

  // Calculator row carrying the connected Stripe account for the invoice.
  memCalculators.set(11, {
    id: 11,
    user_id: 501,
    calculator_settings: {
      booking_settings: { stripe_account_id: "acct_mock_connect" },
    },
  });

  // Catalog services: one simple monthly service + one row per tier of the
  // first real bundle (whatever shared/pricing.ts currently defines).
  memServices.set("mapguard-pro", {
    id: "mapguard-pro",
    name: "MapGuard Pro",
    is_active: true,
    billing_period: "monthly",
    default_price: 14900,
    tiers: null,
    stripe_price_id: "price_mock_mapguard_pro",
    stripe_yearly_price_id: null,
  });
  for (const inc of ALL_BUNDLES[0].includes) {
    memServices.set(inc.tierId, {
      id: inc.tierId,
      name: inc.label,
      is_active: true,
      billing_period: "monthly",
      default_price: 9900,
      tiers: null,
      stripe_price_id: `price_mock_${inc.tierId}`,
      stripe_yearly_price_id: null,
    });
  }
}

const adminUser = { id: 1, role: "admin" };
const clientUser = { id: 7, role: "client" };

/* ── Tiny runner (repo pattern — assert/strict, no runner dep) ── */
let failures = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err: any) {
    failures++;
    console.error(`  FAIL ${name}`);
    console.error(err?.message ?? err);
    process.exitCode = 1;
  }
}

console.log("payment-methods sweep — no hardcoded payment_method_types on the Stripe wire");

/* 1 — admin billing checkout (server/routes/stripeBillingRoutes.ts) */
await test("billing checkout: sessions.create params carry NO payment_method_types", async () => {
  seedAll();
  const mark = captured.length;
  const r = await post("/api/billing/checkout", { client_id: 501, service_id: "mapguard-pro" }, adminUser);
  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.json)}`);
  assert.ok(r.json.checkout_url, "checkout_url returned");
  const creates = sessionCreatesSince(mark);
  assert.equal(creates.length, 1, "exactly one sessions.create on the wire");
  assertNoPaymentMethodTypes(creates[0]);
  // Sanity: the params we DO expect are present (capture isn't vacuous).
  assert.equal(creates[0].params["customer"], "cus_mock_501");
  assert.equal(creates[0].params["line_items[0][price]"], "price_mock_mapguard_pro");
  assert.equal(creates[0].params["mode"], "subscription");
});

/* 2 — BookFlow public invoice pay link (server/routes/bookflowRoutes.ts) */
await test("BookFlow /api/pay/:token/checkout: NO payment_method_types; Connect account intact", async () => {
  seedAll();
  const mark = captured.length;
  const r = await post("/api/pay/tok_pm_sweep/checkout", {}, null);
  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.json)}`);
  assert.ok(r.json.url, "checkout url returned");
  const creates = sessionCreatesSince(mark);
  assert.equal(creates.length, 1, "exactly one sessions.create on the wire");
  assertNoPaymentMethodTypes(creates[0]);
  // Connect routing must survive the param removal.
  const acctHeader = Object.entries(creates[0].headers).find(([k]) => k.toLowerCase() === "stripe-account")?.[1];
  assert.equal(acctHeader, "acct_mock_connect", "Stripe-Account header still set");
  assert.equal(creates[0].params["payment_intent_data[application_fee_amount]"], "725"); // 2.9% of 25000
  assert.equal(creates[0].params["mode"], "payment");
});

/* 3 — portal catalog subscribe, single-service path (server/routes/portal/catalog.ts ~330) */
await test("portal catalog subscribe (single service): NO payment_method_types", async () => {
  seedAll();
  const mark = captured.length;
  const r = await post("/api/portal/catalog/subscribe", { service_id: "mapguard-pro" }, clientUser);
  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.json)}`);
  assert.ok(r.json.checkout_url, "checkout_url returned");
  const creates = sessionCreatesSince(mark);
  assert.equal(creates.length, 1, "exactly one sessions.create on the wire");
  assertNoPaymentMethodTypes(creates[0]);
  assert.equal(creates[0].params["line_items[0][price]"], "price_mock_mapguard_pro");
});

/* 4 — portal catalog subscribe, bundle path (server/routes/portal/catalog.ts ~170) */
await test("portal catalog subscribe (bundle): NO payment_method_types", async () => {
  seedAll();
  const bundle = ALL_BUNDLES[0];
  const mark = captured.length;
  const r = await post("/api/portal/catalog/subscribe", { bundle_id: bundle.id }, clientUser);
  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.json)}`);
  assert.ok(r.json.checkout_url, "checkout_url returned");
  const creates = sessionCreatesSince(mark);
  assert.equal(creates.length, 1, "exactly one sessions.create on the wire");
  assertNoPaymentMethodTypes(creates[0]);
  assert.equal(
    creates[0].params["line_items[0][price]"],
    `price_mock_${bundle.includes[0].tierId}`,
    "bundle line items resolved",
  );
});

/* 5 — DELIBERATE FAILURE FIXTURE: prove the detector catches a regression.
 *     A real stripe-node client sends payment_method_types through the SAME
 *     interceptor; if the detector did NOT flag it, this test fails — so a
 *     future change that re-adds the key at any call site turns case 1-4 red
 *     by the same mechanism proven here. */
await test("deliberate failure: re-added payment_method_types IS flagged by the detector", async () => {
  const StripeSdk = (await import("stripe")).default;
  const stripe = new StripeSdk(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" as any });
  const mark = captured.length;
  await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card", "us_bank_account", "cashapp"] as any,
    line_items: [{ price: "price_regression_probe", quantity: 1 }],
    success_url: "http://app.local.test/ok",
    cancel_url: "http://app.local.test/no",
  });
  const creates = sessionCreatesSince(mark);
  assert.equal(creates.length, 1);
  const offenders = paymentMethodTypeKeys(creates[0].params);
  assert.ok(
    offenders.length >= 3,
    `detector must see the re-added keys on the wire (saw: ${offenders.join(", ") || "none"})`,
  );
  assert.throws(
    () => assertNoPaymentMethodTypes(creates[0]),
    /payment_method_types leaked back/,
    "assertNoPaymentMethodTypes must throw when the key is present",
  );
});

/* 6 — Sentry-1N: billing checkout maps stale-price Stripe errors to 409. */
await test("billing checkout: inactive Stripe price → 409 price_unavailable (not 500)", async () => {
  seedAll();
  nextResponder = () => ({
    status: 400,
    body: {
      error: {
        type: "invalid_request_error",
        message: "The price specified is inactive. This field only accepts active prices.",
        param: "line_items[0][price]",
      },
    },
  });
  const r = await post("/api/billing/checkout", { client_id: 501, service_id: "mapguard-pro" }, adminUser);
  assert.equal(r.status, 409, `expected 409, got ${r.status}: ${JSON.stringify(r.json)}`);
  assert.equal(r.json.error_code, "price_unavailable");
});

await test("billing checkout: 'No such price' Stripe error → 409 price_unavailable", async () => {
  seedAll();
  nextResponder = () => ({
    status: 400,
    body: {
      error: {
        type: "invalid_request_error",
        message: "No such price: 'price_mock_mapguard_pro'",
        param: "line_items[0][price]",
      },
    },
  });
  const r = await post("/api/billing/checkout", { client_id: 501, service_id: "mapguard-pro" }, adminUser);
  assert.equal(r.status, 409, `expected 409, got ${r.status}: ${JSON.stringify(r.json)}`);
  assert.equal(r.json.error_code, "price_unavailable");
});

/* 6b — control: unrelated Stripe errors must NOT be swallowed into 409. */
await test("billing checkout control: unrelated Stripe error still → 500", async () => {
  seedAll();
  nextResponder = () => ({
    status: 400,
    body: {
      error: {
        type: "invalid_request_error",
        message: "You cannot use a Checkout Session in subscription mode with one-time prices.",
        param: "line_items[0][price]",
      },
    },
  });
  const r = await post("/api/billing/checkout", { client_id: 501, service_id: "mapguard-pro" }, adminUser);
  assert.equal(r.status, 500, `expected 500, got ${r.status}: ${JSON.stringify(r.json)}`);
  assert.equal(r.json.error_code, undefined, "no price_unavailable code on unrelated errors");
});

/* Tear down deterministically WITHOUT process.exit():
 *  - undici's fetch holds keep-alive sockets, so force-close connections and
 *    await server.close();
 *  - the imported route modules arm module-level intervals (rate-limiter
 *    cleanup etc.) that would keep the event loop alive forever, and calling
 *    process.exit() instead trips a libuv assertion on Windows under tsx
 *    (src\win\async.c UV_HANDLE_CLOSING). Unref every remaining handle so
 *    the loop drains naturally and node exits with process.exitCode. */
(server as any).closeAllConnections?.();
await new Promise<void>((resolve) => server.close(() => resolve()));

if (failures === 0) console.log("\nAll payment-methods sweep tests passed.");
else console.error(`\n${failures} test(s) failed.`);

process.exitCode = failures === 0 ? 0 : 1;

// Undici's global fetch dispatcher holds keep-alive client sockets.
try {
  await (globalThis as any)[Symbol.for("undici.globalDispatcher.1")]?.destroy?.();
} catch {
  /* best effort — watchdog below covers the rest */
}
// Clear (not just unref) lingering timers/sockets — unref alone is defeated
// by self-re-arming intervals.
for (const h of ((process as any)._getActiveHandles?.() ?? []) as any[]) {
  if (h === process.stdout || h === process.stderr || h === process.stdin) continue;
  try {
    if (h?.constructor?.name === "Timeout" || h?.constructor?.name === "Immediate") {
      clearTimeout(h); // clears intervals too — accepts the Timeout object
    } else {
      h.unref?.();
    }
  } catch {
    /* best effort — watchdog below covers the rest */
  }
}
// Last resort: if some handle still pins the loop after 3s, force the exit.
// unref'd so it never fires on the normal clean-drain path.
setTimeout(() => {
  console.error("[teardown] watchdog: event loop still pinned, forcing exit");
  process.exit(process.exitCode ?? 0);
}, 3000).unref();
