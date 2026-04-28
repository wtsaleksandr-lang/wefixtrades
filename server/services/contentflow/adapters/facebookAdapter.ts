/**
 * ContentFlow — Facebook page-post adapter (Sprint 10).
 *
 * Wraps existing publishToFacebook (server/services/socialSync/
 * facebookPublisher.ts). Shares the cooldown / alert / metrics / persist
 * boilerplate via socialSyncAdapterCommon.dispatchSocialPublish.
 */

import { publishToFacebook } from "../../socialSync/facebookPublisher";
import { makeSocialAdapter, type NormalisedPublishOutcome } from "./socialSyncAdapterCommon";
import type { PublishAdapter } from "./types";
import type { SocialSyncPost } from "@shared/schema";

async function publish(clientId: number, post: SocialSyncPost): Promise<NormalisedPublishOutcome> {
  const r = await publishToFacebook(clientId, post);
  /* Facebook publisher distinguishes rate-limit by error_code (4/17/32/613).
   * Anything not permanent + not those codes = transient. */
  const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
  const isRateLimited = typeof r.error_code === "number" && RATE_LIMIT_CODES.has(r.error_code);
  return {
    success: r.success,
    remote_post_id: r.remote_post_id,
    page_id: r.page_id || null,
    published_at: r.published_at,
    error: r.error,
    error_code: r.error_code,
    permanent_failure: r.permanent_failure,
    rate_limited: isRateLimited,
    raw: r.raw_response_summary,
  };
}

export const facebookAdapter: PublishAdapter = makeSocialAdapter({
  type: "facebook",
  metadataKey: "facebook",
  platform: "facebook",
  publish,
});
