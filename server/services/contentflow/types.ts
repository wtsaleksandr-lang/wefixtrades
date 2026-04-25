/**
 * ContentFlow — shared type contracts.
 *
 * These types describe the kernel surface that SocialSync and RankFlow
 * will both flow through. Sprint 1 only exercises the SocialSync path.
 */

export type ContentDraftKind = "social_post" | "article" | "caption";

export type ContentDraftSurface = "socialsync" | "rankflow";

export type ContentDraftStatus =
  | "draft"
  | "awaiting_admin"
  | "awaiting_client"
  | "approved"
  | "rejected"
  | "published"
  | "delivered"
  | "failed";

export type ApprovalActorType = "admin" | "client" | "system";

export type ApprovalAction =
  | "submitted"
  | "approved"
  | "rejected"
  | "auto_approved"
  | "edited";

/**
 * Quality signal extracted from an existing artefact (e.g. a SocialSync
 * post whose quality gate already ran during generation). Kept surface-
 * agnostic so future RankFlow article paths can produce the same shape.
 */
export interface QualitySignal {
  score: number;             // 0-100
  verdict?: "accept" | "regenerate" | "reject";
  notes?: unknown;            // structured gate output (flags, reasons, etc.)
}
