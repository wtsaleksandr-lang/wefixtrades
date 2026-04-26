/**
 * Shared email shell pieces — header, footer, chat bubble.
 *
 * All customer-facing emails should:
 *  1. Open with `buildEmailHeader()` to match the website navbar logo
 *  2. End with `buildLegalFooter({ recipientEmail, marketing })` for
 *     CAN-SPAM compliance + brand presence
 *  3. (Optional) Include `buildChatBubble()` above the footer
 *
 * Marketing emails (audit reports, monthly reports, review requests) MUST
 * pass `marketing: true` so the unsubscribe link renders. Transactional
 * emails (receipts, password setup, cancellation) skip it — those are
 * exempt under CAN-SPAM and don't need an opt-out.
 */

import { buildUnsubscribeUrl } from "./unsubscribeToken";

const LEGAL_ENTITY_NAME = "MR Holdings & Trade LLC";
const LEGAL_ENTITY_ADDRESS = "30 N. Gould St. Suite R · Sheridan, WY 82801";

const ACCENT = "#66E8FA";
const TEXT_BRIGHT = "#FAFAFA";
const TEXT_MUTED = "#8B919A";
const TEXT_FAINT = "#555B63";
const TEXT_TINY = "#3D434A";
const BORDER = "rgba(255,255,255,0.06)";

/* ═══════════════════════════════════════════
   HEADER — matches website navbar Logo.tsx
   ═══════════════════════════════════════════ */

/**
 * Email-safe replication of the website navbar logo.
 * Table-based layout works in Gmail, Outlook, Apple Mail.
 *
 * Uses Unicode ✓ inside the icon box rather than SVG (Gmail strips SVG).
 * Visually close to the website's bracket+checkmark mark; close enough for
 * brand recognition.
 */
