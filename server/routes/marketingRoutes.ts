import type { Express } from "express";
import { z } from "zod";

const BASE_URL = "https://quickquotepro.com";
const MARKETING_ROUTES = [
  "/", "/product", "/pricing", "/services", "/bundles",
  "/templates", "/demo", "/docs", "/contact", "/privacy", "/terms",
  "/features/instant-quotes", "/features/booking", "/features/ai-employee",
  "/features/sms", "/features/calculator-engine",
  "/docs/embed", "/docs/domain", "/docs/booking", "/docs/ai",
  "/docs/webhooks", "/docs/troubleshooting",
  "/product/quickquotepro", "/product/booking-addon", "/product/ai-chat",
  "/product/ai-voice", "/product/mapguard", "/product/webboost",
  "/product/webcare", "/product/sitelaunch", "/product/socialsync",
  "/product/reputationshield",
  "/free-audit",
];

export function registerMarketingRoutes(app: Express): void {
  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(
      `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /Dashboard\nDisallow: /EditCalculator\nSitemap: ${BASE_URL}/sitemap.xml\n`
    );
  });

  app.get("/sitemap.xml", (_req, res) => {
    const now = new Date().toISOString().split("T")[0];
    const urls = MARKETING_ROUTES.map(
      (r) =>
        `  <url><loc>${BASE_URL}${r}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>${r === "/" ? "1.0" : "0.8"}</priority></url>`
    ).join("\n");
    res.type("application/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
    );
  });

  const contactSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    subject: z.string().optional(),
    message: z.string().min(1),
  });

  app.post("/api/contact", async (req, res) => {
    const parsed = contactSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
    const { name, email, subject, message } = parsed.data;
    console.log(`[Contact] From: ${name} <${email}> | Subject: ${subject} | ${message.substring(0, 100)}`);
    return res.json({ success: true });
  });

  app.post("/api/analytics/pageview", async (req, res) => {
    return res.json({ ok: true });
  });
}
