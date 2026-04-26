/**
 * Review request email — sends a "How was your experience?" email
 * that links to the sentiment gate page (NOT directly to Google).
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildLegalFooter } from "./emailFooter";
import type { ReviewRequest } from "@shared/schema";

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildReviewRequestEmailHtml(opts: {
  customerName: string;
  businessName: string;
  feedbackUrl: string;
}): string {
  const { customerName, businessName, feedbackUrl } = opts;
  const safeName = escHtml(customerName);
  const safeBiz = escHtml(businessName);

  return `<!DOCTYPE html>
<html><body style="font-family:'Inter',Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="padding:28px 28px 0;text-align:center;">
    <div style="display:inline-block;background:#66E8FA;color:#181D1F;font-size:12px;font-weight:800;padding:4px 14px;border-radius:999px;letter-spacing:0.04em;">WeFixTrades</div>
  </td></tr>
  <tr><td style="padding:24px 28px;">
    <h1 style="font-size:20px;font-weight:700;color:#1a1a2e;margin:0 0 8px;">Hi ${safeName},</h1>
    <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 4px;">
      How was your recent experience with <strong>${safeBiz}</strong>?
    </p>
    <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 20px;">
      Your feedback takes less than a minute and helps other local customers find quality tradespeople.
    </p>
    <div style="text-align:center;margin-bottom:20px;">
      <a href="${feedbackUrl}" style="display:inline-block;background:#00D4C8;color:#1A1A2E;font-size:14px;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;">
        Share Your Feedback &rarr;
      </a>
    </div>
  </td></tr>
  <tr><td style="padding:0 28px 20px;">
    <div style="border-top:1px solid #eee;padding-top:16px;font-size:12px;color:#999;line-height:1.5;">
      If the button doesn&rsquo;t work, copy and paste this link:<br/>
      <a href="${feedbackUrl}" style="color:#00D4C8;word-break:break-all;">${feedbackUrl}</a>
    </div>
  </td></tr>
  <tr><td style="padding:12px 28px;background:#f9fafb;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">Sent on behalf of ${safeBiz}</p>
  </td></tr>
</table>
${buildLegalFooter("light")}
</body></html>`;
}

export function buildReminderEmailHtml(opts: {
  customerName: string;
  businessName: string;
  feedbackUrl: string;
  step: number; // 1 = first reminder, 2 = final
}): string {
  const { customerName, businessName, feedbackUrl, step } = opts;
  const safeName = escHtml(customerName);
  const safeBiz = escHtml(businessName);

  const heading = step === 1
    ? `Quick reminder, ${safeName}`
    : `Last chance to share your thoughts`;

  const body = step === 1
    ? `We noticed you haven&rsquo;t had a chance to share your feedback about <strong>${safeBiz}</strong> yet. It only takes a minute and makes a real difference for a local business.`
    : `This is our final reminder &mdash; we&rsquo;d love to hear how things went with <strong>${safeBiz}</strong>. Your honest feedback helps other local customers choose the right tradesperson.`;

  const cta = step === 1 ? "Share Your Feedback" : "Leave Your Feedback";

  return `<!DOCTYPE html>
<html><body style="font-family:'Inter',Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="padding:28px 28px 0;text-align:center;">
    <div style="display:inline-block;background:#66E8FA;color:#181D1F;font-size:12px;font-weight:800;padding:4px 14px;border-radius:999px;letter-spacing:0.04em;">WeFixTrades</div>
  </td></tr>
  <tr><td style="padding:24px 28px;">
    <h1 style="font-size:20px;font-weight:700;color:#1a1a2e;margin:0 0 12px;">${heading}</h1>
    <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 20px;">
      ${body}
    </p>
    <div style="text-align:center;margin-bottom:20px;">
      <a href="${feedbackUrl}" style="display:inline-block;background:#00D4C8;color:#1A1A2E;font-size:14px;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;">
        ${cta} &rarr;
      </a>
    </div>
  </td></tr>
  <tr><td style="padding:0 28px 20px;">
    <div style="border-top:1px solid #eee;padding-top:16px;font-size:12px;color:#999;line-height:1.5;">
      If the button doesn&rsquo;t work, copy and paste this link:<br/>
      <a href="${feedbackUrl}" style="color:#00D4C8;word-break:break-all;">${feedbackUrl}</a>
    </div>
  </td></tr>
  <tr><td style="padding:12px 28px;background:#f9fafb;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">Sent on behalf of ${safeBiz}</p>
  </td></tr>
</table>
${buildLegalFooter("light")}
</body></html>`;
}

export function getReminderSubject(businessName: string, step: number): string {
  if (step === 1) return `Quick reminder: How was ${businessName}?`;
  return `Last chance to share feedback about ${businessName}`;
}

export function getReminderSmsBody(opts: {
  customerName: string;
  businessName: string;
  feedbackUrl: string;
  step: number;
}): string {
  const name = opts.customerName || "there";
  if (opts.step === 1) {
    return `Hi ${name}, just a reminder — we'd love your feedback on ${opts.businessName}. Takes 1 min: ${opts.feedbackUrl}`;
  }
  return `Hi ${name}, last chance to share your experience with ${opts.businessName}: ${opts.feedbackUrl}`;
}

export async function sendReviewRequestEmail(
  reviewRequest: ReviewRequest,
  baseUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    return { ok: false, error: "SMTP not configured" };
  }

  if (!reviewRequest.customer_email) {
    return { ok: false, error: "No customer email" };
  }

  if (!reviewRequest.access_token) {
    return { ok: false, error: "No access token" };
  }

  const feedbackUrl = `${baseUrl}/review/${reviewRequest.access_token}`;
  const payload = reviewRequest.payload as any;
  const businessName = payload?.business_name || "your service provider";
  const customerName = reviewRequest.customer_name || "there";

  const html = buildReviewRequestEmailHtml({
    customerName,
    businessName,
    feedbackUrl,
  });

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: reviewRequest.customer_email,
      subject: `How was your experience with ${businessName}?`,
      html,
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
