/**
 * PRODUCT_PAGES pricing-CTA routing guard.
 *
 * Regression guard for the pricing deep-link fix. A product's "See pricing"
 * (or any pricing) CTA must never dead-end at the bare top of /pricing — the
 * global pricing page (PricingUnified) opens on the Lead-Gen tab, so a bare
 * `/pricing` link drops visitors on the wrong product. Every CTA that targets
 * the global pricing page must deep-link to that product's card
 * (`/pricing#price-<id>`); in-page `#pricing` anchors and `/pricing/<sub>`
 * routes are also allowed.
 *
 * Run standalone:
 *   tsx client/src/config/products.ctas.test.ts
 */
import assert from "node:assert/strict";
import { PRODUCT_PAGES } from "./products";

let checked = 0;
for (const p of PRODUCT_PAGES) {
  for (const cta of [p.primaryCTA, p.secondaryCTA]) {
    if (!cta) continue;
    checked++;
    assert.notStrictEqual(
      cta.href,
      "/pricing",
      `${p.slug}: CTA "${cta.label}" points at bare /pricing (dead-ends at top). Deep-link to /pricing#price-<id> or use in-page #pricing.`,
    );
    // Any GLOBAL /pricing target (not a /pricing/<sub> route) must carry a
    // #price-<id> anchor so it lands on the right card.
    if (cta.href.startsWith("/pricing") && !cta.href.startsWith("/pricing/")) {
      assert.match(
        cta.href,
        /^\/pricing#price-[a-z0-9-]+$/,
        `${p.slug}: CTA "${cta.label}" (${cta.href}) must deep-link as /pricing#price-<id>.`,
      );
    }
  }
}

// The three products the audit flagged must now deep-link to their own card.
const expected: Record<string, string> = {
  mapguard: "/pricing#price-mapguard",
  webcare: "/pricing#price-webcare",
  adflow: "/pricing#price-adflow",
};
for (const [slug, href] of Object.entries(expected)) {
  const p = PRODUCT_PAGES.find((x) => x.slug === slug);
  assert.ok(p, `expected product ${slug} present in PRODUCT_PAGES`);
  assert.strictEqual(
    p!.secondaryCTA?.href,
    href,
    `${slug} secondaryCTA should deep-link to ${href}`,
  );
}

console.log(
  `products CTA routing guard OK — ${checked} CTAs checked, ${Object.keys(expected).length} deep-links verified`,
);
