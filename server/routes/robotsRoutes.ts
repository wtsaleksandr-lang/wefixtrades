/**
 * SEO Wave A — robots.txt.
 *
 * Replaces the inline /robots.txt handler that previously lived in
 * `marketingRoutes.ts`. The directives match the sitemap exclude list
 * in `sitemapRoutes.ts`. The Sitemap line uses PUBLIC_BASE_URL when
 * present, falling back to the production canonical domain.
 */
import type { Express } from "express";

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || "https://wefixtrades.com";

const ROBOTS_BODY = [
  "User-agent: *",
  "Allow: /",
  "Disallow: /admin/",
  "Disallow: /portal/",
  "Disallow: /api/",
  "Disallow: /r/",
  "Disallow: /pay/",
  "Disallow: /book/",
  "Disallow: /q/",
  "Disallow: /onboarding/",
  "Disallow: /review/",
  "Disallow: /audit/report/",
  "Disallow: /dashboard",
  "Disallow: /Dashboard",
  "Disallow: /leads",
  "Disallow: /Leads",
  "Disallow: /calculator",
  "Disallow: /Calculator",
  "Disallow: /edit-calculator",
  "Disallow: /EditCalculator",
  "Disallow: /wizard",
  "Disallow: /Wizard",
  "Disallow: /internal/",
  "",
  `Sitemap: ${PUBLIC_BASE_URL}/sitemap.xml`,
  "",
].join("\n");

export function registerRobotsRoutes(app: Express): void {
  app.get("/robots.txt", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.type("text/plain").send(ROBOTS_BODY);
  });
}
