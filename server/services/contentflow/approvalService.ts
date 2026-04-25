/**
 * ContentFlow — approval service.
 *
 * Mutates draft approval state and writes append-only rows to
 * content_approvals. Sprint 1 only exposes the `autoApprove` path —
 * admin/client approve/reject land in Sprint 2 once the UI is wired.
 */
import { storage } from "../../storage";
import type { ContentDraft } from "@shared/schema";
import type { ApprovalActorType } from "./types";

export interface AutoApproveInput {
  draftId: number;
  notes?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Mark a draft as auto-approved by the system.
 *
 * - Flips `content_drafts.status` → 'approved'
 * - Sets `auto_approved = true` and stamps `admin_approved_at`
 * - Appends a `content_approvals` row with action = 'auto_approved'
 *
 * Returns the updated draft. Throws if the draft cannot be found so the
 * caller can decide whether to tolerate the failure (SocialSync orchestrator
 * wraps the call in try/catch to preserve existing publish flow).
 */
export async function autoApproveDraft(input: AutoApproveInput): Promise<ContentDraft> {
  const { draftId, notes, metadata } = input;

  const existing = await storage.getContentDraftById(draftId);
  if (!existing) {
    throw new Error(`ContentFlow draft ${draftId} not found`);
  }

  const now = new Date();
  const updated = await storage.updateContentDraft(draftId, {
    status: "approved",
    auto_approved: true,
    admin_approved_at: now,
  } as any);

  await storage.createContentApproval({
    draft_id: draftId,
    actor_type: "system" as ApprovalActorType,
    actor_id: null,
    action: "auto_approved",
    notes: notes ?? "Auto-approved — no admin review required",
    metadata: metadata ?? null,
  } as any);

  return updated ?? existing;
}
