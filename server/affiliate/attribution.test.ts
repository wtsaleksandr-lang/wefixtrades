/**
 * Attribution linking on signup — self-referral ignored, referee 30-day trial,
 * referrer credit queued, affiliate link — plus the wft_ref cookie parser.
 *
 * The branch logic under test is the PURE `evaluateReferralSignup` (programs.ts)
 * that attribution.linkReferralOnSignup wraps with DB IO; testing it directly
 * pins every reward decision without a database (WFT's tsx harness has no
 * module mocking). `parseRefCookie` is imported from attribution.ts after a
 * stub DATABASE_URL so its db import doesn't throw (Pool is lazy, no connect).
 * Run: `npx tsx server/affiliate/attribution.test.ts`.
 */
import assert from "node:assert/strict";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://stub:stub@localhost:5432/stub";

const { evaluateReferralSignup, REFEREE_TRIAL_DAYS, REFERRER_FREE_MONTHS } = await import("./programs");
type ResolvedCodeOwner = import("./programs").ResolvedCodeOwner;
const { parseRefCookie } = await import("./attribution");

let pass = 0;
let fail = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass++;
  } catch (err) {
    fail++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
  }
}

const referrer: ResolvedCodeOwner = {
  kind: "referral",
  clientId: 99,
  ownerUserId: 7,
  ownerEmail: "ref@x.com",
};

await check("applies the referee 30-day trial + queues the referrer credit (peer)", () => {
  const out = evaluateReferralSignup(referrer, "new@customer.com", 1001);
  assert.equal(out.self, false);
  assert.equal(out.kind, "referral");
  // 30-day trial extension (vs the standard 14).
  assert.equal(out.refereeTrialDays, 30);
  assert.equal(out.refereeTrialDays, REFEREE_TRIAL_DAYS);
  // Referrer free-month credit queued for the referring client.
  assert.equal(out.queueCreditForClientId, 99);
  assert.equal(out.referrerFreeMonths, REFERRER_FREE_MONTHS);
  assert.equal(out.referrerFreeMonths, 1);
});

await check("IGNORES a self-referral by email (no reward, no credit)", () => {
  const out = evaluateReferralSignup(referrer, "REF@X.com", 1002);
  assert.equal(out.self, true);
});

await check("IGNORES a self-referral by client id", () => {
  const out = evaluateReferralSignup(referrer, "someone-else@x.com", 99);
  assert.equal(out.self, true);
});

await check("affiliate-code signup links the affiliate without a referee trial bonus", () => {
  const affiliate: ResolvedCodeOwner = {
    kind: "affiliate",
    affiliateId: 8,
    ownerClientId: null,
    ownerEmail: "aff@x.com",
  };
  const out = evaluateReferralSignup(affiliate, "buyer@x.com", 1003);
  assert.equal(out.kind, "affiliate");
  assert.equal(out.self, false);
  assert.equal(out.affiliateId, 8);
  assert.equal(out.refereeTrialDays, undefined);
  assert.equal(out.queueCreditForClientId, undefined);
});

// ── wft_ref cookie parser ────────────────────────────────────────────────
await check("parseRefCookie splits `<CODE>~<token>`", () => {
  const parsed = parseRefCookie("ABCD2345~sometoken");
  assert.ok(parsed);
  assert.equal(parsed!.code, "ABCD2345");
  assert.equal(parsed!.token, "sometoken");
});

await check("parseRefCookie rejects malformed / empty values", () => {
  assert.equal(parseRefCookie(""), null);
  assert.equal(parseRefCookie("nodelimiter"), null);
  assert.equal(parseRefCookie("~onlytoken"), null);
  assert.equal(parseRefCookie(null), null);
});

console.log(`\n[attribution.test] ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
