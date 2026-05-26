/**
 * Portal SocialSync Calendar — Wave 25.
 *
 * GET /api/portal/socialsync/calendar?weeks=4
 *   Returns scheduled + recently-published posts shaped as CalendarEntry
 *   for the Wave 22B VisualCalendar primitive. Default window: the current
 *   week + 3 weeks ahead + 1 week behind (for context). Caller can pass
 *   ?weeks=N to widen up to 12.
 *
 * PATCH /api/portal/socialsync/calendar/:id/reschedule
 *   Body: { scheduled_for: ISO-8601 string }
 *   Updates the scheduled_for timestamp of a single post. Only posts in
 *   status pending_approval | queued | ready can be rescheduled (already-
 *   published posts can't be moved). Returns the updated post id +
 *   scheduled_for.
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { socialsyncPosts } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalSocialsyncCalendar");

const PLATFORM_COLORS: Record<string, string> = {
  facebook: "rgb(24, 119, 242)",
  instagram: "rgb(225, 48, 108)",
  linkedin: "rgb(10, 102, 194)",
  whatsapp: "rgb(37, 211, 102)",
  whatsapp_business: "rgb(37, 211, 102)",
  google_business: "rgb(66, 133, 244)",
};

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  whatsapp_business: "WhatsApp",
  google_business: "Google Business",
};

function statusToPill(s: string): string {
  // Maps socialsync post.status to StatusPillStatus the VisualCalendar consumes.
  // Valid pill states: draft | scheduled | in_progress | approved | published | failed
  switch (s) {
    case "draft":
      return "draft";
    case "pending_approval":
      return "in_progress";
    case "queued":
    case "ready":
      return "scheduled";
    case "publishing":
      return "in_progress";
    case "published":
      return "published";
    case "failed":
      return "failed";
    case "cancelled":
    case "rejected":
      return "draft";
    default:
      return "draft";
  }
}

const EMPTY_RESPONSE = {
  previewMode: true,
  entries: [] as unknown[],
};

export function registerPortalSocialsyncCalendarRoutes(app: Express) {
  app.get(
    "/api/portal/socialsync/calendar",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;

        const weeksParam = Number(req.query.weeks);
        const weeks =
          !Number.isFinite(weeksParam) || weeksParam <= 0
            ? 4
            : Math.min(12, Math.floor(weeksParam));

        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now);
        end.setDate(now.getDate() + 7 * weeks);
        end.setHours(23, 59, 59, 999);

        const rows = await db
          .select({
            id: socialsyncPosts.id,
            platform: socialsyncPosts.platform,
            caption: socialsyncPosts.caption,
            post_text: socialsyncPosts.post_text,
            media_plan: socialsyncPosts.media_plan,
            status: socialsyncPosts.status,
            scheduled_for: socialsyncPosts.scheduled_for,
            published_at: socialsyncPosts.published_at,
          })
          .from(socialsyncPosts)
          .where(
            and(
              eq(socialsyncPosts.client_id, clientId),
              sql`status NOT IN ('cancelled', 'rejected')`,
              sql`(scheduled_for >= ${start} OR published_at >= ${start})`,
              sql`(scheduled_for IS NULL OR scheduled_for <= ${end})`,
            ),
          )
          .limit(500);

        const entries = rows.map((r) => {
          const platformKey = (r.platform || "").toLowerCase();
          const label = PLATFORM_LABELS[platformKey] ?? r.platform ?? "Unknown";
          const color = PLATFORM_COLORS[platformKey] ?? "rgb(148, 163, 184)";
          const mediaPlan = (r.media_plan ?? {}) as { image_url?: string };
          const titleSource = (r.caption || r.post_text || "").toString();
          const date = r.scheduled_for ?? r.published_at ?? new Date();
          return {
            id: String(r.id),
            date: (date instanceof Date ? date : new Date(date)).toISOString(),
            title: titleSource.split("\n")[0].slice(0, 80),
            thumbnailUrl: mediaPlan.image_url ?? undefined,
            channelColor: color,
            status: statusToPill(r.status),
            contentType: label,
            metadata: { platform: platformKey, rawStatus: r.status },
          };
        });

        res.json({ entries });
      } catch (err: any) {
        log.error("[portal/socialsync/calendar]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.patch(
    "/api/portal/socialsync/calendar/:id/reschedule",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: { ok: true, persisted: false },
        });
        if (clientId === null) return;

        const postId = parseInt(req.params.id as string);
        if (isNaN(postId)) {
          return res.status(400).json({ error: "Invalid post id" });
        }

        const rawDate = req.body?.scheduled_for;
        if (!rawDate || typeof rawDate !== "string") {
          return res.status(400).json({ error: "Missing scheduled_for" });
        }
        const newDate = new Date(rawDate);
        if (isNaN(newDate.getTime())) {
          return res.status(400).json({ error: "Invalid scheduled_for" });
        }
        if (newDate.getTime() < Date.now() - 60 * 1000) {
          return res.status(400).json({ error: "Cannot reschedule to the past" });
        }

        const [post] = await db
          .select()
          .from(socialsyncPosts)
          .where(
            and(
              eq(socialsyncPosts.client_id, clientId),
              eq(socialsyncPosts.id, postId),
            ),
          )
          .limit(1);

        if (!post) return res.status(404).json({ error: "Post not found" });
        if (!["pending_approval", "queued", "ready"].includes(post.status)) {
          return res.status(400).json({
            error: `Post is "${post.status}" — only pending/queued/ready posts can be rescheduled`,
          });
        }

        await db
          .update(socialsyncPosts)
          .set({ scheduled_for: newDate, updated_at: new Date() })
          .where(eq(socialsyncPosts.id, postId));

        res.json({ ok: true, id: postId, scheduled_for: newDate.toISOString() });
      } catch (err: any) {
        log.error(
          "[portal/socialsync/calendar/reschedule]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
