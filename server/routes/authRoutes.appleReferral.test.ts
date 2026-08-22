/**
 * Referral-wiring guard for the auth signup paths.
 *
 * Bug: the Apple new-user branch (POST /api/auth/apple/callback) created the
 * client but — unlike the password and Google-complete paths — did NOT mint a
 * referral code or link the pending `wft_ref` attribution, so every Apple
 * signup dropped its referral. This structural test asserts that ALL THREE
 * signup branches call the referral hook, and specifically that the Apple
 * self-serve block links attribution using the Apple profile's email.
 *
 * A source-structure assertion (not a full route boot) because the Apple
 * callback depends on live Apple key exchange + DB; the contract we protect is
 * simply "the Apple branch wires the referral hook the same way the others do".
 *
 * Run: npx tsx server/routes/authRoutes.appleReferral.test.ts
 *      (CI: check:apple-referral)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "authRoutes.ts"), "utf8");

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

check("all three signup branches call linkReferralOnSignup", () => {
  const calls = src.match(/linkReferralOnSignup\(\{/g) || [];
  assert.equal(calls.length, 3, `expected 3 linkReferralOnSignup call sites, found ${calls.length}`);
});

check("Apple self-serve branch mints a referral code + links attribution", () => {
  const marker = 'Apple self-serve signup completed';
  const idx = src.indexOf(marker);
  assert.ok(idx > 0, "Apple self-serve signup block not found");
  // Window from the Apple signup log line to the admin-activity log that
  // closes the block — the referral hook must live inside it.
  const block = src.slice(idx, idx + 1400);
  assert.match(block, /ensureClientReferralCode\(client\.id\)/, "Apple branch must mint the client referral code");
  assert.match(block, /linkReferralOnSignup\(\{[^}]*signupEmail:\s*profile\.email/, "Apple branch must link attribution with the Apple email");
  assert.match(block, /\[apple-signup\] referral linking failed/, "Apple branch must log a non-fatal failure (no silent catch)");
});

console.log(`\n[authRoutes.appleReferral.test] ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
