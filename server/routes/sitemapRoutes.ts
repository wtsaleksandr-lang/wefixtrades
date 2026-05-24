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
 *
 * `lastmod` is a per-route real signal (ISO yyyy-mm-dd). Crawlers
 * (especially Google) explicitly devalue sitemaps whose lastmod
 * "updates today" on every fetch — see
 * https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping.
 * Bump the per-route value when the page's content materially changes;
 * leave it alone for nav/style-only edits. The dynamic product pages
 * share PRODUCT_LASTMOD until per-product copy history is tracked.
 */
interface StaticRoute {
  loc: string;
  lastmod: string;
  priority?: string;
  changefreq?: "daily" | "weekly" | "monthly" | "yearly";
}

// Fallback for any new route that ships before its lastmod is recorded.
// Keep this at the most recent marketing-content release.
const DEFAULT_LASTMOD = "2026-05-24";

const PRODUCT_LASTMOD = "2026-05-24";

const STATIC_ROUTES: StaticRoute[] = [
  { loc: "/", priority: "1.0", changefreq: "weekly", lastmod: "2026-05-24" },
  { loc: "/products", priority: "0.9", changefreq: "weekly", lastmod: "2026-05-24" },
  { loc: "/pricing", priority: "0.9", changefreq: "weekly", lastmod: "2026-05-24" },
  { loc: "/pricing/quotequick", priority: "0.8", changefreq: "weekly", lastmod: "2026-05-24" },
  { loc: "/services", priority: "0.8", changefreq: "weekly", lastmod: "2026-05-12" },
  { loc: "/templates", priority: "0.7", changefreq: "weekly", lastmod: "2026-05-12" },
  { loc: "/demo", priority: "0.7", changefreq: "weekly", lastmod: "2026-05-12" },
  { loc: "/demos", priority: "0.7", changefreq: "weekly", lastmod: "2026-05-12" },
  { loc: "/docs", priority: "0.7", changefreq: "monthly", lastmod: "2026-05-01" },
  { loc: "/docs/embed", priority: "0.6", changefreq: "monthly", lastmod: "2026-05-01" },
  { loc: "/docs/domain", priority: "0.6", changefreq: "monthly", lastmod: "2026-05-01" },
  { loc: "/docs/booking", priority: "0.6", changefreq: "monthly", lastmod: "2026-05-01" },
  { loc: "/docs/ai", priority: "0.6", changefreq: "monthly", lastmod: "2026-05-01" },
  { loc: "/docs/mapguard", priority: "0.6", changefreq: "monthly", lastmod: "2026-05-01" },
  { loc: "/docs/reputationshield", priority: "0.6", changefreq: "monthly", lastmod: "2026-05-01" },
  { loc: "/docs/webhooks", priority: "0.6", changefreq: "monthly", lastmod: "2026-05-01" },
  { loc: "/docs/troubleshooting", priority: "0.6", changefreq: "monthly", lastmod: "2026-05-01" },
  { loc: "/docs/api", priority: "0.6", changefreq: "monthly", lastmod: "2026-05-01" },
  { loc: "/features/instant-quotes", priority: "0.7", changefreq: "monthly", lastmod: "2026-05-01" },
  { loc: "/features/booking", priority: "0.7", changefreq: "monthly", lastmod: "2026-05-01" },
  { loc: "/features/ai-employee", priority: "0.7", changefreq: "monthly", lastmod: "2026-05-01" },
  { loc: "/features/sms", priority: "0.7", changefreq: "monthly", lastmod: "2026-05-01" },
  { loc: "/features/calculator-engine", priority: "0.7", changefreq: "monthly", lastmod: "2026-05-01" },
  { loc: "/solutions/visibility", priority: "0.7", changefreq: "monthly", lastmod: "2026-05-01" },
  { loc: "/tools/free-audit", priority: "0.9", changefreq: "weekly", lastmod: "2026-05-24" },
  { loc: "/products/quickquotepro/demo", priority: "0.8", changefreq: "weekly", lastmod: "2026-05-12" },
  { loc: "/products/quickquotepro/build-with-ai", priority: "0.8", changefreq: "weekly", lastmod: "2026-05-12" },
  { loc: "/about", priority: "0.6", changefreq: "monthly", lastmod: "2026-04-01" },
  { loc: "/blog", priority: "0.7", changefreq: "weekly", lastmod: "2026-05-12" },
  { loc: "/case-studies", priority: "0.7", changefreq: "monthly", lastmod: "2026-05-01" },
  { loc: "/resources", priority: "0.6", changefreq: "monthly", lastmod: "2026-05-01" },
  { loc: "/contact", priority: "0.6", changefreq: "monthly", lastmod: "2026-04-01" },
  { loc: "/privacy", priority: "0.3", changefreq: "yearly", lastmod: "2026-01-01" },
  { loc: "/terms", priority: "0.3", changefreq: "yearly", lastmod: "2026-01-01" },
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
  const lines: string[] = [];

  for (const r of STATIC_ROUTES) {
    lines.push(urlNode(r.loc, r.lastmod ?? DEFAULT_LASTMOD, r.changefreq ?? "weekly", r.priority ?? "0.6"));
  }

  // Dynamic: one URL per product slug (uses the EffortelProductPage template).
  for (const product of PRODUCT_PAGES) {
    lines.push(urlNode(`/products/${product.slug}`, PRODUCT_LASTMOD, "weekly", "0.8"));
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
