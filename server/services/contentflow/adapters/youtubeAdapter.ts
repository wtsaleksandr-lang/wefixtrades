/**
 * ContentFlow — YouTube adapter (Sprint 18).
 *
 * Wraps youtubePublisher for use with the ContentFlow publish queue.
 * YouTube uploads are dispatched through the same queue lifecycle as
 * other channels.
 *
 * Reads Google OAuth credentials from client metadata (the same
 * credentials used for GBP). Videos are uploaded as "unlisted" by
 * default unless the draft metadata specifies otherwise.
 */

import { uploadToYouTube } from "../youtubePublisher";
import { storage } from "../../../storage";
import type { PublishAdapter, PublishAdapterOptions, PublishResult, AdapterType } from "./types";
import type { ContentDraft } from "@shared/schema";
import { createLogger } from "../../../lib/logger";

const log = createLogger("YouTubeAdapter");

export const youtubeAdapter: PublishAdapter = {
  type: "youtube" as AdapterType,

  async publish(draft: ContentDraft, _opts: PublishAdapterOptions = {}): Promise<PublishResult> {
    if (draft.kind !== "video") {
      return { ok: false, reason: "wrong_kind", message: `youtubeAdapter only handles video (got '${draft.kind}')`, retryable: false };
    }
    if (draft.status !== "approved") {
      return { ok: false, reason: "not_approved", message: `draft ${draft.id} status is ${draft.status}, not 'approved'`, retryable: false };
    }

    const meta = (draft.metadata || {}) as Record<string, any>;
    const videoUrl = meta.media_plan?.video_url;
    if (!videoUrl) {
      return { ok: false, reason: "missing_body", message: "Draft has no video_url in media_plan", retryable: false };
    }

    // Load client to get Google OAuth credentials
    const client = await storage.getClientById(draft.client_id);
    if (!client) {
      return { ok: false, reason: "validation", message: "Client not found", retryable: false };
    }

    const clientMeta = (client.metadata || {}) as Record<string, any>;
    const googleCreds = clientMeta.google_credentials || clientMeta.google_business_credentials;
    if (!googleCreds?.access_token) {
      return { ok: false, reason: "missing_credentials", message: "No Google OAuth credentials for this client", retryable: false };
    }

    // Build upload options from draft metadata
    const thumbnailUrl = meta.media_plan?.image_url || meta.media_plan?.thumbnail_url || undefined;
    const videoScript = meta.video_script || {};
    const tags = [
      ...(meta.tags || []),
      client.trade_type || "",
      "tips",
      "howto",
    ].filter(Boolean).slice(0, 20);

    const description = [
      draft.body || videoScript.intro || "",
      "",
      videoScript.cta || "",
      "",
      `Visit: ${client.website_url || ""}`,
    ].filter((l) => l !== undefined).join("\n").trim();

    const result = await uploadToYouTube({
      videoUrl,
      title: draft.title || "Video",
      description,
      tags,
      thumbnailUrl,
      privacyStatus: (meta.youtube?.privacy_status as any) || "unlisted",
      scheduledPublishAt: meta.youtube?.scheduled_publish_at || undefined,
      credentials: {
        access_token: googleCreds.access_token,
        refresh_token: googleCreds.refresh_token,
        client_id: googleCreds.client_id,
        client_secret: googleCreds.client_secret,
      },
    });

    if (result) {
      // Persist success on draft metadata
      try {
        const fresh = await storage.getContentDraftById(draft.id);
        if (fresh) {
          const existingMeta = (fresh.metadata || {}) as Record<string, any>;
          await storage.updateContentDraft(draft.id, {
            status: "published",
            target_url: result.youtubeUrl,
            metadata: {
              ...existingMeta,
              youtube: {
                ...(existingMeta.youtube || {}),
                remote_video_id: result.youtubeVideoId,
                youtube_url: result.youtubeUrl,
                posted_at: new Date().toISOString(),
                error: null,
              },
            },
          } as any);
        }
      } catch (err: any) {
        log.warn(`Failed to persist YouTube success for draft=${draft.id}: ${err?.message}`);
      }

      log.info(`YouTube upload succeeded: draft=${draft.id} videoId=${result.youtubeVideoId}`);
      return {
        ok: true,
        externalId: result.youtubeVideoId,
        externalUrl: result.youtubeUrl,
      };
    }

    // Failure — treat as transient (can retry)
    return {
      ok: false,
      reason: "transient",
      message: "YouTube upload failed",
      retryable: true,
    };
  },
};