export function buildEmailHeader(opts: { tagline?: string } = {}): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 28px;">
      <tr>
        <td style="vertical-align:middle;padding-right:12px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;">
            <tr>
              <td align="center" valign="middle" width="42" height="42" style="width:42px;height:42px;background:#1a1f1e;border:1.5px solid rgba(102,232,250,0.22);border-radius:11px;color:${ACCENT};font-size:20px;font-weight:700;font-family:Arial,sans-serif;line-height:42px;text-align:center;">&#10003;</td>
            </tr>
          </table>
        </td>
        <td style="vertical-align:middle;font-family:'Inter',system-ui,-apple-system,Arial,sans-serif;font-weight:700;font-size:20px;letter-spacing:-0.025em;color:${TEXT_BRIGHT};line-height:1;">
          We<span style="color:${ACCENT};">Fix</span>Trades
        </td>
      </tr>
      ${opts.tagline ? `
      <tr>
        <td colspan="2" style="padding-top:10px;text-align:center;font-family:'Inter',system-ui,-apple-system,Arial,sans-serif;font-size:11px;color:${TEXT_MUTED};letter-spacing:0.05em;text-transform:uppercase;">
          ${opts.tagline}
        </td>
      </tr>` : ""}
    </table>`;
}

/* ═══════════════════════════════════════════
   CHAT BUBBLE — call-to-action card
   ═══════════════════════════════════════════ */

/**
 * Friendly "Chat with us" card. Drop in above the footer on any email
 * where helping the recipient reach support is valuable.
 */
export function buildChatBubble(): string {
  const chatUrl = `${(process.env.APP_URL || "https://wefixtrades.com").replace(/\/$/, "")}/#chat`;
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:18px auto 0;width:100%;max-width:560px;">
      <tr>
        <td>
          <a href="${chatUrl}" style="display:block;background:#0F141A;border:1px solid ${BORDER};border-radius:12px;padding:14px 18px;text-decoration:none;font-family:'Inter',system-ui,Arial,sans-serif;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td valign="middle" style="width:36px;">
                  <span style="display:inline-block;width:32px;height:32px;background:rgba(102,232,250,0.12);border-radius:8px;text-align:center;line-height:32px;font-size:16px;">💬</span>
                </td>
                <td valign="middle" style="padding-left:12px;">
                  <div style="font-size:13px;font-weight:700;color:${TEXT_BRIGHT};">Have a question?</div>
                  <div style="font-size:12px;color:${TEXT_MUTED};margin-top:2px;">Chat with us — we usually reply in minutes.</div>
                </td>
                <td valign="middle" align="right" style="font-size:13px;font-weight:700;color:${ACCENT};white-space:nowrap;">→</td>
              </tr>
            </table>
          </a>
        </td>
      </tr>
    </table>`;
}

/* ═══════════════════════════════════════════
   FOOTER — brand, products, contact, trust, legal
   ═══════════════════════════════════════════ */

interface FooterOpts {
  /** Recipient email — required for marketing emails so we can render the per-recipient unsubscribe link */
  recipientEmail?: string;
  /** Marketing emails get an unsubscribe link; transactional emails don't */
  marketing?: boolean;
  /** Theme variant — defaults to dark to match the marketing site */
  theme?: "dark" | "light";
}

const PRODUCTS: Array<{ name: string; href: string }> = [
  { name: "TradeLine", href: "/products/tradeline" },
  { name: "QuoteQuick Pro", href: "/products/quickquotepro" },
  { name: "MapGuard", href: "/products/mapguard" },
  { name: "ReputationShield", href: "/products/reputationshield" },
  { name: "SocialSync", href: "/products/socialsync" },
  { name: "RankFlow", href: "/products/rankflow" },
  { name: "AdFlow", href: "/products/adflow" },
];

const TRUST_BADGES: Array<{ icon: string; label: string }> = [
  { icon: "🌐", label: "Google Business Profile Partner" },
  { icon: "🔒", label: "256-bit SSL" },
  { icon: "💳", label: "Stripe-secured payments" },
  { icon: "📱", label: "Twilio A2P Registered" },
  { icon: "🔐", label: "GDPR-ready" },
];

const POWERED_BY: string[] = [
  "Anthropic", "OpenAI", "Cloudflare", "Twilio", "SendGrid", "Vapi", "Meta",
];

export function buildLegalFooter(opts: FooterOpts | "dark" | "light" = {}): string {
  // Backward-compat: old call sites passed a theme string directly
  const params: FooterOpts = typeof opts === "string" ? { theme: opts } : opts;
  const isLight = params.theme === "light";
  const baseUrl = (process.env.APP_URL || "https://wefixtrades.com").replace(/\/$/, "");

  const palette = isLight ? {
    bg: "transparent",
    text: "#374151",
    muted: "#6B7280",
    faint: "#9CA3AF",
    tiny: "#C7CCD2",
    border: "#E5E7EB",
    accent: ACCENT,
    bright: "#111827",
  } : {
    bg: "transparent",
    text: "#CDD1D6",
    muted: TEXT_MUTED,
    faint: TEXT_FAINT,
    tiny: TEXT_TINY,
    border: BORDER,
    accent: ACCENT,
    bright: TEXT_BRIGHT,
  };

  const productLinks = PRODUCTS
    .map((p) => `<a href="${baseUrl}${p.href}" style="display:inline-block;color:${palette.muted};font-size:11px;text-decoration:none;padding:3px 10px;margin:2px;border:1px solid ${palette.border};border-radius:999px;font-family:'Inter',system-ui,Arial,sans-serif;">${p.name}</a>`)
    .join("");

  const trustRow = TRUST_BADGES
    .map((b) => `<span style="display:inline-block;color:${palette.muted};font-size:10.5px;margin:0 8px 4px 0;font-family:'Inter',system-ui,Arial,sans-serif;">${b.icon} ${b.label}</span>`)
    .join("");

  const poweredRow = POWERED_BY
    .map((name, i) => `<span style="color:${palette.faint};font-size:10.5px;font-weight:600;letter-spacing:0.02em;font-family:'Inter',system-ui,Arial,sans-serif;">${name}</span>${i < POWERED_BY.length - 1 ? `<span style="color:${palette.tiny};margin:0 8px;">·</span>` : ""}`)
    .join("");

  const unsubscribeBlock = params.marketing && params.recipientEmail
    ? `
      <p style="font-size:11px;color:${palette.faint};text-align:center;margin:16px 0 0;line-height:1.5;font-family:'Inter',system-ui,Arial,sans-serif;">
        Don't want these reports? <a href="${buildUnsubscribeUrl(params.recipientEmail, baseUrl)}" style="color:${palette.muted};text-decoration:underline;">Unsubscribe</a>.
      </p>`
    : "";

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%;max-width:560px;margin:24px auto 0;">
      <tr>
        <td style="padding:24px 18px 0;border-top:1px solid ${palette.border};">

          <!-- Brand wordmark -->
          <p style="text-align:center;margin:0 0 8px;font-family:'Inter',system-ui,Arial,sans-serif;font-size:15px;font-weight:700;letter-spacing:-0.02em;color:${palette.bright};">
            We<span style="color:${palette.accent};">Fix</span>Trades
          </p>

          <!-- Tagline -->
          <p style="text-align:center;margin:0 0 14px;font-family:'Inter',system-ui,Arial,sans-serif;font-size:11.5px;color:${palette.muted};line-height:1.5;font-style:italic;">
            No contracts &middot; Cancel anytime &middot; Upfront pricing<br/>
            The most transparent SaaS for trades pros in North America
          </p>

          <!-- Product links -->
          <p style="text-align:center;margin:0 0 14px;line-height:1.9;">
            ${productLinks}
          </p>

          <!-- Contact -->
          <p style="text-align:center;margin:0 0 4px;font-family:'Inter',system-ui,Arial,sans-serif;font-size:11.5px;color:${palette.muted};line-height:1.7;">
            <a href="tel:+19156153280" style="color:${palette.muted};text-decoration:none;">📞&nbsp;+1&nbsp;(915)&nbsp;615-3280</a>
            <span style="color:${palette.tiny};margin:0 8px;">·</span>
            <a href="mailto:support@wefixtrades.com" style="color:${palette.muted};text-decoration:none;">support@wefixtrades.com</a>
            <span style="color:${palette.tiny};margin:0 8px;">·</span>
            <a href="mailto:sales@wefixtrades.com" style="color:${palette.muted};text-decoration:none;">sales@wefixtrades.com</a>
          </p>
          <p style="text-align:center;margin:0 0 18px;font-family:'Inter',system-ui,Arial,sans-serif;font-size:11.5px;color:${palette.muted};">
            Toronto, Canada
          </p>

          <!-- Trust badges -->
          <p style="text-align:center;margin:0 0 12px;line-height:1.7;">
            ${trustRow}
          </p>

          <!-- Powered by -->
          <p style="text-align:center;margin:0;padding-top:10px;border-top:1px solid ${palette.border};line-height:1.6;">
            <span style="font-size:9.5px;color:${palette.tiny};text-transform:uppercase;letter-spacing:0.08em;font-weight:600;font-family:'Inter',system-ui,Arial,sans-serif;">Powered by</span>
            <br/>
            <span style="display:inline-block;margin-top:4px;">${poweredRow}</span>
          </p>

          ${unsubscribeBlock}

          <!-- Tiny CAN-SPAM legal entity -->
          <p style="text-align:center;margin:18px 0 0;font-family:'Inter',system-ui,Arial,sans-serif;font-size:9px;color:${palette.tiny};line-height:1.5;">
            ${LEGAL_ENTITY_NAME} &middot; ${LEGAL_ENTITY_ADDRESS}
          </p>
        </td>
      </tr>
    </table>`;
}

export const LEGAL_ENTITY = {
  name: LEGAL_ENTITY_NAME,
  address: LEGAL_ENTITY_ADDRESS,
};
