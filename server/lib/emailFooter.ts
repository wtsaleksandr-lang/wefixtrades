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

const ACCENT = "#0d3cfc";
const TEXT_BRIGHT = "#FAFAFA";
const TEXT_MUTED = "#8B919A";
const TEXT_FAINT = "#555B63";
const TEXT_TINY = "#3D434A";
const BORDER = "rgba(255,255,255,0.06)";
const BORDER_SOFT = "rgba(255,255,255,0.10)";

const COMPANY_NAME = "WeFixTrades";
const COMPANY_PHONE = "+1 (915) 615-3280";
const COMPANY_LOCATION = "Toronto, Canada";

/* ═══════════════════════════════════════════
   HEADER — matches website navbar Logo.tsx
   ═══════════════════════════════════════════ */

/**
 * Email-safe replication of the website navbar logo.
 * Centered as a unit. Badged icon on the left, then a stacked column with
 * the wordmark and (optional) tagline directly under it. Tagline
 * left-aligns with the "W" of WeFixTrades.
 *
 * The icon is a hosted PNG (`/favicon.png`). It used to be an inline
 * `data:image/svg+xml` URI, but Gmail (and most webmail clients) block
 * `data:` URIs in <img> AND don't render SVG at all — so the logo silently
 * failed in inboxes. A hosted raster PNG loads like any other email image.
 *
 * `theme` defaults to "dark". Pass `theme: "light"` when the header is
 * rendered against a light background (e.g. ContentFlow review emails) —
 * this swaps the wordmark + tagline text colors to dark variants so they
 * stay readable. The badged icon stays constant across both themes.
 */
