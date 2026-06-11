/**
 * Lane A2 — marketing-chat PRODUCT MAP, derived from @shared/pricing.
 *
 * This map is the ONLY pricing source the anonymous sales-chat widget AI
 * (server/routes/marketingChatRoutes.ts) is allowed to quote — its prompt
 * hard-rules say "Never quote prices outside the PRODUCT MAP". Before Lane
 * A2 the map was hand-typed and 7 of 11 prices had drifted from canon
 * (TradeLine $149→$99, QuoteQuick $49→Free+$29, RankFlow $249→$349,
 * SocialSync $79→$99, SiteLaunch $1,499→$1,197, WebCare $49→$79,
 * MapSetup $399→$397). Every dollar figure below is now derived from
 * @shared/pricing (single source of truth) at module load, so drift is
 * structurally impossible.
 *
 * Kept as a pure, side-effect-free module (no express, no db) so the
 * pricing-truth regression test (server/services/knowledgeBase.test.ts,
 * run in CI via `npm run check:pricing-truth`) can import and compile it
 * directly.
 */
import {
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
  type ProductDef,
} from "@shared/pricing";
import { CITATION_TRACKER_PRICING } from "@shared/schemas/citationTracker";

/** "From $X/mo" for a multi-tier monthly product. */
function fromMonthly(product: ProductDef): string {
  return `From ${formatPrice(lowestMonthly(product)!)}/mo`;
}

/**
 * Citation Tracker's MapGuard-bundle add-on price ("$5"), used by the
 * prompt's cross-sell example. Derived from the canonical cents table in
 * shared/schemas/citationTracker.ts (standalone is $19/mo; the $5/mo rate
 * only exists as a MapGuard bundle add-on).
 */
export const CITATION_TRACKER_ADDON_MONTHLY = formatPrice(
  CITATION_TRACKER_PRICING.bundle_monthly_cents / 100,
);

/**
 * Build the PRODUCT MAP block body for the marketing-chat system prompt.
 * Copy/positioning is hand-written; every price is derived.
 */
export function buildMarketingProductMap(): string {
  return [
    `- MapGuard — Google Business Profile monitoring + AI insights. ${formatPrice(lowestMonthly(MAPGUARD)!)}/mo. Best for: "I want more bookings", "my Google ranking is bad", "people can't find me".`,
    // "MapGuard Suite" is the sales framing for the MapGuard Pro tier
    // (full local-SEO coverage incl. citation tooling) — price anchors to
    // the canonical Pro tier so it can never drift from checkout.
    `- MapGuard Suite — MapGuard + Citation Tracker + Citation Builder bundle. ${formatPrice(getTier(MAPGUARD, "Pro")!.price)}/mo. Best for: established trades who want full local-SEO coverage.`,
    `- MapSetup — One-time ${formatPrice(MAPGUARD.setup!)} GBP optimization. Best for: brand-new or neglected listings.`,
    `- TradeLine — AI phone + chat answering jobs 24/7. ${fromMonthly(TRADELINE)}. Best for: "I miss calls", "I can't answer at night", "I lose jobs to voicemail".`,
    `- QuoteQuick — Embeddable quote calculator. Free + from ${formatPrice(getTier(QUOTEQUICK, "Pro")!.price)}/mo. Best for: "I want website visitors to self-serve", "I get tyre-kickers I can't qualify".`,
    `- RankFlow — Ongoing SEO + content. ${fromMonthly(RANKFLOW)}. Best for: "I want long-term Google ranking", "I have a website but no traffic".`,
    `- ReputationShield — Review request automation + monitoring. ${fromMonthly(REPUTATIONSHIELD)}. Best for: "I need more 5-star reviews", "negative reviews are hurting me".`,
    `- SocialSync — AI social posts. ${fromMonthly(SOCIALSYNC)}. Best for: "I should post more but never have time".`,
    `- SiteLaunch — Done-for-you website build. ${formatPrice(SITELAUNCH.tiers[0].price)} one-time. Best for: "my site is bad/old/none".`,
    `- WebCare — Website maintenance. ${fromMonthly(WEBCARE)}. Best for: "I'm worried my site will break".`,
    `- AdFlow — Managed Google/Meta ads via agency partner. Custom. Best for: "I want paid leads NOW".`,
  ].join("\n");
}
