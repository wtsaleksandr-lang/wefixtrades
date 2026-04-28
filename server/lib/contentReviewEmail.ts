/**
 * ContentFlow — review notification emails (Sprint 7).
 *
 * Sends transactional emails when a client makes a review decision in the
 * portal (approve / request changes / reject) and when admin re-approves
 * a previously-changes-requested draft (revision-ready notification to
 * the client).
 *
 * Reuses the existing email infrastructure:
 *   - getEmailTransporter() / getFromAddress() from emailTransport
 *   - buildLegalFooter() shell from PR #22 (CAN-SPAM compliant)
 *
 * No new schema. Idempotency tracked via metadata.client_review.* keys
 * on content_drafts. The "emailed" flag is set ONLY after sendMail
 * succeeds — when SMTP is unavailable or the send throws, no flag is
 * written, so a future retry can deliver the email.
 *
 * All four send functions are non-throwing — email failure never breaks
 * the underlying approval action.
 */

import type { Transporter, SendMailOptions, SentMessageInfo } from "nodemailer";
import crypto from "crypto";
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildLegalFooter, buildEmailHeader } from "./emailFooter";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { storage } from "../storage";
import { db } from "../db";
import { clients } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { ContentDraft } from "@shared/schema";

/* ─── Sprint 8: NODE_ENV-gated test simulation stub ─────────────────────
 *
 * CI cannot rely on live SMTP credits. When EMAIL_TEST_SIMULATE_SUCCESS=1
 * is set AND NODE_ENV !== "production", the resolveTransporter() helper
 * below returns an in-process stub whose sendMail() always returns a
 * synthetic success. The metadata flag (admin_emailed_for /
 * client_revision_emailed_token) gets stamped exactly as it would for
 * a real send — proving the idempotency path works under test load
 * without touching SendGrid.
 *
 * Production safety:
 *   - The simulation gate requires BOTH NODE_ENV !== "production" AND
 *     the explicit EMAIL_TEST_SIMULATE_SUCCESS=1 env var. Production
 *     behaviour is unchanged.
 *   - Caller's `opts.transporter` (a real one OR explicit null for the
 *     SMTP-down test) ALWAYS wins over the stub. P7-9 (transporter:null)
 *     still exercises the smtp_unavailable path.
 *   - Real SMTP failures (auth errors, network errors) still leave
 *     metadata.client_review.admin_emailed_for unset — design
 *     unchanged. The stub only fires when explicitly enabled.
 */
const TEST_STUB_TRANSPORTER: Transporter = {
  sendMail(options: SendMailOptions): Promise<SentMessageInfo> {
    return Promise.resolve({
      messageId: `<test-stub-${Date.now()}-${crypto.randomBytes(4).toString("hex")}@simulated>`,
      envelope: {
        from: typeof options.from === "string" ? options.from : "stub@local",
        to: Array.isArray(options.to) ? options.to.map((t) => String(t)) : [String(options.to ?? "")],
      },
      accepted: Array.isArray(options.to) ? options.to.map((t) => String(t)) : [String(options.to ?? "")],
      rejected: [],
      pending: [],
      response: "250 Stub OK",
    } as unknown as SentMessageInfo);
  },
} as unknown as Transporter;

function shouldUseTestStub(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.EMAIL_TEST_SIMULATE_SUCCESS === "1"
  );
}

/**
 * Resolve a transporter for the send call. Honours caller override
 * (real Transporter OR null for sim-down). When no override is given,
 * returns the test stub if both gates are open, else the real one.
 */
function resolveTransporter(opts: SendEmailOptions): Transporter | null {
  if (opts.transporter !== undefined) return opts.transporter;
  if (shouldUseTestStub()) return TEST_STUB_TRANSPORTER;
  return getEmailTransporter();
}

/* ─── Types ──────────────────────────────────────────────────────────── */

export type AdminReviewKind = "admin-approved" | "admin-changes" | "admin-rejected";
export type SendEmailKind = AdminReviewKind | "client-revision";

export interface SendEmailOptions {
  /** Inject a transporter for tests. `null` simulates SMTP unavailable.
   *  When omitted, calls getEmailTransporter(). */
  transporter?: Transporter | null;
}

