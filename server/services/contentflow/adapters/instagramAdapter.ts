/**
 * ContentFlow — Instagram Business adapter (Sprint 10).
 *
 * Wraps existing publishToInstagram (server/services/socialSync/
 * instagramPublisher.ts). Carousel posts (kind='carousel_post') ride the
 * same publisher today — the publisher reads media_plan to choose
 * single vs multi-image. Future Sprint 11+ may diverge.
 */

import { publishToInstagram, isRateLimitError as isIgRateLimitError } from "../../socialSync/instagramPublisher";
import { makeSocialAdapter, type NormalisedPublishOutcome } from "./socialSyncAdapterCommon";
import type { PublishAdapter } from "./types";
import type { SocialSyncPost } from "@shared/schema";

async function publish(clientId: number, post: SocialSyncPost): Promise<NormalisedPublishOutcome> {
  const r = await publishToInstagram(clientId, post);
  return {
    success: r.success,
    remote_post_id: r.remote_post_id,
    page_id: r.ig_account_id || null,
    published_at: r.published_at,
    error: r.error,
    error_code: r.error_code,
    permanent_failure: r.permanent_failure,
    rate_limited: isIgRateLimitError(r.error_code, r.error_subcode),
    raw: r.raw_response_summary,
  };
}

export const instagramAdapter: PublishAdapter = makeSocialAdapter({
  type: "instagram",
  metadataKey: "instagram",
  platform: "instagram",
  publish,
});
