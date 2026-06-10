import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { auditReports, quoteSnapshots, calculators } from "@shared/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { createLogger } from "./logger";
import { addGtagToHtml } from "./gtagMiddleware";
import { isValidSnapshotSlug } from "@shared/quoteSnapshot";

const log = createLogger("OGMiddleware");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROUTE_RE = /^\/audit\/report\/([0-9a-f-]+)$/i;
const SNAPSHOT_ROUTE_RE = /^\/q\/([0-9a-z]+)$/i;

/** Default OG image — used for quote snapshot shares (no per-quote generated image). */
const DEFAULT_OG_IMAGE = "/brand/og-default.png";

/**
 * Express middleware that intercepts `/audit/report/:id` and `/q/:slug`
 * requests, injects Open Graph + Twitter Card meta tags into the HTML shell,
 * and falls through to normal SPA rendering for everything else.
 *
 * `/q/:slug` — shared quote snapshot links. Tags use the business name from
 * the linked calculator. DB lookup is fail-soft: any error or missing row
 * falls through to the SPA without a 500.
 *
 * Hosted calculator pages (`{slug}.your-quote.net`) are served on a
 * different host, so they cannot be matched by `req.path` here. OG tags
 * for that surface require a separate vhost middleware; skipped in this PR.
 *
 * Must be registered BEFORE the SPA catch-all handler.
 */
export function ogTagMiddleware(getHtml: () => Promise<string>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only handle GET requests that match the report route
    if (req.method !== "GET") return next();

    // ── /q/:slug — shared quote snapshot ──
    const snapshotMatch = SNAPSHOT_ROUTE_RE.exec(req.path);
    if (snapshotMatch) {
      return handleSnapshotOg(req, res, next, getHtml, snapshotMatch[1]);
    }

    const match = ROUTE_RE.exec(req.path);
    if (!match) return next();

    const id = match[1];
    if (!UUID_RE.test(id)) return next();

    // Skip if this is an API/JSON request
    const accept = req.headers.accept || "";
    if (accept.includes("application/json") && !accept.includes("text/html")) {
      return next();
    }

    try {
      const rows = await db
        .select({
          business_name: auditReports.business_name,
          audit_data: auditReports.audit_data,
          ai_narrative: auditReports.ai_narrative,
        })
        .from(auditReports)
        .where(eq(auditReports.id, id))
        .limit(1);

      if (rows.length === 0) return next(); // fall through to SPA

      const row = rows[0];
      const audit: any = row.audit_data || {};
      const narrative: any = row.ai_narrative || {};
      const businessName = row.business_name || "Business";
      const score = audit.scores?.total ?? audit.scores?.grade ?? "";
      const grade = audit.scores?.grade || narrative.grade || "";

      // Build description from AI narrative or fallback
      let description = narrative.executiveSummary || "";
      if (!description) {
        const trade = audit.trade || "local";
        const city = audit.city || "";
        description = `Free website audit report for ${businessName}${city ? ` in ${city}` : ""} — a ${trade} business.`;
      }
      // Truncate to 200 chars for OG description
      if (description.length > 200) {
        description = description.slice(0, 197) + "...";
      }

      const title = score
        ? `${businessName} scored ${score}/100 — Website Audit Report | WeFixTrades`
        : `Website Audit Report for ${businessName} | WeFixTrades`;

      const origin = `${req.protocol}://${req.get("host")}`;
      const url = `${origin}/audit/report/${id}`;
      const ogImageUrl = `${origin}/api/audit/report/${id}/og-image`;

      const metaTags = [
        `<meta property="og:type" content="website" />`,
        `<meta property="og:title" content="${esc(title)}" />`,
        `<meta property="og:description" content="${esc(description)}" />`,
        `<meta property="og:url" content="${esc(url)}" />`,
        `<meta property="og:image" content="${esc(ogImageUrl)}" />`,
        `<meta property="og:image:width" content="1200" />`,
        `<meta property="og:image:height" content="630" />`,
        `<meta property="og:site_name" content="WeFixTrades" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${esc(title)}" />`,
        `<meta name="twitter:description" content="${esc(description)}" />`,
        `<meta name="twitter:image" content="${esc(ogImageUrl)}" />`,
        `<meta name="description" content="${esc(description)}" />`,
        `<title>${esc(title)}</title>`,
      ].join("\n    ");

      let html = await getHtml();
      // Replace existing <title> if present, or inject before </head>
      html = html.replace(/<title>[^<]*<\/title>/, "");
      html = html.replace("</head>", `    ${metaTags}\n  </head>`);
      // Pick up gtag too so the audit-report share link is tracked.
      html = addGtagToHtml(html);

      return res.status(200).set({ "Content-Type": "text/html" }).send(html);
    } catch (err) {
      log.error("[og-middleware] Error:", { error: String(err) });
      return next(); // fall through to SPA on error
    }
  };
}

