/**
 * ContentFlow — email-newsletter adapter (Sprint 13).
 *
 * Publishes a kind='email_post' draft as a single email via the
 * existing nodemailer-based transporter. Draft body becomes the email
 * body; draft.title becomes the subject. Recipient is resolved per
 * draft from metadata.email.recipient (set by the repurposer when it
 * creates the child).
 *
 * Test mode: NODE_ENV !== "production" AND
 *   EMAIL_TEST_SIMULATE_SUCCESS === "1" AND
 *   APP_URL does NOT point at a production domain → uses a synthetic-
 *   success stub transporter (mirrors Sprint 7's pattern). Production
 *   behaviour is unchanged when env vars are unset; the APP_URL check
 *   is a belt-and-suspenders safety net for the case where NODE_ENV is
 *   misconfigured in a real environment.
 *
 * Hard requirement (matches Sprint 11/12): email send failure does
 * NOT block other drafts. Retry honours MAX_ATTEMPTS via the queue
 * worker; permanent failures (auth, validation) dead-letter.
 */

import type { Transporter, SendMailOptions, SentMessageInfo } from "nodemailer";
import crypto from "crypto";
import { storage } from "../../../storage";
import { getEmailTransporter, getFromAddress } from "../../../lib/emailTransport";
import { buildLegalFooter, buildEmailHeader } from "../../../lib/emailFooter";
import { isEmailUnsubscribed } from "../../../lib/unsubscribeStorage";
import type {
  PublishAdapter,
  PublishAdapterOptions,
  PublishResult,
} from "./types";
import type { ContentDraft } from "@shared/schema";
import { createLogger } from "../../../lib/logger";

const log = createLogger("EmailAdapter");

/* Sprint 13: in-process test-success stub (same pattern Sprint 7 uses
 * in contentReviewEmail). Production never sees this — gated on
 * NODE_ENV + EMAIL_TEST_SIMULATE_SUCCESS. */
