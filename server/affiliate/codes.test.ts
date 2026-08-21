/**
 * Referral/affiliate CODE minting — uniqueness/retry + format.
 * mintUniqueCode is exercised with an INJECTED existence checker (no DB). We
 * stub DATABASE_URL first so importing codes.ts (which pulls server/db.ts) does
 * not throw — the pg Pool is constructed lazily and never connects here.
 * Run: `npx tsx server/affiliate/codes.test.ts`.
 */
import assert from "node:assert/strict";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://stub:stub@localhost:5432/stub";

const { mintUniqueCode } = await import("./codes");
const { CODE_ALPHABET, CODE_LENGTH, isValidCodeShape } = await import("./programs");

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

await check("mints a well-formed code when none collide", async () => {
  const code = await mintUniqueCode(8, async () => false);
  assert.equal(code.length, CODE_LENGTH);
  assert.equal(isValidCodeShape(code), true);
  for (const ch of code) assert.ok(CODE_ALPHABET.includes(ch), `char ${ch} not in alphabet`);
});

await check("retries past collisions until it finds a free code", async () => {
  let calls = 0;
  // First 3 candidates "exist", the 4th is free.
  const code = await mintUniqueCode(8, async () => {
    calls++;
    return calls <= 3;
  });
  assert.equal(calls, 4, "should have probed 4 candidates");
  assert.equal(isValidCodeShape(code), true);
});

await check("checks existence at least once (uniqueness is enforced)", async () => {
  let called = false;
  await mintUniqueCode(8, async () => {
    called = true;
    return false;
  });
  assert.equal(called, true);
});

await check("falls back to a longer entropy code when every try collides", async () => {
  // exists always true → exhausts maxTries → deterministic fallback branch.
  const code = await mintUniqueCode(3, async () => true);
  assert.ok(code.length >= CODE_LENGTH, "fallback should not be shorter than a normal code");
  assert.equal(isValidCodeShape(code), true);
});

console.log(`\n[codes.test] ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
