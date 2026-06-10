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

/**
 * Wave 65 — a quantity-driven PRIMARY line item (N windows @ $P each,
 * per-room, per-hour, per-sq-ft). Each becomes an EDITABLE quantity number
 * field defaulting to the quoted count, with unit price baked into the
 * formula — so the customer can change how many units the job covers.
 */
export interface ImageLineItem {
  label: string;
  unitPrice: number | null;
  quantity: number | null;
  unit?: string | null;
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
  lineItems?: ImageLineItem[];
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

  /* ─── Primary product line items (Wave 65) ─── */
  // When the quote prices multiple units/products (N windows @ $P each,
  // per-room, per-hour, …) each becomes an EDITABLE quantity number field
  // defaulting to the quoted count, with the unit price in the formula. The
  // single-flat-service path (basePrice only, no line items) is preserved
  // verbatim below.
  const lineItems = (t.lineItems ?? []).filter(
    (li): li is ImageLineItem =>
      !!li && typeof li.label === 'string' && typeof li.unitPrice === 'number',
  );
  const hasLineItems = lineItems.length > 0;

  /* ─── Base price field ───
   * Always present for the single-service case. When line items drive the
   * price we still keep a base field for any flat charge the AI returned
   * (basePrice), but default it to 0 if the AI (correctly) left it null —
   * the prompt instructs basePrice=null when line items are used. */
  const baseId = uniqId('base_price', used);
  const baseDefault = typeof t.basePrice === 'number' ? t.basePrice : 0;
  // Skip a $0 base field entirely when line items carry the whole price, so
  // the customer isn't shown a redundant "Base price: 0" input.
  const includeBaseField = !hasLineItems || baseDefault > 0;
  if (includeBaseField) {
    fields.push({
      id: baseId,
      name: baseId,
      label: hasLineItems ? 'Base / call-out fee' : 'Base price',
      type: 'number',
      required: !hasLineItems,
      default_value: baseDefault,
      min: 0,
      step: 1,
      unit: t.currency || 'USD',
    });
  }

  /* Per-line-item quantity fields + formula terms (qty × unit price). */
  const lineItemExprs: string[] = [];
  for (const li of lineItems) {
    const unitPrice = li.unitPrice as number; // narrowed by the filter above
    const qty =
      typeof li.quantity === 'number' && isFinite(li.quantity) && li.quantity > 0
        ? li.quantity
        : 1; // trust: default to the quoted count, never 0
    const labelSeed = slugify(li.label, 'item');
    const id = uniqId(`item_${labelSeed}`, used);
    const unitSuffix = li.unit && li.unit.trim() ? ` (${li.unit.trim()})` : '';
    fields.push({
      id,
      name: id,
      label: `${li.label}${unitSuffix}`,
      type: 'number',
      required: false,
      default_value: qty, // editable: customer can change the count
      min: 0,
      step: 1,
      help: `$${unitPrice} each`,
    });
    lineItemExprs.push(`(${id} * ${unitPrice})`);
  }

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
        // Trust: default a quantity add-on to 1 (not 0) so the preview
        // reflects a realistic job total immediately; customer adjusts.
        default_value: 1,
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
  // Subtotal = base (if present) + line items + addons + (base modifiers)
  const baseModifiers = modifierExprs.filter((m) => m.appliesTo === 'base');
  const totalModifiers = modifierExprs.filter((m) => m.appliesTo === 'total');

  const subtotalParts = [
    ...(includeBaseField ? [baseId] : []),
    ...lineItemExprs,
    ...addonExprs,
    ...baseModifiers.map((m) => m.expr),
  ];
  const subtotalExpr = subtotalParts.join(' + ');
  const subtotalCalcId = uniqId('subtotal_calc', used);
  const subtotalName = 'Subtotal';
  calcs.push({
    id: subtotalCalcId,
    name: subtotalName,
    // Fall back to 0 (not an undefined id) when nothing priced was extracted.
    formula: subtotalExpr || '0',
    format: 'currency',
    resultMode: 'secondary',
    showInResults: totalModifiers.length > 0, // hide when redundant with Total
  });

  // Total = Subtotal + total modifiers.
  // CRITICAL (the "$0.00 headline" fix): the formula engine chains calcs BY
  // NAME (runCalculations seeds ctx[calc.name]), so a later calc must
  // reference an earlier one by its NAME, never its id. Referencing the
  // subtotal calc's *id* left it undefined → resolved to 0 → the headline
  // Total read $0.00 even though Subtotal computed correctly. Use the
  // bracketed name form `[Subtotal]` so the engine resolves the real value.
  const subtotalRef = `[${subtotalName}]`;
  const totalParts = [subtotalRef];
  for (const mod of totalModifiers) {
    // multiply the toggle/value expression by the subtotal so percent applies
    // proportionally; fixed mods just add.
    if (mod.expr.includes('/ 100')) {
      totalParts.push(`(${mod.expr} * ${subtotalRef})`);
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
    resultMode: 'primary', // headline: drives the big "Estimated price" number
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
