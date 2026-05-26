/**
 * ContentFlow API — social post dispatcher (Wave 20).
 *
 * Wraps the existing SocialSync `generatePostFromTopic()` path so it
 * appears in the unified content_requests + content_pipeline_log tables.
 *
 * Why we don't ship a new prompt builder: SocialSync's per-platform
 * prompts (Facebook / Instagram / Google Business / LinkedIn) carry
 * platform-specific length + hashtag rules that are part of the
 * delivery layer, not generic content rules. Keeping them adjacent to
 * the social orchestrator is correct. What changes in Wave 20 is that
 * EVERY social post passes through this dispatcher — so the admin
 * pipeline page shows them alongside RankFlow articles + standalone
 * ContentFlow output.
 *
 * Callers (`SocialSync orchestrator`, `manual admin trigger`) provide
 * `metadata.profileId` + `metadata.topicId` + `metadata.platform`. The
 * dispatcher resolves them, runs generatePostFromTopic, and writes the
 * result back to content_requests.
 */

import { storage } from "../../storage";
import { generatePostFromTopic } from "../socialSync/contentGenerator";
import { getContent, markStage, type ContentError } from "./api";
import { createLogger } from "../../lib/logger";

const log = createLogger("ContentFlow:DispatchSocial");

export async function dispatchSocialPostRequest(requestId: string): Promise<void> {
  const req = await getContent(requestId);
  if (!req) {
    log.warn("dispatcher: requestId not found", { requestId });
    return;
  }

  const payload = (req.payload ?? {}) as any;
  const meta = (payload?.metadata as Record<string, any> | undefined) ?? {};

  const platform: string | undefined = meta.platform;
  const profileId: number | undefined = meta.profileId;
  const topicId: number | undefined = meta.topicId;
  const scheduledFor: string | Date | undefined = meta.scheduledFor;

  if (!req.clientId || !platform || !topicId) {
    const err: ContentError = {
      stage: "fetch_brief",
      message: "social_post request missing clientId / platform / topicId",
      retryable: false,
    };
    await markStage(requestId, "failed", { errors: [err] });
    return;
  }

  const profile = await storage.getSocialSyncProfile(req.clientId);
  if (!profile) {
    await markStage(requestId, "failed", {
      errors: [
        {
          stage: "fetch_brief",
          message: `no socialsync profile for client ${req.clientId}`,
          retryable: false,
        },
      ],
    });
    return;
  }

  const topics = await storage.listSocialSyncTopics(req.clientId);
  const topic = topics.find((t) => t.id === topicId);
  if (!topic) {
    await markStage(requestId, "failed", {
      errors: [
        {
          stage: "fetch_brief",
          message: `topic ${topicId} not found for client ${req.clientId}`,
          retryable: false,
        },
      ],
    });
    return;
  }

  await markStage(requestId, "quality_check");

  const scheduled = scheduledFor ? new Date(scheduledFor) : undefined;
  const result = await generatePostFromTopic(profile, topic, platform, scheduled);

  if (!result.post) {
    const reason = result.rejectionReason ?? result.error ?? "post not produced";
    await markStage(requestId, "failed", {
      errors: [
        {
          stage: result.rejected ? "quality_gate" : "llm_generation",
          message: reason,
          retryable: !result.rejected,
        },
      ],
    });
    return;
  }

  await markStage(requestId, "approved", {
    qualityScore: result.post.quality_score ?? null,
    payload: {
      title: null,
      excerpt: result.post.caption ?? null,
      article: result.post.post_text,
      metadata: {
        platform,
        postId: result.post.id,
        topicId,
        hashtags: result.post.hashtags,
        media_plan: result.post.media_plan,
      },
    },
  });
}
