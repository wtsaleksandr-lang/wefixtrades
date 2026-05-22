/**
 * BI-1 — Anonymous AI demo template normalisation.
 *
 * Bridges the BI-1 `/api/ai/demo/image-to-template-anonymous` JSON output
 * (basePrice + addons + modifiers + notes) into shapes the rest of the
 * codebase already understands:
 *
 *   - `imageDemoTemplateToConfig(t)` → the same `TemplateConfig` shape the
 *     BF-5 wizard converter (`imageTemplateToConfig`) emits, so we can run
 *     it through `toAdvancedConfig()` and feed an `AdvancedCalculator`.
 *
 *   - `buildCalculatorFromDemoTemplate(t, businessName)` → a
 *     `{ pricing_config, calculator_settings, business_name, trade_type }`
 *     bundle the signup handoff can hand straight to `createCalculator()`
 *     when materialising a real calculator on a freshly created account.
 *
 * NOTE: this lives in `shared/` so the server signup-handoff and the
 * client preview page can both import it. It MUST NOT import from
 * `server/` or `client/`. Only `shared/templatePresets` is allowed.
 */

import {
  toAdvancedConfig,
  type TemplateConfig,
  type TemplateField,
  type TemplateCalculation,
  type AdvancedConfigShape,
} from "./templatePresets";

/* ─── Wire format — must match server/routes/aiDemoRoutes.ts ────────── */
export interface DemoImageAddon {
  label: string;
  price: number | null;
  type: "checkbox" | "quantity";
}

export interface DemoImageModifier {
  label: string;
  type: "percent" | "fixed";
  value: number;
  appliesTo: "base" | "total";
}

export interface DemoImageTemplate {
  title: string | null;
  basePrice: number | null;
  currency: string;
  addons: DemoImageAddon[];
  modifiers: DemoImageModifier[];
  notes: string | null;
}

