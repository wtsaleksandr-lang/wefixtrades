/**
 * Funnel-analytics instrumentation tests.
 *
 * Phase 1+2 of the conversion-funnel plan instruments six server-side PostHog
 * events on the existing server/lib/analytics.ts helper (trackEvent +
 * distinct-id helpers). This test pins:
 *
 *   1. BEHAVIORAL (helper): the distinct-id helpers produce stable, namespaced,
 *      PII-free ids, and trackEvent() NO-OPS + NEVER THROWS when PostHog is
 *      unconfigured (POSTHOG_API_KEY unset) — the fire-and-forget contract that
 *      lets every call site stay un-try/caught without risking the request.
 *   2. DELIBERATE-FAILURE FIXTURE (behavioral): a re-implementation of a naive
 *      capture that rethrows proves the test would catch a helper that DIDN'T
 *      swallow — i.e. the no-op/no-throw guard is real, not vacuous.
 *   3. SOURCE CONTRACT: each instrumented file contains a trackEvent(...) call
 *      for its event with the documented property keys. An old-shaped source
 *      fixture (a file missing the call) proves the checker flags a regression
 *      that drops the instrumentation.
 *
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 * Runnable standalone:
 *
 *   npx tsx server/lib/analytics.funnel.test.ts
 *
 * Wired into CI as `npm run check:funnel-analytics`.
 * Uses node:assert/strict, no test-runner dependency. No network, no DB —
 * POSTHOG_API_KEY is force-unset so the PostHog client is never constructed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Force the unconfigured path: no client is ever constructed, capture() is
// never dialled. This is the production-safe-disable path the plan requires.
delete process.env.POSTHOG_API_KEY;

const analytics = await import("./analytics");
const {
  trackEvent,
  initAnalytics,
  userDistinctId,
  clientDistinctId,
  calculatorDistinctId,
} = analytics;

const __dirname = dirname(fileURLToPath(import.meta.url));
const routesDir = join(__dirname, "..", "routes");

let passed = 0;
let failed = 0;
function check(label: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ok  ${label}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${label}`);
    console.error(`        ${(err as Error).message}`);
  }
}

/* ─── 1. Behavioral — distinct-id helpers ─── */

check("userDistinctId namespaces to user_<id>", () => {
  assert.equal(userDistinctId(42), "user_42");
});
check("clientDistinctId namespaces to client_<id>", () => {
  assert.equal(clientDistinctId(7), "client_7");
});
check("calculatorDistinctId namespaces to calculator_<id>", () => {
  assert.equal(calculatorDistinctId(9), "calculator_9");
});
check("distinct ids carry no PII (only the opaque numeric id)", () => {
  // Sanity: helpers take a number, so an email/phone can't leak through.
  assert.match(userDistinctId(1), /^user_\d+$/);
  assert.match(clientDistinctId(1), /^client_\d+$/);
  assert.match(calculatorDistinctId(1), /^calculator_\d+$/);
});

/* ─── 1. Behavioral — fire-and-forget no-op/no-throw contract ─── */

check("initAnalytics() no-ops without POSTHOG_API_KEY (no throw)", () => {
  assert.doesNotThrow(() => initAnalytics());
});
check("trackEvent() no-ops + never throws when PostHog unconfigured", () => {
  assert.doesNotThrow(() =>
    trackEvent(userDistinctId(1), "signup_completed", { method: "email", has_phone: true }),
  );
});
check("trackEvent() tolerates undefined properties without throwing", () => {
  assert.doesNotThrow(() => trackEvent(clientDistinctId(1), "checkout_started"));
});

/* ─── 2. Deliberate-failure fixture ─── */

check("DELIBERATE FIXTURE: a rethrowing capture WOULD be caught", () => {
  // Models a helper that did NOT swallow — assert.doesNotThrow must fail on it,
  // proving the no-throw assertions above are not vacuously true.
  const naiveCapture = () => {
    throw new Error("posthog down");
  };
  let tripped = false;
  try {
    assert.doesNotThrow(naiveCapture);
  } catch {
    tripped = true;
  }
  assert.equal(tripped, true, "doesNotThrow should have flagged a throwing capture");
});

/* ─── 3. Source contract — each event is instrumented ─── */

// Map: file → [{ event, requiredPropKeys }]. The checker asserts the file
// contains `trackEvent(` ... "<event>" and each required property key in the
// same call's vicinity (whole-file substring is sufficient — these keys are
// unique enough to the call). A file that drops the call fails the contract.
const CONTRACT: Array<{
  file: string;
  event: string;
  props: string[];
}> = [
  { file: "authRoutes.ts", event: "signup_completed", props: ["method", "has_phone"] },
  { file: "calculatorRoutes.ts", event: "calculator_published", props: ["calculator_id", "trade_type"] },
  { file: "leadRoutes.ts", event: "lead_captured", props: ["calculator_id", "quote_amount"] },
  { file: "publicCheckoutRoutes.ts", event: "checkout_started", props: ["product", "tier", "amount"] },
  { file: "stripeBillingRoutes.ts", event: "subscription_created", props: ["product", "tier", "mrr"] },
  { file: "stripeBillingRoutes.ts", event: "subscription_cancelled", props: ["product", "tier"] },
];

function srcOf(file: string): string {
  return readFileSync(join(routesDir, file), "utf8");
}

for (const { file, event, props } of CONTRACT) {
  check(`SOURCE CONTRACT: ${file} fires trackEvent "${event}"`, () => {
    const src = srcOf(file);
    assert.ok(
      new RegExp(`trackEvent\\([\\s\\S]*?["']${event}["']`).test(src),
      `${file} must contain a trackEvent(...) call for "${event}"`,
    );
  });
  check(`SOURCE CONTRACT: ${file} "${event}" carries props ${props.join("+")}`, () => {
    const src = srcOf(file);
    // Slice the file from the event-name occurrence to a small window so the
    // property assertions are scoped to the right call rather than the whole
    // file. The window comfortably covers a single trackEvent call body.
    const evtIdx = src.indexOf(`"${event}"`);
    assert.ok(evtIdx >= 0, `${event} string literal not found in ${file}`);
    const window = src.slice(evtIdx, evtIdx + 600);
    for (const key of props) {
      assert.ok(
        window.includes(`${key}:`) || window.includes(`${key} :`),
        `${file} "${event}" call must set property "${key}"`,
      );
    }
  });
}

check("DELIBERATE FIXTURE: contract checker flags a file missing the call", () => {
  const fakeSrc = `// no instrumentation here\nfunction handler() { return 1; }\n`;
  let tripped = false;
  try {
    assert.ok(
      new RegExp(`trackEvent\\([\\s\\S]*?["']signup_completed["']`).test(fakeSrc),
      "should fail",
    );
  } catch {
    tripped = true;
  }
  assert.equal(tripped, true, "contract checker should flag a file with no trackEvent call");
});

/* ─── Summary ─── */
console.log(`\nfunnel-analytics: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
