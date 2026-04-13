/**
 * Prospect Targeting Service — V2
 *
 * Two responsibilities:
 *  1. assignTargetOffer — rule-based product match based on heuristic signals
 *  2. computePriorityScore — deterministic 0-100 score; higher = push sooner
 *
 * Both are pure functions (no DB access) called at import time and during
 * enrichment so the data is available for filtering and queue ordering.
 *
 * Offer slugs:
 *   quotequick       — needs a digital quote/booking tool
 *   reputationshield — weak reviews / no social proof
 *   socialsync       — has a website but no social/content presence
 *   tradeline        — no website but has phone (voice/AI channel)
 *   custom           — doesn't fit a single clear slot
 */

import type { ProspectEnrichment, Prospect } from "@shared/schema";

/* ═══════════════════════════════════════════
   Target Offer Assignment
   ═══════════════════════════════════════════ */

export type TargetOffer =
  | "quotequick"
  | "reputationshield"
  | "socialsync"
  | "tradeline"
  | "custom";

export interface OfferSignals {
  /** True if the prospect has a live website */
  has_website: boolean | null | undefined;
  /** 0–100 quality score for the website */
  website_quality_score: number | null | undefined;
  /** True if the site already has an online quote/booking tool */
  has_quote_tool: boolean | null | undefined;
  /** Google review count */
  google_review_count: number | null | undefined;
  /** Google rating 0–5 */
  google_rating: string | number | null | undefined;
  /** 0–100 social presence score */
  social_presence_score: number | null | undefined;
  /** Primary phone */
  primary_phone: string | null | undefined;
}

/**
 * Assign the best-fit WeFixTrades product for this prospect.
 *
 * Rules evaluated in priority order — first match wins:
 *
 *  1. tradeline       — no website AND has a phone number (pure voice/AI channel play)
 *  2. quotequick      — has website AND no quote tool AND reasonable website quality (>= 30)
 *  3. reputationshield — has website AND (< 10 reviews OR rating < 3.5)
 *  4. socialsync      — has website AND social presence score < 30
 *  5. custom          — fallback
 */
export function assignTargetOffer(signals: OfferSignals): TargetOffer {
  const {
    has_website,
    website_quality_score,
    has_quote_tool,
    google_review_count,
    google_rating,
    social_presence_score,
    primary_phone,
  } = signals;

  const hasWebsite = !!has_website;
  const hasPhone   = !!(primary_phone && primary_phone.replace(/\D/g, "").length >= 7);
  const wqs        = Number(website_quality_score ?? 0);
  const reviews    = Number(google_review_count ?? 0);
  const rating     = Number(google_rating ?? 0);
  const social     = Number(social_presence_score ?? 0);

  // Rule 1: tradeline — no website but reachable by phone
  if (!hasWebsite && hasPhone) return "tradeline";

  // Rule 2: quotequick — has website, no quote tool, decent site quality
  if (hasWebsite && !has_quote_tool && wqs >= 30) return "quotequick";

  // Rule 3: reputationshield — has website but weak review profile
  if (hasWebsite && (reviews < 10 || (rating > 0 && rating < 3.5))) return "reputationshield";

  // Rule 4: socialsync — has website but no social presence
  if (hasWebsite && social < 30) return "socialsync";

  return "custom";
}

/* ═══════════════════════════════════════════
   Priority Score
   ═══════════════════════════════════════════ */

/**
 * Compute a deterministic 0-100 priority score.
 * Higher = higher likelihood of conversion + higher urgency to contact.
 *
 * Scoring breakdown:
 *  Base:              20
 *  Has website:       +15
 *  Website quality    +10  (if >= 50)
 *  Likely owner-op:   +15  (owner/operator most likely to reply)
 *  AI quality score:  +15  (if enrichment quality_score >= 70)
 *  Contact confidence:+10 high / +5 medium / 0 low/none
 *  Has phone:         +5
 *  Google reviews:    +5   (if >= 10 reviews)
 *  Strong rating:     +5   (if rating >= 4.0)
 *  Total max:         100
 */
export interface PriorityInputs {
  has_website:             boolean | null | undefined;
  website_quality_score:   number  | null | undefined;
  likely_owner_operator:   boolean | null | undefined;
  quality_score:           number  | null | undefined;   // AI enrichment quality score
  contact_confidence:      string  | null | undefined;   // high | medium | low | none
  primary_phone:           string  | null | undefined;
  google_review_count:     number  | null | undefined;
  google_rating:           string  | number | null | undefined;
}

export function computePriorityScore(inputs: PriorityInputs): number {
  let score = 20;

  if (inputs.has_website)                                        score += 15;
  if (Number(inputs.website_quality_score ?? 0) >= 50)          score += 10;
  if (inputs.likely_owner_operator)                              score += 15;
  if (Number(inputs.quality_score ?? 0) >= 70)                  score += 15;

  const conf = inputs.contact_confidence ?? "none";
  if (conf === "high")   score += 10;
  else if (conf === "medium") score += 5;

  const hasPhone = !!(inputs.primary_phone && inputs.primary_phone.replace(/\D/g, "").length >= 7);
  if (hasPhone)                                                  score += 5;

  if (Number(inputs.google_review_count ?? 0) >= 10)             score += 5;
  if (Number(inputs.google_rating ?? 0) >= 4.0)                  score += 5;

  return Math.min(100, score);
}
