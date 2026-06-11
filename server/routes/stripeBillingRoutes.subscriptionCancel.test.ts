/**
 * Sub-cancel free-tier tests — cancelling a paid QuoteQuick subscription
 * must revert entitlements to FREE but NEVER pause the calculator.
 *
 * Trial-truth follow-up (#1682 flag): the `customer.subscription.deleted`
 * handler in stripeBillingRoutes.ts used to revert the calculator to
 * plan_tier 'free' AND set deployment_status='draft' — taking the
 * customer's published calculator off the air on cancel. That violates the
 * permanent-free promise (marketing + terms: free tools never pause). The
 * free tier must keep working after a paid cancel: entitlements drop to
 * free, the deployment stays live.
 *
 * Coverage:
 *   1. BEHAVIORAL: drives the REAL /api/billing/webhook handler with a
 *      customer.subscription.deleted event (dev-mode unsigned path) against
 *      spied storage — asserts plan_tier reverts to exactly { plan_tier:
 *      "free" }, upsertDeploymentStatus is NEVER called, and the modeled
 *      deployment store stays "live".
 *   2. DELIBERATE-FAILURE FIXTURE (behavioral): a re-implementation of the
 *      OLD free+draft cancel behavior trips the free-cancel-keeps-live
 *      invariant — the gate catches the regression.
 *   3. SOURCE CONTRACT: the handleSubscriptionDeleted body keeps the
 *      plan_tier:"free" revert but contains NO deployment-status write
 *      (no upsertDeploymentStatus, no 'draft' status) — while the
 *      legitimate post-payment live-set elsewhere in the file survives.
 *      An old-shaped source fixture proves the checker flags the draft-set.
 *
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 * Runnable standalone:
 *
 *   npx tsx server/routes/stripeBillingRoutes.subscriptionCancel.test.ts
 *
 * Wired into CI as `npm run check:cancel-keeps-free-live`.
 * Uses node:assert/strict, no test-runner dependency. No network, no DB —
 * storage methods are spied and db.update is stubbed (dunning no-op).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* Module-load prerequisites (same pattern as trialLifecycleWorker.test.ts).
 * The unsigned dev webhook path requires: non-production NODE_ENV and no
 * STRIPE_BILLING_WEBHOOK_SECRET. */
process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";
process.env.STRIPE_SECRET_KEY ??= "sk_test_stub_never_dialled";
if (process.env.NODE_ENV === "production") process.env.NODE_ENV = "test";
delete process.env.STRIPE_BILLING_WEBHOOK_SECRET;

const { registerStripeBillingRoutes } = await import("./stripeBillingRoutes");
const { storage } = await import("../storage");
const { db } = await import("../db");

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

/* ═══ Harness ═══ */

const CALC_ID = 314;

/** Models the deployment_status table — what the customer's visitors see. */
const deploymentStore = new Map<number, string>([[CALC_ID, "live"]]);

/** THE invariant: after a paid-sub cancel the calculator must stay live. */
function assertFreeCancelKeepsLive(store: Map<number, string>) {
  assert.equal(
    store.get(CALC_ID),
    "live",
    `calculator ${CALC_ID} must stay live after subscription cancel — free tools never pause`,
  );
}

const updateCalculatorCalls: Array<{ id: number; patch: any }> = [];
const upsertDeploymentCalls: any[] = [];

const s: any = storage;
s.findCalculatorByStripeSubscriptionId = async (subId: string) =>
  subId === "sub_qq_cancel_test"
    ? { id: CALC_ID, plan_tier: "pro", business_name: "Cancel Test Co", slug: "cancel-test" }
    : null;
s.updateCalculator = async (id: number, patch: any) => {
  updateCalculatorCalls.push({ id, patch });
  return { id, ...patch };
};
s.upsertDeploymentStatus = async (row: any) => {
  upsertDeploymentCalls.push(row);
  deploymentStore.set(row.calculator_id, row.status);
  return row;
};
s.findClientByStripeCustomerId = async () => null; // no CRM client — handler returns after the QQ block
s.logAdminActivity = async () => undefined;

/* Dunning cleanup runs fire-and-forget through db.update — stub the chain so
 * nothing dials the stub DATABASE_URL. */
(db as any).update = () => ({
  set: () => ({
    where: () => ({
      returning: async () => [],
    }),
  }),
});

/* Capture the real webhook handler off a fake Express app. */
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
registerStripeBillingRoutes(fakeApp);
const webhook = handlers["POST /api/billing/webhook"];
assert.ok(webhook, "POST /api/billing/webhook must be registered");

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => ((res.statusCode = code), res);
  res.json = (payload: any) => ((res.body = payload), res);
  res.send = (payload: any) => ((res.body = payload), res);
  return res;
}
function subscriptionDeletedEvent(subId: string) {
  return {
    id: "evt_test_sub_deleted",
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: subId,
        object: "subscription",
        customer: "cus_qq_cancel_test",
        status: "canceled",
        metadata: {}, // not an api_subscription, not citation_tracker
        items: { data: [] },
      },
    },
  };
}

