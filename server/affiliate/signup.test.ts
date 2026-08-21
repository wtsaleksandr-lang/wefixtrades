/**
 * Self-serve affiliate SIGNUP core — idempotency, code minting, base defaults.
 * Pure over injected deps (no DB), so this runs under WFT's tsx + node:assert
 * harness with no infrastructure. Also pins the route's Zod validation shape.
 *
 * Run: npx tsx server/affiliate/signup.test.ts   (CI: check:affiliate-signup)
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 */
import assert from "node:assert/strict";
import { z } from "zod";
import { registerAffiliate, type RegisterAffiliateDeps, type AffiliateInsertValues } from "./signup";
import { AFFILIATE_BASE_RATE } from "./programs";

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

// Recording deps: an in-memory affiliate store keyed by email.
function makeDeps(seed: Record<string, { code: string; status: string }> = {}) {
  const store = new Map(Object.entries(seed));
  const inserts: AffiliateInsertValues[] = [];
  let mints = 0;
  const deps: RegisterAffiliateDeps = {
    findByEmail: async (email) => store.get(email) ?? null,
    mint: async () => {
      mints++;
      return `CODE${mints}23`;
    },
    insert: async (values) => {
      inserts.push(values);
      const row = { code: values.code, status: values.status };
      store.set(values.email, row);
      return row;
    },
  };
  return { deps, inserts, get mints() { return mints; }, store };
}

async function main() {
  // ── New email → mints a code + inserts base/pending row ──────────────────
  await check("new email: mints code, inserts tier=base/status=pending/base rate", async () => {
    const h = makeDeps();
    const r = await registerAffiliate({ email: "New@Aff.com", name: "Nia" }, h.deps);
    assert.equal(r.existing, false);
    assert.equal(r.code, "CODE123");
    assert.equal(r.status, "pending");
    assert.equal(h.mints, 1);
    assert.equal(h.inserts.length, 1);
    const v = h.inserts[0];
    assert.equal(v.email, "new@aff.com"); // lowercased
    assert.equal(v.name, "Nia");
    assert.equal(v.tier, "base");
    assert.equal(v.status, "pending");
    assert.equal(v.commission_rate, AFFILIATE_BASE_RATE);
  });

  // ── Idempotent on email → returns existing, no mint, no insert ───────────
  await check("existing email: returns existing row, no mint, no duplicate insert", async () => {
    const h = makeDeps({ "dup@aff.com": { code: "OLD999", status: "active" } });
    const r = await registerAffiliate({ email: "DUP@aff.com" }, h.deps);
    assert.equal(r.existing, true);
    assert.equal(r.code, "OLD999");
    assert.equal(r.status, "active");
    assert.equal(h.mints, 0);
    assert.equal(h.inserts.length, 0);
  });

  // ── Owner linkage + payout details flow through to the insert ────────────
  await check("owner + payout fields flow through to the insert row", async () => {
    const h = makeDeps();
    await registerAffiliate(
      { email: "own@aff.com", payoutMethod: "paypal", payoutDetails: "pay@aff.com", ownerClientId: 7, ownerUserId: 3 },
      h.deps,
    );
    const v = h.inserts[0];
    assert.equal(v.payout_method, "paypal");
    assert.equal(v.payout_details, "pay@aff.com");
    assert.equal(v.owner_client_id, 7);
    assert.equal(v.owner_user_id, 3);
  });

  // ── Insert returning nothing → throws (route turns it into a 500) ────────
  await check("insert returning no row throws", async () => {
    const deps: RegisterAffiliateDeps = {
      findByEmail: async () => null,
      mint: async () => "ZZZZ23",
      insert: async () => null,
    };
    await assert.rejects(() => registerAffiliate({ email: "x@aff.com" }, deps), /no row/);
  });

  // ── Route validation shape: email required, optional fields bounded ──────
  await check("signup schema rejects bad email, accepts valid payload", () => {
    const Schema = z.object({
      email: z.string().trim().email().max(200),
      name: z.string().trim().max(120).optional(),
      payoutMethod: z.enum(["paypal", "stripe", "bank"]).optional(),
      payoutDetails: z.string().trim().max(300).optional(),
    });
    assert.equal(Schema.safeParse({ email: "not-an-email" }).success, false);
    assert.equal(Schema.safeParse({ email: "ok@aff.com" }).success, true);
    assert.equal(Schema.safeParse({ email: "ok@aff.com", payoutMethod: "venmo" }).success, false);
    assert.equal(Schema.safeParse({ email: "ok@aff.com", payoutMethod: "paypal", name: "A" }).success, true);
  });

  console.log(`\n[signup.test] ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
