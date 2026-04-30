/**
 * ContentFlow — review-reply approval policy (Sprint 9).
 *
 * Decides whether an ingested review's AI-drafted reply should be
 * auto-approved + enqueued, or held in `draft` status pending manual
 * approval (admin or client portal).
 *
 * Policy is read from `clients.metadata.review_reply_policy`. Sprint 9
 * defines three values; the policy UI to flip between them per-client
 * is deferred to Sprint 10 — Sprint 9 ships only the logic.
 *
 *   "auto_high_star" (DEFAULT, preserves pre-Sprint-9 behaviour):
 *       4-5 stars → auto-approve
 *       1-3 stars → manual approval
 *
 *   "manual_all":
 *       every star rating → manual approval
 *
 *   "auto_all":
 *       every star rating → auto-approve
 *
 * Escalated reviews (escalation_flag=true) ALWAYS require manual
 * approval regardless of policy. Reviews that already have an owner
 * reply are skipped upstream and never reach this function.
 */

import type { Review, Client } from "@shared/schema";

export type ReviewReplyPolicy = "auto_high_star" | "manual_all" | "auto_all";

export interface PolicyDecision {
  /** True → autoApprove + enqueue; false → leave draft pending manual approval. */
  autoApprove: boolean;
  /** Why the decision was made — surfaced in audit logs. */
  reason:
    | "policy_auto_high_star_match"
    | "policy_auto_high_star_low_rating"
    | "policy_manual_all"
    | "policy_auto_all"
    | "escalated"
    | "default_fallback";
}

export const DEFAULT_POLICY: ReviewReplyPolicy = "auto_high_star";

export function readClientPolicy(client: Client | null | undefined): ReviewReplyPolicy {
  const meta = (client?.metadata || {}) as Record<string, any>;
  const raw = meta.review_reply_policy;
  if (raw === "auto_high_star" || raw === "manual_all" || raw === "auto_all") {
    return raw;
  }
  return DEFAULT_POLICY;
}

/**
 * Decide whether to auto-approve based on the client's policy and the
 * review's star rating + escalation flag. Pure function — caller does
 * the actual storage writes.
 */
export function decideAutoApprove(
  policy: ReviewReplyPolicy,
  review: Pick<Review, "star_rating" | "escalation_flag">,
): PolicyDecision {
  if (review.escalation_flag) {
    return { autoApprove: false, reason: "escalated" };
  }
  switch (policy) {
    case "manual_all":
      return { autoApprove: false, reason: "policy_manual_all" };
    case "auto_all":
      return { autoApprove: true, reason: "policy_auto_all" };
    case "auto_high_star": {
      const stars = review.star_rating ?? 0;
      if (stars >= 4) return { autoApprove: true, reason: "policy_auto_high_star_match" };
      return { autoApprove: false, reason: "policy_auto_high_star_low_rating" };
    }
    default:
      return { autoApprove: false, reason: "default_fallback" };
  }
}
