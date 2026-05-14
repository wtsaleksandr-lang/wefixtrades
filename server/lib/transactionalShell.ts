/**
 * Transactional email shell — premium, lightweight, mobile-first.
 *
 * Replaces the inline HTML wrapper that customer-facing transactional
 * emails (welcome, onboarding, payment receipt, etc.) have been
 * duplicating across ~9 files. Pattern lifted from the production-tested
 * `dunningEmails.ts` shell, generalized for non-dunning use cases.
 *
 * NOT for:
 *   - Reports (use `reportShell.ts` — has KPI grid, charts, glossary)
 *   - Plain admin alerts (planned for a future small admin shell)
 *
 * Design notes:
 *   - Uses tables for layout (Outlook safe)
 *   - All styles inline (Gmail strips <style>)
 *   - <!DOCTYPE> + viewport meta + <title> for client compatibility
 *   - Default 520px max-width — comfortable on mobile, doesn't feel
 *     cramped on desktop
 *   - Default dark theme (#0B0F14 / #151A21 / #0d3cfc accent) matching
 *     the rest of the brand. Light theme available for callers that
 *     need it (e.g. ContentFlow review emails)
 *   - One CTA. If a template needs more, that's a flag the template
 *     should be split.
 */

import { buildEmailHeader, buildChatBubble, buildLegalFooter } from "./emailFooter";

const DARK = {
  bg: "#0B0F14",
  card: "#151A21",
  cardInner: "#0F141A",
  border: "rgba(255,255,255,0.06)",
  borderInner: "rgba(255,255,255,0.10)",
  textBright: "#F0F0F0",
  textBody: "#CDD1D6",
  textMuted: "#8B919A",
  textFaint: "#555B63",
  accent: "#0d3cfc",
} as const;

const LIGHT = {
  bg: "#F3F4F6",
  card: "#FFFFFF",
  cardInner: "#F9FAFB",
  border: "#E5E7EB",
  borderInner: "#F3F4F6",
  textBright: "#111827",
  textBody: "#374151",
  textMuted: "#6B7280",
  textFaint: "#9CA3AF",
  accent: "#0F172A",
} as const;

export interface TransactionalEmailParams {
  /** Recipient email — required for legal footer (and unsubscribe link if marketing). */
  recipientEmail?: string;
  /** Marketing emails get an unsubscribe link in the footer; transactional emails skip it. */
  marketing?: boolean;
  /** Theme variant. Defaults to dark (matches brand). */
  theme?: "dark" | "light";
  /** Max content width in pixels. Defaults to 520. */
  maxWidth?: number;
  /** Optional <title> tag content for accessibility / preview text. */
  subjectForTitle?: string;
  /** Optional tagline shown under the brand wordmark in the header. */
  headerTagline?: string;

  /** Eyebrow pill above the headline. Skipped if absent. */
  eyebrow?: string;
  /** Eyebrow text color. Defaults to the theme accent. */
  eyebrowColor?: string;

  /** Required headline (h1). HTML allowed but plain text recommended. */
  headline: string;
  /** Optional intro paragraph immediately under the headline. HTML allowed. */
  intro?: string;
  /** Optional free-form body slot between intro and CTA. HTML. */
  bodyHtml?: string;

  /** Optional primary CTA. Skipped if absent. */
  cta?: {
    label: string;
    url: string;
    /** "primary" = inline pill (default). "block" = full-width button. */
    style?: "primary" | "block";
  };
  /** Small text immediately under the CTA. HTML allowed. */
  ctaFinePrint?: string;
  /** HTML injected immediately after the CTA + fine print. E.g. secondary links. */
  afterCtaHtml?: string;
  /** "Button not working? Paste this link" fallback block. */
  pasteLinkFallback?: {
    label?: string;
    url: string;
  };

  /** Show a hairline divider before the support note. Defaults to true if supportNote is set. */
  showDividerBeforeSupport?: boolean;
  /** Footer line about reaching support. HTML allowed (mailto: etc.). */
  supportNote?: string;

  /** Render the "Have a question?" chat bubble between card and footer. Defaults: true for dark, false for light. */
  includeChatBubble?: boolean;
}

