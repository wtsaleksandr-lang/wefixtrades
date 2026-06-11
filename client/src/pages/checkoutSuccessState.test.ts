/**
 * P0-2 — /checkout/success verify-then-celebrate tests.
 *
 * Excluded from `tsc --noEmit` (tsconfig **\/*.test.ts). Runnable
 * standalone via:
 *
 *   npx tsx client/src/pages/checkoutSuccessState.test.ts
 *
 * Uses node's built-in `assert/strict`. No test runner dep added
 * (same pattern as server/lib/checkoutPaymentGate.test.ts).
 *
 * Coverage (regression contract for the fake-success fix):
 *   1. DELIBERATE-FAILURE FIXTURE — the exact pre-fix bug: a bare
 *      page-load with NO session_id rendered "Payment successful".
 *      The old behavior is replayed against the new derivation; if
 *      anyone re-introduces unconditional success (e.g. defaults the
 *      outcome to success, or widens isSuccess), this test FAILS.
 *   2. Only a server-verified 200 yields the success state.
 *   3. 403 (Stripe: not settled) → "unconfirmed", never success.
 *   4. 404 retries while the webhook races, then lands on honest
 *      "pending" — never success.
 *   5. Network failures retry, then land on "pending" — never success.
 *   6. Wiring: CheckoutSuccess.tsx actually renders FROM this module
 *      (imports it, no `if (!sessionId) return;` escape hatch, success
 *      heading gated on the verified outcome).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  initialOutcome,
  isSuccess,
  outcomeForLoginResponse,
  NETWORK_ERROR,
  type CheckoutOutcome,
} from "./checkoutSuccessState";

let passed = 0;
let failed = 0;

function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      // eslint-disable-next-line no-console
      console.log(`  ok  ${label}`);
    })
    .catch((err: any) => {
      failed++;
      // eslint-disable-next-line no-console
      console.error(`  FAIL ${label}: ${err?.message ?? err}`);
    });
}

const ALL_OUTCOMES: CheckoutOutcome[] = [
  "no_session",
  "verifying",
  "verified",
  "pending",
  "unconfirmed",
];

async function main() {
  // eslint-disable-next-line no-console
  console.log("checkoutSuccessState tests");

  /* ── 1. Deliberate-failure fixture: the pre-fix bug ── */
  // Old code: `if (!sessionId) return;` → default render = success copy.
  // Replay: bare load (session_id absent / empty / fabricated-then-404).
  await check("DELIBERATE-FAILURE: bare page-load (no session_id) must NOT be a success state", () => {
    const bareLoad = initialOutcome(null);
    assert.equal(bareLoad, "no_session");
    assert.equal(
      isSuccess(bareLoad),
      false,
      "pre-fix behavior detected: success copy on a page-load with no session_id",
    );
  });

  await check("DELIBERATE-FAILURE: empty-string session_id must NOT be a success state", () => {
    const out = initialOutcome("");
    assert.equal(out, "no_session");
    assert.equal(isSuccess(out), false);
  });

  await check("DELIBERATE-FAILURE: exactly ONE outcome may render success copy", () => {
    const successStates = ALL_OUTCOMES.filter(isSuccess);
    assert.deepEqual(
      successStates,
      ["verified"],
      `success must be gated on "verified" only — got: ${successStates.join(", ") || "(none)"}`,
    );
  });

  /* ── 2. Verified paid session → success ── */
  await check("200 from checkout-login → verified (the only success path)", () => {
    const out = outcomeForLoginResponse(200, 3);
    assert.equal(out, "verified");
    assert.equal(isSuccess(out as CheckoutOutcome), true);
  });

  await check("session_id present → page starts in 'verifying' (neutral), not success", () => {
    const out = initialOutcome("cs_live_a1b2c3");
    assert.equal(out, "verifying");
    assert.equal(isSuccess(out), false);
  });

  /* ── 3. Stripe says not settled ── */
  await check("403 (payment not settled per Stripe) → unconfirmed, never success", () => {
    const out = outcomeForLoginResponse(403, 3);
    assert.equal(out, "unconfirmed");
    assert.equal(isSuccess(out as CheckoutOutcome), false);
  });

  /* ── 4. Webhook race / consumed token ── */
  await check("404 with retry budget → retry (webhook may still be processing)", () => {
    assert.equal(outcomeForLoginResponse(404, 3), "retry");
    assert.equal(outcomeForLoginResponse(404, 1), "retry");
  });

  await check("404 with retries exhausted → honest pending, never success", () => {
    const out = outcomeForLoginResponse(404, 0);
    assert.equal(out, "pending");
    assert.equal(isSuccess(out as CheckoutOutcome), false);
  });

  /* ── 5. Network failure ── */
  await check("network failure retries, then honest pending — never success", () => {
    assert.equal(outcomeForLoginResponse(NETWORK_ERROR, 2), "retry");
    const out = outcomeForLoginResponse(NETWORK_ERROR, 0);
    assert.equal(out, "pending");
    assert.equal(isSuccess(out as CheckoutOutcome), false);
  });

  await check("unexpected statuses (429/500/503) fail closed to pending — never success", () => {
    for (const status of [400, 401, 423, 429, 500, 503]) {
      const out = outcomeForLoginResponse(status, 3);
      assert.notEqual(out, "verified", `status ${status} must not verify`);
      assert.notEqual(out, "retry", `status ${status} must not burn retries silently`);
      assert.equal(isSuccess(out as CheckoutOutcome), false);
    }
  });

  /* ── 6. Wiring: the component renders FROM the derivation module ── */
  await check("wiring: CheckoutSuccess.tsx is gated on the outcome module", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const body = readFileSync(join(here, "CheckoutSuccess.tsx"), "utf-8");

    assert.ok(
      body.includes('from "./checkoutSuccessState"'),
      "CheckoutSuccess.tsx no longer imports the outcome module",
    );
    assert.ok(
      !body.includes("if (!sessionId) return;"),
      "the pre-fix escape hatch `if (!sessionId) return;` is back — bare loads would render the default copy again",
    );
    assert.ok(
      body.includes("isSuccess(outcome)"),
      "success rendering must be derived via isSuccess(outcome)",
    );
    // The success heading must not be the unconditional default: the page
    // must produce it from the per-outcome switch, behind the verified case.
    // (`heading: "..."` is the actual render site — the file's doc comment
    // also mentions the phrase, which must not satisfy this check.)
    const headingIdx = body.indexOf('heading: "Payment successful');
    const verifiedCaseIdx = body.indexOf('case "verified"');
    assert.ok(headingIdx > -1 && verifiedCaseIdx > -1, "expected the success heading inside the outcome switch");
    assert.ok(
      headingIdx > verifiedCaseIdx,
      "the success heading appears before the verified gate — looks unconditional again",
    );
    assert.ok(
      body.includes('navigate("/pricing", { replace: true })'),
      "no_session must redirect to /pricing",
    );
  });

  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
