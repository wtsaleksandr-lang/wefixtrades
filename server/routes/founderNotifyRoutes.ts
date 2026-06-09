/**
 * Founder-notification routes (Phase 3e-ii-a).
 *
 *   - /api/user/ai-contact   — the admin's AI escalation preference
 *                              (dashboard / sms / whatsapp + a phone).
 *   - /api/admin/notices     — the AI agenda: list + mark read/actioned.
 *
 * Admin-only. The preference is per-user and DB-backed (the dispatcher reads
 * it from a background context, so it cannot live in the session).
 */

import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { db } from "../db";
import { eq, desc, sql } from "drizzle-orm";
import { users, adminNotices } from "@shared/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("FounderNotifyRoutes");

const VALID_METHODS = ["dashboard", "sms", "whatsapp"];
const VALID_STATUSES = ["unread", "read", "actioned"];

export function registerFounderNotifyRoutes(app: Express): void {
  /** GET /api/user/ai-contact — the current admin's AI escalation preference. */
  app.get("/api/user/ai-contact", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id as number;
      const [row] = await db
        .select({ method: users.ai_contact_method, phone: users.ai_contact_phone })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      res.json({
        ai_contact_method: row?.method ?? "dashboard",
        ai_contact_phone: row?.phone ?? "",
      });
    } catch (err: any) {
      log.error("[ai-contact] GET error:", err?.message);
      res.status(500).json({ error: "Failed to load AI contact preference" });
    }
  });

  /** PATCH /api/user/ai-contact — update method + phone. */
  app.patch("/api/user/ai-contact", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id as number;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const method = typeof body.ai_contact_method === "string" ? body.ai_contact_method : "";
      const phone = typeof body.ai_contact_phone === "string" ? body.ai_contact_phone.trim() : "";

      if (!VALID_METHODS.includes(method)) {
        return res.status(400).json({ error: "Invalid contact method" });
      }
      if ((method === "sms" || method === "whatsapp") && !phone) {
        return res.status(400).json({ error: "A phone number is required for SMS or WhatsApp." });
      }
      if (phone.length > 30) {
        return res.status(400).json({ error: "Phone number is too long." });
      }

      await db
        .update(users)
        .set({ ai_contact_method: method, ai_contact_phone: phone || null })
        .where(eq(users.id, userId));
      res.json({ ai_contact_method: method, ai_contact_phone: phone });
    } catch (err: any) {
      log.error("[ai-contact] PATCH error:", err?.message);
      res.status(500).json({ error: "Failed to save AI contact preference" });
    }
  });

  /** GET /api/admin/notices — the AI agenda, newest first (+ unread count). */
  app.get("/api/admin/notices", requireAdmin, async (req: Request, res: Response) => {
    try {
      const onlyUnread = req.query.status === "unread";
      const rows = await db
        .select()
        .from(adminNotices)
        .where(onlyUnread ? eq(adminNotices.status, "unread") : undefined)
        .orderBy(desc(adminNotices.created_at))
        .limit(100);
      const [unread] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(adminNotices)
        .where(eq(adminNotices.status, "unread"));
      res.json({ notices: rows, unread_count: unread?.n ?? 0, degraded: false });
    } catch (err: any) {
      // Degrade gracefully instead of hard-500ing the whole AI Agenda page.
      // The most likely prod cause is a schema drift — the `admin_notices`
      // table or one of its columns isn't present yet (this repo syncs schema
      // via `drizzle-kit push`, not SQL migrations, so a newly-added table /
      // column only exists after a prod push). A missing-relation / missing-
      // column error must not take the page down: return an empty, clearly-
      // degraded payload (HTTP 200) so the UI shows an empty state with a
      // banner rather than a blank 500. Any unexpected error still degrades
      // rather than 500s — the agenda is read-only and non-critical.
      const msg: string = String(err?.message ?? "");
      const isSchemaDrift = /relation .* does not exist|column .* does not exist|undefined (table|column)/i.test(msg);
      log.error("[notices] GET error:", err?.message);
      res.json({
        notices: [],
        unread_count: 0,
        degraded: true,
        degraded_reason: isSchemaDrift
          ? "notices table/column missing on this environment (pending schema push)"
          : "notices temporarily unavailable",
      });
    }
  });

  /** PATCH /api/admin/notices/:id — mark a notice unread / read / actioned. */
  app.patch("/api/admin/notices/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const status = (req.body ?? {}).status;
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      const [row] = await db
        .update(adminNotices)
        .set({ status, read_at: status === "unread" ? null : new Date() })
        .where(eq(adminNotices.id, id))
        .returning();
      if (!row) return res.status(404).json({ error: "Notice not found" });
      res.json(row);
    } catch (err: any) {
      log.error("[notices] PATCH error:", err?.message);
      res.status(500).json({ error: "Failed to update notice" });
    }
  });
}
