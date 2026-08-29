/**
 * QuoteQuick pricing-engine guard — `shared/calculateEstimate.ts`.
 *
 * This file computes EVERY price the simple (non-formula) QuoteQuick widget
 * shows a homeowner, and — after the Wave QQ-INT recompute — every price the
 * server persists on a lead. It had zero test coverage. A silent regression
 * here is a wrong customer quote, so the contract is pinned explicitly:
 *
 *   - all 10 pricing models in PRICING_TYPES produce the documented total
 *   - the applyModifiers() stack composes in a FIXED order:
 *       base/unit subtotal → travel fee → after-hours ×  → difficulty ×
 *       → add-ons (pct computed on the post-multiplier running total,
 *         NON-compounding between add-ons) → minimum-charge clamp
 *   - an invalid/unparseable config degrades to call_for_quote, never to a
 *     wrong number (validatePricingConfig → CALL_FOR_QUOTE_FALLBACK)
 *   - hostile / missing / non-finite inputs can never produce NaN, Infinity
 *     or a negative total
 *
 * Runnable standalone via:
 *   npx tsx shared/calculateEstimate.test.ts
 * Wired into CI as `npm run check:calculate-estimate` (.github/workflows/ci.yml).
 *
 * DB-free: imports only pure functions. Sets a dummy DATABASE_URL first
 * (defensive, mirrors the house convention) so a future transitive server
 * import can never make this hang.
 *
 * Excluded from `tsc --noEmit` via the project tsconfig's **\/*.test.ts pattern.
 * Uses node:assert/strict, no test runner dependency.
 */
import assert from "node:assert/strict";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
}

import { calculateEstimate, type EstimateResult } from "./calculateEstimate";
import { PRICING_TYPES, CALL_FOR_QUOTE_FALLBACK } from "./pricingConfig";

let checks = 0;
function check(cond: unknown, msg: string): void {
  checks++;
  assert.ok(cond, msg);
}
function eq<T>(actual: T, expected: T, msg: string): void {
  checks++;
  assert.equal(actual, expected, msg);
}

/** Sum of a result's breakdown lines — used to assert breakdown integrity. */
function breakdownSum(r: EstimateResult): number {
  return Math.round(r.breakdown.reduce((s, l) => s + l.amount, 0) * 100) / 100;
}

