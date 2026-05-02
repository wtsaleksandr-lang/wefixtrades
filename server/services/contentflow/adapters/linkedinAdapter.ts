/**
 * ContentFlow — LinkedIn adapter.
 *
 * Wraps the linkedinPublisher for use with the ContentFlow publish
 * queue. LinkedIn posts are dispatched through the same queue
 * lifecycle as other social channels.
 */

import { publishToLinkedIn } from "../linkedinPublisher";
import { storage } from "../../../storage";
import type { PublishAdapter, PublishAdapterOptions, PublishResult, AdapterType } from "./types";
import type { ContentDraft } from "@shared/schema";
import { createLogger } from "../../../lib/logger";

const log = createLogger("LinkedInAdapter");

export const linkedinAdapter: PublishAdapter = {
  type: "linkedin" as AdapterType,

  async publish(draft: ContentDraft, _opts: PublishAdapterOptions = {}): Promise<PublishResult> {
    if (draft.kind !== "social_post") {
      return { ok: false, reason: "wrong_kind", message: `linkedinAdapter only handles social_post (got '${draft.kind}')`, retryable: false };
    }
    if (draft.status !== "approved") {
      return { ok: false, reason: "not_approved", message: `draft ${draft.id} status is ${draft.status}, not 'approved'`, retryable: false };
    }

    const text = draft.body || "";
    if (!text.trim()) {
      return { ok: false, reason: "missing_body", message: "Draft has no body text", retryable: false };
    }

    /* Extract optional image URL from media_plan metadata. */
    const meta = (draft.metadata || {}) as Record<string, any>;
    const imageUrl = meta.media_plan?.image_url || meta.media_plan?.url || null;

    const result = await publishToLinkedIn(draft.client_id, text, imageUrl);

    if (result.success) {
      /* Persist success on draft metadata. */
      try {
        const fresh = await storage.getContentDraftById(draft.id);
        if (fresh) {
          const existingMeta = (fresh.metadata || {}) as Record<string, any>;
          await storage.updateContentDraft(draft.id, {
            status: "published",
            metadata: {
              ...existingMeta,
              linkedin: {
                ...(existingMeta.linkedin || {}),
                remote_post_id: result.remote_post_id,
                posted_at: new Date().toISOString(),
                error: null,
              },
            },
          } as any);
        }
      } catch (err: any) {
        log.warn(`Failed to persist LinkedIn success for draft=${draft.id}: ${err?.message}`);
      }

      return {
        ok: true,
        externalId: result.remote_post_id || undefined,
      };
    }

    /* Failure. */
    const retryable = !result.permanent_failure;
    return {
      ok: false,
      reason: result.rate_limited ? "rate_limit" : result.permanent_failure ? "auth" : "transient",
      message: result.error || "LinkedIn publish failed",
      retryable,
    };
  },
};
