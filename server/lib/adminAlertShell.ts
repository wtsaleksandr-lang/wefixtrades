/**
 * Admin alert email shell — lightweight, ops-focused.
 *
 * Designed for internal ops + admin notifications:
 *   - low-rating review alerts
 *   - mapguard monitoring alerts
 *   - socialSync operator alerts
 *   - contact-form admin notifications
 *   - sales call summaries
 *   - supplier task dispatches
 *   - booking-received notifications to calculator owners
 *   - lead-arrival internal pings
 *
 * Different from `transactionalShell.ts`:
 *   - No chat bubble, no "Powered by" row, no marketing footer
 *   - Smaller headline (admin emails are scanned, not read)
 *   - Compact key-value detail tables are first-class
 *   - Severity-based pill colors (info / warning / critical / success)
 *   - Default light theme (matches Datadog / GitHub / PagerDuty UX)
 *   - Wider default (560px) since admin emails carry more data
 *
 * Standardized from-name: "WeFixTrades Alerts" — every caller should
 * pass that as the from-name so ops staff can filter on it.
 */

const LIGHT = {
  bg: "#F3F4F6",
  card: "#FFFFFF",
  cardInner: "#F9FAFB",
  border: "#E5E7EB",
  textBright: "#111827",
  textBody: "#374151",
  textMuted: "#6B7280",
  textFaint: "#9CA3AF",
} as const;

const DARK = {
  bg: "#0B0F14",
  card: "#151A21",
  cardInner: "#0F141A",
  border: "rgba(255,255,255,0.06)",
  textBright: "#F0F0F0",
  textBody: "#CDD1D6",
  textMuted: "#8B919A",
  textFaint: "#555B63",
} as const;

const TONES = {
  info:     { fg: "#0369A1", bg: "rgba(3,105,161,0.08)",  border: "rgba(3,105,161,0.20)" },
  success:  { fg: "#15803D", bg: "rgba(21,128,61,0.08)",  border: "rgba(21,128,61,0.20)" },
  warning:  { fg: "#B45309", bg: "rgba(180,83,9,0.08)",   border: "rgba(180,83,9,0.20)" },
  critical: { fg: "#B91C1C", bg: "rgba(185,28,28,0.08)",  border: "rgba(185,28,28,0.20)" },
} as const;

export type AlertTone = keyof typeof TONES;

export interface AdminAlertEmailParams {
  /** Recipient — only used for the tiny footer line. */
  recipientEmail?: string;
  /** Theme. Default "light" (ops-friendly). */
  theme?: "light" | "dark";
  /** Card max-width in px. Default 560. */
  maxWidth?: number;
  /** <title> tag. */
  subjectForTitle?: string;

  /** Pill text above the headline, e.g. "Low-rating alert" or "MapGuard warning". */
  alertType: string;
  /** Pill color tone. Default "warning". */
  alertTone?: AlertTone;

  /** Required headline — short, scannable. */
  headline: string;
  /** Optional one-line summary under the headline. */
  summary?: string;

  /** Compact key-value detail table — the heart of most admin emails. */
  detailRows?: Array<{ label: string; value: string; valueColor?: string }>;

  /** Free-form body block (transcript, message text, etc.). HTML allowed. */
  bodyHtml?: string;

  /** Optional CTA — link to dashboard / CRM / admin tool. */
  cta?: { label: string; url: string };

  /** Tiny line at the very bottom, e.g. "MapGuard alert — adjust in portal". */
  footerNote?: string;
}

