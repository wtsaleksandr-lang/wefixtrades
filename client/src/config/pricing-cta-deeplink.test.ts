/**
 * Routed-page pricing-CTA deep-link guard (companion to products.ctas.test.ts).
 *
 * products.ctas.test.ts only iterates the PRODUCT_PAGES catalog, so it can't
 * see product-specific "See/View pricing" CTAs that live in routed marketing,
 * demo and detail pages (and in the product-mockups / comparisons / siteMap
 * config catalogs). Those CTAs must deep-link to the exact product's pricing
 * card — `/pricing#price-<id>` — because the global pricing page opens on the
 * Lead-Gen tab, so a bare `/pricing` link dead-ends on the wrong product.
 *
 * This guard:
 *   1. Scans a set of PRODUCT-SCOPED source files (per-product demo pages,
 *      product detail/suite pages, and the product config catalogs) and fails
 *      if any of them contains a bare `/pricing` CTA target. Generic hub /
 *      nav / footer pages that legitimately link to the top of /pricing are
 *      intentionally NOT in this set.
 *   2. Validates every `/pricing#price-<id>` anchor it finds actually resolves
 *      to a real product id (or a recognized slug/legacy alias) — otherwise the
 *      PricingUnified hashchange handler silently no-ops and the CTA dead-ends.
 *
 * Run standalone:
 *   tsx client/src/config/pricing-cta-deeplink.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_PRODUCTS } from "./pricing";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT_SRC = join(HERE, ".."); // client/src

// Product-slug / legacy-AI aliases → canonical pricing product id. Mirror of
// PricingUnified's SLUG_TO_PRODUCT_ID; keep in sync when that map changes.
const SLUG_TO_PRODUCT_ID: Record<string, string> = {
  quickquotepro: "quotequick",
  "ai-chat": "tradeline",
  "ai-voice": "tradeline",
  "ai-receptionist": "tradeline",
};

const VALID_ANCHOR_IDS = new Set<string>([
  ...ALL_PRODUCTS.map((p) => p.id),
  ...Object.keys(SLUG_TO_PRODUCT_ID),
]);

// Demo pages are per-product EXCEPT these generic hub / router shells, which
// may link to the top of /pricing.
const GENERIC_DEMO_FILES = new Set(["DemoCenter.tsx", "DemoPage.tsx"]);

// Files whose "See/View pricing" CTAs are inherently about ONE product and so
// must always deep-link. Any bare `/pricing` CTA target here is a regression.
function productScopedFiles(): string[] {
  const demosDir = join(CLIENT_SRC, "pages", "demos");
  const demoFiles = readdirSync(demosDir)
    .filter((f) => f.endsWith(".tsx") && !GENERIC_DEMO_FILES.has(f))
    .map((f) => join(demosDir, f));
  return [
    ...demoFiles,
    join(CLIENT_SRC, "pages", "marketing", "aiReceptionistDetail.tsx"),
    join(CLIENT_SRC, "pages", "marketing", "MapGuardSuitePage.tsx"),
    join(CLIENT_SRC, "config", "product-mockups.tsx"),
    join(CLIENT_SRC, "config", "comparisons.ts"),
    join(CLIENT_SRC, "site", "siteMap.ts"),
  ];
}

// A CTA target pointing at the bare top of /pricing (not /pricing#... and not
// /pricing/<sub>). Matches href / to / *CtaHref / ctaHref = "/pricing".
const BARE_PRICING_CTA = /(?:href|to|ctaHref|CtaHref|secondaryCtaHref|primaryCtaHref)\s*[:=]\s*["'`]\/pricing["'`]/;
// The canonical global-nav / footer link is labelled exactly "Pricing" (not
// "See/View Pricing") and legitimately opens the top of /pricing. Exempt it so
// the guard flags only product-specific CTAs.
const GENERIC_NAV_LABEL = /label\s*:\s*["'`]Pricing["'`]|>\s*Pricing\s*</;
const ANCHOR_RE = /\/pricing#price-([a-z0-9_-]+)/gi;

let scanned = 0;
let anchorsChecked = 0;
const violations: string[] = [];

for (const file of productScopedFiles()) {
  let src: string;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    // A listed explicit file was moved/renamed — surface it so the guard is
    // kept honest rather than silently passing.
    violations.push(`${file}: expected product-scoped file is missing (update the guard's file list).`);
    continue;
  }
  scanned++;
  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (BARE_PRICING_CTA.test(line) && !GENERIC_NAV_LABEL.test(line)) {
      violations.push(
        `${file}:${i + 1}: product-specific CTA points at bare /pricing (dead-ends on the Lead-Gen tab). Deep-link to /pricing#price-<id>.\n    ${line.trim()}`,
      );
    }
  });

  // Validate every deep-link anchor in this file resolves to a real card.
  let m: RegExpExecArray | null;
  ANCHOR_RE.lastIndex = 0;
  while ((m = ANCHOR_RE.exec(src)) !== null) {
    anchorsChecked++;
    const id = m[1];
    const resolved = SLUG_TO_PRODUCT_ID[id] ?? id;
    assert.ok(
      VALID_ANCHOR_IDS.has(id) || ALL_PRODUCTS.some((p) => p.id === resolved),
      `${file}: /pricing#price-${id} does not resolve to a real product id (hashchange handler would no-op). Valid ids: ${ALL_PRODUCTS.map((p) => p.id).join(", ")}.`,
    );
  }
}

assert.strictEqual(
  violations.length,
  0,
  `Product-specific pricing CTAs must deep-link to /pricing#price-<id>:\n\n${violations.join("\n")}\n`,
);

console.log(
  `pricing-cta deep-link guard OK — ${scanned} product-scoped files scanned, ${anchorsChecked} #price anchors validated, 0 bare-/pricing CTAs`,
);
