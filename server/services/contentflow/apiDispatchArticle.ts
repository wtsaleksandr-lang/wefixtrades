/**
 * ContentFlow API — article dispatcher (Wave 20).
 *
 * Thin wrapper around the existing article path. When a caller (RankFlow,
 * or the standalone ContentFlow worker, or a manual admin trigger) submits
 * a request via `requestContent({ type: "article", ... })`, this module
 * picks it up out of the dispatcher and runs the canonical generation flow:
 *
 *   1. If the caller already created a content_drafts row (RankFlow path),
 *      it passes `metadata.draftId` and we reuse it. Otherwise we create
 *      an ad-hoc draft owned by ContentFlow standalone.
 *   2. `generateArticleBody(draftId)` runs the 3-layer quality gate +
 *      humanization (canonical). Never throws.
 *   3. The result is mirrored into content_requests + pipeline_log so the
 *      admin dashboard sees every stage transition.
 *
 * No new LLM logic lives here. This is a seam.
 */

import { storage } from "../../storage";
import { generateArticleBody, createDraftFromRankflowTask } from "./articleService";
import { getContent, markStage, type ContentError } from "./api";
import { createLogger } from "../../lib/logger";

const log = createLogger("ContentFlow:DispatchArticle");

export async function dispatchArticleRequest(requestId: string): Promise<void> {
  const req = await getContent(requestId);
  if (!req) {
    log.warn("dispatcher: requestId not found", { requestId });
    return;
  }

  // Pull caller-supplied metadata (carries draftId / taskId from RankFlow).
  const payload = (req.payload ?? {}) as any;
  const metaFromCaller =
    (payload?.metadata as Record<string, any> | undefined) ?? {};

  let draftId: number | null = metaFromCaller.draftId ?? null;

  // RankFlow path: caller passes taskId and we resolve the existing draft.
  if (!draftId && metaFromCaller.rankflowTaskId) {
    const draft = await storage.getContentDraftByTaskId(
      metaFromCaller.rankflowTaskId,
    );
    if (draft) draftId = draft.id;
  }

  // Standalone ContentFlow path: create a draft owned by ContentFlow.
  // Stays in 'awaiting_admin' until generation completes.
  if (!draftId) {
    if (!req.clientId) {
      const err: ContentError = {
        stage: "fetch_brief",
        message: "article request missing clientId or existing draftId",
        retryable: false,
      };
      await markStage(requestId, "failed", { errors: [err] });
      return;
    }

    const created = await storage.createContentDraft({
      client_id: req.clientId,
      client_service_id: null,
      kind: "article",
      surface: "rankflow",
      title: req.topic,
      body: null,
      excerpt: null,
      target_platform: "website",
      target_url: null,
      metadata: {
        primary_keyword: (req as any).targetKeyword ?? null,
        target_keywords: [],
        generation_status: "pending",
        request_id: requestId,
        source: req.source,
      },
      quality_score: null,
      quality_notes: null,
      status: "draft",
      auto_approved: false,
      requires_admin_review: true,
      requires_client_review: false,
      admin_approved_at: null,
      admin_approved_by: null,
      client_approved_at: null,
      rejected_at: null,
      rejection_reason: null,
      linked_social_post_id: null,
      linked_task_id: null,
      generation_cost_micro_usd: null,
      created_by: "system",
    } as any);
    draftId = created.id;
  }

  // Mark request as in quality-check stage while generateArticleBody runs.
  await markStage(requestId, "quality_check", { draftId });

  const result = await generateArticleBody(draftId);

  if (!result.ok) {
    const err: ContentError = {
      stage: "llm_generation",
      message: result.error ?? "article generation failed",
      retryable: true,
    };
    await markStage(requestId, "failed", { errors: [err] });
    return;
  }

  // Persist the successful payload + quality score back onto the request.
  const draft = result.draft;
  await markStage(requestId, "approved", {
    draftId,
    qualityScore: draft?.quality_score ?? null,
    payload: {
      draftId,
      title: draft?.title ?? null,
      excerpt: draft?.excerpt ?? null,
      article: draft?.body ?? null,
      metadata: draft?.metadata ?? null,
    },
  });
}

/** Helper for RankFlow: hand off the task → draft → request mapping. */
export async function requestArticleFromRankflowTask(input: {
  requestId: string;
  task: any;
  profile: any;
}): Promise<{ draftId: number }> {
  const draft = await createDraftFromRankflowTask({
    task: input.task,
    profile: input.profile,
  });
  return { draftId: draft.id };
}
