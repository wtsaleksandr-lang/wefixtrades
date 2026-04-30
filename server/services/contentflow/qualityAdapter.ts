/**
 * ContentFlow — quality adapter.
 *
 * Thin shim that translates surface-specific quality signals into the
 * kernel's QualitySignal shape. Sprint 1 only handles the SocialSync
 * case: the existing quality gate already ran inside
 * `services/socialSync/contentGenerator.ts` and wrote `quality_score`
 * onto the `socialsync_posts` row, so this adapter just reads it.
 *
 * Future callers (RankFlow articles, ad copy, etc.) will add their own
 * extract* functions here.
 */
import type { SocialSyncPost } from "@shared/schema";
import type { QualitySignal } from "./types";

/**
 * Read the quality signal from a SocialSync post that has already been
 * scored by `evaluateQuality()` in `qualityGate.ts`.
 */
export function extractFromSocialPost(post: SocialSyncPost): QualitySignal {
  const score = typeof post.quality_score === "number" ? post.quality_score : 0;
  return {
    score,
    verdict: score >= 60 ? "accept" : score >= 30 ? "regenerate" : "reject",
  };
}
