/**
 * Affiliate/referral PURE terms + tier logic + code format + signup decision.
 * Pure logic — no DB/HTTP. Ported from QuoteFleet programs.test.ts, adapted to
 * WFT's tsx + node:assert harness (no vitest). Run: `npx tsx server/affiliate/programs.test.ts`.
 */
import assert from "node:assert/strict";
import {
  resolveTier,
  commissionRateForTier,
  tierProgress,
  estimateMonthlyCommissionCents,
  evaluateReferralSignup,
  generateCode,
  normalizeCode,
  isValidCodeShape,
  AFFILIATE_BASE_RATE,
  AFFILIATE_PRO_RATE,
  AFFILIATE_PRO_THRESHOLD,
  AFFILIATE_PARTNER_RATE,
  REFEREE_TRIAL_DAYS,
  REFEREE_DISCOUNT_PCT,
  REFEREE_DISCOUNT_MONTHS,
  REFERRER_FREE_MONTHS,
  CODE_ALPHABET,
  CODE_LENGTH,
  type ResolvedCodeOwner,
} from "./programs";

let pass = 0;
let fail = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    pass++;
  } catch (err) {
    fail++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Tier + commission logic ──────────────────────────────────────────────
check("maps active-customer count to the right tier", () => {
  assert.equal(resolveTier(0), "base");
  assert.equal(resolveTier(9), "base");
  assert.equal(resolveTier(10), "pro");
  assert.equal(resolveTier(50), "pro");
});

check("returns the published rate per tier", () => {
  assert.equal(commissionRateForTier("base"), AFFILIATE_BASE_RATE);
  assert.equal(commissionRateForTier("pro"), AFFILIATE_PRO_RATE);
  assert.equal(commissionRateForTier("partner"), AFFILIATE_PARTNER_RATE);
  assert.equal(AFFILIATE_BASE_RATE, 0.25);
  assert.equal(AFFILIATE_PRO_RATE, 0.3);
  assert.equal(AFFILIATE_PARTNER_RATE, 0.35);
});

check("reports progress toward the next tier for a base affiliate", () => {
  const p = tierProgress(3);
  assert.equal(p.tier, "base");
  assert.equal(p.nextTier, "pro");
  assert.equal(p.toNextTier, AFFILIATE_PRO_THRESHOLD - 3);
  assert.equal(p.rate, AFFILIATE_BASE_RATE);
});

check("a pro affiliate is at the top of the self-serve ladder", () => {
  const p = tierProgress(15);
  assert.equal(p.tier, "pro");
  assert.equal(p.toNextTier, 0);
  assert.equal(p.nextTier, "partner");
});

check("partner stays partner regardless of count", () => {
  const p = tierProgress(3, "partner");
  assert.equal(p.tier, "partner");
  assert.equal(p.nextTier, null);
  assert.equal(p.rate, AFFILIATE_PARTNER_RATE);
});

check("estimates monthly commission cents", () => {
  assert.equal(estimateMonthlyCommissionCents(4, 5000, 0.25), 5000);
  assert.equal(estimateMonthlyCommissionCents(0, 5000, 0.25), 0);
  assert.equal(estimateMonthlyCommissionCents(-3, 5000, 0.25), 0);
});

// ── Code format ──────────────────────────────────────────────────────────
check("generateCode returns a CODE_LENGTH code from the alphabet", () => {
  for (let i = 0; i < 50; i++) {
    const c = generateCode();
    assert.equal(c.length, CODE_LENGTH);
    for (const ch of c) assert.ok(CODE_ALPHABET.includes(ch), `char ${ch} not in alphabet`);
  }
});

check("generated codes avoid ambiguous glyphs (O/0/I/1/L)", () => {
  assert.ok(!/[OIL01]/.test(CODE_ALPHABET));
});

check("normalizeCode uppercases, strips junk, caps at 16", () => {
  assert.equal(normalizeCode("  ab-cd_23 "), "ABCD23");
  assert.equal(normalizeCode("xyz!@#987"), "XYZ987");
  assert.equal(normalizeCode(null), "");
  assert.equal(normalizeCode("a".repeat(40)).length, 16);
});

check("isValidCodeShape accepts 4–16 alnum, rejects the rest", () => {
  assert.equal(isValidCodeShape("ABCD"), true);
  assert.equal(isValidCodeShape("ABCD2345"), true);
  assert.equal(isValidCodeShape("ABC"), false); // too short
  assert.equal(isValidCodeShape("a".repeat(17)), false); // too long
  assert.equal(isValidCodeShape("ab cd"), false); // space
});

// ── Signup decision (pure) ───────────────────────────────────────────────
const refOwner: ResolvedCodeOwner = {
  kind: "referral",
  clientId: 99,
  ownerUserId: 7,
  ownerEmail: "ref@x.com",
};

check("peer referral (not self) yields referee 30d trial + queued referrer credit", () => {
  const out = evaluateReferralSignup(refOwner, "new@customer.com", 1001);
  assert.equal(out.self, false);
  assert.equal(out.kind, "referral");
  assert.equal(out.refereeTrialDays, REFEREE_TRIAL_DAYS);
  assert.equal(out.refereeTrialDays, 30);
  assert.equal(out.refereeDiscountPct, REFEREE_DISCOUNT_PCT);
  assert.equal(out.refereeDiscountMonths, REFEREE_DISCOUNT_MONTHS);
  assert.equal(out.queueCreditForClientId, 99);
  assert.equal(out.referrerFreeMonths, REFERRER_FREE_MONTHS);
  assert.equal(out.referrerFreeMonths, 1);
});

check("self-referral by email is flagged (case-insensitive)", () => {
  const out = evaluateReferralSignup(refOwner, "REF@X.com", 2002);
  assert.equal(out.self, true);
});

check("self-referral by client id is flagged", () => {
  const out = evaluateReferralSignup(refOwner, "different@x.com", 99);
  assert.equal(out.self, true);
});

check("affiliate code links the affiliate with no referee trial bonus", () => {
  const affOwner: ResolvedCodeOwner = {
    kind: "affiliate",
    affiliateId: 8,
    ownerClientId: null,
    ownerEmail: "aff@x.com",
  };
  const out = evaluateReferralSignup(affOwner, "buyer@x.com", 1003);
  assert.equal(out.kind, "affiliate");
  assert.equal(out.self, false);
  assert.equal(out.affiliateId, 8);
  assert.equal(out.refereeTrialDays, undefined);
  assert.equal(out.queueCreditForClientId, undefined);
});

console.log(`\n[programs.test] ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
