import type { Express } from "express";
import { z } from "zod";
import { db } from "../db";
import { salesLeads, clientServices, adminActivityLog } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { sendContactAck, sendContactInternalNotification } from "../lib/contactEmails";
import { createLogger } from "../lib/logger";

const log = createLogger("Marketing");

const BASE_URL = "https://wefixtrades.com";

// Tools-consolidation (2026-05-23): the /tools/* surface collapsed to a
// single Free Audit (the audit hosts the GBP rank-grid in a Rank Grid tab).
// Quote Demo + Build-with-AI relocated under the QuoteQuick product family.
// Missed Call Calculator deleted entirely. Per-trade landing pages removed
// from the sitemap with the calculator/snapshot pages.
const MARKETING_ROUTES = [
  "/", "/products", "/pricing", "/services", "/bundles",
  "/templates", "/demo", "/docs", "/contact", "/privacy", "/terms",
  "/features/instant-quotes", "/features/booking", "/features/ai-employee",
  "/features/sms", "/features/calculator-engine",
  "/docs/embed", "/docs/domain", "/docs/booking", "/docs/ai",
  "/docs/webhooks", "/docs/troubleshooting",
  "/products/quickquotepro", "/products/tradeline",
  "/products/mapguard", "/products/rankflow",
  "/products/webcare", "/products/sitelaunch", "/products/socialsync",
  "/products/reputationshield",
  "/tools/free-audit",
  // BI-1 — anonymous AI demo upload page (priority 0.8 — same as other tool pages).
  "/products/quickquotepro/demo",
  "/products/quickquotepro/build-with-ai",
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
    // BI-1 — Build-with-AI is pinned to 0.8 (per spec). Free Audit keeps
    // the 0.9 prominence as the surviving /tools/ surface.
    const urls = MARKETING_ROUTES.map(
      (r) =>
        `  <url><loc>${BASE_URL}${r}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>${
          r === "/"
            ? "1.0"
            : r === "/products/quickquotepro/build-with-ai"
              ? "0.8"
              : r === "/tools/free-audit"
                ? "0.9"
                : "0.8"
        }</priority></url>`
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
      log.error("[Contact] Failed to save lead:", err.message);
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

  /**
   * GET /api/exit-survey/:token?reason=<id>
   *
   * Fired when a cancelled customer clicks one of the reason links in
   * their cancellation-confirmation email. Logs the reason against the
   * client_service and shows a friendly thank-you page.
   *
   * Intentionally idempotent and forgiving — if the token doesn't match,
   * the customer still gets a thank-you page; we just don't record.
   */
  app.get("/api/exit-survey/:token", async (req, res) => {
    const token = req.params.token as string;
    const reason = (req.query.reason as string || "").slice(0, 40);

    // Try to find the client_service with this exit_survey_token
    try {
      if (reason && token) {
        // Use JSONB containment to find the matching service
        const rows = await db.execute(sql`
          SELECT id, metadata FROM client_services
          WHERE metadata->>'exit_survey_token' = ${token}
          LIMIT 1
        `);
        const first = (rows as any).rows?.[0] || (rows as any)[0];
        if (first) {
          const meta = (first.metadata as any) || {};
          await db.update(clientServices)
            .set({
              metadata: { ...meta, exit_reason: reason, exit_reason_at: new Date().toISOString() },
              updated_at: new Date(),
            } as any)
            .where(eq(clientServices.id, first.id));

          // Log for admin visibility
          await db.insert(adminActivityLog).values({
            actor_type: "system",
            actor_name: "Exit Survey",
            action: "cancellation.exit_reason_captured",
            entity_type: "client_service",
            entity_id: first.id,
            summary: `Exit reason: ${reason}`,
          } as any).catch(() => {});
        }
      }
    } catch (err: any) {
      log.warn("[exit-survey] Failed to record reason:", err.message);
    }

    // Friendly thank-you page (no data exposure, no PII, no auth leak)
    res.type("html").send(`
      <!doctype html>
      <html><head><meta charset="utf-8"><title>Thanks — WeFixTrades</title>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>
        body{font-family:system-ui,-apple-system,sans-serif;background:#0B0F14;color:#F0F0F0;margin:0;padding:60px 20px;display:flex;align-items:center;justify-content:center;min-height:100vh;}
        .card{max-width:460px;background:#151A21;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:40px 32px;text-align:center;}
        h1{font-size:22px;font-weight:700;margin:0 0 12px;}
        p{font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 16px;}
        a{color:#0d3cfc;text-decoration:none;}
        .tag{display:inline-block;background:rgba(13,60,252,0.12);color:#0d3cfc;font-size:11px;font-weight:700;padding:4px 12px;border-radius:999px;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:20px;}
      </style></head><body>
      <div class="card">
        <span class="tag">WeFixTrades</span>
        <h1>Thanks for the feedback</h1>
        <p>That one click tells us a lot — and we actually read every one.</p>
        <p>If you change your mind, your data is kept for 90 days and your services can be reactivated in a few clicks. <a href="https://wefixtrades.com">Visit the site</a>.</p>
      </div></body></html>
    `);
  });
}
