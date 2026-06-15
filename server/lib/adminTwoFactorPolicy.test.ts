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
 *   6. authRoutes wiring contract: flags are stamped INSIDE req.logIn
 *      callbacks (after passport's session regenerate), never before
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

// 0 — master switch: when NOT mandatory (the default), a factor-less admin
// is never forced into enrollment and never blocked, regardless of grace.
check("gate OFF (mandatory:false) → factor-less admin is never forced/blocked", () => {
  const fresh = evaluateAdminTwoFactorPolicy({ role: "admin", totpEnabled: false, graceUsedAt: null, mandatory: false });
  assert.equal(fresh.enrollmentRequired, false);
  assert.equal(fresh.graceLogin, false);
  const spent = evaluateAdminTwoFactorPolicy({
    role: "admin", totpEnabled: false, graceUsedAt: new Date("2026-06-01T00:00:00Z"), mandatory: false,
  });
  assert.equal(spent.enrollmentRequired, false, "even a spent-grace admin is not blocked when the gate is off");
});

// 1
check("gate ON: admin without factor, grace unused → enrollment required + grace login", () => {
  const d = evaluateAdminTwoFactorPolicy({ role: "admin", totpEnabled: false, graceUsedAt: null, mandatory: true });
  assert.equal(d.enrollmentRequired, true);
  assert.equal(d.graceLogin, true);
});

// 2
check("gate ON: admin without factor, grace spent → enrollment required, NO grace", () => {
  const d = evaluateAdminTwoFactorPolicy({
    role: "admin",
    totpEnabled: false,
    graceUsedAt: new Date("2026-06-01T00:00:00Z"),
    mandatory: true,
  });
  assert.equal(d.enrollmentRequired, true);
  assert.equal(d.graceLogin, false);
});

// 3
check("gate ON: admin WITH enrolled factor → policy is silent (normal TOTP challenge)", () => {
  const d = evaluateAdminTwoFactorPolicy({ role: "admin", totpEnabled: true, graceUsedAt: null, mandatory: true });
  assert.equal(d.enrollmentRequired, false);
  // Even with a stale grace stamp, an enrolled admin is never flagged.
  const d2 = evaluateAdminTwoFactorPolicy({
    role: "admin",
    totpEnabled: true,
    graceUsedAt: new Date(),
    mandatory: true,
  });
  assert.equal(d2.enrollmentRequired, false);
});

// 4
check("gate ON: client users unaffected (2FA stays optional for the portal)", () => {
  for (const totpEnabled of [false, true]) {
    const d = evaluateAdminTwoFactorPolicy({ role: "client", totpEnabled, graceUsedAt: null, mandatory: true });
    assert.equal(d.enrollmentRequired, false, `client totpEnabled=${totpEnabled} must be unaffected`);
  }
  // Unknown / missing roles fail safe (no forced enrollment).
  assert.equal(
    evaluateAdminTwoFactorPolicy({ role: undefined, totpEnabled: false, graceUsedAt: null, mandatory: true }).enrollmentRequired,
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

/* ─── 6. authRoutes wiring contract ─────────────────────────────────
 * passport 0.7's SessionManager.logIn calls req.session.regenerate()
 * (session-fixation protection; keepSessionInfo deliberately NOT
 * passed), which discards anything written to the session before
 * req.logIn. So the enrollment flags MUST be stamped inside each
 * logIn callback — i.e. textually AFTER `req.logIn(` in every hooked
 * path. A refactor that moves the stamp back above logIn (or drops
 * it) fails this test. Same source-contract pattern as
 * checkoutPaymentGate.test.ts.
 */
check("wiring: enrollment flags are stamped AFTER req.logIn in every hooked path", () => {
  const routeSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "routes", "authRoutes.ts"),
    "utf-8",
  );

  // Session-fixation protection must stay intact (comments may MENTION
  // keepSessionInfo; passing it as an option — `keepSessionInfo:` — is
  // what this forbids).
  assert.ok(
    !/keepSessionInfo\s*:/.test(routeSource),
    "authRoutes.ts must never pass keepSessionInfo to req.logIn",
  );

  // The policy helper must not write session flags itself (they'd be
  // discarded by the regenerate inside req.logIn).
  const stampAssignments = routeSource.match(/admin2faEnrollPending\s*=\s*true/g) ?? [];
  assert.equal(
    stampAssignments.length,
    1,
    "admin2faEnrollPending must be set in exactly one place (stampAdminTwoFactorEnrollmentFlags)",
  );
  const stampFnIdx = routeSource.indexOf("function stampAdminTwoFactorEnrollmentFlags");
  assert.ok(stampFnIdx !== -1, "stampAdminTwoFactorEnrollmentFlags must exist");
  const policyFnIdx = routeSource.indexOf("async function applyAdminTwoFactorEnrollmentPolicy");
  assert.ok(policyFnIdx !== -1, "applyAdminTwoFactorEnrollmentPolicy must exist");
  const policyBody = routeSource.slice(policyFnIdx, stampFnIdx);
  assert.ok(
    !policyBody.includes("admin2faEnrollPending"),
    "applyAdminTwoFactorEnrollmentPolicy must not stamp session flags (pre-logIn writes are discarded)",
  );

  // Every hooked login path: policy call → req.logIn( → stamp call,
  // in that textual order. (Call sites only — the definitions span
  // multiple lines so these single-line needles don't match them.)
  const policyCallNeedle = "applyAdminTwoFactorEnrollmentPolicy(req,";
  const stampCallNeedle = "stampAdminTwoFactorEnrollmentFlags(req,";
  const siteIndexes: number[] = [];
  for (let i = routeSource.indexOf(policyCallNeedle); i !== -1; i = routeSource.indexOf(policyCallNeedle, i + 1)) {
    siteIndexes.push(i);
  }
  assert.equal(
    siteIndexes.length,
    5,
    "expected 5 hooked login paths (login, google, social, token-login, checkout-login)",
  );
  siteIndexes.forEach((siteIdx, n) => {
    const pathEnd = siteIndexes[n + 1] ?? routeSource.length;
    const logInIdx = routeSource.indexOf("req.logIn(", siteIdx);
    assert.ok(
      logInIdx !== -1 && logInIdx < pathEnd,
      `hooked path #${n + 1}: req.logIn( must follow the policy call`,
    );
    const stampIdx = routeSource.indexOf(stampCallNeedle, siteIdx);
    assert.ok(
      stampIdx !== -1 && stampIdx < pathEnd,
      `hooked path #${n + 1}: flags must be stamped in this path`,
    );
    assert.ok(
      stampIdx > logInIdx,
      `hooked path #${n + 1}: stamp must occur AFTER req.logIn( — passport regenerates the session inside logIn`,
    );
  });
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
