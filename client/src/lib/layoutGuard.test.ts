/**
 * LAYOUT-1 — unit tests for the geometry helpers.
 *
 * Excluded from `tsc --noEmit` (see tsconfig.json `exclude`). Runnable
 * standalone via `tsx client/src/lib/layoutGuard.test.ts` — uses
 * Node's built-in `assert/strict` so no test runner dep is added.
 *
 * Hook behaviour (`useLayoutGuard`) is intentionally NOT unit-tested
 * here — it needs a real DOM + observers and is covered by visual /
 * dev-console inspection in the wizard panels. The geometry helpers
 * carry all the logic that could go subtly wrong off-screen, so this
 * file is where the regressions get caught.
 */
import assert from 'node:assert/strict';
import {
  rectsOverlap,
  verticalGapPx,
  overlapAreaPx,
  type RectLike,
} from './layoutGuard';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    // eslint-disable-next-line no-console
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    // eslint-disable-next-line no-console
    console.error(`  FAIL ${name}\n       ${(err as Error).message}`);
  }
}

/** Convenience factory — saves a lot of object-literal boilerplate. */
function rect(top: number, left: number, width: number, height: number): RectLike {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

/* ─── rectsOverlap ─────────────────────────────────────────────────── */

test('disjoint rects do not overlap', () => {
  const a = rect(0, 0, 100, 20);
  const b = rect(40, 0, 100, 20); // 20px gap below `a`
  assert.equal(rectsOverlap(a, b), false);
});

test('clearly overlapping rects detected', () => {
  const a = rect(0, 0, 100, 50);
  const b = rect(20, 20, 100, 50);
  assert.equal(rectsOverlap(a, b), true);
});

test('rects touching at one edge do not count as overlap', () => {
  const a = rect(0, 0, 100, 20);
  const b = rect(20, 0, 100, 20); // b.top === a.bottom exactly
  assert.equal(rectsOverlap(a, b), false);
});

test('sub-pixel overlap below tolerance is ignored', () => {
  const a = rect(0, 0, 100, 20);
  const b = rect(19.5, 0, 100, 20); // 0.5px overlap — below 1px tolerance
  assert.equal(rectsOverlap(a, b), false);
});

test('overlap requires both axes — side-by-side same row is not overlap', () => {
  const a = rect(0, 0, 100, 20);
  const b = rect(0, 200, 100, 20); // same row, different column
  assert.equal(rectsOverlap(a, b), false);
});

test('overlap of 12px between sibling input rows detected', () => {
  const a = rect(0, 0, 320, 48);
  const b = rect(36, 0, 320, 48); // 12px y-overlap
  assert.equal(rectsOverlap(a, b), true);
});

test('custom tolerance is respected', () => {
  const a = rect(0, 0, 100, 20);
  const b = rect(15, 0, 100, 20); // 5px overlap
  assert.equal(rectsOverlap(a, b, 6), false);
  assert.equal(rectsOverlap(a, b, 2), true);
});

/* ─── overlapAreaPx ────────────────────────────────────────────────── */

test('overlapAreaPx returns 0 for disjoint rects', () => {
  const a = rect(0, 0, 100, 20);
  const b = rect(40, 0, 100, 20);
  assert.equal(overlapAreaPx(a, b), 0);
});

test('overlapAreaPx multiplies x and y overlap', () => {
  const a = rect(0, 0, 100, 50);
  const b = rect(20, 30, 100, 50); // overlap region: 70×30
  assert.equal(overlapAreaPx(a, b), 70 * 30);
});

test('overlapAreaPx is symmetric', () => {
  const a = rect(0, 0, 80, 40);
  const b = rect(10, 20, 80, 40);
  assert.equal(overlapAreaPx(a, b), overlapAreaPx(b, a));
});

/* ─── verticalGapPx ────────────────────────────────────────────────── */

test('verticalGapPx returns positive gap for stacked rects', () => {
  const a = rect(0, 0, 100, 20);
  const b = rect(28, 0, 100, 20); // 8px gap
  assert.equal(verticalGapPx(a, b), 8);
});

test('verticalGapPx is order-independent', () => {
  const a = rect(0, 0, 100, 20);
  const b = rect(28, 0, 100, 20);
  assert.equal(verticalGapPx(a, b), verticalGapPx(b, a));
});

test('verticalGapPx is 0 for touching rects', () => {
  const a = rect(0, 0, 100, 20);
  const b = rect(20, 0, 100, 20); // touching exactly
  assert.equal(verticalGapPx(a, b), 0);
});

test('verticalGapPx is negative for vertically overlapping rects', () => {
  const a = rect(0, 0, 100, 30);
  const b = rect(20, 0, 100, 30); // 10px y-overlap
  assert.equal(verticalGapPx(a, b), -10);
});

test('verticalGapPx is null for side-by-side rects (no x-overlap)', () => {
  const a = rect(0, 0, 100, 20);
  const b = rect(0, 200, 100, 20); // different columns
  assert.equal(verticalGapPx(a, b), null);
});

test('verticalGapPx works for partially x-overlapping rects', () => {
  const a = rect(0, 0, 100, 20);
  const b = rect(30, 50, 100, 20); // x-overlap = 50, y-gap = 10
  assert.equal(verticalGapPx(a, b), 10);
});

/* ─── Done ──────────────────────────────────────────────────────────── */

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