/**
 * Inject OG tags for a shared quote snapshot link `/q/:slug`.
 * Fail-soft: any DB error, missing slug, or expired snapshot falls through
 * to the SPA shell via `next()` — no 500, no blocking.
 */
async function handleSnapshotOg(
  req: Request,
  res: Response,
  next: NextFunction,
  getHtml: () => Promise<string>,
  slug: string,
): Promise<void> {
  // Skip obvious garbage before hitting the DB
  if (!isValidSnapshotSlug(slug)) return next();

  // Skip JSON API requests
  const accept = req.headers.accept || "";
  if (accept.includes("application/json") && !accept.includes("text/html")) {
    return next();
  }

  try {
    const [snapRow] = await db
      .select({
        calculator_id: quoteSnapshots.calculator_id,
        expires_at: quoteSnapshots.expires_at,
      })
      .from(quoteSnapshots)
      .where(eq(quoteSnapshots.snapshot_slug, slug))
      .limit(1);

    if (!snapRow) return next(); // unknown slug — fall through to SPA (→ 404 state)

    // Expired snapshot — fall through to SPA which shows the "expired" UI
    if (snapRow.expires_at && new Date(snapRow.expires_at).getTime() < Date.now()) {
      return next();
    }

    const [calc] = await db
      .select({
        business_name: calculators.business_name,
        trade_type: calculators.trade_type,
      })
      .from(calculators)
      .where(eq(calculators.id, snapRow.calculator_id))
      .limit(1);

    const businessName = calc?.business_name || "a local tradesperson";

    const origin = `${req.protocol}://${req.get("host")}`;
    const url = `${origin}/q/${slug}`;
    const ogImageUrl = `${origin}${DEFAULT_OG_IMAGE}`;

    const title = `Your quote from ${businessName} | WeFixTrades`;
    const description = `View your itemised estimate from ${businessName}. Saved quote link — tap to review the breakdown and totals.`;

    const metaTags = [
      `<meta property="og:type" content="website" />`,
      `<meta property="og:title" content="${esc(title)}" />`,
      `<meta property="og:description" content="${esc(description)}" />`,
      `<meta property="og:url" content="${esc(url)}" />`,
      `<meta property="og:image" content="${esc(ogImageUrl)}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta property="og:site_name" content="WeFixTrades" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(title)}" />`,
      `<meta name="twitter:description" content="${esc(description)}" />`,
      `<meta name="twitter:image" content="${esc(ogImageUrl)}" />`,
      `<meta name="description" content="${esc(description)}" />`,
      `<title>${esc(title)}</title>`,
    ].join("\n    ");

    let html = await getHtml();
    html = html.replace(/<title>[^<]*<\/title>/, "");
    html = html.replace("</head>", `    ${metaTags}\n  </head>`);
    html = addGtagToHtml(html);

    res.status(200).set({ "Content-Type": "text/html" }).send(html);
  } catch (err) {
    log.warn("[og-middleware] snapshot OG lookup failed, falling through", { slug, error: String(err) });
    return next();
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
