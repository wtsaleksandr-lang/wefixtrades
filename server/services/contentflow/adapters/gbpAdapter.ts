/**
 * ContentFlow — Google Business Profile review-reply adapter (Sprint 9).
 *
 * Wraps the existing postGBPReply (gbpReviewIngestion.ts). Used by the
 * publish queue worker when a draft has kind='review_reply'.
 *
 * Persistence on success:
 *   - draft.status            → 'published'
 *   - draft.metadata.gbp      → { ...existing, posted_at, reply_result, error: null }
 *   - reviews.reply_status    → 'manually_replied' (admin-approved) or
 *                                'auto_replied' (policy auto-approve)
 *   - reviews.reply_posted_at → now
 *   - reviews.reply_result    → API response payload
 *
 * Sprint 9 keeps the queue lifecycle keys (queue_status / locked_at /
 * attempts / dead_letter_at) under metadata.gbp.* — analogous to
 * metadata.wordpress.* for the WordPress side.
 */

import { storage } from "../../../storage";
import { postGBPReply } from "../../reputation/gbpReviewIngestion";
import { getGoogleAccessToken } from "../../socialSync/googleBusinessService";
import type {
  PublishAdapter,
  PublishAdapterOptions,
  PublishResult,
  AdapterFailureReason,
} from "./types";
import type { ContentDraft } from "@shared/schema";

interface GbpDraftMeta {
  /** DB id of the linked reviews row. Required. */
  review_id?: number;
  /** Google API review id (last segment of the resource name). Required. */
  external_review_id?: string;
  /** Snapshot of how the draft was approved — drives reviews.reply_status. */
  source?: "auto" | "admin" | "client";
  /** Sprint 9 queue lifecycle (mirrors metadata.wordpress.*). */
  queue_status?: "queued" | "publishing" | "published" | "failed";
  attempts?: number;
  scheduled_for?: string | null;
  last_attempt_at?: string;
  locked_at?: string | null;
  locked_by?: string | null;
  dead_letter_at?: string | null;
  posted_at?: string;
  reply_result?: Record<string, unknown> | null;
  error?: string | null;
  last_error?: string | null;
}

function getGbpMeta(draft: ContentDraft): GbpDraftMeta {
  return ((draft.metadata as any)?.gbp as GbpDraftMeta | undefined) ?? {};
}

async function persistFailure(draftId: number, errorMsg: string): Promise<void> {
  try {
    const draft = await storage.getContentDraftById(draftId);
    if (!draft) return;
    const meta = (draft.metadata || {}) as Record<string, any>;
    const gbp = (meta.gbp || {}) as GbpDraftMeta;
    await storage.updateContentDraft(draftId, {
      metadata: {
        ...meta,
        gbp: {
          ...gbp,
          error: errorMsg.slice(0, 500),
          last_error: errorMsg.slice(0, 500),
        },
      },
    } as any);
  } catch (err: any) {
    console.error(`[contentflow][gbp] failed to persist failure for draft ${draftId}: ${err?.message || err}`);
  }
}

async function persistSuccess(
  draftId: number,
  postedAt: string,
  replyResult: Record<string, unknown>,
): Promise<void> {
  const fresh = await storage.getContentDraftById(draftId);
  if (!fresh) return;
  const meta = (fresh.metadata || {}) as Record<string, any>;
  const gbp = (meta.gbp || {}) as GbpDraftMeta;
  await storage.updateContentDraft(draftId, {
    status: "published",
    metadata: {
      ...meta,
      gbp: {
        ...gbp,
        posted_at: postedAt,
        reply_result: replyResult,
        error: null,
      },
    },
  } as any);
}

async function persistOnReview(
  reviewId: number,
  replyText: string,
  replyResult: Record<string, unknown>,
  source: "auto" | "admin" | "client",
): Promise<void> {
  try {
    await storage.updateReview(reviewId, {
      reply_status: source === "auto" ? "auto_replied" : "manually_replied",
      reply_text: replyText,
      reply_posted_at: new Date(),
      reply_result: replyResult,
    } as any);
  } catch (err: any) {
    /* Non-fatal — the GBP call already succeeded. Log only. */
    console.error(`[contentflow][gbp] reviews row ${reviewId} update failed: ${err?.message || err}`);
  }
}

