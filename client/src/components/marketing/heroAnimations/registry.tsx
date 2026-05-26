/**
 * Wave 13 — hero animation registry.
 *
 * Lazy-loads each per-product / per-trade animation so a marketing page only
 * pulls the one chunk it needs. The home page or product index never loads
 * the full set — visiting `/products/mapguard` pulls MapGuardHeroAnimation
 * alone (~12-20KB gzipped).
 */

import { lazy, Suspense, type ReactNode } from "react";
import GenericTradeHeroAnimation from "./GenericTradeHeroAnimation";

/* ─── Per-product animations ─────────────────────────────────── */
const PRODUCT_ANIMATIONS: Record<string, ReturnType<typeof lazy>> = {
  mapguard: lazy(() => import("./MapGuardHeroAnimation")),
  tradeline: lazy(() => import("./TradeLineHeroAnimation")),
  quickquotepro: lazy(() => import("./QuoteQuickHeroAnimation")),
  contentflow: lazy(() => import("./ContentFlowHeroAnimation")),
  reputationshield: lazy(() => import("./ReputationShieldHeroAnimation")),
  webfix: lazy(() => import("./WebFixHeroAnimation")),
  sitelaunch: lazy(() => import("./SiteLaunchHeroAnimation")),
  webcare: lazy(() => import("./WebCareHeroAnimation")),
  rankflow: lazy(() => import("./RankFlowHeroAnimation")),
  adflow: lazy(() => import("./AdFlowHeroAnimation")),
  socialsync: lazy(() => import("./SocialSyncHeroAnimation")),
  // BookFlow rolled into QuoteQuick — points at the same animation.
  bookflow: lazy(() => import("./QuoteQuickHeroAnimation")),
  // Citation tracker is the MapGuard Suite bonus animation.
  "citation-tracker": lazy(() => import("./CitationTrackerHeroAnimation")),
};

/* ─── Per-trade animations ───────────────────────────────────── */
const TRADE_ANIMATIONS: Record<string, ReturnType<typeof lazy>> = {
  // Solution slugs use the `for-<trade>` form.
  "for-plumbers": lazy(() => import("./trades/PlumbingHeroAnimation")),
  "for-hvac": lazy(() => import("./trades/HvacHeroAnimation")),
  "for-electricians": lazy(() => import("./trades/ElectricalHeroAnimation")),
  "for-roofers": lazy(() => import("./trades/RoofingHeroAnimation")),
  "for-cleaners": lazy(() => import("./trades/HouseCleaningHeroAnimation")),
  "for-landscapers": lazy(() => import("./trades/LandscapingHeroAnimation")),
  "for-painters": lazy(() => import("./trades/PaintingHeroAnimation")),
  "for-general-contractors": lazy(() => import("./trades/GeneralContractorHeroAnimation")),
  "for-handymen": lazy(() => import("./trades/HandymanHeroAnimation")),
  "for-locksmiths": lazy(() => import("./trades/LocksmithHeroAnimation")),
  "for-garage-door": lazy(() => import("./trades/GarageDoorHeroAnimation")),
  "for-pest-control": lazy(() => import("./trades/PestControlHeroAnimation")),
  // Painter/remodeler/GC sister slugs map to the closest match.
  "for-remodelers": lazy(() => import("./trades/GeneralContractorHeroAnimation")),
};

/* ─── Fallback frame ─────────────────────────────────────────── */
function AnimationFallback() {
  return (
    <div
      data-testid="hero-animation-loading"
      style={{
        width: "100%",
        maxWidth: 460,
        aspectRatio: "1 / 1",
        borderRadius: 20,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    />
  );
}

/**
 * Renders the right-side animation for a product page. Falls back to the
 * generic trade animation if the slug isn't registered.
 */
export function ProductHeroAnimation({ slug }: { slug: string }): ReactNode {
  const Animation = PRODUCT_ANIMATIONS[slug];
  if (!Animation) {
    return <GenericTradeHeroAnimation />;
  }
  return (
    <Suspense fallback={<AnimationFallback />}>
      <Animation />
    </Suspense>
  );
}

/**
 * Renders the right-side animation for a per-trade solutions page. Falls
 * back to the generic trade animation for trades not in the top-12.
 */
export function TradeHeroAnimation({ slug }: { slug: string }): ReactNode {
  const Animation = TRADE_ANIMATIONS[slug];
  if (!Animation) {
    return <GenericTradeHeroAnimation />;
  }
  return (
    <Suspense fallback={<AnimationFallback />}>
      <Animation />
    </Suspense>
  );
}
