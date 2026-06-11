/**
 * Derived pricing copy shared by the vs-competitor compare pages
 * (CompareVsJobber, CompareVsHousecallPro, CompareVsServiceTitan).
 *
 * LEGAL / TRUTHFULNESS RULE (Lane A, 2026-06-10): these pages previously
 * advertised a fabricated "Starter $9 / Growth $49 / Scale $149" platform
 * bundle that never existed anywhere in checkout. Advertising plans we do
 * not sell is a false-advertising exposure. Every WeFixTrades figure on a
 * compare page MUST derive from shared/pricing.ts (the single source of
 * truth) so any repricing there flows through automatically. NEVER
 * hardcode our own dollar amounts in compare-page copy — competitor
 * figures are the only hardcoded prices allowed, sourced from their
 * public listings as of each page's publishedDate.
 */
import {
  ALL_PRODUCTS,
  TRADELINE,
  CONTENTFLOW,
  QUOTEQUICK,
  BUNDLE_STARTER,
  BUNDLE_GROWTH,
  BUNDLE_PRO,
  lowestMonthly,
  formatPrice,
  type BundleDef,
} from "@shared/pricing";

/* Lowest PAID monthly price anywhere in the catalogue. lowestMonthly()
 * includes $0 free tiers, so filter those out before taking the min —
 * "from $X/mo" must point at a price someone actually pays. */
const LOWEST_PAID_MONTHLY = Math.min(
  ...ALL_PRODUCTS.flatMap((p) => p.tiers)
    .filter((t) => t.billingPeriod === "monthly" && t.price > 0)
    .map((t) => t.price),
);

/** e.g. "$9" — catalogue-wide paid entry price (ContentFlow Starter today). */
export const ENTRY_PRICE = formatPrice(LOWEST_PAID_MONTHLY);

/** e.g. "$99" — TradeLine's lowest monthly tier (TradeLine has no free tier). */
export const TRADELINE_FROM = formatPrice(lowestMonthly(TRADELINE)!);

/* Real, purchasable bundles — names + prices straight from shared/pricing.ts. */
export const STARTER_BUNDLE_NAME = BUNDLE_STARTER.name;
export const STARTER_BUNDLE_PRICE = formatPrice(BUNDLE_STARTER.price);
export const GROWTH_BUNDLE_NAME = BUNDLE_GROWTH.name;
export const GROWTH_BUNDLE_PRICE = formatPrice(BUNDLE_GROWTH.price);
export const PRO_BUNDLE_NAME = BUNDLE_PRO.name;
export const PRO_BUNDLE_PRICE = formatPrice(BUNDLE_PRO.price);

/** "MapGuard Basic + ReputationShield Basic + …" — derived from the bundle's
 * own includes list so composition changes flow through automatically. */
function bundleContents(bundle: BundleDef): string {
  return bundle.includes
    .map((item) => item.label.split("—")[0].trim())
    .join(" + ");
}

/** TL;DR "Starts at" cell — identical on all three compare pages. */
export const STARTS_AT_US = `Free tiers (QuoteQuick, ContentFlow) · paid plans from ${ENTRY_PRICE}/mo`;

/** Feature-matrix "Starts at" cell (short form). */
export const MATRIX_STARTS_AT_US = `Free · paid from ${ENTRY_PRICE}/mo`;

/** TL;DR "Free tier" cell — honest scope: QuoteQuick + ContentFlow only. */
export const FREE_TIER_US = "Yes — QuoteQuick + ContentFlow free plans";

/** "Our pricing" bullets for the pricing-comparison card — real products and
 * real bundles only, every figure derived from shared/pricing.ts. */
export const OUR_PRICING_BULLETS: string[] = [
  `Free plans — ${QUOTEQUICK.name} (instant quotes) and ${CONTENTFLOW.name} (AI content). No card required.`,
  `Single products from ${ENTRY_PRICE}/mo (${CONTENTFLOW.name} Starter) · ${TRADELINE.name} AI voice from ${TRADELINE_FROM}/mo`,
  `${BUNDLE_STARTER.name} — ${STARTER_BUNDLE_PRICE}/mo (${bundleContents(BUNDLE_STARTER)})`,
  `${BUNDLE_GROWTH.name} — ${GROWTH_BUNDLE_PRICE}/mo (${bundleContents(BUNDLE_GROWTH)})`,
  `${BUNDLE_PRO.name} — ${PRO_BUNDLE_PRICE}/mo (${bundleContents(BUNDLE_PRO)})`,
  "Month-to-month, cancel anytime.",
];
