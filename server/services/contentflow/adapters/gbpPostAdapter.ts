/**
 * ContentFlow — Google Business Profile *post* adapter (Sprint 10).
 *
 * Wraps existing publishToGoogleBusiness (server/services/socialSync/
 * googleBusinessPublisher.ts). Distinct from Sprint 9's `gbp` adapter
 * which handles review-replies — different API endpoint
 * (accounts/.../localPosts vs accounts/.../reviews/.../reply).
 */

import { publishToGoogleBusiness } from "../../socialSync/googleBusinessPublisher";
import { makeSocialAdapter, type NormalisedPublishOutcome } from "./socialSyncAdapterCommon";
import type { PublishAdapter } from "./types";
import type { SocialSyncPost } from "@shared/schema";

async function publish(clientId: number, post: SocialSyncPost): Promise<NormalisedPublishOutcome> {
  const r = await publishToGoogleBusiness(clientId, post);
  return {
    success: r.success,
    remote_post_id: r.remote_post_id,
    page_id: r.location_name || null,
    published_at: r.published_at,
    error: r.error,
    error_code: r.error_code,
    permanent_failure: r.permanent_failure,
    rate_limited: r.rate_limited,
    raw: r.raw_response_summary,
  };
}

export const gbpPostAdapter: PublishAdapter = makeSocialAdapter({
  type: "gbp_post",
  metadataKey: "gbp_post",
  platform: "google_business",
  publish,
});
