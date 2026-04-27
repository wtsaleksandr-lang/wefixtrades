/**
 * ContentFlow — approval service.
 *
 * Mutates draft approval state and writes append-only rows to
 * content_approvals. Sprint 1 introduced `autoApprove`; Sprint 2 adds
 * the admin-driven `adminApprove` and `adminReject` flows used by the
 * /admin/contentflow queue UI.
 */
import crypto from "crypto";
import { storage } from "../../storage";
import type { ContentDraft } from "@shared/schema";
import type { ApprovalActorType } from "./types";
import {
  sendAdminClientApproveEmail,
  sendAdminClientChangesEmail,
  sendAdminClientRejectEmail,
  sendClientRevisionReadyEmail,
} from "../../lib/contentReviewEmail";

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

  /* Sprint 7: detect revision-ready transition. If the prior client
   * review state was 'changes_requested' AND admin is now re-approving,
   * we'll fire a one-shot client notification AFTER persistence. Token
   * is captured before mutation so concurrent writes don't lose it. */
  const priorReview = (existing.metadata as any)?.client_review;
  const wasChangesRequested = priorReview?.state === "changes_requested";
  const revisionToken = wasChangesRequested ? crypto.randomBytes(12).toString("hex") : null;

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

  /* Sprint 7: client revision-ready notification. Only fires when prior
   * client_review.state was 'changes_requested'. Email failure is
   * isolated — never throws back to the API caller. */
  if (revisionToken) {
    sendClientRevisionReadyEmail(draftId, { revisionToken }).catch((err) => {
      console.error(`[content-review-email][client-revision] draft=${draftId} unhandled:`, err?.message || err);
    });
  }

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

/* ─── Client portal review (Sprint 6) ────────────────────────────────────
 *
 * Clients can approve, request changes on, or reject RankFlow article
 * drafts that an admin has already approved. Decisions live in
 * metadata.client_review (no schema migration) AND in the existing
 * content_approvals audit trail (actor_type='client').
 *
 * Security boundary: every function takes the caller's clientId and
 * refuses if it doesn't match the draft's client_id. The route layer
 * resolves clientId from the authenticated session via withClientId().
 */

export interface ClientReviewInput {
  draftId: number;
  clientId: number;          // resolved from req.user → clients.user_id
  note?: string;
}

type ClientReviewState = "approved" | "changes_requested" | "rejected";

interface ClientReviewMeta {
  state: ClientReviewState;
  note: string | null;
  decided_at: string;
}

async function loadAndAuthorize(draftId: number, clientId: number): Promise<ContentDraft> {
  const existing = await storage.getContentDraftById(draftId);
  if (!existing) {
    const err: any = new Error(`ContentFlow draft ${draftId} not found`);
    err.code = "not_found";
    throw err;
  }
  if (existing.client_id !== clientId) {
    const err: any = new Error("Not authorized to review this draft");
    err.code = "forbidden";
    throw err;
  }
  if (existing.kind !== "article" || existing.surface !== "rankflow") {
    const err: any = new Error("Only RankFlow articles support client review");
    err.code = "wrong_kind";
    throw err;
  }
  return existing;
}

/**
 * Re-read draft.metadata immediately before write and merge — same
 * race-protection pattern Sprint 4 introduced for articleService and
 * Sprint 5's queue. Without this, a concurrent publish or article
 * regeneration could clobber the client_review key.
 *
 * Sprint 7 fix: deep-merge into the existing client_review so we
 * preserve email-tracking keys that the email module wrote
 * (admin_emailed_for, admin_emailed_at, admin_emailed_recipient_count,
 * client_revision_emailed_token, client_revision_emailed_at). Without
 * this, a duplicate same-state client decision wiped admin_emailed_for
 * and the email idempotency check mis-fired (P7-5).
 */
