/**
 * Tests for the admin "extend Pro trial" shortcut logic
 * (POST /api/admin/crm/clients/:id/extend-trial).
 *
 * Excluded from `tsc --noEmit` (tsconfig excludes **\/*.test.ts).
 * Runnable standalone via:
 *
 *   npx tsx server/routes/adminExtendTrial.test.ts
 *
 * Dependency-free: node's `assert/strict`, no test runner. Imports only the
 * pure helper module (no db / express), so it needs no env or network.
 */
import assert from "node:assert/strict";
import {
  EXTEND_TRIAL_DAYS,
  extendTrialBodySchema,
  computeExtendedTrialEnd,
} from "./adminExtendTrial";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    failed++;
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

console.log("extendTrialBodySchema — days validation");

// Rejects out-of-set / invalid values.
for (const bad of [5, 31, 0, -7, -1, 3.5, 45, 100]) {
  test(`rejects days=${bad}`, () => {
    const r = extendTrialBodySchema.safeParse({ days: bad });
    assert.equal(r.success, false, `days=${bad} must be rejected (400)`);
  });
}

test("rejects non-number / missing days", () => {
  assert.equal(extendTrialBodySchema.safeParse({ days: "7" }).success, false);
  assert.equal(extendTrialBodySchema.safeParse({}).success, false);
  assert.equal(extendTrialBodySchema.safeParse({ days: null }).success, false);
});

// Accepts each of the four fixed increments.
for (const good of EXTEND_TRIAL_DAYS) {
  test(`accepts days=${good}`, () => {
    const r = extendTrialBodySchema.safeParse({ days: good });
    assert.equal(r.success, true, `days=${good} must be accepted`);
    if (r.success) assert.equal(r.data.days, good);
  });
}

console.log("computeExtendedTrialEnd — expiry math");

const NOW = new Date("2026-08-21T12:00:00.000Z");

test("lapsed trial (past expiry) restarts from now + N days", () => {
  const past = new Date(NOW.getTime() - 10 * MS_PER_DAY);
  const out = computeExtendedTrialEnd(NOW, past, 14);
  assert.equal(out.getTime(), NOW.getTime() + 14 * MS_PER_DAY);
});

test("null expiry restarts from now + N days", () => {
  const out = computeExtendedTrialEnd(NOW, null, 7);
  assert.equal(out.getTime(), NOW.getTime() + 7 * MS_PER_DAY);
});

test("undefined expiry restarts from now + N days", () => {
  const out = computeExtendedTrialEnd(NOW, undefined, 30);
  assert.equal(out.getTime(), NOW.getTime() + 30 * MS_PER_DAY);
});

test("active trial adds N days onto the existing tail", () => {
  const future = new Date(NOW.getTime() + 5 * MS_PER_DAY);
  const out = computeExtendedTrialEnd(NOW, future, 21);
  assert.equal(out.getTime(), future.getTime() + 21 * MS_PER_DAY);
});

test("expiry exactly at now is treated as lapsed (base = now)", () => {
  const out = computeExtendedTrialEnd(NOW, new Date(NOW.getTime()), 7);
  // now is not strictly greater than now → base is now.
  assert.equal(out.getTime(), NOW.getTime() + 7 * MS_PER_DAY);
});

test("accepts an ISO-string expiry (DB may hand back either)", () => {
  const future = new Date(NOW.getTime() + 3 * MS_PER_DAY);
  const out = computeExtendedTrialEnd(NOW, future.toISOString(), 14);
  assert.equal(out.getTime(), future.getTime() + 14 * MS_PER_DAY);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
