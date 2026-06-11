/**
 * Lane C — checkout login-token map tests.
 *
 * Runnable standalone: npx tsx server/lib/loginToken.test.ts
 * (excluded from tsc via tsconfig **\/*.test.ts).
 *
 * Coverage:
 *   1. fabricated / unknown session id → null (route returns 404,
 *      no access)
 *   2. stored token is retrievable exactly once (one-time use)
 *   3. deleteCheckoutLoginToken (async_payment_failed cleanup) makes
 *      the token unreachable
 *   4. buildLoginToken/verifyLoginToken round-trip + tamper rejection
 */
import assert from "node:assert/strict";
import {
  buildLoginToken,
  verifyLoginToken,
  storeCheckoutLoginToken,
  getCheckoutLoginToken,
  deleteCheckoutLoginToken,
} from "./loginToken";

let passed = 0;
let failed = 0;

function check(label: string, fn: () => void): void {
  try {
    fn();
    passed++;
    // eslint-disable-next-line no-console
    console.log(`  ok  ${label}`);
  } catch (err: any) {
    failed++;
    // eslint-disable-next-line no-console
    console.error(`  FAIL ${label}: ${err?.message ?? err}`);
  }
}

// 1 — fabricated session id never yields a token (route → 404).
check("fabricated session_id → null token (no access)", () => {
  assert.equal(getCheckoutLoginToken("cs_live_FABRICATED_by_attacker"), null);
});

// 2 — one-time use.
check("stored token is consumable exactly once", () => {
  const token = buildLoginToken(7);
  storeCheckoutLoginToken("cs_test_once", token);
  assert.equal(getCheckoutLoginToken("cs_test_once"), token);
  assert.equal(getCheckoutLoginToken("cs_test_once"), null, "second retrieval must fail");
});

// 3 — async_payment_failed cleanup path.
check("deleteCheckoutLoginToken removes a stored token", () => {
  const token = buildLoginToken(8);
  storeCheckoutLoginToken("cs_test_failed_ach", token);
  deleteCheckoutLoginToken("cs_test_failed_ach");
  assert.equal(getCheckoutLoginToken("cs_test_failed_ach"), null);
});

// 4a — round-trip.
check("buildLoginToken/verifyLoginToken round-trip", () => {
  const token = buildLoginToken(123);
  const payload = verifyLoginToken(token);
  assert.ok(payload, "token should verify");
  assert.equal(payload!.userId, 123);
});

// 4b — tampered token rejected.
check("tampered token is rejected", () => {
  const token = buildLoginToken(123);
  const [body, sig] = token.split(".");
  const tampered = `${body}x.${sig}`;
  assert.equal(verifyLoginToken(tampered), null);
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