export type SendResult =
  | { ok: true; recipientCount: number; messageId?: string }
  | { ok: false; reason: "smtp_unavailable" | "no_recipient" | "draft_not_found" | "send_failed"; message: string };

/* ─── Recipient parsing ──────────────────────────────────────────────── */

/**
 * Resolve admin notification recipients. ADMIN_EMAIL may be a single
 * address or comma-separated list. Falls back to INTERNAL_LEAD_EMAIL.
 * Returns an empty array if neither env var is configured (caller logs
 * + skips). Trims whitespace, filters empty entries and bad-shaped
 * addresses.
 */
export function resolveAdminRecipients(): string[] {
  const raw = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /.+@.+\..+/.test(s));
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

function getAppUrl(): string {
  return process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
}

function adminDraftLink(draftId: number): string {
  return `${getAppUrl()}/admin/contentflow#draft-${draftId}`;
}

function clientArticlesLink(): string {
  return `${getAppUrl()}/portal/articles`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface DraftContext {
  draft: ContentDraft;
  businessName: string;
  contactName: string | null;
  contactEmail: string | null;
}

async function loadDraftContext(draftId: number): Promise<DraftContext | null> {
  const draft = await storage.getContentDraftById(draftId);
  if (!draft) return null;
  const [client] = await db.select().from(clients).where(eq(clients.id, draft.client_id)).limit(1);
  if (!client) return null;
  return {
    draft,
    businessName: client.business_name || "Client",
    contactName: client.contact_name,
    contactEmail: client.contact_email,
  };
}

/**
 * Re-read draft.metadata + merge a `client_review` patch atomically.
 * Same race-protected pattern Sprint 4 introduced for articleService —
 * a concurrent Sprint 5 queue worker write can't clobber the email flag.
 */
async function mergeClientReviewMetadata(
  draftId: number,
  patch: Record<string, any>,
): Promise<void> {
  const fresh = await storage.getContentDraftById(draftId);
  if (!fresh) return;
  const meta = (fresh.metadata || {}) as Record<string, any>;
  const review = (meta.client_review || {}) as Record<string, any>;
  await storage.updateContentDraft(draftId, {
    metadata: { ...meta, client_review: { ...review, ...patch } },
  } as any);
}

/* ─── Email body builders ────────────────────────────────────────────── */

interface AdminEmailContent {
  subject: string;
  heading: string;
  decisionLabel: string;
  decisionTone: "good" | "warn" | "bad";
}

function adminContent(kind: AdminReviewKind, businessName: string): AdminEmailContent {
  switch (kind) {
    case "admin-approved":
      return {
        subject: `Client Approved Article — ${businessName}`,
        heading: "Client approved their article",
        decisionLabel: "Approved",
        decisionTone: "good",
      };
    case "admin-changes":
      return {
        subject: `Client Requested Changes — ${businessName}`,
        heading: "Client requested changes",
        decisionLabel: "Changes requested",
        decisionTone: "warn",
      };
    case "admin-rejected":
      return {
        subject: `Client Rejected Article — ${businessName}`,
        heading: "Client rejected the article",
        decisionLabel: "Rejected",
        decisionTone: "bad",
      };
  }
}

const TONE_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  good: { bg: "#ecfdf5", fg: "#065f46", border: "#10b981" },
  warn: { bg: "#fffbeb", fg: "#92400e", border: "#f59e0b" },
  bad: { bg: "#fef2f2", fg: "#991b1b", border: "#ef4444" },
};

