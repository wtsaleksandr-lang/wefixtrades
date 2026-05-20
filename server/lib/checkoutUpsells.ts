/**
 * Cross-sell upsells offered on Stripe Checkout via `optional_items`.
 *
 * Customer adds product X to cart → we surface 1-2 products that
 * AMPLIFY the value of X in the same checkout session. The customer
 * can toggle them on at the Stripe-hosted page; declining is the
 * default state.
 *
 * Design principles:
 *   1. Upsells must make obvious sense in the customer's journey —
 *      not random cross-sell. Each pairing has a clear "if you have X,
 *      Y makes it more valuable" story.
 *   2. Never surface a product the customer already has in cart.
 *   3. Never surface a higher tier of the same product (no in-product
 *      upsell — that's the tier picker's job).
 *   4. Cap at 2 upsells per cart to keep the Stripe Checkout page
 *      clean. Stripe allows up to 10 optional_items per session.
 *
 * Pairings (audit-aware — products may be deactivated; missing
 * stripe_price_id is filtered out at call site):
 */

const UPSELL_MAP: Record<string, string[]> = {
  // ─── TradeLine (call answering) → visibility + reputation ───
  // You can answer 24/7, now get more calls (Maps) and protect them (reviews).
  "tradeline-starter": ["mapguard-basic", "reputationshield-basic"],
  "tradeline-pro":     ["mapguard-pro",   "reputationshield-pro"],
  "tradeline-premium": ["mapguard-pro",   "reputationshield-pro"],

  // ─── MapGuard (visibility) → reputation ───
  // Ranking only converts if reviews are good.
  "mapguard-setup": ["mapguard-basic"], // one-time setup → ongoing management
  "mapguard-basic": ["reputationshield-basic"],
  "mapguard-pro":   ["reputationshield-pro"],

  // ─── ReputationShield (reviews) → social presence ───
  // Once reviews look good, build broader public presence.
  "reputationshield-basic":   ["socialsync-starter"],
  "reputationshield-pro":     ["socialsync-growth"],
  "reputationshield-premium": ["socialsync-pro"],

  // ─── SocialSync (social) → ads OR reputation foundation ───
  "socialsync-starter": ["reputationshield-basic"],
  "socialsync-growth":  ["adflow-starter"],
  "socialsync-pro":     ["adflow-growth"],

  // ─── QuoteQuick (quoting) → reputation (qualified leads convert better with strong reviews) ───
  // Wave Q — three-tier ladder (Free / Pro / Business). Legacy "starter" key
  // retained as an alias so any grandfathered checkout flows still surface the
  // right upsell; the marketing UI never offers a quotequick-starter SKU again.
  "quotequick-starter":  ["reputationshield-basic"],
  "quotequick-free":     ["reputationshield-basic"],
  "quotequick-pro":      ["reputationshield-basic"],
  "quotequick-business": ["reputationshield-basic"],

  // ─── One-time website services → ongoing care + visibility ───
  "webfix":     ["webcare-basic"],
  "sitelaunch": ["webcare-basic", "mapguard-setup"],

  // ─── AdFlow (paid ads) → organic visibility ───
  "adflow-starter": ["mapguard-basic"],
  "adflow-growth":  ["mapguard-pro"],
  "adflow-pro":     ["mapguard-pro"],

  // ─── WebCare → visibility ───
  "webcare-basic": ["mapguard-basic"],
  "webcare-pro":   ["mapguard-pro"],

  // ─── RankFlow (content) → social distribution ───
  "rankflow-starter": ["socialsync-starter"],
  "rankflow-growth":  ["socialsync-growth"],
  "rankflow-pro":     ["socialsync-pro"],
};

/**
 * Given the cart's service IDs, compute the best 1-2 upsell candidates.
 * Returns service_catalog IDs (caller must look up stripe_price_id +
 * filter by checkout mode compatibility).
 *
 *   - Dedupes against what's already in cart.
 *   - Dedupes the upsell list itself (multiple cart items might map to
 *     the same upsell).
 *   - Prefers upsells that map to MULTIPLE cart items (universal pairings).
 */
export function getUpsellsForCart(cartServiceIds: string[]): string[] {
  const cartSet = new Set(cartServiceIds);
  // Count how many cart items map to each candidate upsell — higher
  // count = stronger relevance signal.
  const candidateScores = new Map<string, number>();
  for (const id of cartServiceIds) {
    const mapped = UPSELL_MAP[id];
    if (!mapped) continue;
    for (const u of mapped) {
      if (cartSet.has(u)) continue;
      candidateScores.set(u, (candidateScores.get(u) ?? 0) + 1);
    }
  }
  // Sort by score desc, then alphabetically for stable output. Cap at 2.
  return Array.from(candidateScores.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([id]) => id);
}

export const _UPSELL_MAP = UPSELL_MAP; // exported for tests / inspection only