export function buildEmailHeader(opts: { tagline?: string; theme?: "dark" | "light" } = {}): string {
  const isLight = opts.theme === "light";
  const wordmarkColor = isLight ? "#0F172A" : TEXT_BRIGHT;
  const taglineColor = isLight ? "#6B7280" : TEXT_MUTED;
  const baseUrl = (process.env.APP_URL || "https://wefixtrades.com").replace(/\/$/, "");

  const taglineRow = opts.tagline
    ? `<div style="font-family:'Inter',system-ui,-apple-system,Arial,sans-serif;font-size:10.5px;color:${taglineColor};letter-spacing:0.09em;text-transform:uppercase;line-height:1;margin-top:4px;">${opts.tagline}</div>`
    : "";

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 24px;">
      <tr>
        <td style="vertical-align:middle;padding-right:12px;line-height:0;">
          <!-- Brand icon — hosted PNG (badge + rounded corners baked in).
               Renders in every email client; no data:/SVG support needed. -->
          <img src="${baseUrl}/favicon.png" width="42" height="42" alt="WeFixTrades"
               style="display:block;width:42px;height:42px;border:0;outline:none;text-decoration:none;border-radius:11px;" />
        </td>
        <td style="vertical-align:middle;text-align:left;">
          <div style="font-family:'Inter',system-ui,-apple-system,Arial,sans-serif;font-weight:700;font-size:20px;letter-spacing:-0.03em;color:${wordmarkColor};line-height:1;">We<span style="color:${ACCENT};">Fix</span>Trades</div>
          ${taglineRow}
        </td>
      </tr>
    </table>`;
}

/* ═══════════════════════════════════════════
   CHAT BUBBLE — call-to-action card
   ═══════════════════════════════════════════ */

/**
 * "Have a question?" card. Drop in above the footer on any email
 * where helping the recipient reach support is valuable.
 * Wrapped in a subtle white border to lift it off the page.
 */
export function buildChatBubble(): string {
  const chatUrl = `${(process.env.APP_URL || "https://wefixtrades.com").replace(/\/$/, "")}/#chat`;
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:18px auto 0;width:100%;max-width:560px;">
      <tr>
        <td>
          <a href="${chatUrl}" style="display:block;background:#0F141A;border:1px solid ${BORDER_SOFT};border-radius:12px;padding:14px 18px;text-decoration:none;font-family:'Inter',system-ui,Arial,sans-serif;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td valign="middle" style="width:36px;">
                  <span style="display:inline-block;width:32px;height:32px;background:rgba(13,60,252,0.12);border-radius:8px;text-align:center;line-height:32px;font-size:16px;">💬</span>
                </td>
                <td valign="middle" style="padding-left:12px;">
                  <div style="font-size:13px;font-weight:700;color:${TEXT_BRIGHT};">Have a question?</div>
                  <div style="font-size:12px;color:${TEXT_MUTED};margin-top:2px;">Chat with us — available 24/7.</div>
                </td>
                <td valign="middle" align="right" style="font-size:13px;font-weight:700;color:#FFFFFF;white-space:nowrap;">→</td>
              </tr>
            </table>
          </a>
        </td>
      </tr>
    </table>`;
}

/* ═══════════════════════════════════════════
   FOOTER — brand, products, powered-by, legal
   ═══════════════════════════════════════════ */

interface FooterOpts {
  /** Recipient email — required for marketing emails so we can render the per-recipient unsubscribe link */
  recipientEmail?: string;
  /** Marketing emails get an unsubscribe link; transactional emails don't */
  marketing?: boolean;
  /** Theme variant — defaults to dark to match the marketing site */
  theme?: "dark" | "light";
}

/** 3 flagship products surfaced in the footer. Everything else lives at /products. */
const FLAGSHIP_PRODUCTS: Array<{ name: string; href: string }> = [
  { name: "TradeLine", href: "/products/tradeline" },
  { name: "QuoteQuick Pro", href: "/products/quickquotepro" },
  { name: "MapGuard", href: "/products/mapguard" },
];

export function buildLegalFooter(opts: FooterOpts | "dark" | "light" = {}): string {
  // Backward-compat: old call sites passed a theme string directly
  const params: FooterOpts = typeof opts === "string" ? { theme: opts } : opts;
  const isLight = params.theme === "light";
  const baseUrl = (process.env.APP_URL || "https://wefixtrades.com").replace(/\/$/, "");
  const year = new Date().getFullYear();

  const palette = isLight ? {
    text: "#1F2937",
    muted: "#374151",
    faint: "#4B5563",
    tiny: "#6B7280",
    border: "#D1D5DB",
    borderSoft: "#E5E7EB",
    accent: ACCENT,
    bright: "#0F172A",
  } : {
    text: "#CDD1D6",
    muted: TEXT_MUTED,
    faint: TEXT_FAINT,
    tiny: TEXT_TINY,
    border: BORDER,
    borderSoft: "rgba(255,255,255,0.04)",
    accent: ACCENT,
    bright: TEXT_BRIGHT,
  };

  // 3 flagship products inline, with a "View all" tail
  const platformLine = FLAGSHIP_PRODUCTS
    .map((p, i, arr) =>
      `<a href="${baseUrl}${p.href}" style="color:${palette.text};text-decoration:none;font-weight:500;">${p.name}</a>${
        i < arr.length - 1 ? `<span style="color:${palette.tiny};margin:0 8px;">·</span>` : ""
      }`,
    )
    .join("") + ` <a href="${baseUrl}/products" style="color:${palette.muted};text-decoration:none;font-weight:500;margin-left:10px;">View all &rarr;</a>`;

  const unsubscribeLink = params.marketing && params.recipientEmail
    ? ` <span style="color:${palette.tiny};margin:0 8px;">·</span> <a href="${buildUnsubscribeUrl(params.recipientEmail, baseUrl)}" style="color:${palette.faint};text-decoration:underline;">Unsubscribe</a>`
    : "";

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%;max-width:560px;margin:36px auto 0;">
      <tr>
        <td style="padding:0 4px;">

          <!-- Hairline divider — soft fade for premium feel -->
          <div style="height:1px;background:${palette.border};margin:0 0 32px;line-height:1px;font-size:0;">&nbsp;</div>

          <!-- Brand wordmark -->
          <p style="margin:0 0 10px;font-family:'Inter',system-ui,-apple-system,Arial,sans-serif;font-size:17px;font-weight:700;letter-spacing:-0.02em;color:${palette.bright};line-height:1;">
            We<span style="color:${palette.accent};">Fix</span>Trades
          </p>

          <!-- Confident value prop -->
          <p style="margin:0 0 28px;font-family:'Inter',system-ui,-apple-system,Arial,sans-serif;font-size:13px;color:${palette.muted};line-height:1.55;max-width:420px;">
            Helping trade businesses win more jobs through automation, visibility, and lead systems.
          </p>

          <!-- Platform -->
          <p style="margin:0 0 6px;font-family:'Inter',system-ui,-apple-system,Arial,sans-serif;font-size:10px;color:${palette.faint};text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">
            Platform
          </p>
          <p style="margin:0 0 24px;font-family:'Inter',system-ui,-apple-system,Arial,sans-serif;font-size:13px;color:${palette.text};line-height:1.6;">
            ${platformLine}
          </p>

          <!-- Contact -->
          <p style="margin:0 0 6px;font-family:'Inter',system-ui,-apple-system,Arial,sans-serif;font-size:10px;color:${palette.faint};text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">
            Contact
          </p>
          <p style="margin:0 0 4px;font-family:'Inter',system-ui,-apple-system,Arial,sans-serif;font-size:13px;color:${palette.text};line-height:1.65;">
            <a href="mailto:support@wefixtrades.com" style="color:${palette.text};text-decoration:none;">support@wefixtrades.com</a>
            <span style="color:${palette.tiny};margin:0 6px;">·</span>
            <a href="mailto:sales@wefixtrades.com" style="color:${palette.text};text-decoration:none;">sales@wefixtrades.com</a>
          </p>
          <p style="margin:0 0 26px;font-family:'Inter',system-ui,-apple-system,Arial,sans-serif;font-size:12px;color:${palette.faint};line-height:1.6;">
            ${COMPANY_LOCATION}
            <span style="color:${palette.tiny};margin:0 6px;">·</span>
            <a href="tel:+19156153280" style="color:${palette.faint};text-decoration:none;">${COMPANY_PHONE}</a>
          </p>

          <!-- Trust pillars (max 2) -->
          <p style="margin:0 0 22px;font-family:'Inter',system-ui,-apple-system,Arial,sans-serif;font-size:11.5px;color:${palette.muted};line-height:1.6;letter-spacing:0.01em;">
            Cancel anytime
            <span style="color:${palette.tiny};margin:0 8px;">·</span>
            Transparent pricing
            <span style="color:${palette.tiny};margin:0 8px;">·</span>
            Built on enterprise-grade infrastructure
          </p>

          <!-- Final hairline + compliance row -->
          <div style="height:1px;background:${palette.border};margin:0 0 14px;line-height:1px;font-size:0;">&nbsp;</div>
          <p style="margin:0;font-family:'Inter',system-ui,-apple-system,Arial,sans-serif;font-size:11px;color:${palette.tiny};line-height:1.5;">
            &copy; ${year} ${COMPANY_NAME}
            <span style="color:${palette.tiny};margin:0 8px;">·</span>
            <a href="${baseUrl}/privacy" style="color:${palette.faint};text-decoration:none;">Privacy</a>
            <span style="color:${palette.tiny};margin:0 8px;">·</span>
            <a href="${baseUrl}/terms" style="color:${palette.faint};text-decoration:none;">Terms</a>${unsubscribeLink}
          </p>
        </td>
      </tr>
    </table>`;
}