export const gbpAdapter: PublishAdapter = {
  type: "gbp",
  async publish(draft: ContentDraft, _opts: PublishAdapterOptions = {}): Promise<PublishResult> {
    const logPrefix = `[contentflow][gbp]`;

    if (draft.kind !== "review_reply") {
      return { ok: false, reason: "wrong_kind" as AdapterFailureReason, message: `gbpAdapter only handles kind='review_reply' (got '${draft.kind}')`, retryable: false };
    }
    if (draft.surface !== "reputationshield") {
      return { ok: false, reason: "wrong_surface" as AdapterFailureReason, message: `gbpAdapter only handles surface='reputationshield' (got '${draft.surface}')`, retryable: false };
    }
    if (draft.status !== "approved") {
      return { ok: false, reason: "not_approved" as AdapterFailureReason, message: `draft ${draft.id} status is ${draft.status}, not 'approved'`, retryable: false };
    }

    const replyText = (draft.body || "").trim();
    if (replyText.length < 5) {
      return { ok: false, reason: "validation", message: "Reply text too short (min 5 chars)", retryable: false };
    }
    if (replyText.length > 4096) {
      return { ok: false, reason: "validation", message: "Reply text too long (max 4096 chars)", retryable: false };
    }

    const meta = getGbpMeta(draft);
    if (!meta.external_review_id) {
      await persistFailure(draft.id, "metadata.gbp.external_review_id missing on draft");
      return { ok: false, reason: "validation", message: "external_review_id missing on draft", retryable: false };
    }

    /* Defence-in-depth: never re-post if posted_at is already set. */
    if (meta.posted_at) {
      return { ok: true, externalId: meta.external_review_id, raw: { already_posted_at: meta.posted_at } };
    }

    /* Load credentials. */
    const credentials = await getGoogleAccessToken(draft.client_id);
    if (!credentials) {
      const msg = "Google Business connection missing or expired";
      await persistFailure(draft.id, msg);
      return { ok: false, reason: "auth", message: msg, retryable: false };
    }

    /* Call the existing postGBPReply (now apiBase-overridable for tests). */
    const result = await postGBPReply(
      credentials.token,
      credentials.locationName,
      meta.external_review_id,
      replyText,
    );

    if (!result.success) {
      const errMsg = result.error || "unknown GBP error";
      console.error(`${logPrefix} draft=${draft.id} send_failed: ${errMsg}`);
      await persistFailure(draft.id, errMsg);
      const upstreamStatus = (result.result as any)?.status ?? result.status;
      const retryable =
        typeof upstreamStatus === "number"
          ? upstreamStatus >= 500
          : true;
      const reason: AdapterFailureReason =
        upstreamStatus === 401 || upstreamStatus === 403
          ? "auth"
          : upstreamStatus === 404
            ? "validation"
            : retryable
              ? "transient"
              : "upstream_error";
      return { ok: false, reason, message: errMsg, http_status: upstreamStatus, retryable };
    }

    /* Success: persist on draft + reviews.
     *
     * Source detection: trust draft.auto_approved at the moment of
     * publish (true → autoApproveDraft fired, "auto_replied"; false →
     * adminApproveDraft / clientApproveDraft fired, "manually_replied").
     * metadata.gbp.source is only used as a fallback for shape compat. */
    const postedAt = new Date().toISOString();
    const replyResult = (result.result || {}) as Record<string, unknown>;
    await persistSuccess(draft.id, postedAt, replyResult);
    if (meta.review_id) {
      const reviewSource: "auto" | "admin" | "client" = draft.auto_approved
        ? "auto"
        : (meta.source === "client" ? "client" : "admin");
      await persistOnReview(meta.review_id, replyText, replyResult, reviewSource);
    }

    console.log(`${logPrefix} draft=${draft.id} client=${draft.client_id} review=${meta.external_review_id} posted ok`);
    return {
      ok: true,
      externalId: meta.external_review_id,
      raw: { posted_at: postedAt, ...replyResult },
    };
  },
};
