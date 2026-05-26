/**
 * ContentFlow API — video dispatcher (Wave 20).
 *
 * Thin wrapper around videoContentService.generateFullVideo so callers
 * routing through requestContent({ type: "video" }) appear in the unified
 * pipeline log. Caller passes `metadata.articleDraftId` of the parent
 * article draft.
 */

import { generateFullVideo } from "./videoContentService";
import { getContent, markStage, type ContentError } from "./api";

export async function dispatchVideoRequest(requestId: string): Promise<void> {
  const req = await getContent(requestId);
  if (!req) return;

  const payload = (req.payload ?? {}) as any;
  const meta = (payload?.metadata as Record<string, any> | undefined) ?? {};
  const articleDraftId: number | undefined = meta.articleDraftId;

  if (!articleDraftId) {
    const err: ContentError = {
      stage: "fetch_brief",
      message: "video request missing metadata.articleDraftId",
      retryable: false,
    };
    await markStage(requestId, "failed", { errors: [err] });
    return;
  }

  await markStage(requestId, "quality_check", { draftId: articleDraftId });
  const result = await generateFullVideo(articleDraftId);

  if (!result.ok) {
    await markStage(requestId, "failed", {
      errors: [
        {
          stage: "image_gen",
          message: (result as any).message ?? `video generation skipped: ${(result as any).reason}`,
          retryable: (result as any).reason === "disabled" ? false : true,
        },
      ],
    });
    return;
  }

  await markStage(requestId, "approved", {
    draftId: articleDraftId,
    payload: {
      draftId: articleDraftId,
      videoUrl: (result as any).videoUrl ?? null,
      metadata: (result as any).metadata ?? {},
    },
  });
}
