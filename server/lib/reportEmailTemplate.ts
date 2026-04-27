/**
 * Builds a professional HTML email for delivering an audit report.
 * Dark theme — matches the marketing site (#0B0F14 / #66E8FA).
 */

import { buildLegalFooter, buildEmailHeader, buildChatBubble } from "./emailFooter";

export function buildAuditReportEmail(opts: {
  businessName: string;
  score: number | null;
  grade: string;
  executiveSummary: string;
  reportUrl: string;
  hasPdfAttachment: boolean;
  recipientEmail?: string;
}): { subject: string; html: string } {
  const { businessName, score, grade, executiveSummary, reportUrl, hasPdfAttachment, recipientEmail } = opts;

  const gradeColor: Record<string, string> = {
    A: "#22C55E",
    B: "#66E8FA",
    C: "#F59E0B",
    D: "#EF4444",
  };
  const color = gradeColor[grade] || "#8B919A";

  const scoreDisplay = score != null ? `${score}/100` : "N/A";

  const subject = `Your audit report for ${escHtml(businessName)} is ready`;

  const attachmentNote = hasPdfAttachment
    ? `<div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:8px;padding:12px 16px;margin:0 0 18px;font-size:13px;color:#86EFAC;line-height:1.5;text-align:center;">Your full PDF report is attached to this email.</div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="background:#0B0F14;padding:40px 16px;">
    <div style="max-width:560px;margin:0 auto;">
      ${buildEmailHeader({ tagline: "Audit Report" })}

      <div style="background:#151A21;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:36px 28px;">
        <p style="font-size:12px;font-weight:700;color:#66E8FA;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Your audit is ready</p>
        <h1 style="font-size:22px;font-weight:700;color:#F0F0F0;margin:0 0 8px;line-height:1.3;">
          Here's what we found for ${escHtml(businessName)}
        </h1>
        <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 22px;">
          We ran a full local visibility audit. The summary below is the headline — full details and recommendations are in the report.
        </p>

        <!-- Score Badge -->
        <div style="text-align:center;margin:0 0 20px;">
          <div style="display:inline-block;background:${color};color:#0B0F14;font-size:32px;font-weight:800;padding:18px 28px;border-radius:12px;letter-spacing:-0.5px;">
            ${escHtml(scoreDisplay)}
          </div>
          <p style="margin:10px 0 0;font-size:13px;color:#8B919A;">
            Grade: <strong style="color:${color};">${escHtml(grade)}</strong>
          </p>
        </div>

        ${executiveSummary ? `
        <div style="background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px 18px;margin:0 0 20px;font-size:13px;line-height:1.6;color:#CDD1D6;">
          ${escHtml(executiveSummary)}
        </div>
        ` : ""}

        ${attachmentNote}

        <div style="text-align:center;margin:0 0 8px;">
          <a href="${escHtml(reportUrl)}" target="_blank" style="display:inline-block;background:#66E8FA;color:#0B0F14;font-size:14px;font-weight:700;padding:13px 26px;border-radius:10px;text-decoration:none;">
            View Full Report Online
          </a>
        </div>

        <div style="border-top:1px solid rgba(255,255,255,0.06);margin:24px 0 14px;"></div>

        <p style="font-size:12px;color:#8B919A;line-height:1.6;margin:0;">
          You requested this audit from WeFixTrades. If this wasn't you, you can safely ignore this email.
        </p>
        <p style="font-size:11px;color:#555B63;line-height:1.5;margin:10px 0 0;word-break:break-all;">
          <a href="${escHtml(reportUrl)}" style="color:#66E8FA;text-decoration:none;">${escHtml(reportUrl)}</a>
        </p>
      </div>
      ${buildChatBubble()}
      ${buildLegalFooter({ recipientEmail, marketing: true })}
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
