/**
 * Unit tests for redactPii — runnable standalone via
 * `tsx server/lib/redactPii.test.ts`. Uses Node's built-in
 * `assert/strict` so no test runner dep is added (same convention as
 * client/src/lib/contrastGuard.test.ts).
 *
 * Excluded from `tsc --noEmit` via the project tsconfig's existing
 * `*.test.ts` exclude pattern.
 */
import assert from "node:assert/strict";
import { redactPii } from "./redactPii";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err?.message ?? err}`);
  }
}

console.log("redactPii");

test("redacts a valid credit-card-like 16-digit run", () => {
  const out = redactPii("My card is 4111 1111 1111 1111, thanks.");
  assert.ok(!/4111/.test(out), `expected card digits gone, got: ${out}`);
  assert.ok(out.includes("[REDACTED]"));
});

test("redacts a SSN-formatted string", () => {
  const out = redactPii("SSN: 123-45-6789 on file.");
  assert.equal(out, "SSN: [REDACTED] on file.");
});

test("redacts a generic email address", () => {
  const out = redactPii("contact me at john.doe@gmail.com soon");
  assert.equal(out, "contact me at [REDACTED] soon");
});

test("preserves internal @wefixtrades.com email", () => {
  const out = redactPii("forwarded by alex@wefixtrades.com");
  assert.equal(out, "forwarded by alex@wefixtrades.com");
});

test("passes through text with no PII unchanged", () => {
  const input = "Just a normal message about scheduling next week.";
  assert.equal(redactPii(input), input);
});

test("redacts mixed PII in one string, preserves internal email", () => {
  const input =
    "Card 4242-4242-4242-4242, SSN 987-65-4321, customer joe@example.com, " +
    "looped in support@wefixtrades.com.";
  const out = redactPii(input);
  assert.ok(!/4242/.test(out), `card not redacted: ${out}`);
  assert.ok(!/987-65-4321/.test(out), `ssn not redacted: ${out}`);
  assert.ok(!/joe@example\.com/.test(out), `external email not redacted: ${out}`);
  assert.ok(/support@wefixtrades\.com/.test(out), `internal email lost: ${out}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
