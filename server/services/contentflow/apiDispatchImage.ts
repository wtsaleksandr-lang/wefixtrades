/**
 * ContentFlow API — image dispatcher (Wave 20).
 *
 * Thin wrapper around imageGenerationService.generateForDraft so callers
 * routing through requestContent({ type: "image" }) appear in the unified
 * pipeline log. Caller passes `metadata.draftId` pointing to an existing
 * social_post / carousel_post / google_post draft.
 */

import { generateForDraft } from "./imageGenerationService";
import { getContent, markStage, type ContentError } from "./api";

export async function dispatchImageRequest(requestId: string): Promise<void> {
  const req = await getContent(requestId);
  if (!req) return;

  const payload = (req.payload ?? {}) as any;
  const meta = (payload?.metadata as Record<string, any> | undefined) ?? {};
  const draftId: number | undefined = meta.draftId;

  if (!draftId) {
    const err: ContentError = {
      stage: "fetch_brief",
      message: "image request missing metadata.draftId",
      retryable: false,
    };
    await markStage(requestId, "failed", { errors: [err] });
    return;
  }

  await markStage(requestId, "quality_check", { draftId });
  const result = await generateForDraft(draftId, {
    imageStylePreset: (meta.imageStylePreset as any) ?? null,
  });

  if (!result.ok) {
    await markStage(requestId, "failed", {
      errors: [
        {
          stage: "image_gen",
          message: result.message ?? `image generation skipped: ${result.reason}`,
          retryable: result.reason !== "skipped_kind",
        },
      ],
    });
    return;
  }

  await markStage(requestId, "approved", {
    draftId,
    payload: {
      draftId,
      metadata: {
        image_url: (result as any).imageUrl ?? null,
        public_url: (result as any).publicUrl ?? null,
      },
    },
  });
}
