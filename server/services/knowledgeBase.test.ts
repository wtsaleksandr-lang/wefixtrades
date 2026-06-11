/**
 * Lane A2 — pricing-truth regression tests for the chat-AI knowledge base
 * AND the marketing-chat widget PRODUCT MAP.
 *
 * Both surfaces are quoted verbatim to customers by sales AIs, so every
 * price in them MUST come from @shared/pricing (single source of truth).
 * These tests assert (a) the real tier prices are present, (b) the
 * previously fabricated "Starter $99 / Pro $199 / Elite $299" platform
 * ladder, the fake bundles, and all "free trial" claims can never silently
 * reappear, and (c) the marketing-chat PRODUCT MAP quotes canon and the
 * 2026-06 stale figures ($149 TradeLine, $49 QuoteQuick, $249 RankFlow,
 * $1,499 SiteLaunch, $399 MapSetup, $49 WebCare, $79 SocialSync, $97
 * anything) can never come back.
 *
 * Runnable standalone via:
 *   npx tsx server/services/knowledgeBase.test.ts
 * Wired into CI as `npm run check:pricing-truth` (.github/workflows/ci.yml).
 *
 * Excluded from `tsc --noEmit` via the project tsconfig's **\/*.test.ts
 * pattern. Uses node:assert/strict, no test runner dependency.
 */
import assert from "node:assert/strict";
import { compileKnowledge } from "./knowledgeBase";
import {
  buildMarketingProductMap,
  CITATION_TRACKER_ADDON_MONTHLY,
} from "./marketingProductMap";
import {
  ALL_PRODUCTS,
  ALL_BUNDLES,
  TRADELINE,
  QUOTEQUICK,
  MAPGUARD,
  RANKFLOW,
  REPUTATIONSHIELD,
  SOCIALSYNC,
  SITELAUNCH,
  WEBCARE,
  getTier,
  lowestMonthly,
  formatPrice,
} from "@shared/pricing";

const knowledge = compileKnowledge();

/* ─── 1. Every real product tier price appears ─── */
for (const product of ALL_PRODUCTS) {
  assert.ok(
    knowledge.includes(product.name),
    `knowledge base missing product name: ${product.name}`
  );
  for (const tier of product.tiers) {
    const rendered =
      tier.billingPeriod === "monthly"
        ? `${formatPrice(tier.price)}/mo`
        : `${formatPrice(tier.price)} one-time`;
    assert.ok(
      knowledge.includes(rendered),
      `knowledge base missing real tier price for ${product.name} ${tier.name}: ${rendered}`
    );
  }
}

/* ─── 2. Every real bundle appears with its real price ─── */
for (const bundle of ALL_BUNDLES) {
  assert.ok(
    knowledge.includes(bundle.name),
    `knowledge base missing bundle: ${bundle.name}`
  );
  const rendered =
    bundle.billingPeriod === "monthly"
      ? `${formatPrice(bundle.price)}/mo`
      : `${formatPrice(bundle.price)} one-time`;
  assert.ok(
    knowledge.includes(rendered),
    `knowledge base missing real bundle price for ${bundle.name}: ${rendered}`
  );
}

/* ─── 3. Fabricated platform ladder can never come back ─── */
// The fake "Starter $99/mo / Pro $199/mo / Elite $299/mo" platform plans.
// Note plain "$99" / "$149" etc. ARE legitimate (TradeLine, MapGuard …) —
// the fabricated pattern was specifically these prices as platform plans
// with annual variants, plus the two fake bundles.
const FABRICATED = [
  "$199/mo (or",
  "$99/mo (or",
  "$299/mo (or",
  "$79/mo annual",
  "$159/mo annual",
  "$239/mo annual",
  "Elite:",
  "Growth Bundle",
  "Autopilot System",
  "QuickQuotePro",
  // NOTE: "$349/mo"/"$599/mo" (the fake bundle prices) are NOT asserted
  // here because RankFlow Starter/Growth legitimately cost $349/$599 — the
  // fake bundles are caught by name above.
];
for (const phrase of FABRICATED) {
  assert.ok(
    !knowledge.includes(phrase),
    `fabricated pricing phrase reappeared in knowledge base: "${phrase}"`
  );
}

/* ─── 4. No trial claims of any kind ─── */
for (const phrase of ["free trial", "14-day trial", "14-day AI trial", "AI trial"]) {
  assert.ok(
    !knowledge.toLowerCase().includes(phrase.toLowerCase()),
    `trial claim reappeared in knowledge base: "${phrase}"`
  );
}
// "trial" allowed nowhere in customer-quoted knowledge.
assert.ok(
  !/\btrial\b/i.test(knowledge),
  `the word "trial" appears in the knowledge base — no trials exist`
);

/* ─── 5. Free tiers are described truthfully ─── */
assert.ok(
  knowledge.includes("free tier"),
  "knowledge base should describe the QuoteQuick/ContentFlow free TIERS"
);