export function buildAdminAlertEmail(p: AdminAlertEmailParams): string {
  const isDark = p.theme === "dark";
  const t = isDark ? DARK : LIGHT;
  const tone = TONES[p.alertTone ?? "warning"];
  const maxWidth = p.maxWidth ?? 560;

  const detailTable = p.detailRows && p.detailRows.length > 0
    ? `<table style="width:100%;border-collapse:collapse;background:${t.cardInner};border:1px solid ${t.border};border-radius:8px;padding:8px 14px;margin:0 0 ${p.bodyHtml || p.cta ? "16px" : "0"};">
        ${p.detailRows.map((r) => `<tr>
          <td style="padding:6px 0;color:${t.textMuted};font-size:12px;text-transform:uppercase;letter-spacing:0.06em;width:130px;">${r.label}</td>
          <td style="padding:6px 0;color:${r.valueColor ?? t.textBright};font-size:14px;font-weight:600;text-align:right;">${r.value}</td>
        </tr>`).join("")}
      </table>`
    : "";

  const bodyBlock = p.bodyHtml
    ? `<div style="margin:0 0 ${p.cta ? "16px" : "0"};">${p.bodyHtml}</div>`
    : "";

  const ctaButton = p.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td>
        <a href="${p.cta.url}" style="display:inline-block;background:${isDark ? "#0d3cfc" : "#0F172A"};color:${isDark ? "#0B0F14" : "#FFFFFF"};font-size:14px;font-weight:700;padding:11px 22px;border-radius:8px;text-decoration:none;mso-padding-alt:0;">${p.cta.label}</a>
      </td></tr></table>`
    : "";

  const summaryLine = p.summary
    ? `<p style="font-size:14px;color:${t.textBody};line-height:1.55;margin:0 0 18px;">${p.summary}</p>`
    : "";

  const footerNote = p.footerNote
    ? `<p style="font-size:11px;color:${t.textFaint};margin:14px 0 0;text-align:center;">${p.footerNote}</p>`
    : "";

  const recipientLine = p.recipientEmail
    ? `<span style="color:${t.textFaint};">to ${p.recipientEmail}</span>`
    : "";

  // Brand wordmark — compact (smaller than buildEmailHeader's marketing version)
  const brand = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 18px;">
    <tr><td>
      <span style="font-family:'Inter',system-ui,Arial,sans-serif;font-weight:700;font-size:14px;letter-spacing:-0.02em;color:${t.textBright};">We<span style="color:#0d3cfc;">Fix</span>Trades</span>
      <span style="font-family:'Inter',system-ui,Arial,sans-serif;font-size:10px;color:${t.textMuted};letter-spacing:0.1em;text-transform:uppercase;margin-left:8px;">Alerts</span>
    </td></tr>
  </table>`;

  const titleTag = p.subjectForTitle
    ? `<title>${escapeForTag(p.subjectForTitle)}</title>`
    : "<title>WeFixTrades Alert</title>";

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
${titleTag}
</head><body style="margin:0;padding:0;background:${t.bg};">
<div style="font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:${t.bg};padding:28px 12px;">
  <div style="max-width:${maxWidth}px;margin:0 auto;">
    ${brand}
    <div style="background:${t.card};border:1px solid ${t.border};border-radius:12px;padding:24px 22px;">
      <p style="display:inline-block;font-size:11px;font-weight:700;color:${tone.fg};background:${tone.bg};border:1px solid ${tone.border};text-transform:uppercase;letter-spacing:0.08em;margin:0 0 10px;padding:4px 10px;border-radius:999px;">${p.alertType}</p>
      <h1 style="font-size:18px;font-weight:700;color:${t.textBright};margin:0 0 ${p.summary ? "8px" : "16px"};line-height:1.35;">${p.headline}</h1>
      ${summaryLine}
      ${detailTable}
      ${bodyBlock}
      ${ctaButton}
    </div>
    <p style="font-size:11px;color:${t.textFaint};margin:14px 0 0;text-align:center;">
      WeFixTrades Alerts ${recipientLine ? `· ${recipientLine}` : ""}
    </p>
    ${footerNote}
  </div>
</div>
</body></html>`;
}

function escapeForTag(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ─── Plain-text companion ─── */

export interface AdminAlertPlainTextParams {
  alertType: string;
  headline: string;
  summary?: string;
  detailRows?: Array<{ label: string; value: string }>;
  bodyText?: string;
  cta?: { label: string; url: string };
  footerNote?: string;
}

export function buildAdminAlertPlainText(p: AdminAlertPlainTextParams): string {
  const lines: string[] = [];
  lines.push(`[${p.alertType.toUpperCase()}]`);
  lines.push(p.headline);
  lines.push("");
  if (p.summary) {
    lines.push(p.summary);
    lines.push("");
  }
  if (p.detailRows && p.detailRows.length > 0) {
    for (const r of p.detailRows) {
      lines.push(`  ${r.label.padEnd(15, " ")}: ${r.value}`);
    }
    lines.push("");
  }
  if (p.bodyText) {
    lines.push(p.bodyText);
    lines.push("");
  }
  if (p.cta) {
    lines.push(`${p.cta.label}: ${p.cta.url}`);
    lines.push("");
  }
  if (p.footerNote) {
    lines.push(p.footerNote);
  }
  lines.push("— WeFixTrades Alerts");
  return lines.join("\n");
}

export const ADMIN_ALERT_FROM_NAME = "WeFixTrades Alerts";