function buildAdminHtml(args: {
  kind: AdminReviewKind;
  businessName: string;
  articleTitle: string;
  clientNote: string | null;
  draftId: number;
  recipientEmail: string;
}): string {
  const c = adminContent(args.kind, args.businessName);
  const tone = TONE_COLORS[c.decisionTone];
  const noteBlock = args.clientNote
    ? `<tr><td style="padding:16px 24px;background:#f9fafb;border-left:3px solid #d1d5db;">
         <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Client note</div>
         <div style="font-size:14px;color:#111827;line-height:1.6;white-space:pre-wrap;">${escapeHtml(args.clientNote)}</div>
       </td></tr>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
${buildEmailHeader({ tagline: "ContentFlow review update" })}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">
      <tr><td style="padding:32px 24px 16px;">
        <div style="display:inline-block;padding:6px 12px;border-radius:9999px;background:${tone.bg};color:${tone.fg};border:1px solid ${tone.border};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(c.decisionLabel)}</div>
        <h1 style="margin:16px 0 8px;font-size:22px;font-weight:600;color:#111827;line-height:1.3;">${escapeHtml(c.heading)}</h1>
        <p style="margin:0;font-size:14px;color:#6b7280;">${escapeHtml(args.businessName)}</p>
      </td></tr>
      <tr><td style="padding:0 24px 16px;">
        <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Article</div>
        <div style="font-size:16px;color:#111827;font-weight:500;line-height:1.4;">${escapeHtml(args.articleTitle)}</div>
      </td></tr>
      ${noteBlock}
      <tr><td align="center" style="padding:24px;">
        <a href="${escapeHtml(adminDraftLink(args.draftId))}" style="display:inline-block;padding:12px 24px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">Open in ContentFlow</a>
      </td></tr>
    </table>
  </td></tr>
</table>
${buildLegalFooter({ recipientEmail: args.recipientEmail })}
</body></html>`;
}

function buildClientRevisionHtml(args: {
  contactName: string | null;
  articleTitle: string;
  recipientEmail: string;
}): string {
  const greeting = args.contactName ? `Hi ${escapeHtml(args.contactName.split(" ")[0])},` : "Hi there,";
  return buildTransactionalEmail({
    recipientEmail: args.recipientEmail,
    theme: "light",
    maxWidth: 600,
    subjectForTitle: "Your Revised Article Is Ready",
    headerTagline: "Article ready for your review",
    headline: greeting,
    intro: "Your team has revised the article you asked us to update. It's ready for your review.",
    bodyHtml: `
      <div style="font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;margin:24px 0 4px;">Article</div>
      <div style="font-size:16px;color:#111827;font-weight:500;line-height:1.4;">${escapeHtml(args.articleTitle)}</div>`,
    cta: { label: "Review revised article", url: clientArticlesLink() },
  });
}

/* ─── Send functions (admin notifications) ──────────────────────────── */

/**
 * Send an admin notification for a client review decision. Idempotent:
 * if metadata.client_review.admin_emailed_for already matches the
 * current state, skip. The flag is set ONLY after a successful sendMail
 * call — failures leave the flag unset so the next decision-state
 * change (or a manual retry) will deliver.
 */
async function sendAdminEmail(
  draftId: number,
  kind: AdminReviewKind,
  state: "approved" | "changes_requested" | "rejected",
  opts: SendEmailOptions = {},
): Promise<SendResult> {
  const logPrefix = `[content-review-email][${kind}]`;
  try {
    const ctx = await loadDraftContext(draftId);
    if (!ctx) {
      console.warn(`${logPrefix} draft=${draftId} not found`);
      return { ok: false, reason: "draft_not_found", message: `draft ${draftId} not found` };
    }

    /* Idempotency: skip if already emailed for this exact state. */
    const existing = (ctx.draft.metadata as any)?.client_review?.admin_emailed_for;
    if (existing === state) {
      console.log(`${logPrefix} draft=${draftId} skipped (already emailed for state=${state})`);
      return { ok: true, recipientCount: 0 };
    }

    const transporter = resolveTransporter(opts);
    if (!transporter) {
      console.warn(`${logPrefix} draft=${draftId} skipped: SMTP not configured`);
      return { ok: false, reason: "smtp_unavailable", message: "SMTP not configured" };
    }

    const recipients = resolveAdminRecipients();
    if (recipients.length === 0) {
      console.warn(`${logPrefix} draft=${draftId} skipped: no admin recipient configured`);
      return { ok: false, reason: "no_recipient", message: "ADMIN_EMAIL/INTERNAL_LEAD_EMAIL not set" };
    }

    const note = (ctx.draft.metadata as any)?.client_review?.note ?? null;
    const subject = adminContent(kind, ctx.businessName).subject;
    const html = buildAdminHtml({
      kind,
      businessName: ctx.businessName,
      articleTitle: ctx.draft.title || "Untitled article",
      clientNote: typeof note === "string" ? note : null,
      draftId,
      recipientEmail: recipients[0],
    });

    const result = await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: recipients,
      subject,
      html,
    });

    /* Only AFTER successful sendMail do we mark the metadata flag. */
    await mergeClientReviewMetadata(draftId, {
      admin_emailed_for: state,
      admin_emailed_at: new Date().toISOString(),
      admin_emailed_recipient_count: recipients.length,
    });

    console.log(`${logPrefix} draft=${draftId} sent to ${recipients.length} recipient(s)`);
    return { ok: true, recipientCount: recipients.length, messageId: (result as any)?.messageId };
  } catch (err: any) {
    console.error(`${logPrefix} draft=${draftId} send_failed: ${err?.message || String(err)}`);
    return { ok: false, reason: "send_failed", message: err?.message || String(err) };
  }
}

