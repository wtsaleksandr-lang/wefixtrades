/**
 * Approval notification email — sent to clients when a task moves to
 * waiting_on = "client" and has deliverables attached.
 *
 * Includes a magic-link "Approve" button for one-click approval, plus
 * a "Request Changes" link to the portal (revision requires notes).
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { buildApprovalUrl } from "./approvalToken";
import { createLogger } from "./logger";
import type { Deliverable } from "@shared/schema";

const log = createLogger("ApprovalNotification");

interface ApprovalNotificationData {
  recipientEmail: string;
  businessName: string;
  taskTitle: string;
  taskId: number;
  clientId: number;
  clientServiceId: number;
  deliverables: Deliverable[];
}

export async function sendApprovalNotificationEmail(data: ApprovalNotificationData): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("No email transporter — skipping approval notification");
    return false;
  }

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const approveUrl = buildApprovalUrl(data.taskId, data.clientId, "approve");
  const portalUrl = `${baseUrl}/portal/services/${data.clientServiceId}?action=revision&task=${data.taskId}`;

  const subject = `Action needed: ${data.taskTitle} is ready for your review`;

  // Build deliverables preview list
  const deliverableLines = data.deliverables
    .slice(0, 5)
    .map((d) => `<li style="font-size:14px;color:#CDD1D6;line-height:1.8;">${d.label || d.kind}${d.url ? ` — <a href="${d.url}" style="color:#66E8FA;text-decoration:none;">View</a>` : ""}</li>`)
    .join("");

  const moreCount = data.deliverables.length > 5 ? data.deliverables.length - 5 : 0;

  const bodyHtml = `
    <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 16px;">
      We've finished working on <strong style="color:#F0F0F0;">${data.taskTitle}</strong> and it's ready for your review.
    </p>
    ${data.deliverables.length > 0 ? `
    <p style="font-size:13px;color:#8B919A;margin:0 0 8px;font-weight:600;">Deliverables:</p>
    <ul style="margin:0 0 16px;padding-left:20px;">
      ${deliverableLines}
      ${moreCount > 0 ? `<li style="font-size:13px;color:#8B919A;line-height:1.8;">+ ${moreCount} more</li>` : ""}
    </ul>
    ` : ""}
    <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 4px;">
      If everything looks good, hit the button below to approve. If you'd like changes, visit your portal to add notes.
    </p>
  `;

  const html = buildTransactionalEmail({
    recipientEmail: data.recipientEmail,
    subjectForTitle: subject,
    headerTagline: "Review needed",
    eyebrow: "READY FOR REVIEW",
    headline: `${data.taskTitle}`,
    bodyHtml,
    cta: {
      label: "Approve",
      url: approveUrl,
      style: "primary",
    },
    ctaFinePrint: `<a href="${portalUrl}" style="color:#66E8FA;text-decoration:none;font-size:12px;">Want changes instead? Add revision notes in your portal</a>`,
    pasteLinkFallback: {
      label: "Approve link not working? Paste this URL:",
      url: approveUrl,
    },
    supportNote: `This link expires in 24 hours. After that, log in to your <a href="${baseUrl}/portal/services" style="color:#66E8FA;text-decoration:none;">portal</a> to approve.`,
  });

  const text = buildPlainText({
    headline: `Ready for review: ${data.taskTitle}`,
    intro: `We've finished working on "${data.taskTitle}" for ${data.businessName} and it's ready for your review.`,
    bodyText: data.deliverables.length > 0
      ? "Deliverables:\n" + data.deliverables.slice(0, 5).map((d) => `- ${d.label || d.kind}${d.url ? ` (${d.url})` : ""}`).join("\n")
      : undefined,
    ctaLabel: "Approve (one-click)",
    ctaUrl: approveUrl,
    supportNote: `Want changes instead? Visit your portal: ${portalUrl}\n\nThis link expires in 24 hours.`,
  });

  try {
    await transporter.sendMail({
      from: `"WeFixTrades" <${getFromAddress()}>`,
      to: data.recipientEmail,
      subject,
      html,
      text,
    });
    log.info("Approval notification sent", { to: data.recipientEmail, taskId: data.taskId });
    return true;
  } catch (err: any) {
    log.error("Approval notification send failed", { error: err.message, taskId: data.taskId });
    return false;
  }
}