/* ═══ 6. Marketing-chat PRODUCT MAP (server/routes/marketingChatRoutes.ts) ═══
 * The anonymous sales-chat widget quotes ONLY this map ("Never quote prices
 * outside the PRODUCT MAP" hard rule), so it gets the same treatment: every
 * price must equal canon, and the stale figures the 2026-06 review caught
 * must never reappear. The map is compiled via the pure builder in
 * services/marketingProductMap.ts — no express/db needed. */
const productMap = buildMarketingProductMap();

/** The single map line for a product label, e.g. mapLine("TradeLine"). */
function mapLine(label: string): string {
  const line = productMap
    .split("\n")
    .find((l) => l.startsWith(`- ${label} —`));
  assert.ok(line, `PRODUCT MAP missing entry: ${label}`);
  return line!;
}

/* 6a. Canonical prices appear on each product's line (derived from canon,
 * so these assertions track shared/pricing if it legitimately changes). */
const MAP_EXPECTED: Array<[label: string, pricePhrase: string]> = [
  ["MapGuard", `${formatPrice(lowestMonthly(MAPGUARD)!)}/mo`],
  ["MapGuard Suite", `${formatPrice(getTier(MAPGUARD, "Pro")!.price)}/mo`],
  ["MapSetup", `One-time ${formatPrice(MAPGUARD.setup!)}`],
  ["TradeLine", `From ${formatPrice(lowestMonthly(TRADELINE)!)}/mo`],
  ["QuoteQuick", `Free + from ${formatPrice(getTier(QUOTEQUICK, "Pro")!.price)}/mo`],
  ["RankFlow", `From ${formatPrice(lowestMonthly(RANKFLOW)!)}/mo`],
  ["ReputationShield", `From ${formatPrice(lowestMonthly(REPUTATIONSHIELD)!)}/mo`],
  ["SocialSync", `From ${formatPrice(lowestMonthly(SOCIALSYNC)!)}/mo`],
  ["SiteLaunch", `${formatPrice(SITELAUNCH.tiers[0].price)} one-time`],
  ["WebCare", `From ${formatPrice(lowestMonthly(WEBCARE)!)}/mo`],
];
for (const [label, pricePhrase] of MAP_EXPECTED) {
  assert.ok(
    mapLine(label).includes(pricePhrase),
    `PRODUCT MAP ${label} line must quote the canonical price "${pricePhrase}" — got: ${mapLine(label)}`
  );
}

/* 6b. The exact stale/fabricated figures the review caught can never come
 * back. Per-line where the figure is legitimate elsewhere in the map
 * (e.g. $149/mo is MapGuard Suite's real price but was TradeLine's stale
 * one). \b after the digits stops "$49" matching "$490" etc. */
const MAP_FORBIDDEN: Array<[label: string, stale: RegExp]> = [
  ["TradeLine", /\$149\b/],      // pre-realignment price; canon is from $99
  ["QuoteQuick", /\$49\b/],      // retired Solo tier; canon is Free + from $29
  ["RankFlow", /\$249\b/],       // canon is from $349
  ["SocialSync", /\$79\b/],      // canon is from $99
  ["SiteLaunch", /\$1,499\b/],   // canon is $1,197
  ["WebCare", /\$49\b/],         // canon is from $79
  ["MapSetup", /\$399\b/],       // canon is $397
];
for (const [label, stale] of MAP_FORBIDDEN) {
  assert.ok(
    !stale.test(mapLine(label)),
    `stale price ${stale} reappeared on the PRODUCT MAP ${label} line: ${mapLine(label)}`
  );
}
// The retired TradeLine "$97/mo" must not appear anywhere in the map.
assert.ok(
  !/\$97\b/.test(productMap),
  `retired "$97" TradeLine price reappeared in the PRODUCT MAP`
);
// SiteLaunch is a single one-time tier — "From" framing is a drift signal.
assert.ok(
  !/SiteLaunch[^\n]*From \$/.test(productMap),
  `PRODUCT MAP SiteLaunch line must not use "From $" framing (single one-time price)`
);
// No trial claims in the map either.
assert.ok(
  !/\btrial\b/i.test(productMap),
  `the word "trial" appears in the PRODUCT MAP — no trials exist`
);

/* 6c. Citation Tracker cross-sell add-on price derives from canon
 * (shared/schemas/citationTracker.ts bundle_monthly_cents). */
assert.equal(
  CITATION_TRACKER_ADDON_MONTHLY,
  formatPrice(500 / 100),
  "Citation Tracker MapGuard-bundle add-on must be $5/mo (bundle_monthly_cents)"
);

console.log("knowledgeBase.test.ts — all pricing-truth assertions passed (knowledge base + marketing-chat PRODUCT MAP)");
