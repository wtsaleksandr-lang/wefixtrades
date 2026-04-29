/**
 * Lightweight email tracking — open pixel + click redirect injection.
 *
 * Used by `emailTransport.ts` to wrap every outbound HTML email with:
 *   1. A 1x1 transparent tracking pixel pointing at /api/email/open/:id
 *   2. All <a href="https://..."> rewritten to /api/email/click/:id?redirect=...
 *
 * Skipped link types (passed through unchanged):
 *   - mailto:, tel:, sms:
 *   - anchor #fragments
 *   - the per-recipient unsubscribe link (legal requirement: no redirect)
 *   - already-tracked links (idempotent — safe to re-run)
 *
 * Plain-text emails are not modified (no HTML to inject). The text/
 * fallback simply doesn't get tracking, which is correct.
 *
 * Pure functions — no DB, no network. The wire-up to the routes
 * (which DO write to DB on pixel/redirect hits) is in
 * `server/routes/emailTrackingRoutes.ts`.
 */

import crypto from "crypto";

/**
 * Generate an opaque email ID. ~22 base64url chars (128 bits of entropy).
 */
export function generateEmailId(): string {
  return crypto.randomBytes(16).toString("base64url");
}

interface InjectOpts {
  emailId: string;
  baseUrl: string;
}

/**
 * Inject open-tracking pixel + click-tracking links into an HTML email.
 * Idempotent. If `html` is empty/undefined, returns it unchanged.
 */
export function injectTracking(html: string | undefined, opts: InjectOpts): string {
  if (!html || typeof html !== "string") return html ?? "";
  const base = opts.baseUrl.replace(/\/$/, "");

  const withPixel = injectPixel(html, opts.emailId, base);
  const withTrackedLinks = wrapLinks(withPixel, opts.emailId, base);
  return withTrackedLinks;
}

function injectPixel(html: string, emailId: string, baseUrl: string): string {
  // Skip if pixel already present (idempotency)
  if (html.includes(`/api/email/open/${emailId}`)) return html;

  const pixel = `<img src="${baseUrl}/api/email/open/${emailId}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;outline:none;text-decoration:none;" />`;

  // Append before </body> if present, else at the very end
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return html + pixel;
}

/**
 * Rewrite every external <a href="..."> to route through the click-tracking redirect.
 *
 * Skip rules — applied in order:
 *   1. mailto:, tel:, sms:                  (no-op — recipient action, not a webpage)
 *   2. anchor (#)                           (in-page, doesn't leave email client)
 *   3. /api/email/click/...                  (already tracked — idempotent)
 *   4. /api/unsubscribe/...                  (legal; CAN-SPAM expects direct delivery)
 *   5. data: / cid:                          (inline content, not real navigation)
 */
function wrapLinks(html: string, emailId: string, baseUrl: string): string {
  return html.replace(
    /(<a\b[^>]*\bhref=)(["'])([^"']+)\2/gi,
    (match, prefix, quote, url) => {
      if (shouldSkipUrl(url)) return match;
      const wrapped = `${baseUrl}/api/email/click/${emailId}?redirect=${encodeURIComponent(url)}`;
      return `${prefix}${quote}${wrapped}${quote}`;
    },
  );
}

function shouldSkipUrl(url: string): boolean {
  const lower = url.toLowerCase().trim();
  if (lower.startsWith("mailto:")) return true;
  if (lower.startsWith("tel:")) return true;
  if (lower.startsWith("sms:")) return true;
  if (lower.startsWith("data:")) return true;
  if (lower.startsWith("cid:")) return true;
  if (lower.startsWith("#")) return true;
  if (lower.includes("/api/email/click/")) return true;     // already tracked
  if (lower.includes("/api/email/open/")) return true;       // pixel — never tracked
  if (lower.includes("/api/unsubscribe/")) return true;      // legal direct delivery
  return false;
}
