/**
 * ContentFlow — publish adapter interface (Sprint 8).
 *
 * One interface per destination type. The publish queue worker is
 * destination-agnostic: it claims a draft, looks up the right adapter
 * via the registry, and calls `publish(draft, opts)`. Adding a new
 * channel is one new file in this folder + one registry entry.
 *
 * Sprint 8 ships with the `wordpress` adapter wrapping the existing
 * publishDraftToWordpress() function. Future adapters (facebook,
 * instagram, gbp, generic_export) will wrap the existing SocialSync
 * publishers under the same shape.
 */

import type { ContentDraft } from "@shared/schema";

export type AdapterType =
  | "wordpress"
  | "facebook"
  | "instagram"
  | "gbp"           // GBP review-reply (Sprint 9)
  | "gbp_post"      // GBP standalone post (Sprint 10)
  | "email"         // Newsletter / repurposed-article email (Sprint 13)
  | "linkedin"      // LinkedIn UGC posts (Sprint 18)
  | "pinterest"     // Pinterest pins (Sprint 18)
  | "youtube"       // YouTube video uploads (Sprint 18)
  | "generic_export";

export interface PublishAdapterOptions {
  /** WP post status hint, FB scheduled-vs-immediate, etc. — adapter-specific. */
  status?: "draft" | "publish" | string;
  /** Optional fetch override for tests (where applicable). */
  fetchImpl?: typeof fetch;
}

export type AdapterFailureReason =
  | "auth"
  | "validation"
  | "rate_limit"
  | "upstream_error"
  | "transient"
  | "missing_credentials"
  | "wrong_kind"
  | "wrong_surface"
  | "not_approved"
  | "missing_body"
  | "encryption_unavailable"
  | "decrypt_failed"
  | "draft_not_found"
  | "no_profile"
  | "wrong_cms_type"
  | "wp_error"
  | "network_error"
  | "insecure_destination"
  /* Sprint 10: cooldown short-circuit. Adapter returns this when the
   * platform's cooldown manager says we're rate-limited from a prior
   * request. The queue worker treats it specially: leave queued, do
   * NOT increment attempts, retry next tick. */
  | "cooling_down"
  /* W-AX-2: recipient is on the unsubscribe list. Email adapter drops
   * with audit; queue worker treats as terminal (no retry). */
  | "recipient_unsubscribed";

export type PublishResult =
  | { ok: true; externalId?: string | number; externalUrl?: string; raw?: Record<string, unknown> }
  | { ok: false; reason: AdapterFailureReason; message: string; http_status?: number; retryable?: boolean };

export interface PublishAdapter {
  readonly type: AdapterType;
  /**
   * Push a draft out to the destination. MUST persist the success/failure
   * shape the queue worker expects (the adapter is responsible for writing
   * its own destination-specific metadata; the queue layers in the
   * cross-cutting queue_status / locking fields).
   *
   * Implementation contract:
   *   - Never throw on expected errors (auth, validation, upstream 5xx).
   *     Return { ok: false, reason, message }.
   *   - Throwing IS allowed only on truly unexpected programmer errors
   *     and is treated by the queue worker as a transient failure.
   */
  publish(draft: ContentDraft, opts?: PublishAdapterOptions): Promise<PublishResult>;
}