async function main() {
  /* ═══ 1. Behavioral — the REAL handler ═══ */

  await check("subscription.deleted: entitlements revert to exactly { plan_tier: 'free' }", async () => {
    updateCalculatorCalls.length = 0;
    upsertDeploymentCalls.length = 0;
    const res = makeRes();
    await webhook({ headers: {}, body: subscriptionDeletedEvent("sub_qq_cancel_test") } as any, res);

    assert.equal(res.statusCode, 200, `webhook must not error (got ${res.statusCode}: ${JSON.stringify(res.body)})`);
    assert.deepEqual(res.body, { received: true });
    assert.equal(updateCalculatorCalls.length, 1, "calculator updated exactly once");
    assert.equal(updateCalculatorCalls[0].id, CALC_ID);
    // Exact payload: plan_tier free and NOTHING else (no status/deployment fields smuggled in).
    assert.deepEqual(updateCalculatorCalls[0].patch, { plan_tier: "free" });
  });

  await check("subscription.deleted: deployment status untouched — calculator stays LIVE", () => {
    assert.equal(upsertDeploymentCalls.length, 0, "upsertDeploymentStatus must never run on subscription cancel");
    assertFreeCancelKeepsLive(deploymentStore);
  });

  await check("subscription.deleted with no linked calculator: no-op, still 200", async () => {
    updateCalculatorCalls.length = 0;
    upsertDeploymentCalls.length = 0;
    const res = makeRes();
    await webhook({ headers: {}, body: subscriptionDeletedEvent("sub_unknown_no_calc") } as any, res);
    assert.equal(res.statusCode, 200);
    assert.equal(updateCalculatorCalls.length, 0);
    assert.equal(upsertDeploymentCalls.length, 0);
    assertFreeCancelKeepsLive(deploymentStore);
  });

  /* ═══ 2. Deliberate-failure fixture (behavioral) ═══ */

  await check("DELIBERATE-FAILURE: the OLD free+draft cancel behavior trips the stays-live invariant", async () => {
    // Faithful re-implementation of the REMOVED behavior: revert tier AND
    // set the deployment to draft.
    async function legacyCancelBehavior(calcId: number) {
      await (storage as any).updateCalculator(calcId, { plan_tier: "free" });
      await (storage as any).upsertDeploymentStatus({ calculator_id: calcId, status: "draft" });
    }
    const before = new Map(deploymentStore);
    await legacyCancelBehavior(CALC_ID);
    // Sanity: the fixture really does pause…
    assert.equal(deploymentStore.get(CALC_ID), "draft", "deliberate-failure fixture must actually pause");
    // …and THE GATE catches it.
    assert.throws(() => assertFreeCancelKeepsLive(deploymentStore), /free tools never pause/);
    // Restore for any later assertions.
    deploymentStore.set(CALC_ID, before.get(CALC_ID)!);
  });

  /* ═══ 3. Source contract — the draft-set can never come back ═══ */

  const here = dirname(fileURLToPath(import.meta.url));
  const routeSrc = readFileSync(join(here, "stripeBillingRoutes.ts"), "utf8");
  const fnStart = routeSrc.indexOf("async function handleSubscriptionDeleted");
  assert.ok(fnStart !== -1, "handleSubscriptionDeleted must exist");
  const fnEnd = routeSrc.indexOf("\nasync function ", fnStart + 1);
  assert.ok(fnEnd > fnStart, "handleSubscriptionDeleted must not be the last function in the file");
  const deletedHandlerBody = routeSrc.slice(fnStart, fnEnd);

  /** Returns violations for a subscription-cancel handler body. */
  function cancelHandlerViolations(label: string, body: string): string[] {
    const violations: string[] = [];
    if (!body.includes('plan_tier: "free"')) {
      violations.push(`${label}: the entitlements revert (plan_tier: "free") is missing — paid entitlements would survive cancel`);
    }
    if (body.includes("upsertDeploymentStatus")) {
      violations.push(`${label}: upsertDeploymentStatus in the cancel path — billing events must never touch deployment status`);
    }
    if (/status:\s*["']draft["']/.test(body)) {
      violations.push(`${label}: writes a 'draft' status on cancel — free tools never pause`);
    }
    return violations;
  }

  await check("source contract: handleSubscriptionDeleted reverts to free with NO deployment-status write", () => {
    assert.deepEqual(cancelHandlerViolations("handleSubscriptionDeleted", deletedHandlerBody), []);
  });

  await check("source contract: the legitimate post-payment live-set elsewhere in the file survives", () => {
    // Slicing sanity — proves the body check isn't passing because the whole
    // file lost upsertDeploymentStatus: the QuoteQuick checkout-completed
    // path still sets the deployment live after payment.
    const rest = routeSrc.slice(0, fnStart) + routeSrc.slice(fnEnd);
    assert.ok(
      rest.includes("upsertDeploymentStatus"),
      "the post-payment upsertDeploymentStatus (live) outside the cancel handler must still exist",
    );
  });

  await check("DELIBERATE-FAILURE: the checker flags the old draft-on-cancel source shape", () => {
    const legacySnippet = `
      async function handleSubscriptionDeleted(subscription, _eventId) {
        const qqCalculator = await storage.findCalculatorByStripeSubscriptionId(subscription.id);
        if (qqCalculator) {
          await storage.updateCalculator(qqCalculator.id, { plan_tier: "free" });
          await storage.upsertDeploymentStatus({ calculator_id: qqCalculator.id, status: "draft" });
        }
      }
    `;
    const violations = cancelHandlerViolations("legacy fixture", legacySnippet);
    assert.ok(
      violations.length >= 2,
      "restoring the old draft-set must fail the source contract",
    );
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
