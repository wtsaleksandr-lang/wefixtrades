/**
 * ContentFlow — Squarespace CMS publisher (Sprint 8: multi-CMS).
 *
 * Squarespace does not have a public Blog Posts API. Their Content API
 * is limited to inventory/commerce, and the Developer API requires
 * OAuth with limited blog support.
 *
 * Fallback approach: email-based content delivery. The formatted blog
 * post is sent to the client's email with clear instructions to paste
 * it into their Squarespace blog editor. This ensures content still
 * gets delivered on schedule even without API access.
 *
 * If Squarespace extends their API in the future, this adapter can be
 * updated to use direct API publishing while keeping the email fallback
 * for clients who prefer it.
 *
 * Credentials shape (stored in client_service.metadata.squarespace_credentials):
 *   {
 *     squarespace_api_key?: string,    // optional — for future API support
 *     client_email: string,            // required — delivery destination
 *   }
 */

import type { Transporter } from "nodemailer";
import { storage } from "../../storage";
import { getEmailTransporter, getFromAddress } from "../../lib/emailTransport";
import { buildLegalFooter, buildEmailHeader } from "../../lib/emailFooter";
import { createLogger } from "../../lib/logger";
import type { CmsAdapter, CmsCredentials, CmsPostPayload, CmsPublishResult } from "./cmsAdapter";

const log = createLogger("SquarespacePublisher");

/* ─── HTML email builder ──────────────────────────────────────────── */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildContentDeliveryEmail(args: {
  title: string;
  content: string;
  excerpt?: string;
  recipientEmail: string;
}): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>New Blog Post Ready</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
${buildEmailHeader({ tagline: "Your monthly content is ready" })}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">
      <tr><td style="padding:32px 24px 8px;">
        <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">New Blog Post Ready for Your Website</h1>
        <p style="margin:0 0 16px;font-size:14px;color:#6b7280;">Copy the content below into your Squarespace blog editor.</p>
      </td></tr>
      <tr><td style="padding:0 24px;">
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px;margin-bottom:16px;">
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">How to publish:</p>
          <ol style="margin:0;padding-left:20px;font-size:13px;color:#374151;line-height:1.6;">
            <li>Log in to your Squarespace dashboard</li>
            <li>Go to <strong>Pages</strong> &rarr; your blog page</li>
            <li>Click <strong>+ Add Post</strong></li>
            <li>Set the title to: <strong>${escapeHtml(args.title)}</strong></li>
            <li>Paste the content below into the post body</li>
            <li>Click <strong>Publish</strong></li>
          </ol>
        </div>
      </td></tr>
      <tr><td style="padding:0 24px 8px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Post Title</p>
        <p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#111827;">${escapeHtml(args.title)}</p>
      </td></tr>
      ${args.excerpt ? `<tr><td style="padding:0 24px 8px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Excerpt / Summary</p>
        <p style="margin:0 0 16px;font-size:14px;color:#374151;font-style:italic;">${escapeHtml(args.excerpt)}</p>
      </td></tr>` : ""}
      <tr><td style="padding:0 24px 24px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Post Content (copy everything below)</p>
        <div style="background:#ffffff;border:1px solid #d1d5db;border-radius:4px;padding:16px;margin-top:8px;font-size:14px;color:#1f2937;line-height:1.7;">
          ${args.content}
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
${buildLegalFooter({ recipientEmail: args.recipientEmail })}
</body></html>`;
}

/* ─── Adapter ─────────────────────────────────────────────────────── */

export const squarespacePublisher: CmsAdapter = {
  platform: "squarespace",

  async publishPost(
    credentials: CmsCredentials,
    post: CmsPostPayload,
  ): Promise<CmsPublishResult> {
    // Resolve recipient email: from credentials, then client lookup
    let recipientEmail: string | null = credentials.client_email || null;

    if (!recipientEmail && credentials.client_id) {
      try {
        const client = await storage.getClientById(Number(credentials.client_id));
        if (client?.contact_email) {
          recipientEmail = client.contact_email;
        }
      } catch { /* ignore */ }
    }

    if (!recipientEmail) {
      return {
        success: false,
        error: "No email address available for Squarespace content delivery. Set client_email in credentials or ensure client has a contact_email.",
      };
    }

    const transporter = getEmailTransporter();
    if (!transporter) {
      return {
        success: false,
        error: "SMTP not configured — cannot send content delivery email",
      };
    }

    const subject = `New Blog Post Ready: "${(post.title || "Untitled").slice(0, 80)}"`;
    const html = buildContentDeliveryEmail({
      title: post.title || "Untitled",
      content: post.content,
      excerpt: post.excerpt,
      recipientEmail,
    });

    try {
      const sendResult = await transporter.sendMail({
        from: `WeFixTrades <${getFromAddress()}>`,
        to: recipientEmail,
        subject,
        html,
      });

      const messageId = (sendResult as any)?.messageId || `squarespace-${Date.now()}`;
      log.info("Squarespace content delivery email sent", {
        messageId,
        recipient: recipientEmail,
        title: post.title,
      });

      return {
        success: true,
        postId: messageId,
        postUrl: undefined, // No direct URL — content delivered via email
      };
    } catch (err: any) {
      const msg = err?.message || String(err);
      log.error("Squarespace content delivery email failed", { error: msg });
      return {
        success: false,
        error: `Email delivery failed: ${msg}`,
      };
    }
  },
};
