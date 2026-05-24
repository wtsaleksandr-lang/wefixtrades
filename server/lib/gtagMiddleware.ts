/**
 * gtag head injection — public pages only.
 *
 * Runs ahead of the SPA catch-all and rewrites `</head>` to include the
 * Google Analytics 4 gtag.js snippet + a small runtime helper exposing
 * the measurement ID and a localStorage opt-out gate.
 *
 * Rules baked in here:
 *
 *   1. Only fires when `GA4_MEASUREMENT_ID` is set AND `NODE_ENV === "production"`.
 *      Dev/staging never load gtag — keeps prod analytics clean.
 *   2. Skips admin/portal surfaces (`/admin*`, `/portal*`, `/api*`) — no
 *      internal traffic in prod numbers, and no PII inside admin pages.
 *   3. Respects a future-proof opt-out: gates the `gtag('config', …)` call
 *      on `localStorage.getItem('analytics_opt_out') !== '1'`.
 *   4. The Measurement ID is exposed to client code as
 *      `window.__GA4_MEASUREMENT_ID__` so funnel events can `gtag('event', …)`
 *      without re-reading the env.
 *
 * Measurement IDs are intentionally public — the gtag snippet ships the ID
 * to every visitor by design — so it is NOT a secret. The
 * Measurement Protocol API SECRET lives ONLY in `server/lib/analytics/ga4Server.ts`
 * and never reaches the client bundle.
 */

import type { Request, Response, NextFunction } from "express";
import { createLogger } from "./logger";

const log = createLogger("GtagMiddleware");

const SKIP_PREFIXES = ["/admin", "/portal", "/api", "/embed-widget.js", "/embed-chat.js"];

function shouldInject(path: string): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  if (!process.env.GA4_MEASUREMENT_ID) return false;
  for (const p of SKIP_PREFIXES) {
    if (path === p || path.startsWith(p + "/")) return false;
  }
  return true;
}

/**
 * Build the script tags to inject into <head>. The measurement ID is
 * read from process.env at request time so an admin-driven Doppler bump
 * + a server restart is enough — no client rebuild required.
 */
function buildGtagScripts(measurementId: string): string {
  // Bare interpolation is safe — measurement IDs only contain [A-Z0-9-].
  return [
    `<script>window.__GA4_MEASUREMENT_ID__=${JSON.stringify(measurementId)};</script>`,
    `<script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script>`,
    `<script>`,
    `  window.dataLayer = window.dataLayer || [];`,
    `  function gtag(){dataLayer.push(arguments);}`,
    `  window.gtag = gtag;`,
    `  gtag('js', new Date());`,
    `  try {`,
    `    if (typeof localStorage !== 'undefined' && localStorage.getItem('analytics_opt_out') === '1') {`,
    `      window.__GA4_OPT_OUT__ = true;`,
    `    } else {`,
    `      gtag('config', ${JSON.stringify(measurementId)}, { anonymize_ip: true });`,
    `    }`,
    `  } catch (e) { gtag('config', ${JSON.stringify(measurementId)}, { anonymize_ip: true }); }`,
    `</script>`,
  ].join("\n  ");
}

/**
 * Express middleware that, for public SPA HTML responses, fetches the
 * shell HTML via the supplied `getHtml` callback, injects the gtag
 * snippet immediately before `</head>`, and returns the rewritten HTML.
 *
 * Falls through to the next middleware unchanged when:
 *   - not a GET
 *   - the request path is in SKIP_PREFIXES
 *   - GA4 isn't configured / we're not in production
 *   - the Accept header doesn't want HTML
 *
 * The OG middleware runs ahead of this one for /audit/report/:id; we
 * still inject gtag there by also exposing a helper used by the OG
 * middleware (see addGtagToHtml below).
 */
export function gtagMiddleware(getHtml: () => Promise<string>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET") return next();
    if (!shouldInject(req.path)) return next();
    const accept = req.headers.accept || "";
    if (accept.includes("application/json") && !accept.includes("text/html")) {
      return next();
    }

    try {
      const html = await getHtml();
      const out = addGtagToHtml(html);
      return res.status(200).set({ "Content-Type": "text/html" }).send(out);
    } catch (err) {
      log.warn("gtag injection failed — falling through to SPA", {
        err: err instanceof Error ? err.message : String(err),
      });
      return next();
    }
  };
}

/**
 * Pure helper — given an HTML shell, inject the gtag snippet before
 * `</head>` if (and only if) the env says we should. Used by the OG
 * middleware so audit-report shares also pick up analytics.
 *
 * Idempotent: if the snippet is already in the string, returns unchanged.
 */
export function addGtagToHtml(html: string): string {
  const measurementId = process.env.GA4_MEASUREMENT_ID;
  if (process.env.NODE_ENV !== "production" || !measurementId) return html;
  if (html.includes("__GA4_MEASUREMENT_ID__")) return html;
  const scripts = buildGtagScripts(measurementId);
  return html.replace("</head>", `    ${scripts}\n  </head>`);
}
