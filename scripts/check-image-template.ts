/**
 * Test battery for client/.../imageTemplateToConfig.ts — run with
 *   `npx tsx scripts/check-image-template.ts`
 *
 * Asserts the Wave 65 quantity-driven conversion end-to-end against the REAL
 * formula engine (shared/formulaEngine), so the headline Total is validated
 * the same way the customer widget computes it:
 *
 *   - a multi-line-item extraction  → one editable quantity field per product
 *     (default = quoted count), per-unit prices in the formula, and a primary
 *     Total that equals Σ(qty × unitPrice) + addons + modifiers.
 *   - a single-base extraction       → unchanged (one base field) AND a
 *     non-zero primary Total (the "$0.00 headline" regression guard).
 *
 * Exits non-zero on any failure so CI can gate it.
 */
import { runCalculations, type FormulaContext } from '../shared/formulaEngine';
import {
  imageTemplateToConfig,
  type ImageTemplate,
} from '../client/src/components/wizard/elfsight/imageTemplateToConfig';

let pass = 0;
let fail = 0;

function ok(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL  ${label}${detail ? `  → ${detail}` : ''}`); }
}

/** Build the field context the way AdvancedCalculator does (by field name),
 *  using each field's default_value / on_value, then run the calcs and return
 *  the value of the named headline calc. */
function headline(cfg: ReturnType<typeof imageTemplateToConfig>): number {
  const ctx: FormulaContext = {};
  for (const f of cfg.fields) {
    if (f.type === 'number' || f.type === 'slider') {
      ctx[f.name] = typeof f.default_value === 'number' ? f.default_value : 0;
    } else if (f.type === 'toggle') {
      // toggles default OFF in the generated config → contribute 0
      ctx[f.name] = 0;
    }
  }
  const { values } = runCalculations(
    cfg.calculations.map((c) => ({ id: c.id, name: c.name, formula: c.formula })),
    ctx,
  );
  return values[cfg.result_calc] ?? 0;
}

/* ── 1. Multi-line-item (windows) — the core Wave 65 case ──
 * 8 double-hung @ $525 + 2 picture @ $640 = 4200 + 1280 = 5480. */
{
  const t: ImageTemplate = {
    title: 'Window replacement',
    basePrice: null,
    lineItems: [
      { label: 'Double-hung window', unitPrice: 525, quantity: 8, unit: 'window' },
      { label: 'Picture window', unitPrice: 640, quantity: 2, unit: 'window' },
    ],
    currency: 'USD',
    addons: [],
    modifiers: [],
    notes: null,
  };
  const cfg = imageTemplateToConfig(t);

  // One editable number field per line item, defaulting to the quoted count.
  const numFields = cfg.fields.filter((f) => f.type === 'number');
  ok(numFields.length === 2, 'windows: two quantity number fields', `got ${numFields.length}`);
  ok(numFields.every((f) => (f.default_value ?? 0) > 0),
     'windows: quantity defaults are non-zero (quoted counts)',
     numFields.map((f) => f.default_value).join(','));
  ok(numFields.some((f) => f.default_value === 8) && numFields.some((f) => f.default_value === 2),
     'windows: defaults equal the quoted counts (8 and 2)');

  // No redundant $0 base field when line items carry the whole price.
  ok(!cfg.fields.some((f) => f.label === 'Base price'),
     'windows: no redundant $0 base-price field');

  // Headline Total = 8*525 + 2*640 = 5480, and it is the primary calc.
  const total = cfg.calculations.find((c) => c.name === 'Total');
  ok(total?.resultMode === 'primary', 'windows: Total is resultMode=primary');
  ok(cfg.result_calc === 'Total', 'windows: result_calc points at Total');
  ok(headline(cfg) === 5480, 'windows: headline Total = 5480 (qty × unit price)', String(headline(cfg)));

  // Customer can change counts: bump double-hung 8→10 → +1050 = 6530.
  const ctx: FormulaContext = {};
  for (const f of cfg.fields) if (f.type === 'number') ctx[f.name] = f.default_value ?? 0;
  const dh = cfg.fields.find((f) => f.label.startsWith('Double-hung'))!;
  ctx[dh.name] = 10;
  const { values } = runCalculations(
    cfg.calculations.map((c) => ({ id: c.id, name: c.name, formula: c.formula })), ctx);
  ok(values['Total'] === 6530, 'windows: editing a count recomputes Total (10 dh → 6530)', String(values['Total']));
}

/* ── 2. Single flat service (cleaning) — must be UNCHANGED + non-zero headline ── */
{
  const t: ImageTemplate = {
    title: 'House cleaning',
    basePrice: 180,
    currency: 'USD',
    addons: [],
    modifiers: [{ label: 'Sales tax', type: 'percent', value: 8, appliesTo: 'total' }],
    notes: null,
  };
  const cfg = imageTemplateToConfig(t);

  const base = cfg.fields.find((f) => f.label === 'Base price');
  ok(!!base, 'cleaning: single base-price field present');
  ok(base?.default_value === 180, 'cleaning: base defaults to 180', String(base?.default_value));
  ok(cfg.fields.filter((f) => f.type === 'number').length === 1,
     'cleaning: exactly one number field (the base)');

  // Headline must NOT be $0.00 — base flows into Total via the Subtotal name ref.
  // Tax toggle defaults OFF → Total == base == 180.
  ok(headline(cfg) === 180, 'cleaning: headline Total = 180 (not $0.00)', String(headline(cfg)));
  ok(cfg.result_calc === 'Total', 'cleaning: result_calc points at Total');
}

/* ── 3. Regression guard for the "$0.00 headline" bug directly ──
 * Even a bare base with NO modifiers must surface a non-zero Total (the old
 * code referenced the Subtotal calc by id → 0). */
{
  const cfg = imageTemplateToConfig({
    title: 'Flat fee', basePrice: 99, currency: 'USD', addons: [], modifiers: [], notes: null,
  });
  ok(headline(cfg) === 99, 'bare-base: headline Total = 99 (id-vs-name $0.00 fix)', String(headline(cfg)));
}

console.log(`\nimage-template conversion: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
