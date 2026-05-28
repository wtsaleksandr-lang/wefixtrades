/**
 * Unit tests for the Wave 84 SMS segment math helper.
 *
 * Excluded from `tsc --noEmit` (tsconfig `**\/*.test.ts`). Runnable standalone:
 *
 *   npx tsx server/lib/smsSegments.test.ts
 *
 * `assert/strict` only — no test runner dep is added.
 *
 * Coverage:
 *   1.  Empty body → 1 segment / GSM-7
 *   2.  ASCII 50 chars → 1 segment / GSM-7
 *   3.  ASCII 200 chars → 2 segments / GSM-7 (153 per-segment break)
 *   4.  Boundary 160 GSM-7 → 1 segment
 *   5.  Boundary 161 GSM-7 → 2 segments
 *   6.  Boundary 306 GSM-7 (153 * 2) → 2 segments
 *   7.  Boundary 307 GSM-7 → 3 segments
 *   8.  Emoji 30 chars → 1 segment / UCS-2
 *   9.  Emoji 100 chars → 2 segments / UCS-2 (67 per-segment break)
 *   10. Boundary 70 UCS-2 → 1 segment
 *   11. Boundary 71 UCS-2 → 2 segments
 *   12. Mixed ASCII + accented char (é) → UCS-2
 */
import assert from "node:assert/strict";
import { calculateSmsSegments } from "./smsSegments";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err: any) {
    console.error(`  FAIL ${name}`);
    console.error(err?.message ?? err);
    process.exitCode = 1;
  }
}

console.log("smsSegments.calculateSmsSegments");

test("empty body → 1 segment GSM-7", () => {
  const r = calculateSmsSegments("");
  assert.equal(r.segments, 1);
  assert.equal(r.encoding, "GSM-7");
});

test("ASCII 50 chars → 1 segment GSM-7", () => {
  const r = calculateSmsSegments("a".repeat(50));
  assert.equal(r.segments, 1);
  assert.equal(r.encoding, "GSM-7");
});

test("ASCII 200 chars → 2 segments GSM-7", () => {
  // 200 / 153 = 1.30 → ceil = 2
  const r = calculateSmsSegments("a".repeat(200));
  assert.equal(r.segments, 2);
  assert.equal(r.encoding, "GSM-7");
});

test("boundary 160 GSM-7 → 1 segment", () => {
  const r = calculateSmsSegments("a".repeat(160));
  assert.equal(r.segments, 1);
  assert.equal(r.encoding, "GSM-7");
});

test("boundary 161 GSM-7 → 2 segments (153 break)", () => {
  const r = calculateSmsSegments("a".repeat(161));
  assert.equal(r.segments, 2);
  assert.equal(r.encoding, "GSM-7");
});

test("boundary 306 GSM-7 (2 * 153) → 2 segments", () => {
  const r = calculateSmsSegments("a".repeat(306));
  assert.equal(r.segments, 2);
});

test("boundary 307 GSM-7 → 3 segments", () => {
  const r = calculateSmsSegments("a".repeat(307));
  assert.equal(r.segments, 3);
});

test("emoji 30 chars → 1 segment UCS-2", () => {
  // Each emoji is 2 JS code units, but length() counts code units. 15 emojis
  // = 30 code units, still ≤ 70 → 1 segment.
  const r = calculateSmsSegments("\u{1F600}".repeat(15));
  assert.equal(r.segments, 1);
  assert.equal(r.encoding, "UCS-2");
});

test("emoji 100 chars → 2 segments UCS-2 (67 break)", () => {
  // 50 emojis × 2 code units = 100; 100 / 67 = 1.49 → ceil = 2.
  const r = calculateSmsSegments("\u{1F600}".repeat(50));
  assert.equal(r.segments, 2);
  assert.equal(r.encoding, "UCS-2");
});

test("boundary 70 UCS-2 → 1 segment", () => {
  const r = calculateSmsSegments("é".repeat(70));
  assert.equal(r.segments, 1);
  assert.equal(r.encoding, "UCS-2");
});

test("boundary 71 UCS-2 → 2 segments", () => {
  const r = calculateSmsSegments("é".repeat(71));
  assert.equal(r.segments, 2);
  assert.equal(r.encoding, "UCS-2");
});

test("mixed ASCII + accented char (é) → UCS-2", () => {
  const r = calculateSmsSegments("Hello café");
  assert.equal(r.encoding, "UCS-2");
  assert.equal(r.segments, 1);
});

console.log("done");
