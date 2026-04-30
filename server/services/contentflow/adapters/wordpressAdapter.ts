/**
 * ContentFlow — WordPress publish adapter (Sprint 8).
 *
 * Thin wrapper over the existing publishDraftToWordpress() function so
 * the publish queue worker can dispatch through a unified interface.
 * No business-logic change vs Sprint 4 — the adapter just shape-converts
 * WordpressPublishResult into the cross-adapter PublishResult shape.
 */

import { publishDraftToWordpress } from "../wordpressPublisher";
import type {
  PublishAdapter,
  PublishAdapterOptions,
  PublishResult,
  AdapterFailureReason,
} from "./types";
import type { ContentDraft } from "@shared/schema";

/* Map publisher reason → adapter reason. Mostly identity; collapses
 * draft-shape errors into the more generic AdapterFailureReason taxonomy
 * while keeping wp_error / network_error / insecure_destination explicit. */
function mapReason(reason: string): AdapterFailureReason {
  switch (reason) {
    case "draft_not_found":
    case "wrong_kind":
    case "wrong_surface":
    case "not_approved":
    case "missing_body":
    case "no_profile":
    case "wrong_cms_type":
    case "missing_credentials":
    case "encryption_unavailable":
    case "decrypt_failed":
    case "wp_error":
    case "network_error":
    case "insecure_destination":
      return reason as AdapterFailureReason;
    default:
      return "upstream_error";
  }
}

export const wordpressAdapter: PublishAdapter = {
  type: "wordpress",
  async publish(draft: ContentDraft, opts: PublishAdapterOptions = {}): Promise<PublishResult> {
    const status = opts.status === "publish" ? "publish" : "draft";
    const result = await publishDraftToWordpress(draft.id, {
      status,
      fetchImpl: opts.fetchImpl,
    });
    if (result.ok) {
      return {
        ok: true,
        externalId: result.post_id,
        externalUrl: result.post_url,
        raw: { wp_status: result.wp_status, published_at: result.published_at },
      };
    }
    /* Transient-vs-permanent hint: HTTP 5xx + network errors are
     * retryable; auth + validation are not. */
    const retryable =
      result.reason === "network_error" ||
      result.reason === "wp_error" ||
      (typeof result.http_status === "number" && result.http_status >= 500);
    return {
      ok: false,
      reason: mapReason(result.reason),
      message: result.message,
      http_status: result.http_status,
      retryable,
    };
  },
};