export function buildTransactionalEmail(p: TransactionalEmailParams): string {
  const theme = p.theme === "light" ? LIGHT : DARK;
  const isLight = p.theme === "light";
  const maxWidth = p.maxWidth ?? 520;
  const showChat = p.includeChatBubble ?? !isLight;

  const eyebrowColor = p.eyebrowColor ?? theme.accent;

  const eyebrowHtml = p.eyebrow
    ? `<p style="font-size:11px;font-weight:700;color:${eyebrowColor};text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px;">${p.eyebrow}</p>`
    : "";

  const introHtml = p.intro
    ? `<p style="font-size:14px;color:${theme.textBody};line-height:1.6;margin:0 0 ${p.bodyHtml || p.cta ? "20px" : "0"};">${p.intro}</p>`
    : "";

  const bodyHtml = p.bodyHtml
    ? `<div style="margin:0 0 ${p.cta ? "22px" : "0"};">${p.bodyHtml}</div>`
    : "";

  const ctaHtml = p.cta
    ? buildCtaHtml(p.cta, theme)
    : "";

  const ctaFinePrintHtml = p.ctaFinePrint
    ? `<p style="font-size:12px;color:${theme.textMuted};line-height:1.6;margin:12px 0 0;">${p.ctaFinePrint}</p>`
    : "";

  const afterCtaHtml = p.afterCtaHtml ?? "";

  const pasteFallbackHtml = p.pasteLinkFallback
    ? `<p style="font-size:11px;color:${theme.textFaint};line-height:1.5;margin:14px 0 0;word-break:break-all;">
         ${p.pasteLinkFallback.label ?? "Button not working? Paste this link:"}<br/>
         <a href="${p.pasteLinkFallback.url}" style="color:${theme.accent};text-decoration:none;">${p.pasteLinkFallback.url}</a>
       </p>`
    : "";

  const showDivider = p.showDividerBeforeSupport ?? !!p.supportNote;
  const dividerHtml = showDivider
    ? `<div style="border-top:1px solid ${theme.border};margin:24px 0 14px;line-height:1px;font-size:0;">&nbsp;</div>`
    : "";

  const supportNoteHtml = p.supportNote
    ? `<p style="font-size:12px;color:${theme.textMuted};line-height:1.6;margin:0;">${p.supportNote}</p>`
    : "";

  const chatBubbleHtml = showChat ? buildChatBubble() : "";
  const legalFooterHtml = buildLegalFooter({
    recipientEmail: p.recipientEmail,
    marketing: p.marketing,
    theme: isLight ? "light" : "dark",
  });

  const titleTag = p.subjectForTitle ? `<title>${escapeForTag(p.subjectForTitle)}</title>` : "<title>WeFixTrades</title>";

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
${titleTag}
</head><body style="margin:0;padding:0;background:${theme.bg};">
<div style="font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:${theme.bg};padding:32px 12px;">
  <div style="max-width:${maxWidth}px;margin:0 auto;">
    ${buildEmailHeader({ tagline: p.headerTagline, theme: isLight ? "light" : "dark" })}
    <div style="background:${theme.card};border:1px solid ${theme.border};border-radius:16px;padding:32px 24px;">
      ${eyebrowHtml}
      <h1 style="font-size:22px;font-weight:700;color:${theme.textBright};margin:0 0 ${p.intro ? "12px" : "20px"};line-height:1.3;">${p.headline}</h1>
      ${introHtml}
      ${bodyHtml}
      ${ctaHtml}
      ${ctaFinePrintHtml}
      ${afterCtaHtml}
      ${pasteFallbackHtml}
      ${dividerHtml}
      ${supportNoteHtml}
    </div>
    ${chatBubbleHtml}
    ${legalFooterHtml}
  </div>
</div>
</body></html>`;
}

function buildCtaHtml(cta: NonNullable<TransactionalEmailParams["cta"]>, theme: typeof DARK | typeof LIGHT): string {
  const block = cta.style === "block";
  const isLight = theme === LIGHT;
  /* DOSS pattern: dark-theme email button is cream (#E6E3E0) with near-
   * black text — same as the marketing site's primary CTA. Was previously
   * blue button with #0B0F14 text, which read as "barely visible blue on
   * blue" in customer inboxes. Light theme stays dark-bg / white-text. */
  const buttonBg = isLight ? "#0F172A" : "#E6E3E0";
  const buttonFg = isLight ? "#FFFFFF" : "#1E1E1E";

  if (block) {
    return `<a href="${cta.url}" style="display:block;background:${buttonBg};color:${buttonFg};font-size:15px;font-weight:700;padding:14px 24px;border-radius:10px;text-decoration:none;text-align:center;mso-padding-alt:0;">${cta.label}</a>`;
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0;"><tr><td>
    <a href="${cta.url}" style="display:inline-block;background:${buttonBg};color:${buttonFg};font-size:14px;font-weight:700;padding:13px 26px;border-radius:10px;text-decoration:none;mso-padding-alt:0;">${cta.label}</a>
  </td></tr></table>`;
}

function escapeForTag(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ─── Plain-text companion ─── */

export interface PlainTextParams {
  headline: string;
  intro?: string;
  bodyText?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  pasteLinkUrl?: string;
  supportNote?: string;
  signoff?: string;
}

/**
 * Build a plain-text fallback for the same email. Caller passes the same
 * core content; the shell strips formatting and produces a clean text version
 * suitable as the `text` field on nodemailer.sendMail() options.
 */
export function buildPlainText(p: PlainTextParams): string {
  const lines: string[] = [];
  lines.push(stripHtml(p.headline));
  lines.push("");
  if (p.intro) {
    lines.push(stripHtml(p.intro));
    lines.push("");
  }
  if (p.bodyText) {
    lines.push(p.bodyText);
    lines.push("");
  }
  if (p.ctaLabel && p.ctaUrl) {
    lines.push(`${p.ctaLabel}: ${p.ctaUrl}`);
    lines.push("");
  }
  if (p.pasteLinkUrl && p.pasteLinkUrl !== p.ctaUrl) {
    lines.push(`Or paste this link: ${p.pasteLinkUrl}`);
    lines.push("");
  }
  if (p.supportNote) {
    lines.push(stripHtml(p.supportNote));
    lines.push("");
  }
  lines.push(p.signoff ?? "WeFixTrades · Toronto, Canada");
  return lines.join("\n");
}

function stripHtml(s: string): string {
  return s
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, "$2 ($1)")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(strong|em|b|i|u|span|div|p)[^>]*>/gi, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
