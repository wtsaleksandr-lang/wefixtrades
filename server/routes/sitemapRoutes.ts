/**
 * SEO Wave A — Dynamic sitemap.xml.
 *
 * Replaces the static MARKETING_ROUTES list in `marketingRoutes.ts`
 * (that route is now removed in favour of this file). The sitemap is
 * assembled on each request — content is small (well under 100 URLs)
 * and the assembly is pure, so we can also serve a 1-hour `Cache-Control`
 * header to keep load trivial.
 *
 * Source of truth for product slugs: the canonical pricing config in
 * `shared/pricing` is imported here via `client/src/config/products`.
 * The config is a TS module (not a DB table) — the spec mentions a
 * `service_catalog` table but the WFX catalog actually lives in
 * code. Importing the typed config means the sitemap auto-picks up
 * any new product as soon as the slug is added.
 *
 * Routes intentionally EXCLUDED: /admin/*, /portal/*, /api/*, /r/:slug,
 * /pay/:token, /book/:slug, /q/:slug, /onboarding/:token, /review/*,
 * /audit/report/:id, /demo/:templateId, /compare/:slug catch-all,
 * /demos/:slug catch-all, /solutions/:slug catch-all (per-customer),
 * and the various dashboard/calculator/wizard internal paths.
 */
import type { Express } from "express";
import { PRODUCT_PAGES } from "../../client/src/config/products";

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || "https://wefixtrades.com";

/**
 * Curated list of public marketing routes. Each entry has a `loc`
 * (path) and optional `priority` / `changefreq` overrides. Default
 * priority is 0.6, changefreq weekly.
 */
interface StaticRoute {
  loc: string;
  priority?: string;
  changefreq?: "daily" | "weekly" | "monthly" | "yearly";
}

const STATIC_ROUTES: StaticRoute[] = [
  { loc: "/", priority: "1.0", changefreq: "weekly" },
  { loc: "/products", priority: "0.9", changefreq: "weekly" },
  { loc: "/pricing", priority: "0.9", changefreq: "weekly" },
  { loc: "/pricing/quotequick", priority: "0.8", changefreq: "weekly" },
  { loc: "/services", priority: "0.8", changefreq: "weekly" },
  { loc: "/templates", priority: "0.7", changefreq: "weekly" },
  { loc: "/demo", priority: "0.7", changefreq: "weekly" },
  { loc: "/demos", priority: "0.7", changefreq: "weekly" },
  { loc: "/docs", priority: "0.7", changefreq: "monthly" },
  { loc: "/docs/embed", priority: "0.6", changefreq: "monthly" },
  { loc: "/docs/domain", priority: "0.6", changefreq: "monthly" },
  { loc: "/docs/booking", priority: "0.6", changefreq: "monthly" },
  { loc: "/docs/ai", priority: "0.6", changefreq: "monthly" },
  { loc: "/docs/mapguard", priority: "0.6", changefreq: "monthly" },
  { loc: "/docs/reputationshield", priority: "0.6", changefreq: "monthly" },
  { loc: "/docs/webhooks", priority: "0.6", changefreq: "monthly" },
  { loc: "/docs/troubleshooting", priority: "0.6", changefreq: "monthly" },
  { loc: "/docs/api", priority: "0.6", changefreq: "monthly" },
  { loc: "/features/instant-quotes", priority: "0.7", changefreq: "monthly" },
  { loc: "/features/booking", priority: "0.7", changefreq: "monthly" },
  { loc: "/features/ai-employee", priority: "0.7", changefreq: "monthly" },
  { loc: "/features/sms", priority: "0.7", changefreq: "monthly" },
  { loc: "/features/calculator-engine", priority: "0.7", changefreq: "monthly" },
  { loc: "/solutions/visibility", priority: "0.7", changefreq: "monthly" },
  { loc: "/tools/free-audit", priority: "0.9", changefreq: "weekly" },
  { loc: "/products/quickquotepro/demo", priority: "0.8", changefreq: "weekly" },
  { loc: "/products/quickquotepro/build-with-ai", priority: "0.8", changefreq: "weekly" },
  { loc: "/about", priority: "0.6", changefreq: "monthly" },
  { loc: "/blog", priority: "0.7", changefreq: "weekly" },
  { loc: "/case-studies", priority: "0.7", changefreq: "monthly" },
  { loc: "/resources", priority: "0.6", changefreq: "monthly" },
  { loc: "/contact", priority: "0.6", changefreq: "monthly" },
  { loc: "/privacy", priority: "0.3", changefreq: "yearly" },
  { loc: "/terms", priority: "0.3", changefreq: "yearly" },
];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlNode(loc: string, lastmod: string, changefreq: string, priority: string): string {
  return `  <url>
    <loc>${escapeXml(`${PUBLIC_BASE_URL}${loc}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function buildSitemapXml(): string {
  const today = new Date().toISOString().split("T")[0];
  const lines: string[] = [];

  for (const r of STATIC_ROUTES) {
    lines.push(urlNode(r.loc, today, r.changefreq ?? "weekly", r.priority ?? "0.6"));
  }

  // Dynamic: one URL per product slug (uses the EffortelProductPage template).
  for (const product of PRODUCT_PAGES) {
    lines.push(urlNode(`/products/${product.slug}`, today, "weekly", "0.8"));
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${lines.join("\n")}
</urlset>
`;
}

let cachedXml: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export function registerSitemapRoutes(app: Express): void {
  app.get("/sitemap.xml", (_req, res) => {
    const now = Date.now();
    if (!cachedXml || now - cachedAt > CACHE_TTL_MS) {
      cachedXml = buildSitemapXml();
      cachedAt = now;
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("application/xml").send(cachedXml);
  });
}