export function sendAdminClientApproveEmail(draftId: number, opts?: SendEmailOptions): Promise<SendResult> {
  return sendAdminEmail(draftId, "admin-approved", "approved", opts);
}

export function sendAdminClientChangesEmail(draftId: number, opts?: SendEmailOptions): Promise<SendResult> {
  return sendAdminEmail(draftId, "admin-changes", "changes_requested", opts);
}

export function sendAdminClientRejectEmail(draftId: number, opts?: SendEmailOptions): Promise<SendResult> {
  return sendAdminEmail(draftId, "admin-rejected", "rejected", opts);
}

/* ─── Send function (client revision-ready notification) ────────────── */

/**
 * Notify the client that admin has revised an article they previously
 * asked to change. Per-revision idempotency via a token: the caller
 * supplies (or generates) a token, and we record it in
 * metadata.client_review.client_revision_emailed_token. Re-sending the
 * same token is a no-op; a fresh admin re-approval generates a new
 * token.
 */
export async function sendClientRevisionReadyEmail(
  draftId: number,
  opts: SendEmailOptions & { revisionToken?: string } = {},
): Promise<SendResult> {
  const logPrefix = `[content-review-email][client-revision]`;
  try {
    const ctx = await loadDraftContext(draftId);
    if (!ctx) {
      console.warn(`${logPrefix} draft=${draftId} not found`);
      return { ok: false, reason: "draft_not_found", message: `draft ${draftId} not found` };
    }
    if (!ctx.contactEmail) {
      console.warn(`${logPrefix} draft=${draftId} skipped: client has no contact_email`);
      return { ok: false, reason: "no_recipient", message: "client has no contact_email" };
    }

    const token = opts.revisionToken || crypto.randomBytes(12).toString("hex");
    const existing = (ctx.draft.metadata as any)?.client_review?.client_revision_emailed_token;
    if (existing === token) {
      console.log(`${logPrefix} draft=${draftId} skipped (already emailed for token=${token})`);
      return { ok: true, recipientCount: 0 };
    }

    const transporter = resolveTransporter(opts);
    if (!transporter) {
      console.warn(`${logPrefix} draft=${draftId} skipped: SMTP not configured`);
      return { ok: false, reason: "smtp_unavailable", message: "SMTP not configured" };
    }

    const articleTitle = ctx.draft.title || "Untitled article";
    const greeting = ctx.contactName ? `Hi ${ctx.contactName.split(" ")[0]},` : "Hi there,";
    const html = buildClientRevisionHtml({
      contactName: ctx.contactName,
      articleTitle,
      recipientEmail: ctx.contactEmail,
    });

    const result = await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: ctx.contactEmail,
      subject: "Your Revised Article Is Ready",
      html,
      text: buildPlainText({
        headline: greeting,
        intro: "Your team has revised the article you asked us to update. It's ready for your review.",
        bodyText: `Article: ${articleTitle}`,
        ctaLabel: "Review revised article",
        ctaUrl: clientArticlesLink(),
      }),
    });

    await mergeClientReviewMetadata(draftId, {
      client_revision_emailed_token: token,
      client_revision_emailed_at: new Date().toISOString(),
    });

    console.log(`${logPrefix} draft=${draftId} sent to client`);
    return { ok: true, recipientCount: 1, messageId: (result as any)?.messageId };
  } catch (err: any) {
    console.error(`${logPrefix} draft=${draftId} send_failed: ${err?.message || String(err)}`);
    return { ok: false, reason: "send_failed", message: err?.message || String(err) };
  }
}
