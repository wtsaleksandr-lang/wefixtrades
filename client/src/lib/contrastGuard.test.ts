/**
 * CONTRAST-1 — unit tests for the runtime contrast guard.
 *
 * Excluded from `tsc --noEmit` (see tsconfig.json `exclude`). Runnable
 * standalone via `tsx client/src/lib/contrastGuard.test.ts` — uses
 * Node's built-in `assert/strict` so no test runner dep is added.
 */
import assert from 'node:assert/strict';
import {
  ensureReadableText,
  getContrastRatio,
  getRelativeLuminance,
} from './contrastGuard';

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

/* ─── getRelativeLuminance ──────────────────────────────────────── */

test('black has luminance 0', () => {
  assert.equal(getRelativeLuminance('#000000'), 0);
});

test('white has luminance 1', () => {
  assert.equal(getRelativeLuminance('#ffffff'), 1);
});

test('3-digit hex normalises to 6-digit', () => {
  assert.equal(getRelativeLuminance('#fff'), getRelativeLuminance('#ffffff'));
});

test('rgb() syntax parses identically to hex', () => {
  const a = getRelativeLuminance('#ff0000');
  const b = getRelativeLuminance('rgb(255, 0, 0)');
  assert.ok(Math.abs(a - b) < 1e-9, `expected ${a} ~= ${b}`);
});

test('rgba() alpha is dropped (compared to opaque rgb)', () => {
  const a = getRelativeLuminance('rgba(13, 60, 252, 0.5)');
  const b = getRelativeLuminance('rgb(13, 60, 252)');
  assert.ok(Math.abs(a - b) < 1e-9);
});

/* ─── getContrastRatio ──────────────────────────────────────────── */

test('black on white = 21:1', () => {
  assert.equal(getContrastRatio('#000000', '#ffffff'), 21);
});

test('white on black = 21:1 (symmetric)', () => {
  assert.equal(getContrastRatio('#ffffff', '#000000'), 21);
});

test('same colour on itself = 1:1', () => {
  assert.equal(getContrastRatio('#ff00ff', '#ff00ff'), 1);
});

test('brand blue #0d3cfc on white passes 4.5:1 floor', () => {
  const r = getContrastRatio('#0d3cfc', '#ffffff');
  assert.ok(r >= 4.5, `expected >=4.5, got ${r.toFixed(2)}`);
});

/* ─── ensureReadableText ────────────────────────────────────────── */

test('white text on white bg corrects (ratio 1) → final passes 4.5', () => {
  const out = ensureReadableText('#ffffff', '#ffffff');
  assert.notEqual(out.toLowerCase(), '#ffffff');
  const r = getContrastRatio(out, '#ffffff');
  assert.ok(r >= 4.5, `expected >=4.5, got ${r.toFixed(2)}`);
});

test('black text on black bg corrects → final passes 4.5', () => {
  const out = ensureReadableText('#000000', '#000000');
  assert.notEqual(out.toLowerCase(), '#000000');
  const r = getContrastRatio(out, '#000000');
  assert.ok(r >= 4.5, `expected >=4.5, got ${r.toFixed(2)}`);
});

test('black on white passes unchanged', () => {
  assert.equal(ensureReadableText('#000000', '#ffffff'), '#000000');
});

test('brand blue #0d3cfc on white passes unchanged', () => {
  assert.equal(ensureReadableText('#0d3cfc', '#ffffff'), '#0d3cfc');
});

test('light gray text on white corrects to a darker shade', () => {
  const out = ensureReadableText('#dddddd', '#ffffff');
  assert.notEqual(out.toLowerCase(), '#dddddd');
  const r = getContrastRatio(out, '#ffffff');
  assert.ok(r >= 4.5, `expected >=4.5, got ${r.toFixed(2)}`);
});

test('largeText opt uses 3:1 floor (passes a borderline pair)', () => {
  // Light-mid gray on white: ratio ~3.4 — fails 4.5 (normal) but passes 3 (large).
  const fg = '#949494';
  const bg = '#ffffff';
  const ratioBefore = getContrastRatio(fg, bg);
  assert.ok(ratioBefore < 4.5 && ratioBefore >= 3, `setup: got ${ratioBefore.toFixed(2)}`);
  assert.equal(ensureReadableText(fg, bg, { largeText: true }), fg);
  assert.notEqual(ensureReadableText(fg, bg), fg);
});

test('unparseable bg returns fg untouched', () => {
  assert.equal(ensureReadableText('#ffffff', 'not-a-color'), '#ffffff');
});

test('unparseable fg + light bg → safe dark default', () => {
  const out = ensureReadableText('???', '#ffffff');
  assert.equal(out, '#0f172a');
});

test('unparseable fg + dark bg → safe light default', () => {
  const out = ensureReadableText('???', '#000000');
  assert.equal(out, '#f5f7fa');
});

test('rgb() input is parsed and corrected', () => {
  // Light gray as rgb() on white — should correct.
  const out = ensureReadableText('rgb(220, 220, 220)', '#ffffff');
  const r = getContrastRatio(out, '#ffffff');
  assert.ok(r >= 4.5, `expected >=4.5, got ${r.toFixed(2)}`);
});

/* ─── Done ──────────────────────────────────────────────────────── */

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
