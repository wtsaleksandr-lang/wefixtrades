/**
 * Email tracking routes — open pixel + click redirect + admin stats.
 *
 *   GET /api/email/open/:id           public  → returns 1x1 GIF, logs open
 *   GET /api/email/click/:id?redirect=...  public  → logs click, 302 redirects
 *   GET /api/admin/email-events?email_id=...  admin → counts + recent events
 *
 * The two public routes intentionally never block on DB failure:
 *   - Open pixel must always return 200 with the GIF (else email
 *     clients show a broken-image icon which alarms the recipient)
 *   - Click redirect must always 302 to the target URL (else the
 *     recipient sees a broken-link page from us, looks worse than a
 *     normal blocked-tracker scenario)
 *
 * Both routes do best-effort DB writes via fire-and-forget — never
 * awaited — so an unreachable DB or table-doesn't-exist error doesn't
 * affect the response.
 *
 * Admin endpoint requires `requireAdmin` (existing session-based auth).
 */

import type { Express, Request, Response } from "express";
import { db } from "../db";
import { emailEvents } from "@shared/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "../auth";

// 1x1 transparent GIF — base64 decoded to a buffer once, served as a
// pre-built Buffer for every pixel hit (no per-request decoding cost).
const TRANSPARENT_GIF_BASE64 = "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";
const TRANSPARENT_GIF = Buffer.from(TRANSPARENT_GIF_BASE64, "base64");

/* ─── Format / safety ─── */

const EMAIL_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

function isValidEmailId(id: unknown): id is string {
  return typeof id === "string" && EMAIL_ID_PATTERN.test(id);
}

/** Best-effort log of a tracking event. Never throws. */
function logEvent(emailId: string, type: "open" | "click", metadata: Record<string, any> | null): void {
  // Fire-and-forget — do not await
  db.insert(emailEvents)
    .values({
      email_id: emailId,
      type,
      metadata: metadata ?? null,
    })
    .catch((err: any) => {
      console.warn(`[email-tracking] failed to log ${type} for ${emailId}: ${err?.message}`);
    });
}

export function registerEmailTrackingRoutes(app: Express): void {
  /* ─── Open pixel ─── */
  app.get("/api/email/open/:id", (req: Request, res: Response) => {
    const emailId = req.params.id;
    if (isValidEmailId(emailId)) {
      const ua = String(req.headers["user-agent"] || "").slice(0, 500) || null;
      logEvent(emailId, "open", ua ? { user_agent: ua } : null);
    }

    // Always return the pixel — even if id is malformed — so no broken-image icon ever shows.
    res.set({
      "Content-Type": "image/gif",
      "Content-Length": String(TRANSPARENT_GIF.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
    });
    res.status(200).end(TRANSPARENT_GIF);
  });

  /* ─── Click redirect ─── */
  app.get("/api/email/click/:id", (req: Request, res: Response) => {
    const emailId = req.params.id;
    const target = typeof req.query.redirect === "string" ? req.query.redirect : "";

    // Decode + validate the target URL — must be http(s), absolute.
    let safeTarget: string | null = null;
    try {
      const decoded = decodeURIComponent(target);
      const parsed = new URL(decoded);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        safeTarget = parsed.toString();
      }
    } catch {
      safeTarget = null;
    }

    if (isValidEmailId(emailId) && safeTarget) {
      const ua = String(req.headers["user-agent"] || "").slice(0, 500) || null;
      logEvent(emailId, "click", {
        target_url: safeTarget,
        ...(ua ? { user_agent: ua } : {}),
      });
    }

    // If we can't reconstruct a valid target, send the user to the home page
    // rather than a broken response. Better UX than a generic error.
    const fallback = (process.env.APP_URL
      || process.env.APP_PUBLIC_URL
      || "https://wefixtrades.com").replace(/\/$/, "");
    res.redirect(302, safeTarget || fallback);
  });

  /* ─── Admin stats ─── */
  app.get("/api/admin/email-events", requireAdmin, async (req: Request, res: Response) => {
    const emailId = String(req.query.email_id || "").trim();
    if (!isValidEmailId(emailId)) {
      return res.status(400).json({ error: "email_id query param is required (8-128 base64url chars)" });
    }

    try {
      const counts = await db.select({
        type: emailEvents.type,
        count: sql<number>`count(*)::int`,
      })
        .from(emailEvents)
        .where(eq(emailEvents.email_id, emailId))
        .groupBy(emailEvents.type);

      const opens = counts.find((c) => c.type === "open")?.count ?? 0;
      const clicks = counts.find((c) => c.type === "click")?.count ?? 0;

      const recent = await db.select()
        .from(emailEvents)
        .where(eq(emailEvents.email_id, emailId))
        .orderBy(desc(emailEvents.id))
        .limit(20);

      res.json({
        email_id: emailId,
        opens,
        clicks,
        total: opens + clicks,
        recent: recent.map((r) => ({
          id: r.id,
          type: r.type,
          created_at: r.created_at,
          metadata: r.metadata,
        })),
      });
    } catch (err: any) {
      console.error("[email-events] query failed:", err?.message);
      res.status(500).json({ error: "Failed to load email events" });
    }
  });
}
