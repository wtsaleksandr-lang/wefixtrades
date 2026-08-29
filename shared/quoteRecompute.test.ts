/**
 * Server-side quote recompute guard — `shared/quoteRecompute.ts`.
 *
 * POST /api/leads used to store whatever `quote_amount` the browser posted.
 * This module decides what actually gets persisted, so its failure modes are
 * both directions of wrong money:
 *
 *   - accepting a tampered client number (the hole being closed), and
 *   - overwriting a CORRECT customer quote with a bad recompute (the hole a
 *     careless fix would open).
 *
 * The second is the reason most of this file is about what the module
 * REFUSES to do. Pinned contracts:
 *
 *   - the simple pricing_config path is recomputed and the SERVER value wins
 *   - a tampered amount is corrected, and both numbers survive for audit
 *   - the ADVANCED formula path is skipped, never recomputed — the widget's
 *     client-side value mapping is not available server-side, so a recompute
 *     would resolve select-driven terms to 0 and destroy correct quotes
 *   - call-for-quote, the roof visualiser, and null amounts are skipped
 *     explicitly rather than being "corrected" to 0
 *   - nothing throws; a failure keeps the client value (never lose a lead)
 *
 * Runnable standalone via:
 *   npx tsx shared/quoteRecompute.test.ts
 * Wired into CI as `npm run check:quote-recompute` (.github/workflows/ci.yml).
 *
 * DB-free. Excluded from `tsc --noEmit` via the project tsconfig's
 * **\/*.test.ts pattern. Uses node:assert/strict, no test runner dependency.
 */
import assert from "node:assert/strict";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
}

import {
  recomputeQuoteAmount,
  rebuildEstimateInputs,
  rebuildWidgetFlow,
  RECOMPUTE_TOLERANCE,
  type RecomputeStatus,
} from "./quoteRecompute";
import { validatePricingConfig } from "./pricingConfig";
import { calculateEstimate } from "./calculateEstimate";

let checks = 0;
function check(cond: unknown, msg: string): void {
  checks++;
  assert.ok(cond, msg);
}
function eq<T>(actual: T, expected: T, msg: string): void {
  checks++;
  assert.equal(actual, expected, msg);
}

/** A plain per-unit calculator — the most common simple-path shape. */
const PER_UNIT = { pricingType: "per_unit", unitName: "room", rate: 100, baseFee: 50 };

/**
 * Reproduce what the widget would post for a given set of answers, by running
 * the exact same pipeline the browser runs. Using the real pipeline (rather
 * than a hand-written expected number) is the point: it proves the server can
 * reproduce the client, which is the entire premise of the feature.
 */
function widgetAmount(pricingConfig: unknown, settings: unknown, answers: Record<string, any>): number {
  const cfg = validatePricingConfig(pricingConfig).config;
  const flow = rebuildWidgetFlow(cfg, settings);
  return calculateEstimate(cfg, rebuildEstimateInputs(flow, answers)).total;
}

function run(over: Partial<Parameters<typeof recomputeQuoteAmount>[0]> = {}) {
  return recomputeQuoteAmount({
    pricingConfig: PER_UNIT,
    calculatorSettings: {},
    answers: {},
    submittedAmount: null,
    ...over,
  });
}