/* ─── id helpers (copy of imageTemplateToConfig — keep in sync) ─────── */
function slugifyIdSeed(raw: string, fallback: string): string {
  const s = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
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

/**
 * Convert the BI-1 demo extraction into a `TemplateConfig`. Functionally a
 * copy of the BF-5 wizard's `imageTemplateToConfig` so the rendered preview
 * matches what the auth'd image-to-template flow produces — that gives the
 * "look how nice this is once you sign up!" promise teeth.
 */
export function imageDemoTemplateToConfig(t: DemoImageTemplate): TemplateConfig {
  const used = new Set<string>();
  const fields: TemplateField[] = [];
  const calcs: TemplateCalculation[] = [];

  /* ─── Base price field ─── */
  const baseId = uniqId("base_price", used);
  fields.push({
    id: baseId,
    name: baseId,
    label: "Base price",
    type: "number",
    required: true,
    default_value: typeof t.basePrice === "number" ? t.basePrice : 0,
    min: 0,
    step: 1,
    unit: t.currency || "USD",
  });

  /* ─── Addon fields ─── */
  const addonExprs: string[] = [];
  for (const addon of t.addons ?? []) {
    if (!addon || typeof addon.label !== "string") continue;
    const price = typeof addon.price === "number" ? addon.price : 0;
    const labelSeed = slugifyIdSeed(addon.label, "addon");
    const id = uniqId(`addon_${labelSeed}`, used);

    if (addon.type === "quantity") {
      fields.push({
        id,
        name: id,
        label: addon.label,
        type: "number",
        required: false,
        default_value: 0,
        min: 0,
        step: 1,
        on_value: price,
      });
      addonExprs.push(`(${id} * ${price})`);
    } else {
      fields.push({
        id,
        name: id,
        label: addon.label,
        type: "toggle",
        required: false,
        on_value: price,
      });
      addonExprs.push(`(${id} * ${price})`);
    }
  }

  /* ─── Modifier fields ─── */
  const modifierExprs: { expr: string; appliesTo: "base" | "total" }[] = [];
  for (const mod of t.modifiers ?? []) {
    if (!mod || typeof mod.label !== "string") continue;
    const labelSeed = slugifyIdSeed(mod.label, "modifier");
    const id = uniqId(`mod_${labelSeed}`, used);
    fields.push({
      id,
      name: id,
      label: mod.label,
      type: "toggle",
      required: false,
    });
    if (mod.type === "percent") {
      modifierExprs.push({
        expr: `(${id} * ${mod.value} / 100)`,
        appliesTo: mod.appliesTo === "base" ? "base" : "total",
      });
    } else {
      modifierExprs.push({
        expr: `(${id} * ${mod.value})`,
        appliesTo: mod.appliesTo === "base" ? "base" : "total",
      });
    }
  }

  /* ─── Calculations ─── */
  const baseModifiers = modifierExprs.filter((m) => m.appliesTo === "base");
  const totalModifiers = modifierExprs.filter((m) => m.appliesTo === "total");

  const subtotalParts = [baseId, ...addonExprs, ...baseModifiers.map((m) => m.expr)];
  const subtotalExpr = subtotalParts.join(" + ");
  const subtotalCalcId = uniqId("subtotal_calc", used);
  calcs.push({
    id: subtotalCalcId,
    name: "Subtotal",
    formula: subtotalExpr || baseId,
    format: "currency",
    resultMode: "secondary",
    showInResults: totalModifiers.length > 0,
  });

  const totalParts = [subtotalCalcId];
  for (const mod of totalModifiers) {
    if (mod.expr.includes("/ 100")) {
      totalParts.push(`(${mod.expr} * ${subtotalCalcId})`);
    } else {
      totalParts.push(mod.expr);
    }
  }
  const totalCalcId = uniqId("total_calc", used);
  calcs.push({
    id: totalCalcId,
    name: "Total",
    formula: totalParts.join(" + "),
    format: "currency",
    resultMode: "primary",
  });

  /* ─── Header / results ─── */
  const title = (t.title && t.title.trim()) || "Your quote";

  let footnote: string | undefined;
  if (t.notes && t.notes.trim()) {
    const raw = t.notes.trim();
    if (raw.length <= 240) {
      footnote = raw;
    } else {
      const cut = raw.slice(0, 240);
      const lastDot = cut.lastIndexOf(". ");
      footnote = (lastDot > 60 ? cut.slice(0, lastDot + 1) : cut) + "…";
    }
  }

  return {
    id: `image_demo_${Date.now().toString(36)}`,
    name: title,
    description: "Calculator generated from an uploaded quote / invoice image.",
    category: "general",
    trades: [],
    layout: "two-column",
    theme: "qq-classic",
    fields,
    calculations: calcs,
    result_calc: "Total",
    header: {
      title,
      subtitle: "Powered by your AI assistant",
      align: "left",
    },
    results: {
      heading: "Estimated price",
      footnote,
      show_breakdown: true,
    },
  };
}

/**
 * Bundle used by the signup handoff and the preview page. Both need the
 * same shape; centralising it here keeps the two call sites honest.
 */
export interface DemoCalculatorBundle {
  business_name: string;
  trade_type: string;
  pricing_config: Record<string, unknown>;
  calculator_settings: { advanced: AdvancedConfigShape };
  primary_color: string;
}

/**
 * Convert a demo template + business name into a `createCalculator()`
 * payload. We default `pricing_config` to an empty object because the
 * advanced config (with `enabled: true`) is what actually drives the
 * widget — the legacy `pricing_config` field is required-non-null by the
 * DB but is unused on the `advanced` code path.
 */
export function buildCalculatorFromDemoTemplate(
  t: DemoImageTemplate,
  businessName: string,
): DemoCalculatorBundle {
  const tplConfig = imageDemoTemplateToConfig(t);
  const advanced = toAdvancedConfig(tplConfig);
  return {
    business_name: businessName,
    trade_type: "general",
    // The `advanced` branch in calculator_settings is what actually drives
    // the widget; the legacy `pricing_config` column is still required
    // non-null by the DB, so we seed it with a valid CALL_FOR_QUOTE shape.
    pricing_config: { pricingType: "call_for_quote_only", message: "Request a quote" },
    calculator_settings: { advanced },
    primary_color: "#0d3cfc",
  };
}
