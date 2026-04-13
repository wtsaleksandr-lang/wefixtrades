/**
 * Low-rating review alert email — sent immediately when monitoring
 * detects a new 1-2 star public review.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function starsHtml(rating: number): string {
  let s = "";
  for (let i = 1; i <= 5; i++) {
    s += `<span style="color:${i <= rating ? "#FBBF24" : "#D1D5DB"};font-size:18px;">&#9733;</span>`;
  }
  return s;
}

export async function sendLowRatingAlert(opts: {
  contactEmail: string;
  businessName: string;
  reviewerName: string;
  rating: number;
  reviewText: string | null;
  platform: string;
  portalUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const transporter = getEmailTransporter();
  if (!transporter) return { ok: false, error: "SMTP not configured" };
  if (!opts.contactEmail) return { ok: false, error: "No contact email" };

  const preview = opts.reviewText
    ? esc(opts.reviewText.length > 200 ? opts.reviewText.slice(0, 200) + "…" : opts.reviewText)
    : "<em>No review text provided</em>";

  const subject = `⚠ New ${opts.rating}-star ${opts.platform} review for ${opts.businessName}`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 16px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
  <tr><td style="padding:20px 28px;background:#991B1B;">
    <div style="font-size:16px;font-weight:700;color:#FFFFFF;">Low-Rating Review Alert</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:2px;">${esc(opts.businessName)}</div>
  </td></tr>
  <tr><td style="padding:24px 28px;">
    <p style="font-size:14px;color:#374151;margin:0 0 16px;line-height:1.5;">
      A new <strong>${opts.rating}-star</strong> review was detected on <strong>${esc(opts.platform)}</strong>. Responding quickly can help with recovery.
    </p>
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:16px;">
      <div style="margin-bottom:8px;">${starsHtml(opts.rating)}</div>
      <p style="font-size:13px;color:#374151;line-height:1.5;margin:0 0 8px;">${preview}</p>
      <p style="font-size:12px;color:#6B7280;margin:0;">— ${esc(opts.reviewerName)}</p>
    </div>
  </td></tr>
  <tr><td style="padding:0 28px 24px;text-align:center;">
    <a href="${opts.portalUrl}/portal/reviews" style="display:inline-block;background:#DC2626;color:#FFFFFF;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">
      View &amp; Respond
    </a>
  </td></tr>
  <tr><td style="padding:12px 28px;background:#F9FAFB;text-align:center;">
    <p style="font-size:11px;color:#9CA3AF;margin:0;">ReputationShield alert &bull; You can adjust alert settings in your portal.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  try {
    await transporter.sendMail({
      from: `ReputationShield <${getFromAddress()}>`,
      to: opts.contactEmail,
      subject,
      html,
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