function main() {
  /* ══════════════════════════════════════════════════════════════════
   * 1. The happy path — the server reproduces the widget exactly.
   * ══════════════════════════════════════════════════════════════════ */
  {
    const settings = {};
    const answers = { quantity: 3 };
    const honest = widgetAmount(PER_UNIT, settings, answers);
    check(honest > 0, "fixture: the widget pipeline yields a real price");

    const r = run({ calculatorSettings: settings, answers, submittedAmount: honest });
    eq(r.status, "verified", "an honest client amount is VERIFIED, not merely accepted");
    eq(r.mismatch, false, "an honest amount is not a mismatch");
    eq(r.serverAmount, honest, "the server reproduces the widget's own number exactly");
    eq(r.storedAmount, honest, "the verified amount is what gets stored");
    eq(r.clientAmount, honest, "the client amount is preserved for audit");
    eq(r.delta, 0, "a verified amount has zero delta");
  }

  /* ══════════════════════════════════════════════════════════════════
   * 2. TAMPERING — the hole this module exists to close.
   * ══════════════════════════════════════════════════════════════════ */
  {
    const answers = { quantity: 3 };
    const honest = widgetAmount(PER_UNIT, {}, answers);

    // Understated (the interesting attack: cheap job, real service).
    const low = run({ answers, submittedAmount: 1 });
    eq(low.status, "corrected", "an understated amount is CORRECTED");
    eq(low.mismatch, true, "an understated amount is flagged as a mismatch");
    eq(low.storedAmount, honest, "the SERVER value is stored, not the tampered one");
    eq(low.clientAmount, 1, "the tampered value is preserved so the attempt stays provable");
    eq(low.delta, Math.round((honest - 1) * 100) / 100, "delta is server minus client");

    // Overstated.
    const high = run({ answers, submittedAmount: 999999 });
    eq(high.status, "corrected", "an inflated amount is CORRECTED");
    eq(high.storedAmount, honest, "an inflated amount is replaced by the server value");
    check(high.delta! < 0, "an inflated client amount yields a negative delta");

    // Zero is a real value, not "absent" — a job quoted at 0 that should cost
    // money must still be corrected rather than silently accepted.
    const zero = run({ answers, submittedAmount: 0 });
    eq(zero.status, "corrected", "a zero amount on a priced config is corrected, not treated as missing");
    eq(zero.storedAmount, honest, "a zeroed quote is restored to the server price");

    // Negative.
    const negative = run({ answers, submittedAmount: -500 });
    eq(negative.status, "corrected", "a negative amount is corrected");
    eq(negative.storedAmount, honest, "a negative amount never survives to the database");
    check(negative.storedAmount! >= 0, "the stored amount is never negative");
  }

  /* ══════════════════════════════════════════════════════════════════
   * 3. Tolerance — sub-cent float dust is not a mismatch, real money is.
   * ══════════════════════════════════════════════════════════════════ */
  {
    const answers = { quantity: 3 };
    const honest = widgetAmount(PER_UNIT, {}, answers);

    eq(
      run({ answers, submittedAmount: honest + RECOMPUTE_TOLERANCE / 2 }).mismatch, false,
      "a sub-tolerance difference is NOT flagged (float dust, not tampering)",
    );
    eq(
      run({ answers, submittedAmount: honest + 1 }).mismatch, true,
      "a whole-dollar difference IS flagged",
    );
    check(RECOMPUTE_TOLERANCE > 0 && RECOMPUTE_TOLERANCE <= 0.01, "tolerance is at most one cent");
  }

  /* ══════════════════════════════════════════════════════════════════
   * 4. SKIPS — the cases where recomputing would DESTROY a real quote.
   * Each of these would be a customer-facing regression if "corrected".
   * ══════════════════════════════════════════════════════════════════ */
  {
    /* 4a. Advanced formula builder. The widget maps each raw answer through
     * client-only code (a select answer is an option ID that resolves to that
     * option's numeric value) before it reaches the formula engine. Recomputing
     * without that mapping feeds "opt_3" to toNum() → 0, so every select-driven
     * term collapses and the customer's real quote is overwritten with a
     * fabricated low one. MUST skip. */
    const advanced = run({
      calculatorSettings: {
        advanced: {
          enabled: true,
          fields: [{ id: "f1", name: "rooms", type: "select", options: [{ id: "opt_3", value: 3 }] }],
          calculations: [{ id: "c1", name: "Total", formula: "rooms * 100" }],
          result_calc: "Total",
        },
      },
      answers: { rooms: "opt_3" },
      submittedAmount: 300,
    });
    eq(advanced.status, "skipped_advanced", "the advanced formula path is SKIPPED, never recomputed");
    eq(advanced.storedAmount, 300, "the advanced-path client amount is preserved verbatim");
    eq(advanced.serverAmount, null, "no server amount is invented for the advanced path");
    eq(advanced.mismatch, false, "a skipped path is never reported as a mismatch");

    // An advanced config that is present but DISABLED still uses the simple path.
    const advDisabled = run({
      calculatorSettings: { advanced: { enabled: false } },
      answers: { quantity: 3 },
      submittedAmount: widgetAmount(PER_UNIT, { advanced: { enabled: false } }, { quantity: 3 }),
    });
    eq(advDisabled.status, "verified", "advanced.enabled:false falls through to the simple path");

    /* 4b. The roof/solar 3D visualiser prices inside a browser bundle the
     * server does not run; its number arrives via answers.source. */
    const roof = run({
      answers: { source: "roof_visualizer", priceHi: 24500 },
      submittedAmount: 24500,
    });
    eq(roof.status, "skipped_external", "a roof-visualiser quote is skipped");
    eq(roof.storedAmount, 24500, "the roof-visualiser amount is preserved verbatim");

    /* 4c. call_for_quote_only — the config declines to price the job. The
     * recompute would yield 0; writing that over a real submitted number would
     * destroy the quote. This is the explicit "cannot be recomputed" case. */
    const cfq = run({
      pricingConfig: { pricingType: "call_for_quote_only", message: "Call us" },
      submittedAmount: 4200,
    });
    eq(cfq.status, "skipped_no_price", "call_for_quote_only is skipped, not zeroed");
    eq(cfq.storedAmount, 4200, "a call-for-quote lead KEEPS its submitted amount (never overwritten with 0)");
    eq(cfq.serverAmount, null, "no server amount is asserted for a call-for-quote config");

    /* 4d. An INVALID pricing config degrades to call_for_quote inside
     * calculateEstimate. Same reasoning — refuse rather than zero out. */
    for (const [label, cfg] of [
      ["null", null],
      ["empty object", {}],
      ["unknown pricingType", { pricingType: "interpretive_dance" }],
      ["negative rate", { pricingType: "hourly", unitName: "hour", rate: -5 }],
    ] as Array<[string, unknown]>) {
      const bad = run({ pricingConfig: cfg, submittedAmount: 1500 });
      eq(bad.status, "skipped_no_price", `an invalid config (${label}) is skipped, not zeroed`);
      eq(bad.storedAmount, 1500, `an invalid config (${label}) preserves the client amount`);
      check(/invalid pricing config|declines/.test(bad.reason), `an invalid config (${label}) explains itself`);
    }

    /* 4e. No amount at all — call-for-quote leads, AI-chat handoffs, and
     * quotes the widget deliberately suppressed (out of service area). */
    for (const submitted of [null, undefined, NaN, Infinity]) {
      const none = run({ submittedAmount: submitted as any, answers: { quantity: 3 } });
      eq(none.status, "skipped_no_amount", `a ${String(submitted)} amount is skipped`);
      eq(none.storedAmount, null, `a ${String(submitted)} amount stores null, not a server-invented price`);
      eq(none.serverAmount, null, `a ${String(submitted)} amount invents no server price`);
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   * 5. Answer replay across pricing models.
   * The recompute is only as good as the answers→inputs mapping, so each
   * `maps_to` binding is exercised end to end.
   * ══════════════════════════════════════════════════════════════════ */
  {
    // quantity binding drives the price.
    const q1 = widgetAmount(PER_UNIT, {}, { quantity: 1 });
    const q5 = widgetAmount(PER_UNIT, {}, { quantity: 5 });
    check(q5 > q1, "fixture: a larger quantity costs more (the binding is live)");
    eq(run({ answers: { quantity: 5 }, submittedAmount: q5 }).status, "verified", "quantity replay verifies");
    eq(
      run({ answers: { quantity: 1 }, submittedAmount: q5 }).status, "corrected",
      "posting a 5-room price with a 1-room answer set is CAUGHT",
    );

    /* Package tiers. NOTE the answer key is the FLOW QUESTION ID
     * (`package_tier`), not the EstimateInputs field name — `maps_to` is what
     * bridges the two. Getting this wrong is the most likely way a future
     * change silently breaks the replay, so it is asserted explicitly. */
    const packages = {
      pricingType: "tiered_packages", tierMode: "fixed",
      tiers: [{ label: "Basic", price: 300 }, { label: "Premium", price: 1200 }],
    };
    const bindings = rebuildWidgetFlow(validatePricingConfig(packages).config, {})
      .steps.flatMap(s => (s.questions ?? []))
      .filter(q => q.maps_to)
      .map(q => `${q.id}→${q.maps_to}`);
    check(
      bindings.includes("package_tier→selected_tier_index"),
      "the package flow still binds question `package_tier` to selected_tier_index",
    );

    const premium = widgetAmount(packages, {}, { package_tier: 1 });
    const basic = widgetAmount(packages, {}, { package_tier: 0 });
    eq(basic, 300, "fixture: package index 0 prices the Basic tier");
    eq(premium, 1200, "fixture: package index 1 prices the Premium tier");

    eq(
      run({ pricingConfig: packages, answers: { package_tier: 1 }, submittedAmount: premium }).status,
      "verified",
      "a package selection replays and verifies",
    );
    const downgraded = run({ pricingConfig: packages, answers: { package_tier: 1 }, submittedAmount: basic });
    eq(downgraded.status, "corrected", "posting the Basic price against a Premium selection is CAUGHT");
    eq(downgraded.storedAmount, premium, "the Premium price is restored");

    // Add-on selection replays too (checkbox_group → selected_add_on_ids).
    const withAddon = {
      pricingType: "hourly", unitName: "hour", rate: 100,
      addOns: [{ id: "a1", label: "Extra", type: "fixed", amount: 50 }],
    };
    const addonPrice = widgetAmount(withAddon, {}, { quantity: 2, addon_selection: ["a1"] });
    const noAddonPrice = widgetAmount(withAddon, {}, { quantity: 2, addon_selection: [] });
    eq(addonPrice - noAddonPrice, 50, "fixture: selecting the add-on adds its $50");
    eq(
      run({ pricingConfig: withAddon, answers: { quantity: 2, addon_selection: ["a1"] }, submittedAmount: addonPrice }).status,
      "verified",
      "an add-on selection replays and verifies",
    );
    eq(
      run({ pricingConfig: withAddon, answers: { quantity: 2, addon_selection: ["a1"] }, submittedAmount: noAddonPrice }).status,
      "corrected",
      "dropping a selected add-on from the posted price is CAUGHT",
    );

    // Missing answers fall back to the documented defaults (quantity 1, tier 0)
    // — exactly what the widget itself does, so an untouched form still verifies.
    const empty = widgetAmount(PER_UNIT, {}, {});
    eq(
      run({ answers: {}, submittedAmount: empty }).status, "verified",
      "an empty answer set replays to the same defaults the widget uses",
    );

    // Extra non-pricing keys (the lead form's custom fields and ContactStep's
    // service_address ride along in `answers`) must not disturb the replay.
    eq(
      run({
        answers: { quantity: 3, service_address: "1 Main St", "How did you hear?": "Google" },
        submittedAmount: widgetAmount(PER_UNIT, {}, { quantity: 3 }),
      }).status,
      "verified",
      "extra non-pricing answer keys do not break the replay",
    );
  }

  /* ══════════════════════════════════════════════════════════════════
   * 6. Robustness — never throw, never lose a lead.
   * A verification problem must never turn a successful capture into an
   * error, so every hostile input degrades to keeping the client value.
   * ══════════════════════════════════════════════════════════════════ */
  {
    const hostile: Array<[string, any]> = [
      ["a string answers blob", "not-an-object"],
      ["an array answers blob", [1, 2, 3]],
      ["null answers", null],
      ["undefined answers", undefined],
      ["a number answers blob", 42],
      ["settings as a string", undefined],
    ];
    for (const [label, answers] of hostile) {
      let result: ReturnType<typeof recomputeQuoteAmount> | undefined;
      assert.doesNotThrow(() => {
        result = run({ answers, submittedAmount: 500 });
      }, `recomputeQuoteAmount never throws on ${label}`);
      checks++;
      check(result !== undefined, `a result is always returned for ${label}`);
      check(
        result!.storedAmount === 500 || typeof result!.storedAmount === "number",
        `a usable amount survives ${label}`,
      );
    }

    // Hostile calculator_settings must not throw either.
    for (const settings of [null, undefined, "string", 42, [], { ui_template: "bad" }, { advanced: "yes" }]) {
      assert.doesNotThrow(() => {
        run({ calculatorSettings: settings, answers: { quantity: 2 }, submittedAmount: 250 });
      }, `recomputeQuoteAmount survives calculator_settings = ${JSON.stringify(settings)}`);
      checks++;
    }

    // An unknown ui_template falls back to classic_single rather than crashing.
    const unknownTemplate = run({
      calculatorSettings: { ui_template: { template_id: "does_not_exist" } },
      answers: { quantity: 2 },
      submittedAmount: 250,
    });
    check(
      unknownTemplate.status !== "unavailable",
      "an unknown ui_template falls back to the default template instead of failing",
    );

    // Every status the module can return is one of the declared union members.
    const declared: RecomputeStatus[] = [
      "verified", "corrected", "skipped_no_amount", "skipped_advanced",
      "skipped_external", "skipped_no_price", "unavailable",
    ];
    for (const s of declared) {
      eq(typeof s, "string", `status "${s}" is a plain string (safe for a varchar column)`);
      check(s.length <= 32, `status "${s}" fits the varchar(32) column added by migration 0098`);
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   * 7. Invariants that hold for EVERY result shape.
   * ══════════════════════════════════════════════════════════════════ */
  {
    const cases = [
      run({ answers: { quantity: 3 }, submittedAmount: widgetAmount(PER_UNIT, {}, { quantity: 3 }) }),
      run({ answers: { quantity: 3 }, submittedAmount: 1 }),
      run({ submittedAmount: null }),
      run({ calculatorSettings: { advanced: { enabled: true } }, submittedAmount: 100 }),
      run({ answers: { source: "roof_visualizer" }, submittedAmount: 100 }),
      run({ pricingConfig: { pricingType: "call_for_quote_only", message: "x" }, submittedAmount: 100 }),
    ];
    for (const r of cases) {
      check(
        r.storedAmount === null || Number.isFinite(r.storedAmount),
        `[${r.status}] storedAmount is null or a finite number — never NaN/Infinity`,
      );
      check(
        r.serverAmount === null || Number.isFinite(r.serverAmount),
        `[${r.status}] serverAmount is null or finite`,
      );
      check(typeof r.reason === "string" && r.reason.length > 0, `[${r.status}] carries a non-empty reason`);
      // A mismatch is only ever claimed when BOTH numbers actually exist.
      if (r.mismatch) {
        check(r.serverAmount !== null, `[${r.status}] a mismatch always has a server amount`);
        check(r.clientAmount !== null, `[${r.status}] a mismatch always has a client amount`);
        eq(r.status, "corrected", `[${r.status}] only the corrected status reports a mismatch`);
      }
      // A skip never asserts a server number.
      if (r.status.startsWith("skipped")) {
        eq(r.serverAmount, null, `[${r.status}] a skip invents no server amount`);
        eq(r.storedAmount, r.clientAmount, `[${r.status}] a skip preserves the client amount verbatim`);
      }
    }
  }

  console.log(`quoteRecompute.test.ts — all ${checks} assertions passed`);
}

// Standalone tsx guard: MUST exit(0) on success / exit(1) on failure.
try {
  main();
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
