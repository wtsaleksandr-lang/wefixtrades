import type { Express, Request } from "express";
import { verifyUnsubscribeToken } from "../lib/unsubscribeToken";
import { recordUnsubscribe } from "../lib/unsubscribeStorage";
import { createLogger } from "../lib/logger";

const log = createLogger("Unsubscribe");

const PAGE_BG = "#0B0F14";
const CARD_BG = "#151A21";
const TEXT = "#F0F0F0";
const TEXT_MUTED = "#CDD1D6";
const ACCENT = "#66E8FA";

function getClientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string") return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "";
}

function renderPage(opts: { title: string; heading: string; body: string; success: boolean }): string {
  const accent = opts.success ? ACCENT : "#F59E0B";
  return `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${opts.title} — WeFixTrades</title>
  <style>
    body{margin:0;padding:60px 20px;background:${PAGE_BG};color:${TEXT};font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;}
    .card{max-width:460px;background:${CARD_BG};border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:40px 32px;text-align:center;}
    .badge{display:inline-block;background:rgba(102,232,250,0.12);color:${ACCENT};font-size:11px;font-weight:800;padding:5px 14px;border-radius:999px;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:18px;}
    h1{font-size:22px;font-weight:700;margin:0 0 12px;color:${TEXT};}
    p{font-size:14px;color:${TEXT_MUTED};line-height:1.6;margin:0 0 12px;}
    a{color:${accent};text-decoration:none;}
    .accent{color:${accent};}
  </style>
</head><body>
  <div class="card">
    <span class="badge">WeFixTrades</span>
    <h1>${opts.heading}</h1>
    ${opts.body}
  </div>
</body></html>`;
}

export function registerUnsubscribeRoutes(app: Express): void {
  /**
   * GET /api/unsubscribe/:token
   *
   * One-click unsubscribe. Verifies the HMAC-signed token, records the
   * opt-out, and shows a friendly confirmation page. Idempotent — clicking
   * the link twice is a no-op the second time.
   */
  app.get("/api/unsubscribe/:token", async (req, res) => {
    const token = req.params.token as string;
    const verified = verifyUnsubscribeToken(token);

    if (!verified) {
      return res.status(400).type("html").send(renderPage({
        title: "Invalid link",
        heading: "This unsubscribe link isn't valid",
        body: `<p>The link may have been copied incorrectly or expired. If you'd like to unsubscribe, just reply to any of our emails with the word <strong class="accent">UNSUBSCRIBE</strong> and we'll handle it manually.</p>`,
        success: false,
      }));
    }

    try {
      await recordUnsubscribe({
        email: verified.email,
        source: (req.query.source as string) || "footer_link",
        ipAddress: getClientIp(req),
        userAgent: (req.headers["user-agent"] as string || "").slice(0, 500),
      });
    } catch (err: any) {
      log.error("[unsubscribe] record failed:", err?.message);
      return res.status(500).type("html").send(renderPage({
        title: "Something went wrong",
        heading: "We couldn't process the request",
        body: `<p>Please reply to any of our emails with the word <strong class="accent">UNSUBSCRIBE</strong> and we'll handle it manually within 24 hours.</p>`,
        success: false,
      }));
    }

    return res.type("html").send(renderPage({
      title: "Unsubscribed",
      heading: "You're unsubscribed",
      body: `
        <p>We've removed <strong class="accent">${verified.email}</strong> from our marketing email list.</p>
        <p>You'll still receive transactional emails (receipts, password resets, account notifications) — those are required by law.</p>
        <p style="margin-top:18px;font-size:13px;">Changed your mind? Just reply to any past email and we'll add you back.</p>
      `,
      success: true,
    }));
  });

  /**
   * POST /api/unsubscribe/:token
   *
   * One-click unsubscribe (RFC 8058). Major email providers (Gmail, Yahoo,
   * Apple) hit this when the user clicks the native "Unsubscribe" UI rendered
   * from the List-Unsubscribe header. Same logic as GET, but returns plain
   * 200 OK instead of an HTML page.
   */
  app.post("/api/unsubscribe/:token", async (req, res) => {
    const token = req.params.token as string;
    const verified = verifyUnsubscribeToken(token);
    if (!verified) return res.status(400).json({ error: "Invalid token" });

    try {
      await recordUnsubscribe({
        email: verified.email,
        source: "list_unsubscribe_header",
        ipAddress: getClientIp(req),
        userAgent: (req.headers["user-agent"] as string || "").slice(0, 500),
      });
      return res.status(200).json({ unsubscribed: true });
    } catch (err: any) {
      log.error("[unsubscribe] POST record failed:", err?.message);
      return res.status(500).json({ error: "Internal error" });
    }
  });
}
