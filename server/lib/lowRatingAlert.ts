/**
 * Low-rating review alert email — sent immediately when monitoring
 * detects a new 1-2 star public review.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildAdminAlertEmail, buildAdminAlertPlainText, ADMIN_ALERT_FROM_NAME } from "./adminAlertShell";

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

  const previewRaw = opts.reviewText
    ? (opts.reviewText.length > 200 ? opts.reviewText.slice(0, 200) + "…" : opts.reviewText)
    : "(no review text provided)";

  const subject = `New ${opts.rating}-star ${opts.platform} review for ${opts.businessName}`;

  const html = buildAdminAlertEmail({
    recipientEmail: opts.contactEmail,
    subjectForTitle: subject,
    alertType: "Low-rating review alert",
    alertTone: "critical",
    headline: `New ${opts.rating}-star review on ${opts.platform}`,
    summary: `Responding quickly can help with recovery. The reviewer's text is below.`,
    detailRows: [
      { label: "Business", value: opts.businessName },
      { label: "Platform", value: opts.platform },
      { label: "Reviewer", value: opts.reviewerName },
    ],
    bodyHtml: `
      <div style="background:rgba(185,28,28,0.06);border:1px solid rgba(185,28,28,0.18);border-radius:8px;padding:14px 16px;">
        <div style="margin-bottom:8px;">${starsHtml(opts.rating)}</div>
        <p style="font-size:13px;color:#374151;line-height:1.5;margin:0;">${esc(previewRaw)}</p>
      </div>`,
    cta: { label: "View & respond", url: `${opts.portalUrl}/portal/reviews` },
    footerNote: "ReputationShield alert · adjust alert settings in your portal.",
  });

  const text = buildAdminAlertPlainText({
    alertType: "Low-rating review alert",
    headline: `New ${opts.rating}-star review on ${opts.platform}`,
    summary: "Responding quickly can help with recovery.",
    detailRows: [
      { label: "Business", value: opts.businessName },
      { label: "Platform", value: opts.platform },
      { label: "Reviewer", value: opts.reviewerName },
      { label: "Rating", value: `${opts.rating}/5` },
    ],
    bodyText: `Review:\n${previewRaw}`,
    cta: { label: "View & respond", url: `${opts.portalUrl}/portal/reviews` },
    footerNote: "ReputationShield alert · adjust alert settings in your portal.",
  });

  try {
    await transporter.sendMail({
      from: `${ADMIN_ALERT_FROM_NAME} <${getFromAddress()}>`,
      to: opts.contactEmail,
      subject,
      html,
      text,
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
