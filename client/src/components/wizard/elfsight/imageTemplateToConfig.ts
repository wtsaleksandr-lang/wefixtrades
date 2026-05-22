/**
 * BF-5 — Convert the JSON returned by `/api/ai/wizard/image-to-template`
 * (extracted from a quote / invoice image by Claude vision) into a
 * `TemplateConfig` the wizard's `replaceTemplate()` setter can consume.
 *
 * Strategy:
 *  - Title  →   header.title + a single readonly heading row.
 *  - Base   →   one `number` field "Base price" with the extracted default.
 *  - Addons →   each addon → a toggle field (`type: "checkbox"`) or a
 *               quantity number field (`type: "quantity"`) with `on_value`
 *               carrying the unit price.
 *  - Mods   →   each modifier → an extra `toggle` field whose value is
 *               applied multiplicatively (percent) or additively (fixed) in
 *               the result formula.
 *  - Notes  →   results.footnote (truncated to keep the panel readable).
 *
 * Anything the model returned as `null` is gracefully skipped — the
 * resulting calculator stays valid even when only the title was extractable.
 */

import type {
  TemplateConfig,
  TemplateField,
  TemplateCalculation,
  TemplateOption,
} from '@shared/templatePresets';

export interface ImageAddon {
  label: string;
  price: number | null;
  type: 'checkbox' | 'quantity';
}

export interface ImageModifier {
  label: string;
  type: 'percent' | 'fixed';
  value: number;
  appliesTo: 'base' | 'total';
}

export interface ImageTemplate {
  title: string | null;
  basePrice: number | null;
  currency: string;
  addons: ImageAddon[];
  modifiers: ImageModifier[];
  notes: string | null;
}

/* ─── id helpers ─── */
function slugify(raw: string, fallback: string): string {
  const s = raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return s || fallback;
}

function uniqId(seed: string, used: Set<string>): string {
  let id = seed;
  let n = 1;
  while (used.has(id)) {
    id = `${seed}_${++n}`;
  }
  used.add(id);
  return id;
}

/** Turn an extracted vision-template into a `TemplateConfig` the editor
 *  can swap in via `replaceTemplate()`. */
