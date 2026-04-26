/**
 * ContentFlow — approval service.
 *
 * Mutates draft approval state and writes append-only rows to
 * content_approvals. Sprint 1 introduced `autoApprove`; Sprint 2 adds
 * the admin-driven `adminApprove` and `adminReject` flows used by the
 * /admin/contentflow queue UI.
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

/* ─── Admin-driven approval (Sprint 2) ───────────────────────────────── */

export interface AdminApproveInput {
  draftId: number;
  adminUserId: number;
  notes?: string;
}

export interface AdminRejectInput {
  draftId: number;
  adminUserId: number;
  reason?: string;
}

/**
 * Admin explicitly approves a draft from the queue UI.
 *
 * Allowed source states: 'draft', 'awaiting_admin', 'rejected'.
 * Approving an already-approved draft is a no-op that still records the
 * approval row (so the audit trail is honest) but doesn't double-stamp
 * `admin_approved_at`. Approving a `published` / `delivered` draft is
 * blocked — those are terminal.
 */
export async function adminApproveDraft(input: AdminApproveInput): Promise<ContentDraft> {
  const { draftId, adminUserId, notes } = input;

  const existing = await storage.getContentDraftById(draftId);
  if (!existing) throw new Error(`ContentFlow draft ${draftId} not found`);

  const terminal = new Set(["published", "delivered", "failed"]);
  if (terminal.has(existing.status)) {
    throw new Error(`Cannot approve draft in terminal status '${existing.status}'`);
  }

  const now = new Date();
  const updated = await storage.updateContentDraft(draftId, {
    status: "approved",
    auto_approved: false,
    admin_approved_at: existing.admin_approved_at ?? now,
    admin_approved_by: existing.admin_approved_by ?? adminUserId,
    rejected_at: null,
    rejection_reason: null,
  } as any);

  await storage.createContentApproval({
    draft_id: draftId,
    actor_type: "admin" as ApprovalActorType,
    actor_id: adminUserId,
    action: "approved",
    notes: notes ?? null,
    metadata: null,
  } as any);

  return updated ?? existing;
}

/**
 * Admin explicitly rejects a draft from the queue UI.
 *
 * Allowed source states: 'draft', 'awaiting_admin', 'awaiting_client',
 * 'approved' (revoking an earlier approval). Rejecting a published /
 * delivered / failed draft is blocked — those are terminal.
 */
export async function adminRejectDraft(input: AdminRejectInput): Promise<ContentDraft> {
  const { draftId, adminUserId, reason } = input;

  const existing = await storage.getContentDraftById(draftId);
  if (!existing) throw new Error(`ContentFlow draft ${draftId} not found`);

  const terminal = new Set(["published", "delivered", "failed"]);
  if (terminal.has(existing.status)) {
    throw new Error(`Cannot reject draft in terminal status '${existing.status}'`);
  }

  const now = new Date();
  const updated = await storage.updateContentDraft(draftId, {
    status: "rejected",
    rejected_at: now,
    rejection_reason: reason ?? null,
  } as any);

  await storage.createContentApproval({
    draft_id: draftId,
    actor_type: "admin" as ApprovalActorType,
    actor_id: adminUserId,
    action: "rejected",
    notes: reason ?? null,
    metadata: null,
  } as any);

  return updated ?? existing;
}
