/**
 * Thin client-side wrapper around `window.gtag`.
 *
 * The gtag.js script is injected server-side (see
 * `server/lib/gtagMiddleware.ts`) on production public pages only.
 * In dev — and on admin/portal pages — `window.gtag` is undefined.
 * Every call here no-ops in that case, so feature code can call
 * `ga4Event('quote_started', { ... })` without any guards.
 *
 * Also respects the `analytics_opt_out` localStorage flag the snippet
 * checks at boot. If the user opts out later in the session, this
 * helper re-checks it on every call so the next page-load is enough
 * to fully respect the preference.
 *
 * NEVER send PII (email, phone, name) — params are limited to
 * non-identifying funnel metadata.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    __GA4_MEASUREMENT_ID__?: string;
    __GA4_OPT_OUT__?: boolean;
  }
}

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.gtag !== "function") return false;
  if (window.__GA4_OPT_OUT__ === true) return false;
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("analytics_opt_out") === "1") {
      return false;
    }
  } catch {
    // localStorage can throw in iframes / privacy modes — fall through to enabled.
  }
  return true;
}

export function ga4Event(name: string, params?: Record<string, unknown>): void {
  if (!isEnabled()) return;
  try {
    window.gtag!("event", name, params ?? {});
  } catch {
    // Never let an analytics failure break the UI.
  }
}
