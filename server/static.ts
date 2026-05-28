import express, { type Express, type NextFunction, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import * as Sentry from "@sentry/node";
import { ogTagMiddleware } from "./lib/ogMiddleware";
import { gtagMiddleware, addGtagToHtml } from "./lib/gtagMiddleware";

/**
 * Wave 93 — critical routes that MUST have a prerendered file. If any of
 * these falls through to the SPA shell, that means the prerender step
 * silently skipped (or the file got pruned) and external no-JS scrapers
 * are getting garbage. We rate-limit Sentry events to one per route per
 * process so a sustained outage doesn't flood the project.
 *
 * Kept in sync with `scripts/seo/prerender-routes.mjs`,
 * `scripts/deploy/content-verification.mjs`, and
 * `tests/build-output-smoke.test.ts`.
 */
const CRITICAL_PRERENDERED_ROUTES = new Set<string>([
  "/sms-consent-disclosure",
  "/privacy",
  "/terms",
  "/products/quickquotepro",
  "/products/tradeline",
  "/pricing",
  "/about",
]);
const _criticalRouteAlertSent = new Set<string>();

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  const indexPath = path.resolve(distPath, "index.html");
  const readShell = () => fs.promises.readFile(indexPath, "utf-8");

  // Inject OG meta tags for shared audit report pages (also picks up gtag
  // via addGtagToHtml internally so audit shares are tracked too).
  app.use(ogTagMiddleware(readShell));

  // Inject gtag.js into every other public HTML response (admin/portal/api
  // are filtered inside the middleware).
  app.use(gtagMiddleware(readShell));

  /**
   * SEO Wave E — per-route prerendered HTML.
   *
   * The build emits `dist/public/<route>/index.html` for every
   * marketing route in the prerender list (see
   * `scripts/seo/prerender-routes.mjs`). When a GET request matches
   * one of those files, serve the prerendered HTML so Bing's primary
   * index and the LLM crawlers (which don't execute JS) see the real
   * per-route `<title>`, canonical, meta description, og:*, and
   * JSON-LD instead of the homepage shell. The bundled JS still
   * boots client-side hydration so React Router takes over for any
   * subsequent navigation.
   *
   * Falls through to the catch-all shell for any URL without a
   * matching prerendered file. The catch-all keeps the SPA working
   * for routes we don't prerender (admin/portal/dynamic IDs).
   *
   * Path-traversal: req.path is express-normalized, so `..` cannot
   * escape `distPath`. We still resolve + startsWith-check below.
   */
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET") return next();
    // Skip API + already-handled file extensions (express.static
    // above will have served those). We only want HTML routes here.
    if (req.path.startsWith("/api/")) return next();
    if (/\.[a-z0-9]+$/i.test(req.path)) return next();
    // Don't intercept SPA-only sensitive surfaces — they should
    // always render from the live shell, not a stale snapshot.
    if (
      req.path.startsWith("/admin") ||
      req.path.startsWith("/portal") ||
      req.path.startsWith("/audit/report/")
    ) {
      return next();
    }
    const accept = req.headers.accept || "";
    if (accept.includes("application/json") && !accept.includes("text/html")) {
      return next();
    }

    const rel = req.path === "/" ? "index.html" : path.posix.join(req.path.replace(/^\/+/, ""), "index.html");
    const candidate = path.resolve(distPath, rel);
    if (!candidate.startsWith(distPath)) return next();
    // Skip the root shell — that's handled by the catch-all below
    // (and gtag/og middleware) so existing behaviour is unchanged
    // for URLs we don't prerender.
    if (candidate === indexPath) {
      // The home route "/" IS prerendered into index.html at build
      // time, so it's fine to serve directly here. But we also want
      // gtag injection — fall through to the catch-all which reads
      // the (now-prerendered) shell and pipes it through addGtagToHtml.
      return next();
    }
    try {
      const html = await fs.promises.readFile(candidate, "utf-8");
      res.status(200).type("html").send(addGtagToHtml(html));
    } catch {
      // Wave 93 — if a CRITICAL route falls through, the prerender
      // silently skipped. Tag Sentry once per process so we don't
      // flood the project during a sustained outage. The request
      // itself still falls through to the SPA shell (200) — we
      // don't want to break the user-facing route, only flag the
      // SEO / compliance regression.
      if (CRITICAL_PRERENDERED_ROUTES.has(req.path) && !_criticalRouteAlertSent.has(req.path)) {
        _criticalRouteAlertSent.add(req.path);
        try {
          Sentry.withScope((scope) => {
            scope.setTag("source", "prerender-fallback");
            scope.setTag("failed_route", req.path);
            scope.setLevel("error");
            scope.setExtras({
              path: req.path,
              candidate,
              userAgent: req.headers["user-agent"] ?? null,
            });
            Sentry.captureMessage(
              `Critical prerendered route missing: ${req.path} (served SPA shell fallback)`,
            );
          });
        } catch {
          // Sentry capture is best-effort — never let it break the response.
        }
      }
      // No prerendered file for this route — fall through to shell.
      return next();
    }
  });

  // fall through to index.html if the file doesn't exist. Reads the file
  // once per request so a Doppler-driven GA4_MEASUREMENT_ID change is
  // picked up without a redeploy of the static bundle.
  app.use("/{*path}", async (_req: Request, res: Response) => {
    try {
      const shell = await readShell();
      res.status(200).type("html").send(addGtagToHtml(shell));
    } catch {
      res.sendFile(indexPath);
    }
  });
}
