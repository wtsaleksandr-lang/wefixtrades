/**
 * QuoteQuick tier-entitlement guard — `shared/quotequickEntitlements.ts`.
 *
 * These gates decide whether a paying customer gets what the pricing page
 * promised, and whether a free account gets something it should have paid
 * for. Both directions are revenue-affecting, so the contract is pinned:
 *
 *   - the feature→tier map MATCHES the bullets on shared/pricing.ts (asserted
 *     against the real QUOTEQUICK tier definitions, not a copy — a bullet
 *     moving between Pro and Business without updating the gate fails here)
 *   - unknown / blank / null tiers FAIL CLOSED (plan_tier is an unconstrained
 *     text column with no CHECK constraint, so a typo must not unlock Business)
 *   - grandfathering keeps an already-configured account working
 *   - the master switch opens every gate, so reverting the packaging decision
 *     stays a genuine one-line change
 *
 * Runnable standalone via:
 *   npx tsx shared/quotequickEntitlements.test.ts
 * Wired into CI as `npm run check:qq-entitlements` (.github/workflows/ci.yml).
 *
 * DB-free. Excluded from `tsc --noEmit` via the project tsconfig's
 * **\/*.test.ts pattern. Uses node:assert/strict, no test runner dependency.
 */
import assert from "node:assert/strict";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
}

import {
  QQ_TIER_RANK,
  QQ_FEATURE_MIN_TIER,
  QQ_FEATURE_GATES_ENABLED,
  QQ_FEATURE_GATE_STATUS,
  normalizeTier,
  tierRank,
  tierAtLeast,
  isFeatureGrandfathered,
  checkQuoteQuickFeature,
  hasQuoteQuickFeature,
  buildFeatureAllowMap,
  upgradeMessageFor,
  featureGateErrorBody,
  type QuoteQuickFeature,
} from "./quotequickEntitlements";
import { QUOTEQUICK } from "./pricing";

let checks = 0;
function check(cond: unknown, msg: string): void {
  checks++;
  assert.ok(cond, msg);
}
function eq<T>(actual: T, expected: T, msg: string): void {
  checks++;
  assert.equal(actual, expected, msg);
}

const ALL_FEATURES: QuoteQuickFeature[] = ["lead_webhook", "booking_deposits", "sms_followups"];