function main() {
  /* ══════════════════════════════════════════════════════════════════
   * 1. Every pricing model in PRICING_TYPES is actually handled.
   * A new model added to the enum without a switch arm would silently
   * fall through to `default:` → call_for_quote → $0 quotes.
   * ══════════════════════════════════════════════════════════════════ */
  {
    const minimalConfigs: Record<string, any> = {
      hourly: { pricingType: "hourly", unitName: "hour", rate: 100 },
      per_unit: { pricingType: "per_unit", unitName: "room", rate: 50 },
      per_sqft: { pricingType: "per_sqft", unitName: "sq ft", rate: 3 },
      per_linear_ft: { pricingType: "per_linear_ft", unitName: "linear ft", rate: 12 },
      base_plus_rate: { pricingType: "base_plus_rate", unitName: "panel", baseFee: 200, rate: 25 },
      tiered_packages: {
        pricingType: "tiered_packages", tierMode: "fixed",
        tiers: [{ label: "Basic", price: 300 }, { label: "Premium", price: 900 }],
      },
      tiered_ranges: {
        pricingType: "tiered_ranges", tierMode: "fixed", unitName: "window",
        tiers: [{ min: 1, max: 10, price: 400 }, { min: 11, max: null, price: 900 }],
      },
      min_charge_plus_addons: { pricingType: "min_charge_plus_addons", minCharge: 150 },
      price_range_only: { pricingType: "price_range_only", rangeMin: 500, rangeMax: 1500 },
      call_for_quote_only: { pricingType: "call_for_quote_only", message: "Call us" },
    };

    for (const t of PRICING_TYPES) {
      check(minimalConfigs[t] !== undefined, `test fixture exists for pricing model "${t}"`);
      const r = calculateEstimate(minimalConfigs[t], { quantity: 2 });
      if (t === "call_for_quote_only") {
        eq(r.type, "call_for_quote", `${t} → type call_for_quote`);
      } else if (t === "price_range_only") {
        eq(r.type, "range", `${t} → type range`);
      } else {
        eq(r.type, "exact", `${t} → type exact (not silently falling through to default)`);
        check(r.total > 0, `${t} produces a positive total, not a $0 fall-through`);
      }
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   * 2. Per-model arithmetic.
   * ══════════════════════════════════════════════════════════════════ */

  /* ─── hourly ─── */
  {
    const cfg = { pricingType: "hourly", unitName: "hour", rate: 125, baseFee: 75 };
    const r = calculateEstimate(cfg, { quantity: 3 });
    eq(r.total, 450, "hourly: baseFee 75 + 3h × $125 = 450");
    eq(r.breakdown[0].label, "Setup / Dispatch Fee", "hourly: base fee line is labelled Setup / Dispatch Fee");
    eq(r.breakdown[0].amount, 75, "hourly: base fee line carries the fee");
    eq(r.breakdown[1].amount, 375, "hourly: unit line = rate × qty");
    eq(breakdownSum(r), r.total, "hourly: breakdown lines sum to the total");

    // A zero base fee is omitted from the breakdown entirely (`if (base > 0)`).
    const noBase = calculateEstimate({ ...cfg, baseFee: 0 }, { quantity: 2 });
    eq(noBase.total, 250, "hourly: zero base fee → pure rate × qty");
    eq(noBase.breakdown.length, 1, "hourly: a $0 base fee produces no breakdown line");
  }

  /* ─── per_unit / per_sqft / per_linear_ft share one code path ─── */
  {
    const perUnit = calculateEstimate(
      { pricingType: "per_unit", unitName: "room", rate: 60, baseFee: 40 },
      { quantity: 5 },
    );
    eq(perUnit.total, 340, "per_unit: 40 + 5 × 60 = 340");

    const perSqft = calculateEstimate(
      { pricingType: "per_sqft", unitName: "sq ft", rate: 2.5 },
      { quantity: 1200 },
    );
    eq(perSqft.total, 3000, "per_sqft: 1200 sq ft × $2.50 = 3000");

    const perLinear = calculateEstimate(
      { pricingType: "per_linear_ft", unitName: "linear ft", rate: 18 },
      { quantity: 60 },
    );
    eq(perLinear.total, 1080, "per_linear_ft: 60 ft × $18 = 1080");
  }

  /* ─── base_plus_rate: baseFee is REQUIRED and always listed ─── */
  {
    const r = calculateEstimate(
      { pricingType: "base_plus_rate", unitName: "panel", baseFee: 500, rate: 30 },
      { quantity: 12 },
    );
    eq(r.total, 860, "base_plus_rate: 500 + 12 × 30 = 860");
    eq(r.breakdown[0].label, "Base Fee", "base_plus_rate: always emits the Base Fee line");

    // Unlike hourly/per_unit, a ZERO base fee is still listed here (the field
    // is required by the schema, so the `if (base > 0)` guard does not apply).
    const zeroBase = calculateEstimate(
      { pricingType: "base_plus_rate", unitName: "panel", baseFee: 0, rate: 30 },
      { quantity: 2 },
    );
    eq(zeroBase.breakdown[0].amount, 0, "base_plus_rate: a $0 base fee IS still listed (differs from hourly)");
    eq(zeroBase.total, 60, "base_plus_rate: $0 base fee → rate × qty");
  }

  /* ─── tiered_packages: selection by index, quantity IGNORED ─── */
  {
    const cfg = {
      pricingType: "tiered_packages", tierMode: "fixed",
      tiers: [{ label: "Basic", price: 300 }, { label: "Standard", price: 600 }, { label: "Premium", price: 1200 }],
    };
    eq(calculateEstimate(cfg, { selectedTierIndex: 2 }).total, 1200, "tiered_packages: index 2 → Premium 1200");
    eq(calculateEstimate(cfg, {}).total, 300, "tiered_packages: no index → first tier");

    // Quantity must NOT scale a fixed package price.
    eq(
      calculateEstimate(cfg, { selectedTierIndex: 1, quantity: 99 }).total, 600,
      "tiered_packages: quantity is ignored — a package is a flat price",
    );

    // Out-of-range / hostile indices clamp to the first tier rather than
    // reading undefined and producing NaN.
    eq(calculateEstimate(cfg, { selectedTierIndex: 99 }).total, 300, "tiered_packages: index past the end → first tier");
    eq(calculateEstimate(cfg, { selectedTierIndex: -1 }).total, 300, "tiered_packages: negative index → first tier");
    eq(
      calculateEstimate(cfg, { selectedTierIndex: NaN as number }).total, 300,
      "tiered_packages: NaN index → first tier, never NaN total",
    );
  }

  /* ─── tiered_ranges: quantity selects the band ─── */
  {
    const cfg = {
      pricingType: "tiered_ranges", tierMode: "fixed", unitName: "window",
      tiers: [
        { min: 1, max: 5, price: 250 },
        { min: 6, max: 20, price: 800 },
        { min: 21, max: null, price: 2000 },
      ],
    };
    eq(calculateEstimate(cfg, { quantity: 3 }).total, 250, "tiered_ranges: qty 3 → band 1-5");
    eq(calculateEstimate(cfg, { quantity: 5 }).total, 250, "tiered_ranges: band max is INCLUSIVE");
    eq(calculateEstimate(cfg, { quantity: 6 }).total, 800, "tiered_ranges: band min is INCLUSIVE");
    eq(calculateEstimate(cfg, { quantity: 5000 }).total, 2000, "tiered_ranges: max:null is an open-ended top band");

    // A quantity that falls in a GAP between bands must degrade to
    // call_for_quote — never to $0 and never to a neighbouring band's price.
    const gapCfg = {
      pricingType: "tiered_ranges", tierMode: "fixed", unitName: "window",
      tiers: [{ min: 1, max: 5, price: 250 }, { min: 20, max: null, price: 2000 }],
    };
    const gap = calculateEstimate(gapCfg, { quantity: 12 });
    eq(gap.type, "call_for_quote", "tiered_ranges: a quantity in a band GAP → call_for_quote");
    eq(gap.total, 0, "tiered_ranges: unmatched quantity totals 0, not a guessed price");
    eq(gap.callUs, true, "tiered_ranges: unmatched quantity sets callUs");

    // Below the lowest band is likewise unmatched. Note qty is clamped to a
    // positive number first, so quantity:0 becomes 1 and DOES match here.
    eq(
      calculateEstimate(gapCfg, { quantity: 0 }).total, 250,
      "tiered_ranges: quantity 0 is clamped to 1 and matches the first band",
    );

    /* FINDING (pinned, not endorsed): band matching is a linear `.find()`, so
     * OVERLAPPING bands resolve to whichever appears FIRST in the array, not
     * the narrowest or cheapest. Config order is therefore price-significant.
     * The wizard writes bands in ascending order so this is latent, not live. */
    const overlap = {
      pricingType: "tiered_ranges", tierMode: "fixed", unitName: "window",
      tiers: [{ min: 1, max: 100, price: 999 }, { min: 1, max: 5, price: 250 }],
    };
    eq(
      calculateEstimate(overlap, { quantity: 3 }).total, 999,
      "tiered_ranges: overlapping bands resolve by ARRAY ORDER (first match wins)",
    );
  }

  /* ─── min_charge_plus_addons ─── */
  {
    const cfg = {
      pricingType: "min_charge_plus_addons", minCharge: 200,
      addOns: [{ id: "haul", label: "Haul-away", type: "fixed", amount: 75 }],
    };
    eq(calculateEstimate(cfg, {}).total, 200, "min_charge_plus_addons: bare minimum charge");
    eq(
      calculateEstimate(cfg, { selectedAddOnIds: ["haul"] }).total, 275,
      "min_charge_plus_addons: 200 + 75 add-on",
    );
  }

  /* ─── price_range_only ─── */
  {
    const r = calculateEstimate({ pricingType: "price_range_only", rangeMin: 800, rangeMax: 2400 }, {});
    eq(r.type, "range", "price_range_only → type range");
    eq(r.rangeMin, 800, "price_range_only: rangeMin surfaced");
    eq(r.rangeMax, 2400, "price_range_only: rangeMax surfaced");
    eq(r.total, 1600, "price_range_only: total is the midpoint");

    /* FINDING (pinned): the midpoint uses Math.round() to a WHOLE DOLLAR,
     * while every other model rounds to cents. An odd-cent range therefore
     * reports a dollar-rounded midpoint. Harmless (it is an advisory band,
     * not a charge) but it is a real inconsistency. */
    eq(
      calculateEstimate({ pricingType: "price_range_only", rangeMin: 100, rangeMax: 101 }, {}).total, 101,
      "price_range_only: midpoint rounds to whole dollars (100.5 → 101), unlike every other model",
    );

    // rangeMax < rangeMin is rejected by validatePricingConfig → fallback.
    const inverted = calculateEstimate({ pricingType: "price_range_only", rangeMin: 900, rangeMax: 100 }, {});
    eq(inverted.type, "call_for_quote", "price_range_only: inverted range is rejected → call_for_quote");
  }

  /* ─── call_for_quote_only ─── */
  {
    const r = calculateEstimate({ pricingType: "call_for_quote_only", message: "Ring us" }, { quantity: 10 });
    eq(r.type, "call_for_quote", "call_for_quote_only → type call_for_quote");
    eq(r.total, 0, "call_for_quote_only: total is 0");
    eq(r.callUs, true, "call_for_quote_only: callUs is always true");
    eq(r.message, "Ring us", "call_for_quote_only: owner message surfaced");
    eq(r.breakdown.length, 0, "call_for_quote_only: no breakdown lines");
  }

  /* ══════════════════════════════════════════════════════════════════
   * 3. applyModifiers() — the shared modifier stack.
   * Composition ORDER is the contract: a change here silently reprices
   * every calculator that uses a multiplier or a percentage add-on.
   * ══════════════════════════════════════════════════════════════════ */

  /* ─── travel fee ─── */
  {
    const r = calculateEstimate(
      { pricingType: "per_unit", unitName: "room", rate: 100, travelFee: 45 },
      { quantity: 2 },
    );
    eq(r.total, 245, "travelFee: added to the subtotal");
    check(
      r.breakdown.some(l => l.label === "Travel / Service Fee" && l.amount === 45),
      "travelFee: emits its own breakdown line",
    );
    // A zero travel fee must not emit a noise line.
    const zero = calculateEstimate(
      { pricingType: "per_unit", unitName: "room", rate: 100, travelFee: 0 }, { quantity: 1 },
    );
    check(!zero.breakdown.some(l => l.label === "Travel / Service Fee"), "travelFee: $0 emits no line");
  }

  /* ─── after-hours multiplier ─── */
  {
    const cfg = { pricingType: "hourly", unitName: "hour", rate: 100, afterHoursMult: 1.5 };
    eq(calculateEstimate(cfg, { quantity: 2, isAfterHours: false }).total, 200, "afterHours: off → no uplift");
    eq(calculateEstimate(cfg, { quantity: 2, isAfterHours: true }).total, 300, "afterHours: 1.5× on a $200 subtotal → 300");

    // The multiplier applies AFTER the travel fee, so the fee is uplifted too.
    eq(
      calculateEstimate({ ...cfg, travelFee: 100 }, { quantity: 2, isAfterHours: true }).total, 450,
      "afterHours: applies to (subtotal + travelFee) — (200+100) × 1.5 = 450",
    );

    // A multiplier of exactly 1 is a no-op and emits no line.
    const unity = calculateEstimate(
      { pricingType: "hourly", unitName: "hour", rate: 100, afterHoursMult: 1 },
      { quantity: 1, isAfterHours: true },
    );
    eq(unity.total, 100, "afterHours: ×1 is a no-op");
    check(!unity.breakdown.some(l => l.label.startsWith("After-Hours")), "afterHours: ×1 emits no line");
  }

  /* ─── difficulty tiers ─── */
  {
    const cfg = {
      pricingType: "per_unit", unitName: "room", rate: 100,
      difficultyTiers: [
        { id: "easy", label: "Easy access", multiplier: 1 },
        { id: "hard", label: "Difficult access", multiplier: 1.25 },
      ],
    };
    eq(calculateEstimate(cfg, { quantity: 4, selectedDifficultyId: "hard" }).total, 500, "difficulty: 400 × 1.25 = 500");
    eq(calculateEstimate(cfg, { quantity: 4, selectedDifficultyId: "easy" }).total, 400, "difficulty: ×1 tier is a no-op");
    eq(
      calculateEstimate(cfg, { quantity: 4, selectedDifficultyId: "does-not-exist" }).total, 400,
      "difficulty: an unknown id is ignored, never NaN",
    );

    // After-hours and difficulty COMPOUND (both multiply the running total).
    eq(
      calculateEstimate({ ...cfg, afterHoursMult: 2 }, { quantity: 1, isAfterHours: true, selectedDifficultyId: "hard" }).total,
      250,
      "difficulty + afterHours COMPOUND: 100 × 2 × 1.25 = 250",
    );
  }

  /* ─── add-ons: fixed and percentage ─── */
  {
    const cfg = {
      pricingType: "per_unit", unitName: "room", rate: 100,
      addOns: [
        { id: "deep", label: "Deep clean", type: "pct", amount: 20 },
        { id: "supplies", label: "Supplies", type: "fixed", amount: 35 },
      ],
    };
    eq(calculateEstimate(cfg, { quantity: 2 }).total, 200, "add-ons: none selected → subtotal unchanged");
    eq(calculateEstimate(cfg, { quantity: 2, selectedAddOnIds: ["supplies"] }).total, 235, "add-ons: fixed adds a flat amount");
    eq(calculateEstimate(cfg, { quantity: 2, selectedAddOnIds: ["deep"] }).total, 240, "add-ons: pct 20% of 200 = 40");

    /* Percentage add-ons are NON-COMPOUNDING: every selected pct is computed
     * against the SAME pre-add-on running total, not against each other. */
    const both = calculateEstimate(cfg, { quantity: 2, selectedAddOnIds: ["deep", "supplies"] });
    eq(both.total, 275, "add-ons: pct is computed on the PRE-add-on total (200×20% + 35), not compounded");

    // The pct base is the POST-multiplier total, so a multiplier inflates it.
    eq(
      calculateEstimate({ ...cfg, afterHoursMult: 2 }, { quantity: 1, isAfterHours: true, selectedAddOnIds: ["deep"] }).total,
      240,
      "add-ons: pct base is the post-multiplier total — (100×2) + 20% = 240",
    );

    // Unknown / empty selections are ignored rather than throwing.
    eq(calculateEstimate(cfg, { quantity: 1, selectedAddOnIds: ["nope"] }).total, 100, "add-ons: unknown id ignored");
    eq(calculateEstimate(cfg, { quantity: 1, selectedAddOnIds: [] }).total, 100, "add-ons: empty selection ignored");

    // A pct add-on line reports the computed dollars, with the % in the label.
    const pctLine = calculateEstimate(cfg, { quantity: 2, selectedAddOnIds: ["deep"] })
      .breakdown.find(l => l.label.startsWith("Deep clean"));
    check(pctLine !== undefined, "add-ons: pct add-on emits a breakdown line");
    eq(pctLine!.label, "Deep clean (20%)", "add-ons: pct label carries the percentage");
    eq(pctLine!.amount, 40, "add-ons: pct line reports DOLLARS, not the percentage");
  }

  /* ─── minimum-charge clamp ─── */
  {
    const cfg = { pricingType: "per_unit", unitName: "room", rate: 10, minCharge: 150 };
    eq(calculateEstimate(cfg, { quantity: 2 }).total, 150, "minCharge: a below-minimum job is raised to the minimum");
    eq(calculateEstimate(cfg, { quantity: 40 }).total, 400, "minCharge: an above-minimum job is untouched");
    eq(
      calculateEstimate(cfg, { quantity: 15 }).total, 150,
      "minCharge: exactly at the minimum is not double-applied",
    );
    check(
      calculateEstimate(cfg, { quantity: 2 }).breakdown.some(l => l.label === "Minimum charge applied"),
      "minCharge: emits an explicit 'Minimum charge applied' line",
    );

    // The clamp runs LAST — after add-ons — so add-ons count toward the minimum
    // rather than stacking on top of it.
    const withAddon = calculateEstimate(
      { ...cfg, addOns: [{ id: "x", label: "Extra", type: "fixed", amount: 50 }] },
      { quantity: 2, selectedAddOnIds: ["x"] },
    );
    eq(withAddon.total, 150, "minCharge: clamp runs AFTER add-ons (20 + 50 = 70 → clamped to 150)");
  }

  /* ─── callUsThreshold ─── */
  {
    const cfg = { pricingType: "per_unit", unitName: "room", rate: 100, callUsThreshold: 1000 };
    eq(calculateEstimate(cfg, { quantity: 5 }).callUs, false, "callUsThreshold: below the threshold → callUs false");
    eq(calculateEstimate(cfg, { quantity: 10 }).callUs, true, "callUsThreshold: exactly at the threshold trips it (>=)");
    eq(calculateEstimate(cfg, { quantity: 20 }).callUs, true, "callUsThreshold: above the threshold → callUs true");

    // Absent threshold never trips.
    eq(
      calculateEstimate({ pricingType: "per_unit", unitName: "room", rate: 100 }, { quantity: 999 }).callUs,
      false,
      "callUsThreshold: undefined → callUs never trips regardless of size",
    );

    // The threshold is evaluated on the POST-modifier total.
    eq(
      calculateEstimate({ ...cfg, travelFee: 600 }, { quantity: 5 }).callUs, true,
      "callUsThreshold: evaluated on the final total, modifiers included",
    );

    /* FINDING (pinned, not endorsed): a threshold of 0 makes EVERY quote a
     * "call us" quote, because the comparison is `total >= 0`. The schema
     * permits 0 (z.number().min(0)), so a user who types 0 meaning "disabled"
     * silently suppresses all their prices. */
    eq(
      calculateEstimate({ pricingType: "per_unit", unitName: "room", rate: 100, callUsThreshold: 0 }, { quantity: 1 }).callUs,
      true,
      "callUsThreshold: 0 suppresses EVERY price (total >= 0 is always true)",
    );

    // price_range_only compares the range's TOP against the threshold.
    eq(
      calculateEstimate({ pricingType: "price_range_only", rangeMin: 100, rangeMax: 5000, callUsThreshold: 1000 }, {}).callUs,
      true,
      "callUsThreshold: price_range_only trips on rangeMax, not the midpoint",
    );
  }

  /* ══════════════════════════════════════════════════════════════════
   * 4. Hostile / missing input — must never yield NaN, Infinity or a
   *    negative price. These are the cases that would put a garbage
   *    number in front of a real customer.
   * ══════════════════════════════════════════════════════════════════ */
  {
    const cfg = { pricingType: "per_unit", unitName: "room", rate: 100 };
    const hostile: Array<[string, any]> = [
      ["undefined quantity", undefined],
      ["null quantity", null],
      ["NaN quantity", NaN],
      ["Infinity quantity", Infinity],
      ["-Infinity quantity", -Infinity],
      ["negative quantity", -5],
      ["zero quantity", 0],
      ["string quantity", "12" as any],
    ];
    for (const [label, quantity] of hostile) {
      const r = calculateEstimate(cfg, { quantity: quantity as number });
      check(Number.isFinite(r.total), `${label}: total is finite`);
      check(r.total >= 0, `${label}: total is never negative`);
    }
    // Every non-positive / non-finite quantity is normalised to 1.
    eq(calculateEstimate(cfg, { quantity: NaN }).total, 100, "NaN quantity → treated as 1");
    eq(calculateEstimate(cfg, { quantity: -5 }).total, 100, "negative quantity → treated as 1");
    eq(calculateEstimate(cfg, { quantity: 0 }).total, 100, "zero quantity → treated as 1");
    eq(calculateEstimate(cfg, { quantity: Infinity }).total, 100, "Infinity quantity → treated as 1");

    /* A string quantity is NOT normalised — `Number.isFinite("12")` is false,
     * so it falls to 1 rather than being coerced to 12. Pinned so a future
     * "helpful" coercion is a deliberate change, not an accident. */
    eq(calculateEstimate(cfg, { quantity: "12" as any }).total, 100, 'string quantity "12" → 1, not 12');
  }

  /* ─── NaN clamping in the modifier stack ─── */
  {
    // A NaN reaching the arithmetic is clamped to 0 by the applyModifiers
    // guard rather than being rendered as "$NaN" to a homeowner.
    const r = calculateEstimate(
      { pricingType: "min_charge_plus_addons", minCharge: 100, travelFee: NaN as any },
      {},
    );
    check(Number.isFinite(r.total), "NaN travelFee: total stays finite (clamped, never $NaN)");
    check(r.total >= 0, "NaN travelFee: total is not negative");
  }

  /* ══════════════════════════════════════════════════════════════════
   * 5. Invalid config degrades SAFELY to call_for_quote.
   * The critical property: a broken config must never produce a
   * confident WRONG price — it must refuse to quote.
   * ══════════════════════════════════════════════════════════════════ */
  {
    const invalid: Array<[string, unknown]> = [
      ["null", null],
      ["undefined", undefined],
      ["empty object", {}],
      ["unknown pricingType", { pricingType: "interpretive_dance", rate: 5 }],
      ["missing required rate", { pricingType: "hourly", unitName: "hour" }],
      ["negative rate", { pricingType: "hourly", unitName: "hour", rate: -50 }],
      ["tiered_packages with no tiers", { pricingType: "tiered_packages", tierMode: "fixed", tiers: [] }],
      ["base_plus_rate missing baseFee", { pricingType: "base_plus_rate", unitName: "x", rate: 10 }],
      ["a bare string", "hourly"],
      ["an array", [1, 2, 3]],
      ["afterHoursMult below 1", { pricingType: "hourly", unitName: "hour", rate: 10, afterHoursMult: 0.5 }],
    ];
    for (const [label, cfg] of invalid) {
      const r = calculateEstimate(cfg, { quantity: 3 });
      eq(r.type, "call_for_quote", `invalid config (${label}) → call_for_quote, never a wrong price`);
      eq(r.total, 0, `invalid config (${label}) → total 0`);
      eq(r.callUs, true, `invalid config (${label}) → callUs true`);
    }

    // The fallback constant itself must behave like a call_for_quote config.
    const fb = calculateEstimate(CALL_FOR_QUOTE_FALLBACK, {});
    eq(fb.type, "call_for_quote", "CALL_FOR_QUOTE_FALLBACK evaluates to call_for_quote");
    eq(fb.message, "Request a quote", "CALL_FOR_QUOTE_FALLBACK carries the default message");
  }

  /* ══════════════════════════════════════════════════════════════════
   * 6. Determinism — the same config + inputs must always produce the
   *    same number. The server-side recompute in POST /api/leads
   *    compares its result against the client's, so any nondeterminism
   *    here would produce phantom mismatch flags on every submission.
   * ══════════════════════════════════════════════════════════════════ */
  {
    const cfg = {
      pricingType: "per_sqft", unitName: "sq ft", rate: 4.75, baseFee: 199, travelFee: 60,
      afterHoursMult: 1.35, minCharge: 400, callUsThreshold: 9000,
      difficultyTiers: [{ id: "steep", label: "Steep roof", multiplier: 1.4 }],
      addOns: [
        { id: "gutters", label: "Gutter guards", type: "fixed", amount: 320 },
        { id: "warranty", label: "Extended warranty", type: "pct", amount: 8 },
      ],
    };
    const inputs = {
      quantity: 1850, isAfterHours: true, selectedDifficultyId: "steep",
      selectedAddOnIds: ["gutters", "warranty"],
    };
    const first = calculateEstimate(cfg, inputs).total;
    for (let i = 0; i < 25; i++) {
      eq(calculateEstimate(cfg, inputs).total, first, "full modifier stack is deterministic across repeated calls");
    }
    check(Number.isFinite(first) && first > 0, "full modifier stack produces a real positive number");

    // Pin the exact composed number so a reordering of the modifier stack
    // is caught rather than silently repricing every roofing calculator.
    //   subtotal    = 199 + 1850 × 4.75              = 8986.5
    //   + travel    = 8986.5 + 60                    = 9046.5
    //   × afterHrs  = 9046.5 × 1.35                  = 12212.775
    //   × difficulty= 12212.775 × 1.4                = 17097.885
    //   + gutters   = 17097.885 + 320                = 17417.885
    //   + warranty  = 17097.885 × 0.08 = 1367.8308   → 18785.7158
    //   round(2dp)                                    = 18785.72
    eq(first, 18785.72, "full modifier stack composes in the documented order (pins the exact total)");

    // Money is rounded to cents, never left with float dust.
    eq(Math.round(first * 100) / 100, first, "totals are rounded to 2 decimal places");
  }

  /* ─── cents rounding on a classic float-dust case ─── */
  {
    const r = calculateEstimate({ pricingType: "per_unit", unitName: "item", rate: 0.1 }, { quantity: 3 });
    eq(r.total, 0.3, "0.1 × 3 rounds to 0.3, not 0.30000000000000004");
  }

  console.log(`calculateEstimate.test.ts — all ${checks} assertions passed`);
}

// Standalone tsx guard: MUST exit(0) on success / exit(1) on failure. A
// resolved main() that left an open handle once stalled CI for an hour — so
// exit explicitly here.
try {
  main();
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
