/**
 * Affiliate admin-update guard — pins the PATCH /api/admin/affiliates/:id Zod
 * validation + the before→after diff logic (computeAffiliateUpdate). Pure, no
 * DB, so it runs under WFT's tsx + node:assert harness.
 *
 * Run: npx tsx server/affiliate/adminUpdate.test.ts   (CI: check:affiliate-admin)
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 */
import assert from "node:assert/strict";
import {
  affiliateAdminUpdateSchema,
  computeAffiliateUpdate,
  type AffiliateSnapshot,
} from "./adminUpdate";

let pass = 0;
let fail = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      pass++;
    })
    .catch((err) => {
      fail++;
      console.error(`  ✗ ${name}`);
      console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    });
}

const baseRow: AffiliateSnapshot = { status: "pending", tier: "base", commission_rate: 0.25 };

async function main() {
  // ── Zod: rejects out-of-enum status / tier ───────────────────────────────
  await check("schema rejects unknown status", () => {
    assert.equal(affiliateAdminUpdateSchema.safeParse({ status: "deleted" }).success, false);
    assert.equal(affiliateAdminUpdateSchema.safeParse({ status: "active" }).success, true);
  });
  await check("schema rejects unknown tier", () => {
    assert.equal(affiliateAdminUpdateSchema.safeParse({ tier: "platinum" }).success, false);
    assert.equal(affiliateAdminUpdateSchema.safeParse({ tier: "partner" }).success, true);
  });

  // ── Zod: commission_rate bounds + type ───────────────────────────────────
  await check("schema rejects out-of-range / non-numeric commission_rate", () => {
    assert.equal(affiliateAdminUpdateSchema.safeParse({ commission_rate: 1.5 }).success, false);
    assert.equal(affiliateAdminUpdateSchema.safeParse({ commission_rate: -0.1 }).success, false);
    assert.equal(affiliateAdminUpdateSchema.safeParse({ commission_rate: "0.3" }).success, false); // no coerce
    assert.equal(affiliateAdminUpdateSchema.safeParse({ commission_rate: 0 }).success, true);
    assert.equal(affiliateAdminUpdateSchema.safeParse({ commission_rate: 1 }).success, true);
    assert.equal(affiliateAdminUpdateSchema.safeParse({ commission_rate: 0.3 }).success, true);
  });

  // ── Zod: at least one field required ──────────────────────────────────────
  await check("schema rejects empty body", () => {
    assert.equal(affiliateAdminUpdateSchema.safeParse({}).success, false);
  });

  // ── Transition: activate a pending affiliate (only status changes) ────────
  await check("pending → active writes only status + audits before/after", () => {
    const parsed = affiliateAdminUpdateSchema.parse({ status: "active" });
    const r = computeAffiliateUpdate(baseRow, parsed);
    assert.deepEqual(r.changed, ["status"]);
    assert.deepEqual(r.set, { status: "active" });
    assert.deepEqual(r.before, { status: "pending" });
    assert.deepEqual(r.after, { status: "active" });
  });

  // ── Transition: suspend + tier bump + rate override together ──────────────
  await check("multi-field patch writes each changed field with correct diff", () => {
    const parsed = affiliateAdminUpdateSchema.parse({ status: "suspended", tier: "pro", commission_rate: 0.3 });
    const r = computeAffiliateUpdate(baseRow, parsed);
    assert.deepEqual(new Set(r.changed), new Set(["status", "tier", "commission_rate"]));
    assert.deepEqual(r.set, { status: "suspended", tier: "pro", commission_rate: 0.3 });
    assert.deepEqual(r.before, { status: "pending", tier: "base", commission_rate: 0.25 });
    assert.deepEqual(r.after, { status: "suspended", tier: "pro", commission_rate: 0.3 });
  });

  // ── No-op: a field equal to the current value is not written or audited ───
  await check("unchanged field is a no-op (not written, not audited)", () => {
    const parsed = affiliateAdminUpdateSchema.parse({ status: "pending", tier: "pro" });
    const r = computeAffiliateUpdate(baseRow, parsed);
    // status matches current → skipped; only tier changes.
    assert.deepEqual(r.changed, ["tier"]);
    assert.deepEqual(r.set, { tier: "pro" });
    assert.equal("status" in r.set, false);
  });

  await check("fully-inert patch produces empty change set", () => {
    const parsed = affiliateAdminUpdateSchema.parse({ status: "pending", tier: "base", commission_rate: 0.25 });
    const r = computeAffiliateUpdate(baseRow, parsed);
    assert.equal(r.changed.length, 0);
    assert.deepEqual(r.set, {});
  });

  // ── Partner rate override: a hand-set 'partner' rate can differ from base ─
  await check("partner tier with a negotiated rate flows through", () => {
    const parsed = affiliateAdminUpdateSchema.parse({ tier: "partner", commission_rate: 0.4 });
    const r = computeAffiliateUpdate(baseRow, parsed);
    assert.deepEqual(new Set(r.changed), new Set(["tier", "commission_rate"]));
    assert.equal(r.set.commission_rate, 0.4);
  });

  console.log(`\n[adminUpdate.test] ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