function main() {
  /* ══════════════════════════════════════════════════════════════════
   * 1. The gate map agrees with the PRICING PAGE.
   *
   * This is the assertion that matters most: shared/pricing.ts is what we
   * promise the customer, this module is what we enforce. If they disagree
   * we are either overcharging or giving away a paid feature, and the
   * whole point of this file is that neither happens silently.
   * ══════════════════════════════════════════════════════════════════ */
  {
    const tierBullets = (id: string): string[] => {
      const tier = QUOTEQUICK.tiers.find(t => t.id === id);
      assert.ok(tier, `pricing.ts must still define the ${id} tier`);
      return tier!.features.map(f => f.toLowerCase());
    };
    const proBullets = tierBullets("quotequick-pro");
    const businessBullets = tierBullets("quotequick-business");

    // "Email + SMS follow-ups" is a PRO bullet → sms_followups gates at pro.
    check(
      proBullets.some(f => f.includes("sms")),
      "pricing.ts Pro tier still advertises SMS (if this moved, update QQ_FEATURE_MIN_TIER)",
    );
    eq(QQ_FEATURE_MIN_TIER.sms_followups, "pro", "sms_followups gates at the tier pricing.ts advertises (Pro)");

    // "Online booking + deposits" is a BUSINESS bullet.
    check(
      businessBullets.some(f => f.includes("booking") && f.includes("deposit")),
      "pricing.ts Business tier still advertises booking + deposits",
    );
    eq(QQ_FEATURE_MIN_TIER.booking_deposits, "business", "booking_deposits gates at Business");

    // "Webhook / CRM integration" is a BUSINESS bullet.
    check(
      businessBullets.some(f => f.includes("webhook")),
      "pricing.ts Business tier still advertises webhook / CRM integration",
    );
    eq(QQ_FEATURE_MIN_TIER.lead_webhook, "business", "lead_webhook gates at Business");

    // None of the three may be advertised as a FREE feature.
    const freeBullets = tierBullets("quotequick-free");
    for (const needle of ["sms", "webhook", "deposit"]) {
      check(
        !freeBullets.some(f => f.includes(needle)),
        `pricing.ts Free tier does not advertise "${needle}" (it is gated here)`,
      );
    }

    // Every gated feature names a tier that actually exists in the rank table.
    for (const f of ALL_FEATURES) {
      check(
        Object.prototype.hasOwnProperty.call(QQ_TIER_RANK, QQ_FEATURE_MIN_TIER[f]),
        `feature "${f}" requires a tier that exists in QQ_TIER_RANK`,
      );
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   * 2. Tier normalisation + ranking — must FAIL CLOSED.
   * `calculators.plan_tier` is `text` with no CHECK constraint, so any
   * string can be in there. Anything unrecognised must rank as free.
   * ══════════════════════════════════════════════════════════════════ */
  {
    eq(normalizeTier("free"), "free", "normalize: free");
    eq(normalizeTier("PRO"), "pro", "normalize: uppercase is lowered");
    eq(normalizeTier("  business  "), "business", "normalize: surrounding whitespace trimmed");
    eq(normalizeTier(null), "free", "normalize: null → free");
    eq(normalizeTier(undefined), "free", "normalize: undefined → free");
    eq(normalizeTier(""), "free", "normalize: empty string → free");
    eq(normalizeTier("   "), "free", "normalize: whitespace-only → free");
    eq(normalizeTier("busines"), "free", "normalize: a TYPO falls back to free, never to the intended tier");
    eq(normalizeTier("admin"), "free", "normalize: an arbitrary string → free");

    eq(tierRank("free"), 0, "rank: free is 0");
    check(tierRank("pro") > tierRank("free"), "rank: pro outranks free");
    check(tierRank("business") > tierRank("pro"), "rank: business outranks pro");
    eq(
      tierRank("starter"), tierRank("pro"),
      "rank: legacy 'starter' ranks AS pro (migrations/0014 converted these rows)",
    );
    eq(tierRank("nonsense"), 0, "rank: an unknown tier ranks as free (FAIL CLOSED)");
    eq(tierRank(null), 0, "rank: null ranks as free");

    eq(tierAtLeast("business", "pro"), true, "atLeast: business satisfies a pro requirement");
    eq(tierAtLeast("pro", "business"), false, "atLeast: pro does NOT satisfy a business requirement");
    eq(tierAtLeast("pro", "pro"), true, "atLeast: a tier satisfies its own requirement");
    eq(tierAtLeast("free", "pro"), false, "atLeast: free satisfies nothing paid");
    eq(tierAtLeast("enterprise", "business"), true, "atLeast: enterprise outranks business");
  }

  /* ══════════════════════════════════════════════════════════════════
   * 3. The gate itself, per tier × feature.
   * ══════════════════════════════════════════════════════════════════ */
  {
    // FREE gets nothing.
    for (const f of ALL_FEATURES) {
      eq(hasQuoteQuickFeature("free", f), false, `free tier is denied "${f}"`);
      eq(hasQuoteQuickFeature(null, f), false, `a null tier is denied "${f}"`);
      eq(hasQuoteQuickFeature("", f), false, `a blank tier is denied "${f}"`);
    }

    // PRO gets SMS only — this is the Pro-vs-Business distinction that no
    // pre-existing predicate in the codebase could express.
    eq(hasQuoteQuickFeature("pro", "sms_followups"), true, "pro gets SMS follow-ups");
    eq(hasQuoteQuickFeature("pro", "lead_webhook"), false, "pro does NOT get the webhook (Business-only)");
    eq(hasQuoteQuickFeature("pro", "booking_deposits"), false, "pro does NOT get deposits (Business-only)");

    // Legacy starter behaves exactly like pro.
    eq(hasQuoteQuickFeature("starter", "sms_followups"), true, "legacy starter gets SMS, like pro");
    eq(hasQuoteQuickFeature("starter", "lead_webhook"), false, "legacy starter does not get the webhook");

    // BUSINESS gets everything.
    for (const f of ALL_FEATURES) {
      eq(hasQuoteQuickFeature("business", f), true, `business gets "${f}"`);
    }

    // Reasons are reported accurately (they drive log lines and UI copy).
    eq(checkQuoteQuickFeature("business", "lead_webhook").reason, "entitled", "an entitled result says so");
    eq(checkQuoteQuickFeature("free", "lead_webhook").reason, "tier_too_low", "a denied result says tier_too_low");
    eq(
      checkQuoteQuickFeature("free", "lead_webhook").requiredTier, "business",
      "a denied result names the tier needed",
    );
    eq(
      checkQuoteQuickFeature("  BUSINESS ", "lead_webhook").planTier, "business",
      "the result echoes the NORMALISED tier",
    );
    eq(checkQuoteQuickFeature("free", "lead_webhook").feature, "lead_webhook", "the result echoes the feature");
  }

  /* ══════════════════════════════════════════════════════════════════
   * 4. Grandfathering — the humane path for an account that configured a
   *    feature before it was gated.
   * ══════════════════════════════════════════════════════════════════ */
  {
    const grandfathered = { entitlements: { grandfathered: ["lead_webhook"] } };

    eq(
      hasQuoteQuickFeature("free", "lead_webhook", grandfathered), true,
      "a grandfathered free account keeps its webhook",
    );
    eq(
      checkQuoteQuickFeature("free", "lead_webhook", grandfathered).reason, "grandfathered",
      "the grandfathered path is reported distinctly from 'entitled' (so it shows up in logs)",
    );
    // Grandfathering is per-feature, not a blanket unlock.
    eq(
      hasQuoteQuickFeature("free", "booking_deposits", grandfathered), false,
      "grandfathering ONE feature does not unlock the others",
    );

    // Malformed / hostile grandfather lists must not unlock anything.
    const hostile: Array<[string, unknown]> = [
      ["undefined settings", undefined],
      ["null settings", null],
      ["empty settings", {}],
      ["entitlements not an object", { entitlements: "yes" }],
      ["grandfathered not an array", { entitlements: { grandfathered: "lead_webhook" } }],
      ["grandfathered is true", { entitlements: { grandfathered: true } }],
      ["empty grandfather list", { entitlements: { grandfathered: [] } }],
      ["unrelated key", { entitlements: { grandfathered: ["something_else"] } }],
      ["a string settings blob", "entitlements"],
    ];
    for (const [label, settings] of hostile) {
      eq(
        isFeatureGrandfathered(settings, "lead_webhook"), false,
        `grandfather check is not fooled by ${label}`,
      );
      eq(
        hasQuoteQuickFeature("free", "lead_webhook", settings), false,
        `free tier stays denied with ${label}`,
      );
    }

    // A grandfathered BUSINESS account is simply entitled — grandfathering
    // never downgrades or shadows a real entitlement.
    eq(
      checkQuoteQuickFeature("business", "lead_webhook", grandfathered).reason, "grandfathered",
      "grandfathering short-circuits before the tier check (both allow, so allowed either way)",
    );
    eq(
      hasQuoteQuickFeature("business", "lead_webhook", grandfathered), true,
      "a grandfathered business account is still allowed",
    );
  }

  /* ══════════════════════════════════════════════════════════════════
   * 5. The master switch.
   * The packaging decision is contested (see the module header). Reverting
   * must stay a genuine ONE-LINE change, so assert the switch is wired
   * through every feature rather than only consulted in one branch.
   * ══════════════════════════════════════════════════════════════════ */
  {
    eq(
      typeof QQ_FEATURE_GATES_ENABLED, "boolean",
      "QQ_FEATURE_GATES_ENABLED is a plain boolean constant, flippable in one line",
    );
    if (QQ_FEATURE_GATES_ENABLED) {
      // Current default: gates ON, matching the advertised pricing page.
      for (const f of ALL_FEATURES) {
        eq(hasQuoteQuickFeature("free", f), false, `gates ON → free is denied "${f}"`);
      }
    } else {
      // If the switch is ever flipped, EVERY feature must open — a partial
      // unlock would be the worst of both worlds.
      for (const f of ALL_FEATURES) {
        eq(hasQuoteQuickFeature("free", f), true, `gates OFF → free gets "${f}"`);
        eq(checkQuoteQuickFeature("free", f).reason, "gates_disabled", `gates OFF is reported as such for "${f}"`);
      }
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   * 6. The allow-map handed to the client.
   * The wizard renders its locks from this, so it must cover every gated
   * feature and agree with the individual checks exactly.
   * ══════════════════════════════════════════════════════════════════ */
  {
    for (const tier of ["free", "pro", "business", "starter", null, "garbage"]) {
      const map = buildFeatureAllowMap(tier as string | null);
      eq(
        Object.keys(map).sort().join(","), ALL_FEATURES.slice().sort().join(","),
        `allow-map covers exactly the gated features for tier "${tier}"`,
      );
      for (const f of ALL_FEATURES) {
        eq(
          map[f], hasQuoteQuickFeature(tier as string | null, f),
          `allow-map agrees with the direct check for "${f}" on tier "${tier}"`,
        );
      }
    }

    // Grandfathering is reflected in the map, so a grandfathered owner sees
    // an UNLOCKED control rather than a lock the server would have allowed.
    const gf = buildFeatureAllowMap("free", { entitlements: { grandfathered: ["booking_deposits"] } });
    eq(gf.booking_deposits, true, "allow-map reflects grandfathering");
    eq(gf.lead_webhook, false, "allow-map still locks the non-grandfathered features");
  }

  /* ══════════════════════════════════════════════════════════════════
   * 7. Rejection payload — what a blocked caller actually receives.
   * ══════════════════════════════════════════════════════════════════ */
  {
    eq(QQ_FEATURE_GATE_STATUS, 402, "the gate uses 402 Payment Required");

    for (const f of ALL_FEATURES) {
      const body = featureGateErrorBody(f);
      eq(body.code, "tier_too_low", `error body for "${f}" carries a stable machine code`);
      eq(body.upgrade_required, true, `error body for "${f}" flags upgrade_required`);
      eq(body.feature, f, `error body names the feature`);
      eq(body.required_tier, QQ_FEATURE_MIN_TIER[f], `error body names the required tier as DATA, not prose`);
      check(typeof body.error === "string" && body.error.length > 0, `error body carries human-readable copy for "${f}"`);
    }

    // Upgrade copy names both the feature and the plan a customer must buy —
    // a message that says neither is useless in a UI.
    check(/SMS follow-ups/.test(upgradeMessageFor("sms_followups")), "upgrade copy names the feature");
    check(/Pro/.test(upgradeMessageFor("sms_followups")), "SMS upgrade copy names the Pro plan");
    check(/Business/.test(upgradeMessageFor("lead_webhook")), "webhook upgrade copy names the Business plan");
    check(/Business/.test(upgradeMessageFor("booking_deposits")), "deposit upgrade copy names the Business plan");
  }

  /* ══════════════════════════════════════════════════════════════════
   * 8. Immutability — the tables are frozen so a caller can't mutate a
   *    shared entitlement map at runtime and unlock a feature globally.
   * ══════════════════════════════════════════════════════════════════ */
  {
    check(Object.isFrozen(QQ_TIER_RANK), "QQ_TIER_RANK is frozen");
    check(Object.isFrozen(QQ_FEATURE_MIN_TIER), "QQ_FEATURE_MIN_TIER is frozen");
    // A stray write must not take effect (silently ignored in sloppy mode,
    // throws in strict — either way the value must be unchanged).
    try {
      (QQ_FEATURE_MIN_TIER as any).lead_webhook = "free";
    } catch {
      /* strict-mode TypeError is the acceptable outcome */
    }
    eq(QQ_FEATURE_MIN_TIER.lead_webhook, "business", "a stray write cannot downgrade a feature's required tier");
  }

  console.log(`quotequickEntitlements.test.ts — all ${checks} assertions passed`);
}

// Standalone tsx guard: MUST exit(0) on success / exit(1) on failure.
try {
  main();
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
