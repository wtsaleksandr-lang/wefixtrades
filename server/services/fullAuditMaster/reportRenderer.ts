/**
 * Master Audit report renderer — converts a MasterAuditReport into:
 *
 *   - renderReportEmailBody()  — small HTML fragment for the delivery
 *                                email's body slot (already wrapped by
 *                                buildTransactionalEmail's shell).
 *   - renderReportPage()       — full HTML page for the public share
 *                                URL (/full-audit-report/:id/:token).
 *                                Print-friendly so the "Download PDF"
 *                                button can just call window.print().
 *
 * Wave 3.6 (2026-05-25). No new deps — plain string concatenation with
 * an escape helper. The shared transactional shell handles dark-mode
 * tokens for emails; the share page uses semantic CSS variables for
 * theming so it stays inside the design-system color guard.
 */
import type { MasterAuditReport, SectionResult } from "./types";
import { SECTION_ORDER, SECTION_LABELS } from "./types";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function statusBadge(status: SectionResult["status"]): { label: string; bg: string; fg: string } {
  if (status === "pass") return { label: "Pass", bg: "rgba(34,197,94,0.15)", fg: "rgb(22,101,52)" };
  if (status === "warning") return { label: "Needs work", bg: "rgba(245,158,11,0.15)", fg: "rgb(146,64,14)" };
  return { label: "Critical", bg: "rgba(239,68,68,0.15)", fg: "rgb(153,27,27)" };
}

function severityColor(severity: "info" | "warning" | "critical"): string {
  if (severity === "critical") return "rgb(153,27,27)";
  if (severity === "warning") return "rgb(146,64,14)";
  return "rgb(55,65,81)";
}

/** Compact section table used inside the delivery email body. */
export function renderReportEmailBody(report: MasterAuditReport, shareUrl: string): string {
  const rows = SECTION_ORDER
    .filter((key) => report.sections[key])
    .map((key) => {
      const s = report.sections[key]!;
      const badge = statusBadge(s.status);
      return `
        <tr>
          <td style="padding:8px 12px;font-size:14px;color:rgb(205,209,214);border-bottom:1px solid rgba(255,255,255,0.06);">
            ${escapeHtml(SECTION_LABELS[key])}
          </td>
          <td style="padding:8px 12px;font-size:14px;color:rgb(240,240,240);font-weight:600;border-bottom:1px solid rgba(255,255,255,0.06);text-align:center;">
            ${s.score}/100
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);text-align:right;">
            <span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${badge.bg};color:${badge.fg};font-size:11px;font-weight:700;">
              ${badge.label}
            </span>
          </td>
        </tr>`;
    })
    .join("");

  return `
    <p style="font-size:14px;color:rgb(205,209,214);line-height:1.6;margin:0 0 16px;">
      Your Master Audit for <strong style="color:rgb(240,240,240);">${escapeHtml(report.businessName)}</strong>
      is ready. Overall score: <strong style="color:rgb(240,240,240);">${report.overallScore}/100</strong>.
    </p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 16px;">
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:13px;color:rgb(139,145,154);line-height:1.6;margin:0;">
      Open the full report below — it stays available indefinitely and
      includes per-section findings with suggested fixes.
    </p>`;
}

