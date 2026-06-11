/**
 * Lane A2 — pricing-truth regression tests for the chat-AI knowledge base.
 *
 * The knowledge base is quoted verbatim to customers by the marketing chat
 * AI, so every price in it MUST come from @shared/pricing (single source of
 * truth). These tests assert (a) the real tier prices are present, and
 * (b) the previously fabricated "Starter $99 / Pro $199 / Elite $299"
 * platform ladder, the fake bundles, and all "free trial" claims can never
 * silently reappear.
 *
 * Runnable standalone via:
 *   npx tsx server/services/knowledgeBase.test.ts
 *
 * Excluded from `tsc --noEmit` via the project tsconfig's **\/*.test.ts
 * pattern. Uses node:assert/strict, no test runner dependency.
 */
import assert from "node:assert/strict";
import { compileKnowledge } from "./knowledgeBase";
import {
  ALL_PRODUCTS,
  ALL_BUNDLES,
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

console.log("knowledgeBase.test.ts — all pricing-truth assertions passed");
