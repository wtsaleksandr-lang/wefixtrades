/**
 * PRICING-MODELS (U7) — test battery for `resolveMatrixRate()`
 * (client/src/components/quote-widget/MatrixField.tsx).
 *
 * Mirrors the scripts/check-formula.ts battery style (pass/fail counters,
 * exits non-zero on any failure). Run with `npm run check:matrix-rate`.
 *
 * Contract under test (the formula side of the rate_matrix field):
 *   - full cell        → the finite lane rate,
 *   - either axis ''   → undefined (unselected — the parent contributes 0),
 *   - missing cell     → null under BOTH missingCell rules; the rules only
 *     diverge downstream: `custom_quote` additionally nulls the lead's
 *     quote_amount + shows the "quoted individually" note (AdvancedCalculator
 *     `quoteSuppressed`), `zero` just contributes 0 silently. The formula
 *     context receives a finite number either way (never NaN).
 *   - single-axis      → resolves through the only column like any cell.
 */
import { resolveMatrixRate, type MatrixAnswer } from './MatrixField';
import type { TemplateRateMatrix } from '../../../../shared/templatePresets';
import { evaluateFormula } from '../../../../shared/formulaEngine';

let pass = 0;
let fail = 0;

function eq(got: unknown, want: unknown, label: string) {
  if (Object.is(got, want)) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}  → got ${String(got)}, want ${String(want)}`);
}

const ans = (rowId: string, colId: string): MatrixAnswer => ({ rowId, colId });

/* ── the dumpster showcase shape: 4 sizes × 3 zones, one cell absent ── */
const MATRIX: TemplateRateMatrix = {
  rowLabel: 'Dumpster size',
  colLabel: 'Delivery zone',
  rows: [
    { id: 'yd10', label: '10 yard' }, { id: 'yd20', label: '20 yard' },
    { id: 'yd30', label: '30 yard' }, { id: 'yd40', label: '40 yard' },
  ],
  cols: [
    { id: 'zone_a', label: 'Zone A' }, { id: 'zone_b', label: 'Zone B' },
    { id: 'zone_c', label: 'Zone C' },
  ],
  rates: {
    yd10: { zone_a: 295, zone_b: 325, zone_c: 365 },
    yd20: { zone_a: 395, zone_b: 430, zone_c: 470 },
    yd30: { zone_a: 495, zone_b: 535, zone_c: 580 },
    yd40: { zone_a: 595, zone_b: 640 }, // zone_c intentionally absent
  },
  missingCell: 'custom_quote',
};

/* ── full cells resolve to the exact lane rate ── */
eq(resolveMatrixRate(MATRIX, ans('yd10', 'zone_a')), 295, 'full cell yd10×A');
eq(resolveMatrixRate(MATRIX, ans('yd30', 'zone_c')), 580, 'full cell yd30×C');
eq(resolveMatrixRate(MATRIX, ans('yd40', 'zone_b')), 640, 'full cell yd40×B');

/* ── unselected (either axis empty) → undefined, never null ── */
eq(resolveMatrixRate(MATRIX, ans('', '')), undefined, 'both axes unselected');
eq(resolveMatrixRate(MATRIX, ans('yd10', '')), undefined, 'col unselected');
eq(resolveMatrixRate(MATRIX, ans('', 'zone_a')), undefined, 'row unselected');
eq(resolveMatrixRate(undefined, ans('yd10', 'zone_a')), undefined, 'matrix undefined');

/* ── missing cell → null under BOTH rules (divergence is downstream) ── */
eq(resolveMatrixRate(MATRIX, ans('yd40', 'zone_c')), null,
  'missing cell (custom_quote rule)');
eq(resolveMatrixRate({ ...MATRIX, missingCell: 'zero' }, ans('yd40', 'zone_c')), null,
  'missing cell (zero rule) — same null, parent maps to 0');
eq(resolveMatrixRate(MATRIX, ans('yd99', 'zone_a')), null, 'unknown row id → null');
eq(resolveMatrixRate(MATRIX, ans('yd10', 'zone_z')), null, 'unknown col id → null');

/* ── non-finite rates are rejected (config corruption can't NaN a quote) ── */
{
  const corrupt: TemplateRateMatrix = {
    ...MATRIX,
    rates: { ...MATRIX.rates, yd10: { zone_a: NaN as number, zone_b: Infinity as number } },
  };
  eq(resolveMatrixRate(corrupt, ans('yd10', 'zone_a')), null, 'NaN rate → null');
  eq(resolveMatrixRate(corrupt, ans('yd10', 'zone_b')), null, 'Infinity rate → null');
}

/* ── single-axis matrix (1 col) — the drayage flat-lane shape ── */
{
  const single: TemplateRateMatrix = {
    rowLabel: 'Port / ramp', colLabel: 'Rate',
    rows: [{ id: 'pola', label: 'Port of LA' }, { id: 'ictf', label: 'ICTF ramp' }],
    cols: [{ id: 'flat', label: 'Flat' }],
    rates: { pola: { flat: 480 }, ictf: { flat: 520 } },
  };
  eq(resolveMatrixRate(single, ans('pola', 'flat')), 480, 'single-axis full cell');
  eq(resolveMatrixRate(single, ans('ictf', 'flat')), 520, 'single-axis second row');
  eq(resolveMatrixRate(single, ans('', 'flat')), undefined, 'single-axis unselected row');
}

/* ── formula composition — the resolved rate flows like any field token ── */
{
  // Drayage surcharge composition from the pricing-models spec:
  // `[Lane Rate]*1.32+150` (fuel 32% + chassis flat).
  const rate = resolveMatrixRate(MATRIX, ans('yd20', 'zone_b')); // 430
  const r = evaluateFormula('[Lane Rate]*1.32+150', { 'Lane Rate': rate as number });
  if (r.ok && Math.abs(r.value - (430 * 1.32 + 150)) < 1e-9) pass++;
  else { fail++; console.log(`FAIL  formula composition → ${JSON.stringify(r)}`); }

  // Missing cell: parent maps null → 0 before the formula runs (see
  // AdvancedCalculator rawFieldValue) — prove the mapped value never NaNs.
  const missing = resolveMatrixRate(MATRIX, ans('yd40', 'zone_c'));
  const mapped = typeof missing === 'number' ? missing : 0;
  const r2 = evaluateFormula('[Lane Rate]*1.32+150', { 'Lane Rate': mapped });
  if (r2.ok && Math.abs(r2.value - 150) < 1e-9) pass++;
  else { fail++; console.log(`FAIL  missing-cell composition → ${JSON.stringify(r2)}`); }
}

console.log(`\nresolveMatrixRate: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
