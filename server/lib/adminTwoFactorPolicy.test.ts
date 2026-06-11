/**
 * Lane C — mandatory admin 2FA policy tests.
 *
 * Runnable standalone: npx tsx server/lib/adminTwoFactorPolicy.test.ts
 * (excluded from tsc via tsconfig **\/*.test.ts).
 *
 * Coverage:
 *   1. admin WITHOUT factor, grace unused → forced enrollment, grace login
 *   2. admin WITHOUT factor, grace already spent → forced enrollment,
 *      NO grace (session enrollment-restricted)
 *   3. admin WITH factor → policy silent (normal TOTP challenge handles it)
 *   4. client users → never affected, with or without factor
 *   5. requireAdmin blocking matrix (isAdminBlockedPendingEnrollment)
 */
import assert from "node:assert/strict";
import {
  evaluateAdminTwoFactorPolicy,
  isAdminBlockedPendingEnrollment,
} from "./adminTwoFactorPolicy";

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

// 1
check("admin without factor, grace unused → enrollment required + grace login", () => {
  const d = evaluateAdminTwoFactorPolicy({ role: "admin", totpEnabled: false, graceUsedAt: null });
  assert.equal(d.enrollmentRequired, true);
  assert.equal(d.graceLogin, true);
});

// 2
check("admin without factor, grace spent → enrollment required, NO grace", () => {
  const d = evaluateAdminTwoFactorPolicy({
    role: "admin",
    totpEnabled: false,
    graceUsedAt: new Date("2026-06-01T00:00:00Z"),
  });
  assert.equal(d.enrollmentRequired, true);
  assert.equal(d.graceLogin, false);
});

// 3
check("admin WITH enrolled factor → policy is silent (normal TOTP challenge)", () => {
  const d = evaluateAdminTwoFactorPolicy({ role: "admin", totpEnabled: true, graceUsedAt: null });
  assert.equal(d.enrollmentRequired, false);
  // Even with a stale grace stamp, an enrolled admin is never flagged.
  const d2 = evaluateAdminTwoFactorPolicy({
    role: "admin",
    totpEnabled: true,
    graceUsedAt: new Date(),
  });
  assert.equal(d2.enrollmentRequired, false);
});

// 4
check("client users unaffected (2FA stays optional for the portal)", () => {
  for (const totpEnabled of [false, true]) {
    const d = evaluateAdminTwoFactorPolicy({ role: "client", totpEnabled, graceUsedAt: null });
    assert.equal(d.enrollmentRequired, false, `client totpEnabled=${totpEnabled} must be unaffected`);
  }
  // Unknown / missing roles fail safe (no forced enrollment).
  assert.equal(
    evaluateAdminTwoFactorPolicy({ role: undefined, totpEnabled: false, graceUsedAt: null }).enrollmentRequired,
    false,
  );
});

// 5 — requireAdmin enforcement matrix.
check("isAdminBlockedPendingEnrollment matrix", () => {
  // No flags (pre-policy sessions, enrolled admins) → not blocked.
  assert.equal(isAdminBlockedPendingEnrollment(undefined), false);
  assert.equal(isAdminBlockedPendingEnrollment({}), false);
  // Grace session → full access (but client is redirected to enroll).
  assert.equal(
    isAdminBlockedPendingEnrollment({ admin2faEnrollPending: true, admin2faEnrollGrace: true }),
    false,
  );
  // Grace spent → enrollment-restricted: admin APIs blocked.
  assert.equal(
    isAdminBlockedPendingEnrollment({ admin2faEnrollPending: true, admin2faEnrollGrace: false }),
    true,
  );
  assert.equal(isAdminBlockedPendingEnrollment({ admin2faEnrollPending: true }), true);
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
