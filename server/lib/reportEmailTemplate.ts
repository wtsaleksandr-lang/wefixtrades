/**
 * Builds a professional HTML email for delivering an audit report.
 */
export function buildAuditReportEmail(opts: {
  businessName: string;
  score: number | null;
  grade: string;
  executiveSummary: string;
  reportUrl: string;
  hasPdfAttachment: boolean;
}): { subject: string; html: string } {
  const { businessName, score, grade, executiveSummary, reportUrl, hasPdfAttachment } = opts;

  const gradeColor: Record<string, string> = {
    A: "#22C55E",
    B: "#00D4C8",
    C: "#F59E0B",
    D: "#EF4444",
  };
  const color = gradeColor[grade] || "#6B7280";

  const scoreDisplay = score != null ? `${score}/100` : "N/A";

  const subject = `Your audit report for ${escHtml(businessName)} is ready`;

  const attachmentNote = hasPdfAttachment
    ? `<tr><td style="padding:0 32px 24px;text-align:center;"><div style="background:#F0FFF4;border:1px solid #BBF7D0;border-radius:8px;padding:12px 16px;font-size:13px;color:#166534;line-height:1.5;">Your full PDF report is attached to this email.</div></td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:#1A1A2E;padding:24px 32px;text-align:center;">
              <div style="font-size:22px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;">
                WeFixTrades
              </div>
              <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px;">
                Local Business Audit Report
              </div>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:28px 32px 8px;">
              <div style="font-size:16px;font-weight:700;color:#1A1A2E;">
                Here's your audit report
              </div>
              <div style="font-size:13px;color:#6B7280;margin-top:4px;line-height:1.5;">
                We ran a full local visibility audit for <strong>${escHtml(businessName)}</strong>. Here's what we found.
              </div>
            </td>
          </tr>

          <!-- Score Badge -->
          <tr>
            <td style="padding:20px 32px 12px;text-align:center;">
              <div style="display:inline-block;background:${color};color:#FFFFFF;font-size:28px;font-weight:800;padding:16px 28px;border-radius:12px;letter-spacing:-0.5px;">
                ${escHtml(scoreDisplay)}
              </div>
              <div style="margin-top:8px;font-size:14px;color:#6B7280;">
                Grade: <strong style="color:${color};">${escHtml(grade)}</strong>
              </div>
            </td>
          </tr>

          <!-- Summary -->
          ${executiveSummary ? `
          <tr>
            <td style="padding:4px 32px 20px;">
              <div style="background:#F9FAFB;border-radius:8px;padding:16px 20px;font-size:13px;line-height:1.6;color:#4B5563;">
                ${escHtml(executiveSummary)}
              </div>
            </td>
          </tr>
          ` : ""}

          <!-- PDF attachment note -->
          ${attachmentNote}

          <!-- CTA Button -->
          <tr>
            <td style="padding:0 32px 28px;text-align:center;">
              <a href="${escHtml(reportUrl)}" target="_blank" style="display:inline-block;background:#00D4C8;color:#1A1A2E;font-size:15px;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;">
                View Full Report Online
              </a>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <div style="border-top:1px solid #E5E7EB;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 24px;text-align:center;">
              <div style="font-size:12px;color:#9CA3AF;line-height:1.5;">
                You requested this report from <strong>WeFixTrades</strong>.<br/>
                If this wasn't you, you can safely ignore this email.
              </div>
              <div style="margin-top:8px;font-size:11px;color:#D1D5DB;">
                <a href="${escHtml(reportUrl)}" style="color:#9CA3AF;text-decoration:underline;">${escHtml(reportUrl)}</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
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
