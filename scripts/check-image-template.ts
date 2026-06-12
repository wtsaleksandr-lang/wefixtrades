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
 *   - a single-base extraction       → the flat fee is folded into the
 *     formula as a constant (business config, NEVER a customer-facing
 *     "Base price" field) AND a non-zero primary Total (the "$0.00
 *     headline" regression guard).
 *
 * Exits non-zero on any failure so CI can gate it.
 */
import { runCalculations, type FormulaContext } from '../shared/formulaEngine';
import {
  imageTemplateToConfig,
  type ImageTemplate,
} from '../client/src/components/wizard/elfsight/imageTemplateToConfig';
import {
  imageDemoTemplateToConfig,
  type DemoImageTemplate,
} from '../shared/aiDemoTemplate';

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

/* ── 2. Single flat service (cleaning) — flat basePrice is business config:
 * folded into the formula as a constant, NEVER a customer-facing field
 * (input-vs-config rule, AI-gen quality wave gap 3). ── */
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

  ok(!cfg.fields.some((f) => f.label === 'Base price'),
     'cleaning: NO customer-facing base-price field (business config)');
  ok(cfg.fields.filter((f) => f.type === 'number').length === 0,
     'cleaning: zero number fields (flat fee folded into formula)',
     cfg.fields.map((f) => f.label).join(','));
  const subtotal = cfg.calculations.find((c) => c.name === 'Subtotal');
  ok(/(^|[^\d.])180($|[^\d.])/.test(subtotal?.formula ?? ''),
     'cleaning: constant 180 baked into Subtotal formula', subtotal?.formula);

  // Headline must NOT be $0.00 — the constant flows into Total via the
  // Subtotal name ref. Tax toggle defaults OFF → Total == base == 180.
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

/* ── 3b. Flat call-out fee + line items — fee folded as a constant, no
 * "Base / call-out fee" customer field either (input-vs-config parity). ── */
{
  const t: ImageTemplate = {
    title: 'Window replacement',
    basePrice: 95, // flat call-out fee printed on the quote
    lineItems: [
      { label: 'Double-hung window', unitPrice: 525, quantity: 8, unit: 'window' },
    ],
    currency: 'USD',
    addons: [],
    modifiers: [],
    notes: null,
  };
  const cfg = imageTemplateToConfig(t);

  ok(!cfg.fields.some((f) => f.label === 'Base price' || f.label === 'Base / call-out fee'),
     'flat+items: no base / call-out customer field (fee folded as constant)',
     cfg.fields.map((f) => f.label).join(','));
  const subtotal = cfg.calculations.find((c) => c.name === 'Subtotal');
  ok(/(^|[^\d.])95($|[^\d.])/.test(subtotal?.formula ?? ''),
     'flat+items: constant 95 baked into Subtotal formula', subtotal?.formula);
  // 95 + 8 × 525 = 4295 — flat fee still contributes through the constant.
  ok(headline(cfg) === 4295, 'flat+items: headline Total = 4295 (95 + 8×525)', String(headline(cfg)));
  // The quantity field stays editable — only the FLAT fee became a constant.
  ok(cfg.fields.some((f) => f.type === 'number' && f.default_value === 8),
     'flat+items: per-unit quantity field still editable (rate semantics preserved)');
}

/* ── 3c. basePrice ABSENT (null) + no line items — behaviour unchanged:
 * the editable "Base price" placeholder field remains so the owner has
 * something to fill in. ── */
{
  const cfg = imageTemplateToConfig({
    title: 'Mystery job', basePrice: null, currency: 'USD', addons: [], modifiers: [], notes: null,
  });
  const base = cfg.fields.find((f) => f.label === 'Base price');
  ok(!!base, 'null-base: editable Base price placeholder field still present');
  ok(base?.default_value === 0, 'null-base: placeholder defaults to 0', String(base?.default_value));
}

/* ── 4. Styling: themeHint:'red' → scarlet theme + ctaLabel applied ──
 * The red brand-colour hint should map to the 'scarlet' widget theme.
 * ctaLabel should appear in results.cta_label.
 * businessName should override header.title and config.name. */
{
  const t: ImageTemplate = {
    title: 'Window cleaning',
    basePrice: 150,
    currency: 'USD',
    addons: [],
    modifiers: [],
    notes: null,
    styling: {
      themeHint: 'red',
      businessName: 'SparkleClean LLC',
      tagline: 'Streak-free every time',
      ctaLabel: 'Get My Window Quote',
      trustHints: ['Licensed & Insured', 'Family owned since 2002'],
    },
  };
  const cfg = imageTemplateToConfig(t);

  ok(cfg.theme === 'scarlet', 'styling/red: theme mapped to scarlet', `got ${cfg.theme}`);
  ok(cfg.name === 'SparkleClean LLC', 'styling/red: businessName used as config.name', `got ${cfg.name}`);
  ok(cfg.header.title === 'SparkleClean LLC', 'styling/red: businessName in header.title', `got ${cfg.header.title}`);
  ok(cfg.header.subtitle === 'Streak-free every time', 'styling/red: tagline in header.subtitle', `got ${cfg.header.subtitle}`);
  ok(cfg.results?.cta_label === 'Get My Window Quote', 'styling/red: ctaLabel in results.cta_label', `got ${cfg.results?.cta_label}`);
  const badges = (cfg as any).trustBadges as Array<{ label: string; icon: string }> | undefined;
  ok(Array.isArray(badges) && badges.length === 2, 'styling/red: 2 trust badges', `got ${badges?.length}`);
  ok(badges?.[0]?.label === 'Licensed & Insured', 'styling/red: first trust badge label', `got ${badges?.[0]?.label}`);
  ok(badges?.[0]?.icon === 'shield-check', 'styling/red: trust badge uses shield-check icon');
  // Pricing still correct.
  ok(headline(cfg) === 150, 'styling/red: headline Total = 150 (pricing unaffected)', String(headline(cfg)));
}

/* ── 5. Styling absent → falls back to today's behaviour ──
 * No styling field → theme stays 'light', header uses title, no trust badges,
 * no cta_label. Regression guard: this must be identical to the pre-Wave-65.1
 * output for the same input. */
{
  const t: ImageTemplate = {
    title: 'Gutter cleaning',
    basePrice: 200,
    currency: 'USD',
    addons: [],
    modifiers: [],
    notes: null,
    // No styling field at all.
  };
  const cfg = imageTemplateToConfig(t);

  ok(cfg.theme === 'light', 'no-styling: theme defaults to light', `got ${cfg.theme}`);
  ok(cfg.header.title === 'Gutter cleaning', 'no-styling: title used as header.title', `got ${cfg.header.title}`);
  // Chat rebrand (2026-06-12): customer-facing fallback subtitle de-AI'd.
  ok(cfg.header.subtitle === 'Get your instant quote', 'no-styling: default subtitle', `got ${cfg.header.subtitle}`);
  ok(!cfg.results?.cta_label, 'no-styling: no cta_label in results');
  ok(!(cfg as any).trustBadges, 'no-styling: no trustBadges array');
  ok(headline(cfg) === 200, 'no-styling: headline Total = 200', String(headline(cfg)));
}

/* ── 6. Clarification pass-through — converter must not crash ──
 * The server now passes clarification back in the response body, and the
 * server may also include a best-effort partial template. The converter
 * only gets called on the template — but the ImageTemplate type now
 * carries the clarification field. Verify that imageTemplateToConfig does
 * NOT crash and still returns a valid TemplateConfig when the template
 * itself is partial (only title, no price) even if clarification is present. */
{
  const partialTemplate: ImageTemplate = {
    title: 'Plumbing repair',
    basePrice: null,
    lineItems: [],
    currency: 'USD',
    addons: [],
    modifiers: [],
    notes: null,
    clarification: {
      question: 'Is the $200 price per visit or per hour?',
      options: [
        { label: 'Per visit (flat fee)', hint: 'One fixed price for the job' },
        { label: 'Per hour', hint: 'Hourly rate' },
      ],
    },
  };

  let cfg: ReturnType<typeof imageTemplateToConfig> | undefined;
  let threw = false;
  try {
    cfg = imageTemplateToConfig(partialTemplate);
  } catch {
    threw = true;
  }

  ok(!threw, 'clarification pass-through: converter does not crash on clarification-bearing template');
  ok(!!cfg, 'clarification pass-through: returns a config object');
  ok(cfg?.result_calc === 'Total', 'clarification pass-through: result_calc is Total');
  // With no price data the headline should be 0 (not a crash).
  ok(cfg ? headline(cfg) === 0 : false, 'clarification pass-through: headline Total = 0 (no pricing data)', cfg ? String(headline(cfg)) : 'no cfg');
}

/* ── 7. DEMO CONVERTER — canned template: base + 13% tax on total ──
 * Mirrors the HVAC sample ($89 base + 13% HST).
 * Expected: Total = 89 + (89 * 0.13) = 89 + 11.57 = 100.57 on load.
 * Previously broken: modifiers were toggles defaulting OFF → Total was $89
 * (tax skipped), not $100.57. With the constant-coefficient fix the tax
 * is always included. */
{
  const demoT: DemoImageTemplate = {
    title: 'HVAC Service',
    basePrice: 89,
    currency: 'USD',
    addons: [],
    modifiers: [{ label: 'HST (13%)', type: 'percent', value: 13, appliesTo: 'total' }],
    notes: null,
  };
  const cfg = imageDemoTemplateToConfig(demoT);

  // Helper reusing the headline() pattern but for the demo converter output.
  function demoHeadline(c: typeof cfg): number {
    const ctx: FormulaContext = {};
    for (const f of c.fields) {
      if (f.type === 'number' || f.type === 'slider') {
        ctx[f.name] = typeof f.default_value === 'number' ? f.default_value : 0;
      } else if (f.type === 'toggle') {
        ctx[f.name] = 0; // toggles default OFF in initAnswers
      }
    }
    const { values } = runCalculations(
      c.calculations.map((calc) => ({ id: calc.id, name: calc.name, formula: calc.formula })),
      ctx,
    );
    return values[c.result_calc] ?? 0;
  }

  const total = demoHeadline(cfg);
  const expected = 89 + 89 * 0.13; // 100.57

  ok(cfg.result_calc === 'Total', 'demo/tax: result_calc points at Total');
  // No toggle fields for modifiers — they're baked as constants.
  ok(!cfg.fields.some((f) => f.type === 'toggle'), 'demo/tax: no toggle fields (modifiers are constant)');
  ok(Math.abs(total - expected) < 0.01,
    'demo/tax: headline = base + 13% tax on load (constant-coefficient fix)',
    `got ${total.toFixed(2)}, expected ${expected.toFixed(2)}`);
}

/* ── 8. DEMO CONVERTER — name-reference fix ($0.00 regression guard) ──
 * A bare base with no modifiers must show a non-zero Total (previously
 * the id-vs-name bug caused $0.00). */
{
  const demoT: DemoImageTemplate = {
    title: 'Flat fee', basePrice: 250, currency: 'USD', addons: [], modifiers: [], notes: null,
  };
  const cfg = imageDemoTemplateToConfig(demoT);
  const ctx: FormulaContext = {};
  for (const f of cfg.fields) {
    if (f.type === 'number') ctx[f.name] = typeof f.default_value === 'number' ? f.default_value : 0;
  }
  const { values } = runCalculations(
    cfg.calculations.map((c) => ({ id: c.id, name: c.name, formula: c.formula })), ctx,
  );
  const total = values[cfg.result_calc] ?? 0;
  ok(total === 250, 'demo/name-ref: headline = 250, not $0.00 (id-vs-name fix)', String(total));
}

console.log(`\nimage-template conversion: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