export function imageTemplateToConfig(t: ImageTemplate): TemplateConfig {
  const used = new Set<string>();
  const fields: TemplateField[] = [];
  const calcs: TemplateCalculation[] = [];

  /* ─── Base price field ─── */
  const baseId = uniqId('base_price', used);
  fields.push({
    id: baseId,
    name: baseId,
    label: 'Base price',
    type: 'number',
    required: true,
    default_value: typeof t.basePrice === 'number' ? t.basePrice : 0,
    min: 0,
    step: 1,
    unit: t.currency || 'USD',
  });

  /* ─── Addon fields ─── */
  const addonExprs: string[] = [];
  for (const addon of t.addons ?? []) {
    if (!addon || typeof addon.label !== 'string') continue;
    const price = typeof addon.price === 'number' ? addon.price : 0;
    const labelSeed = slugify(addon.label, 'addon');
    const id = uniqId(`addon_${labelSeed}`, used);

    if (addon.type === 'quantity') {
      fields.push({
        id,
        name: id,
        label: addon.label,
        type: 'number',
        required: false,
        default_value: 0,
        min: 0,
        step: 1,
        on_value: price,
      });
      // value = quantity × unit price
      addonExprs.push(`(${id} * ${price})`);
    } else {
      // checkbox / toggle
      fields.push({
        id,
        name: id,
        label: addon.label,
        type: 'toggle',
        required: false,
        on_value: price,
      });
      // toggle resolves to 0 or 1 (or on_value via engine); use field * price.
      addonExprs.push(`(${id} * ${price})`);
    }
  }

  /* ─── Modifier fields (each rendered as a toggle the owner can flip) ─── */
  // We render modifiers as toggles defaulting to OFF so the owner can decide
  // whether each one applies to a given customer. The result formula consults
  // each toggle and applies percent / fixed transformations accordingly.
  const modifierExprs: { expr: string; appliesTo: 'base' | 'total' }[] = [];
  for (const mod of t.modifiers ?? []) {
    if (!mod || typeof mod.label !== 'string') continue;
    const labelSeed = slugify(mod.label, 'modifier');
    const id = uniqId(`mod_${labelSeed}`, used);
    fields.push({
      id,
      name: id,
      label: mod.label,
      type: 'toggle',
      required: false,
    });
    if (mod.type === 'percent') {
      // (id * value / 100) of base or running subtotal
      modifierExprs.push({
        expr: `(${id} * ${mod.value} / 100)`,
        appliesTo: mod.appliesTo === 'base' ? 'base' : 'total',
      });
    } else {
      modifierExprs.push({
        expr: `(${id} * ${mod.value})`,
        appliesTo: mod.appliesTo === 'base' ? 'base' : 'total',
      });
    }
  }

  /* ─── Calculations ─── */
  // Subtotal = base + addons + (modifiers that apply to base)
  const baseModifiers = modifierExprs.filter((m) => m.appliesTo === 'base');
  const totalModifiers = modifierExprs.filter((m) => m.appliesTo === 'total');

  const subtotalParts = [baseId, ...addonExprs, ...baseModifiers.map((m) => m.expr)];
  const subtotalExpr = subtotalParts.join(' + ');
  const subtotalCalcId = uniqId('subtotal_calc', used);
  calcs.push({
    id: subtotalCalcId,
    name: 'Subtotal',
    formula: subtotalExpr || baseId,
    format: 'currency',
    resultMode: 'secondary',
    showInResults: totalModifiers.length > 0, // hide when redundant with Total
  });

  // Total = subtotal + total modifiers (multiplicative percent against Subtotal
  // collapses to subtotal × (1 + sum_pct/100), but we approximate by adding the
  // pre-computed `(toggle * pct/100) * subtotal` terms. To keep the formula
  // valid against the engine we expand mods relative to the subtotal name.)
  const totalParts = [subtotalCalcId];
  for (const mod of totalModifiers) {
    // multiply the toggle/value expression by the subtotal so percent applies
    // proportionally; fixed mods just add.
    if (mod.expr.includes('/ 100')) {
      totalParts.push(`(${mod.expr} * ${subtotalCalcId})`);
    } else {
      totalParts.push(mod.expr);
    }
  }
  const totalCalcId = uniqId('total_calc', used);
  calcs.push({
    id: totalCalcId,
    name: 'Total',
    formula: totalParts.join(' + '),
    format: 'currency',
    resultMode: 'primary',
  });

  /* ─── Header / results ─── */
  const title = (t.title && t.title.trim()) || 'Your quote';

  // Trim notes — the result panel footnote should be a short line, not a
  // paragraph. Keep up to ~240 chars and break on a sentence boundary.
  let footnote: string | undefined;
  if (t.notes && t.notes.trim()) {
    const raw = t.notes.trim();
    if (raw.length <= 240) {
      footnote = raw;
    } else {
      const cut = raw.slice(0, 240);
      const lastDot = cut.lastIndexOf('. ');
      footnote = (lastDot > 60 ? cut.slice(0, lastDot + 1) : cut) + '…';
    }
  }

  return {
    id: `image_generated_${Date.now().toString(36)}`,
    name: title,
    description: 'Calculator generated from an uploaded quote / invoice image.',
    category: 'general',
    trades: [],
    layout: 'two-column',
    theme: 'qq-classic',
    fields,
    calculations: calcs,
    result_calc: 'Total',
    header: {
      title,
      subtitle: 'Powered by your AI assistant',
      align: 'left',
    },
    results: {
      heading: 'Estimated price',
      footnote,
      show_breakdown: true,
    },
  };
}

/** Custom event the wizard's `WizardShell` listens for to apply the
 *  generated template. The detail carries both the raw extracted JSON
 *  (for analytics / debug) and the converted `TemplateConfig`. */
export const TEMPLATE_GENERATED_EVENT = 'qq-wizard:template-generated';

export interface TemplateGeneratedDetail {
  source: 'image';
  raw: ImageTemplate;
  config: TemplateConfig;
}
