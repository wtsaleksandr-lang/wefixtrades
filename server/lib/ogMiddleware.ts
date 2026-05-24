import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { auditReports } from "@shared/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { createLogger } from "./logger";
import { addGtagToHtml } from "./gtagMiddleware";

const log = createLogger("OGMiddleware");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROUTE_RE = /^\/audit\/report\/([0-9a-f-]+)$/i;

/**
 * Express middleware that intercepts `/audit/report/:id` requests,
 * injects Open Graph + Twitter Card meta tags into the HTML shell,
 * and falls through to normal SPA rendering for everything else.
 *
 * Must be registered BEFORE the SPA catch-all handler.
 */
export function ogTagMiddleware(getHtml: () => Promise<string>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only handle GET requests that match the report route
    if (req.method !== "GET") return next();
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

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
