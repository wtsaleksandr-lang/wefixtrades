/**
 * Lane C — 2FA recovery codes tests.
 *
 * Runnable standalone: npx tsx server/lib/recoveryCodes.test.ts
 * (excluded from tsc via tsconfig **\/*.test.ts).
 *
 * Coverage:
 *   1. generation: 8 unique codes, hashes persist-able, plaintext ≠ hash
 *   2. consumption: valid code verifies and is single-use
 *   3. wrong code rejected without mutating the stored set
 *   4. normalization: dashes / case / spaces don't matter
 *   5. looksLikeRecoveryCode discriminates TOTP vs recovery input
 *   6. malformed stored hashes never throw mid-login
 */
import assert from "node:assert/strict";
import {
  generateRecoveryCodes,
  consumeRecoveryCode,
  hashRecoveryCode,
  normalizeRecoveryCode,
  looksLikeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from "./recoveryCodes";

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
check("generates 8 unique codes with matching hashes", () => {
  const { codes, hashes } = generateRecoveryCodes();
  assert.equal(codes.length, RECOVERY_CODE_COUNT);
  assert.equal(hashes.length, RECOVERY_CODE_COUNT);
  assert.equal(new Set(codes).size, RECOVERY_CODE_COUNT, "codes must be unique");
  for (let i = 0; i < codes.length; i++) {
    assert.equal(hashes[i], hashRecoveryCode(codes[i]));
    assert.notEqual(codes[i], hashes[i], "plaintext must never equal the stored hash");
    assert.match(hashes[i], /^[0-9a-f]{64}$/, "hash must be sha256 hex");
  }
});

// 2
check("valid code verifies and is consumed (single-use)", () => {
  const { codes, hashes } = generateRecoveryCodes();
  const first = consumeRecoveryCode(hashes, codes[3]);
  assert.equal(first.ok, true);
  assert.equal(first.remainingHashes.length, RECOVERY_CODE_COUNT - 1);
  // Replay of the SAME code against the updated set must fail.
  const replay = consumeRecoveryCode(first.remainingHashes, codes[3]);
  assert.equal(replay.ok, false, "a consumed recovery code must not work twice");
  assert.equal(replay.remainingHashes.length, RECOVERY_CODE_COUNT - 1);
});

// 3
check("wrong code rejected, stored set untouched", () => {
  const { hashes } = generateRecoveryCodes();
  const result = consumeRecoveryCode(hashes, "WRONG-CODE99");
  assert.equal(result.ok, false);
  assert.deepEqual(result.remainingHashes, hashes);
});

// 4
check("normalization: case / dashes / spaces are irrelevant", () => {
  const { codes, hashes } = generateRecoveryCodes();
  const sloppy = ` ${codes[0].toLowerCase().replace("-", " - ")} `;
  assert.equal(normalizeRecoveryCode(sloppy), normalizeRecoveryCode(codes[0]));
  const result = consumeRecoveryCode(hashes, sloppy);
  assert.equal(result.ok, true);
});

// 5
check("looksLikeRecoveryCode: TOTP codes are not recovery codes", () => {
  assert.equal(looksLikeRecoveryCode("123456"), false);
  assert.equal(looksLikeRecoveryCode(" 123 456 "), false);
  const { codes } = generateRecoveryCodes();
  for (const code of codes) {
    assert.equal(looksLikeRecoveryCode(code), true, `generated code ${code} must be recognized`);
  }
  assert.equal(looksLikeRecoveryCode(""), false);
  assert.equal(looksLikeRecoveryCode("abc"), false);
});

// 6
check("malformed stored hashes never throw", () => {
  const result = consumeRecoveryCode(["not-hex!!", null as any, 42 as any, undefined as any], "AAAAA-BBBBB");
  assert.equal(result.ok, false);
  // Non-array storage (legacy null column) is handled too.
  assert.equal(consumeRecoveryCode(null, "AAAAA-BBBBB").ok, false);
  assert.equal(consumeRecoveryCode(undefined, "AAAAA-BBBBB").ok, false);
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
