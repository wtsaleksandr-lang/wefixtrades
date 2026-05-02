/**
 * ContentFlow — Pinterest adapter.
 *
 * Wraps the pinterestPublisher for use with the ContentFlow publish
 * queue. Pinterest pins are dispatched through the same queue
 * lifecycle as other social channels.
 */

import { publishToPinterest } from "../pinterestPublisher";
import { storage } from "../../../storage";
import type { PublishAdapter, PublishAdapterOptions, PublishResult, AdapterType } from "./types";
import type { ContentDraft } from "@shared/schema";
import { createLogger } from "../../../lib/logger";

const log = createLogger("PinterestAdapter");

export const pinterestAdapter: PublishAdapter = {
  type: "pinterest" as AdapterType,

  async publish(draft: ContentDraft, _opts: PublishAdapterOptions = {}): Promise<PublishResult> {
    if (draft.kind !== "social_post") {
      return { ok: false, reason: "wrong_kind", message: `pinterestAdapter only handles social_post (got '${draft.kind}')`, retryable: false };
    }
    if (draft.status !== "approved") {
      return { ok: false, reason: "not_approved", message: `draft ${draft.id} status is ${draft.status}, not 'approved'`, retryable: false };
    }

    const meta = (draft.metadata || {}) as Record<string, any>;
    const imageUrl = meta.media_plan?.image_url || meta.media_plan?.url || null;

    if (!imageUrl) {
      return {
        ok: false,
        reason: "validation",
        message: "Pinterest requires an image URL in media_plan",
        retryable: false,
      };
    }

    const title = draft.title || "Trade photo";
    const description = draft.body || draft.excerpt || "";
    const link = draft.target_url || null;

    const result = await publishToPinterest(
      draft.client_id,
      imageUrl,
      title,
      description,
      link,
    );

    if (result.success) {
      /* Persist success on draft metadata. */
      try {
        const fresh = await storage.getContentDraftById(draft.id);
        if (fresh) {
          const existingMeta = (fresh.metadata || {}) as Record<string, any>;
          await storage.updateContentDraft(draft.id, {
            status: "published",
            target_url: result.pin_url || fresh.target_url,
            metadata: {
              ...existingMeta,
              pinterest: {
                ...(existingMeta.pinterest || {}),
                remote_post_id: result.remote_post_id,
                pin_url: result.pin_url,
                posted_at: new Date().toISOString(),
                error: null,
              },
            },
          } as any);
        }
      } catch (err: any) {
        log.warn(`Failed to persist Pinterest success for draft=${draft.id}: ${err?.message}`);
      }

      return {
        ok: true,
        externalId: result.remote_post_id || undefined,
        externalUrl: result.pin_url || undefined,
      };
    }

    /* Failure. */
    const retryable = !result.permanent_failure;
    return {
      ok: false,
      reason: result.rate_limited ? "rate_limit" : result.permanent_failure ? "auth" : "transient",
      message: result.error || "Pinterest publish failed",
      retryable,
    };
  },
};
