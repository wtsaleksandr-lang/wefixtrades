import type { Express } from "express";
import { z } from "zod";
import { db } from "../db";
import { salesLeads } from "@shared/schema";
import { sendContactAck, sendContactInternalNotification } from "../lib/contactEmails";

const BASE_URL = "https://wefixtrades.com";

const TRADE_SLUGS = [
  "plumbing", "hvac", "electrical", "roofing", "landscaping",
  "house_cleaning", "pest_control", "painting", "flooring",
  "window_cleaning", "junk_removal", "garage_door", "appliance_repair",
  "locksmith", "handyman", "tree_service", "pressure_washing",
  "pool_service", "concrete", "fencing", "siding", "gutter_services",
  "remodeling", "carpet_cleaning",
];

const MARKETING_ROUTES = [
  "/", "/products", "/pricing", "/services", "/bundles",
  "/templates", "/demo", "/docs", "/contact", "/privacy", "/terms",
  "/features/instant-quotes", "/features/booking", "/features/ai-employee",
  "/features/sms", "/features/calculator-engine",
  "/docs/embed", "/docs/domain", "/docs/booking", "/docs/ai",
  "/docs/webhooks", "/docs/troubleshooting",
  "/products/quickquotepro", "/products/tradeline",
  "/products/mapguard", "/products/rankflow", "/products/adflow",
  "/products/webcare", "/products/sitelaunch", "/products/socialsync",
  "/products/reputationshield",
  "/free-audit",
  "/tools", "/tools/free-audit", "/tools/missed-call-calculator", "/tools/quote-demo",
  ...TRADE_SLUGS.map((s) => `/tools/missed-call-calculator/${s}`),
];

export function registerMarketingRoutes(app: Express): void {
  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(
      [
        "User-agent: *",
        "Allow: /",
        "Disallow: /api/",
        "Disallow: /Dashboard",
        "Disallow: /dashboard",
        "Disallow: /EditCalculator",
        "Disallow: /edit-calculator",
        "Disallow: /Wizard",
        "Disallow: /wizard",
        "Disallow: /Leads",
        "Disallow: /leads",
        "Disallow: /Calculator",
        "Disallow: /calculator",
        `Sitemap: ${BASE_URL}/sitemap.xml`,
        "",
      ].join("\n"),
    );
  });

  app.get("/sitemap.xml", (_req, res) => {
    const now = new Date().toISOString().split("T")[0];
    const urls = MARKETING_ROUTES.map(
      (r) =>
        `  <url><loc>${BASE_URL}${r}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>${r === "/" ? "1.0" : r.startsWith("/tools") ? "0.9" : "0.8"}</priority></url>`
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

    // Persist to sales_leads so the message is never lost even if SMTP is down
    let leadId = 0;
    try {
      const [row] = await db.insert(salesLeads).values({
        business_name: name, // we don't collect business separately here — name is best-effort
        contact_name: name,
        email,
        source: "inbound",
        status: "new",
        notes: `Subject: ${subject || "General"}\n\n${message}`,
      }).returning({ id: salesLeads.id });
      leadId = row?.id ?? 0;
    } catch (err: any) {
      console.error("[Contact] Failed to save lead:", err.message);
      // Don't fail the request — still try to send notifications
    }

    // Fire both emails in parallel, non-blocking to the HTTP response
    Promise.allSettled([
      sendContactAck({ name, email, subject, message }),
      leadId ? sendContactInternalNotification({ name, email, subject, message }, leadId) : Promise.resolve(false),
    ]).catch(() => {});

    return res.json({ success: true, lead_id: leadId || undefined });
  });

  app.post("/api/analytics/pageview", async (req, res) => {
    return res.json({ ok: true });
  });
}