const TEST_STUB_TRANSPORTER: Transporter = {
  sendMail(options: SendMailOptions): Promise<SentMessageInfo> {
    return Promise.resolve({
      messageId: `<test-stub-newsletter-${Date.now()}-${crypto.randomBytes(4).toString("hex")}@simulated>`,
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

/* Production-domain hints — if APP_URL points at any of these, the stub
 * refuses to engage even when the test flag is on. Belt-and-suspenders
 * for the case where NODE_ENV gets misconfigured in a real environment
 * (e.g. NODE_ENV=development sticky in a preview/staging that points at
 * a real customer-facing URL). */
const PRODUCTION_DOMAIN_HINTS = ["wefixtrades.com", "wefixtrades.co.uk"];

function appUrlLooksProductionLike(): boolean {
  const appUrl = (process.env.APP_URL || "").toLowerCase();
  return PRODUCTION_DOMAIN_HINTS.some((d) => appUrl.includes(d));
}

function shouldUseTestStub(): boolean {
  if (process.env.EMAIL_TEST_SIMULATE_SUCCESS !== "1") return false;
  if (process.env.NODE_ENV === "production") return false;

  // If NODE_ENV is something other than "production" but APP_URL points
  // at a real customer-facing domain, something is misconfigured.
  // Refuse to silently fake sends — log loudly and fall through to the
  // real transporter so the misconfig becomes visible (deliverability
  // logs, bounce reports, etc.) rather than silently dropping mail.
  if (appUrlLooksProductionLike()) {
    log.error(
      "[email-stub] EMAIL_TEST_SIMULATE_SUCCESS=1 with production-looking APP_URL — refusing to stub. Fix NODE_ENV or unset the simulate flag.",
      { node_env: process.env.NODE_ENV, app_url: process.env.APP_URL },
    );
    return false;
  }

  log.info("[email-stub] ContentFlow email adapter using simulated-success stub (no real sends)");
  return true;
}

function resolveTransporter(): Transporter | null {
  if (shouldUseTestStub()) return TEST_STUB_TRANSPORTER;
  return getEmailTransporter();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(args: { title: string; body: string; recipientEmail: string }): string {
  const paragraphs = args.body
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">${escapeHtml(p.trim())}</p>`)
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(args.title)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
${buildEmailHeader({ tagline: "Latest update" })}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">
      <tr><td style="padding:32px 24px 8px;">
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#111827;line-height:1.3;">${escapeHtml(args.title)}</h1>
      </td></tr>
      <tr><td style="padding:0 24px 32px;">
        ${paragraphs}
      </td></tr>
    </table>
  </td></tr>
</table>
${buildLegalFooter({ recipientEmail: args.recipientEmail })}
</body></html>`;
}

export const emailAdapter: PublishAdapter = {
  type: "email" as any,
  async publish(draft: ContentDraft, _opts: PublishAdapterOptions = {}): Promise<PublishResult> {
    const logPrefix = `[contentflow][adapter][email]`;

    if (draft.kind !== "email_post") {
      return { ok: false, reason: "wrong_kind", message: `emailAdapter only handles kind='email_post' (got '${draft.kind}')`, retryable: false };
    }
    if (draft.status !== "approved") {
      return { ok: false, reason: "not_approved", message: `draft ${draft.id} status is ${draft.status}, not 'approved'`, retryable: false };
    }
    const body = (draft.body || "").trim();
    if (body.length < 5) {
      return { ok: false, reason: "validation", message: "email body too short", retryable: false };
    }

    const meta = (draft.metadata || {}) as Record<string, any>;
    const emailMeta = (meta.email || {}) as Record<string, any>;

    /* Defence-in-depth: never re-send if message_id already set. */
    if (emailMeta.message_id || emailMeta.sent_at) {
      return { ok: true, externalId: emailMeta.message_id, raw: { already_sent_at: emailMeta.sent_at } };
    }

    /* Resolve recipient: explicit metadata override → client.contact_email
     * → fall back to ADMIN_EMAIL / INTERNAL_LEAD_EMAIL. */
    let recipient: string | null = null;
    if (typeof emailMeta.recipient === "string" && /.+@.+\..+/.test(emailMeta.recipient)) {
      recipient = emailMeta.recipient;
    } else {
      const client = await storage.getClientById(draft.client_id);
      if (client?.contact_email && /.+@.+\..+/.test(client.contact_email)) {
        recipient = client.contact_email;
      } else if (process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL) {
        recipient = (process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || "").split(",")[0].trim();
      }
    }
    if (!recipient) {
      const msg = "no recipient available (metadata.email.recipient / clients.contact_email / ADMIN_EMAIL all empty)";
      log.warn(`${logPrefix} draft=${draft.id} ${msg}`);
      return { ok: false, reason: "validation", message: msg, retryable: false };
    }

    /* CAN-SPAM / CASL compliance (W-AX-2): newsletter-style content is
     * marketing, not transactional — must consult suppression list
     * before sending. Drop with audit; don't bounce, don't retry. */
    if (await isEmailUnsubscribed(recipient)) {
      log.info(`${logPrefix} draft=${draft.id} skipped recipient=${recipient} reason=unsubscribed`);
      return { ok: false, reason: "recipient_unsubscribed", message: "recipient unsubscribed", retryable: false };
    }

    const transporter = resolveTransporter();
    if (!transporter) {
      return { ok: false, reason: "transient", message: "SMTP not configured", retryable: true };
    }

    const subject = (draft.title || "Latest update").slice(0, 200);
    const html = buildHtml({ title: subject, body, recipientEmail: recipient });

    let sendResult;
    try {
      sendResult = await transporter.sendMail({
        from: `WeFixTrades <${getFromAddress()}>`,
        to: recipient,
        subject,
        html,
      });
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      log.error(`${logPrefix} draft=${draft.id} send_failed: ${errMsg}`);
      return { ok: false, reason: "transient", message: errMsg, retryable: true };
    }

    const messageId = (sendResult as any)?.messageId || `unknown-${Date.now()}`;
    const sentAt = new Date().toISOString();

    /* Persist outcome on the draft + flip status='published'. */
    const fresh = await storage.getContentDraftById(draft.id);
    const freshMeta = (fresh?.metadata || {}) as Record<string, any>;
    const freshEmail = (freshMeta.email || {}) as Record<string, any>;
    await storage.updateContentDraft(draft.id, {
      status: "published",
      metadata: {
        ...freshMeta,
        email: {
          ...freshEmail,
          recipient,
          message_id: messageId,
          sent_at: sentAt,
          error: null,
        },
      },
    } as any);

    log.info(`${logPrefix} draft=${draft.id} client=${draft.client_id} sent_to=${recipient} message_id=${messageId}`);
    return {
      ok: true,
      externalId: messageId,
      raw: { recipient, sent_at: sentAt },
    };
  },
};