/** Full standalone HTML page rendered by the public share-token route. */
export function renderReportPage(report: MasterAuditReport): string {
  const scoreColor =
    report.overallScore >= 80 ? "rgb(34,197,94)"
    : report.overallScore >= 50 ? "rgb(245,158,11)"
    : "rgb(239,68,68)";

  const sectionBlocks = SECTION_ORDER
    .filter((key) => report.sections[key])
    .map((key) => {
      const s = report.sections[key]!;
      const badge = statusBadge(s.status);
      const findings = s.findings.map((f) => `
        <li style="margin:0 0 10px;padding:10px 12px;background:rgb(248,250,252);border-left:3px solid ${severityColor(f.severity)};border-radius:6px;">
          <div style="font-weight:600;font-size:14px;color:rgb(17,24,39);margin-bottom:4px;">
            ${escapeHtml(f.title)}
          </div>
          <div style="font-size:13px;color:rgb(75,85,99);line-height:1.55;margin-bottom:${f.suggestedFix ? "6px" : "0"};">
            ${escapeHtml(f.description)}
          </div>
          ${f.suggestedFix ? `
            <div style="font-size:12px;color:rgb(13,60,252);font-weight:500;">
              Suggested fix: ${escapeHtml(f.suggestedFix)}
            </div>` : ""}
        </li>`).join("");

      return `
        <details open style="margin:0 0 16px;background:rgb(255,255,255);border:1px solid rgb(229,231,235);border-radius:12px;overflow:hidden;">
          <summary style="cursor:pointer;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:rgb(249,250,251);">
            <span style="font-weight:700;font-size:15px;color:rgb(17,24,39);">${escapeHtml(SECTION_LABELS[key])}</span>
            <span style="display:inline-flex;align-items:center;gap:8px;">
              <span style="font-weight:700;font-size:14px;color:rgb(17,24,39);">${s.score}/100</span>
              <span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${badge.bg};color:${badge.fg};font-size:11px;font-weight:700;">
                ${badge.label}
              </span>
            </span>
          </summary>
          <div style="padding:14px 18px;">
            <p style="font-size:13px;color:rgb(75,85,99);line-height:1.6;margin:0 0 12px;">${escapeHtml(s.summary)}</p>
            ${findings ? `<ul style="list-style:none;padding:0;margin:0;">${findings}</ul>` : `<p style="font-size:13px;color:rgb(107,114,128);font-style:italic;margin:0;">No findings in this section.</p>`}
          </div>
        </details>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Full Audit Master Report — ${escapeHtml(report.businessName)}</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: rgb(243,244,246); color: rgb(17,24,39); }
    .wrap { max-width: 880px; margin: 0 auto; padding: 32px 16px 64px; }
    .hero { background: rgb(255,255,255); border: 1px solid rgb(229,231,235); border-radius: 16px; padding: 28px; margin-bottom: 24px; display: flex; gap: 24px; align-items: center; }
    .score-ring { width: 120px; height: 120px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-direction: column; background: conic-gradient(${scoreColor} ${report.overallScore * 3.6}deg, rgb(229,231,235) 0deg); position: relative; flex-shrink: 0; }
    .score-ring::before { content: ""; position: absolute; inset: 8px; background: rgb(255,255,255); border-radius: 50%; }
    .score-ring-inner { position: relative; text-align: center; }
    .score-num { font-size: 32px; font-weight: 800; color: ${scoreColor}; line-height: 1; }
    .score-denom { font-size: 12px; color: rgb(107,114,128); margin-top: 2px; }
    .hero-meta h1 { font-size: 22px; font-weight: 800; margin: 0 0 6px; }
    .hero-meta p { font-size: 13px; color: rgb(107,114,128); margin: 0 0 8px; }
    .hero-meta a { font-size: 13px; color: rgb(13,60,252); text-decoration: none; }
    .actions { margin: 0 0 20px; display: flex; gap: 10px; }
    .btn { display: inline-block; padding: 10px 16px; border-radius: 10px; background: rgb(13,60,252); color: rgb(255,255,255); font-weight: 600; font-size: 14px; text-decoration: none; border: none; cursor: pointer; }
    .btn-secondary { background: rgb(255,255,255); color: rgb(17,24,39); border: 1px solid rgb(229,231,235); }
    .pending { text-align: center; padding: 40px; background: rgb(255,255,255); border: 1px solid rgb(229,231,235); border-radius: 16px; color: rgb(75,85,99); }
    .spinner { display: inline-block; width: 24px; height: 24px; border: 3px solid rgb(229,231,235); border-top-color: rgb(13,60,252); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 12px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media print {
      body { background: rgb(255,255,255); }
      .actions { display: none; }
      details { break-inside: avoid; }
      details > summary { background: rgb(255,255,255) !important; }
    }
    @media (max-width: 600px) {
      .hero { flex-direction: column; text-align: center; }
    }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <div class="score-ring" aria-label="Overall score ${report.overallScore} out of 100">
        <div class="score-ring-inner">
          <div class="score-num">${report.overallScore}</div>
          <div class="score-denom">/100</div>
        </div>
      </div>
      <div class="hero-meta">
        <h1>Full Audit Master report</h1>
        <p>${escapeHtml(report.businessName)} — <a href="${escapeHtml(report.websiteUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(report.websiteUrl)}</a></p>
        <p>Generated ${new Date(report.generatedAt).toLocaleString()}</p>
      </div>
    </section>
    <div class="actions">
      <button class="btn" onclick="window.print()">Download PDF</button>
      <a class="btn btn-secondary" href="/tools/free-audit">Run another audit</a>
    </div>
    ${sectionBlocks}
  </main>
</body>
</html>`;
}

/** Lightweight pending page rendered while status is "running". */
export function renderPendingPage(orderId: string, websiteUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="10">
  <meta name="robots" content="noindex,nofollow" />
  <title>Your Full Audit Master is running…</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: rgb(243,244,246); color: rgb(17,24,39); display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { max-width: 480px; padding: 40px 28px; text-align: center; background: rgb(255,255,255); border: 1px solid rgb(229,231,235); border-radius: 16px; }
    .spinner { display: inline-block; width: 32px; height: 32px; border: 3px solid rgb(229,231,235); border-top-color: rgb(13,60,252); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { font-size: 20px; font-weight: 700; margin: 0 0 10px; }
    p { font-size: 14px; color: rgb(75,85,99); line-height: 1.55; margin: 0 0 8px; }
  </style>
</head>
<body>
  <main class="card">
    <div class="spinner" aria-hidden="true"></div>
    <h1>Running your Master Audit…</h1>
    <p>We're scoring <strong>${escapeHtml(websiteUrl)}</strong> across speed, mobile, SEO, accessibility, and security.</p>
    <p>This page refreshes automatically every 10 seconds. Order ${escapeHtml(orderId)}.</p>
  </main>
</body>
</html>`;
}

/** Error / failed-pipeline page (status: "failed" or unknown). */
export function renderFailedPage(orderId: string, message?: string | null): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Audit failed</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: rgb(243,244,246); color: rgb(17,24,39); display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { max-width: 480px; padding: 40px 28px; text-align: center; background: rgb(255,255,255); border: 1px solid rgb(229,231,235); border-radius: 16px; }
    h1 { font-size: 20px; font-weight: 700; margin: 0 0 10px; color: rgb(153,27,27); }
    p { font-size: 14px; color: rgb(75,85,99); line-height: 1.55; margin: 0 0 12px; }
    a { color: rgb(13,60,252); text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <main class="card">
    <h1>Your audit couldn't complete</h1>
    <p>${escapeHtml(message || "Something went wrong on our end. We'll refund your payment automatically.")}</p>
    <p>Order ${escapeHtml(orderId)}.</p>
    <p><a href="mailto:support@wefixtrades.com">Email support</a> if you'd like us to retry.</p>
  </main>
</body>
</html>`;
}