async function mergeClientReviewMetadata(draftId: number, review: ClientReviewMeta): Promise<ContentDraft | undefined> {
  const fresh = await storage.getContentDraftById(draftId);
  if (!fresh) return undefined;
  const existingMeta = (fresh.metadata || {}) as Record<string, any>;
  const existingReview = (existingMeta.client_review || {}) as Record<string, any>;
  return storage.updateContentDraft(draftId, {
    metadata: { ...existingMeta, client_review: { ...existingReview, ...review } },
  } as any);
}

/**
 * Sprint 6: client approves a draft. Sets metadata.client_review.state +
 * client_approved_at + appends content_approvals row. Idempotent — re-
 * approving is a no-op past the first decision.
 */
export async function clientApproveDraft(input: ClientReviewInput): Promise<ContentDraft> {
  const existing = await loadAndAuthorize(input.draftId, input.clientId);

  const now = new Date();
  await storage.updateContentDraft(input.draftId, {
    client_approved_at: existing.client_approved_at ?? now,
  } as any);
  const updated = await mergeClientReviewMetadata(input.draftId, {
    state: "approved",
    note: input.note ?? null,
    decided_at: now.toISOString(),
  });

  await storage.createContentApproval({
    draft_id: input.draftId,
    actor_type: "client" as ApprovalActorType,
    actor_id: input.clientId,
    action: "approved",
    notes: input.note ?? null,
    metadata: null,
  } as any);

  /* Sprint 7: notify admin. Fire-and-forget; email failure must NOT
   * surface as an API error. Idempotency is enforced inside the email
   * function via metadata.client_review.admin_emailed_for. */
  sendAdminClientApproveEmail(input.draftId).catch((err) => {
    console.error(`[content-review-email][admin-approved] draft=${input.draftId} unhandled:`, err?.message || err);
  });

  return updated ?? existing;
}

/**
 * Sprint 6: client requests changes. Does NOT change draft.status —
 * keeps it at 'approved' so admin still controls publish gating, but
 * marks metadata.client_review.state='changes_requested' so admin sees
 * the request in the queue/drawer and can regenerate.
 */
export async function clientRequestChanges(input: ClientReviewInput): Promise<ContentDraft> {
  const existing = await loadAndAuthorize(input.draftId, input.clientId);

  const now = new Date();
  const updated = await mergeClientReviewMetadata(input.draftId, {
    state: "changes_requested",
    note: input.note ?? null,
    decided_at: now.toISOString(),
  });

  await storage.createContentApproval({
    draft_id: input.draftId,
    actor_type: "client" as ApprovalActorType,
    actor_id: input.clientId,
    action: "changes_requested",
    notes: input.note ?? null,
    metadata: null,
  } as any);

  /* Sprint 7: notify admin (changes-requested includes the note). */
  sendAdminClientChangesEmail(input.draftId).catch((err) => {
    console.error(`[content-review-email][admin-changes] draft=${input.draftId} unhandled:`, err?.message || err);
  });

  return updated ?? existing;
}

/**
 * Sprint 6: client rejects. Flips draft.status to 'rejected' and records
 * metadata.client_review.state='rejected'. Admin can revive via
 * regeneration + a fresh approval cycle.
 */
export async function clientRejectDraft(input: ClientReviewInput): Promise<ContentDraft> {
  const existing = await loadAndAuthorize(input.draftId, input.clientId);

  const now = new Date();
  await storage.updateContentDraft(input.draftId, {
    status: "rejected",
    rejected_at: now,
    rejection_reason: input.note ?? null,
  } as any);
  const updated = await mergeClientReviewMetadata(input.draftId, {
    state: "rejected",
    note: input.note ?? null,
    decided_at: now.toISOString(),
  });

  await storage.createContentApproval({
    draft_id: input.draftId,
    actor_type: "client" as ApprovalActorType,
    actor_id: input.clientId,
    action: "rejected",
    notes: input.note ?? null,
    metadata: null,
  } as any);

  /* Sprint 7: notify admin. */
  sendAdminClientRejectEmail(input.draftId).catch((err) => {
    console.error(`[content-review-email][admin-rejected] draft=${input.draftId} unhandled:`, err?.message || err);
  });

  return updated ?? existing;
}
