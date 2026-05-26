/**
 * Portal SocialSync Dashboard KPIs — Wave 25.
 *
 * GET /api/portal/socialsync/dashboard-kpis
 *
 * Returns the four hero numbers the new SocialSync dashboard shows above
 * the fold:
 *  - postsThisWeek      — approved + scheduled posts whose scheduled_for
 *                         falls within the current ISO week
 *  - avgEngagementRate  — placeholder (we don't store engagement metrics
 *                         yet; surfaces as 0 with empty=true so the UI can
 *                         render "Awaiting data" rather than NaN)
 *  - approvalBacklog    — count of socialsync_posts in pending_approval
 *  - whatsappMessagesThisWeek — incoming WhatsApp messages logged in
 *                         socialsync_activity_logs as
 *                         action="whatsapp.message_received" this week
 *
 * Plus a per-platform engagement-rate map (same caveat — empty until we
 * persist engagement data) that the per-platform gauges consume.
 *
 * Auth: requireClient. adminPreviewSafe-wrapped so admin preview returns
 * an empty-shape 200 instead of 403.
 */

import type { Express, Request, Response } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import {
  socialsyncPosts,
  socialsyncActivityLogs,
  socialsyncPlatformConnections,
} from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalSocialsyncDashboardKpis");

const EMPTY_KPIS = {
  postsThisWeek: 0,
  avgEngagementRate: 0,
  approvalBacklog: 0,
  whatsappMessagesThisWeek: 0,
};

const EMPTY_PER_PLATFORM = {
  facebook: { ratePct: 0, empty: true },
  instagram: { ratePct: 0, empty: true },
  linkedin: { ratePct: 0, empty: true },
  whatsapp: { ratePct: 0, empty: true },
};

const EMPTY_DASHBOARD_RESPONSE = {
  previewMode: true,
  kpis: EMPTY_KPIS,
  perPlatform: EMPTY_PER_PLATFORM,
  connections: { facebook: false, instagram: false, linkedin: false, whatsapp: false },
};

function startOfIsoWeek(now = new Date()): Date {
  // Monday-start week, local-time approximation good enough for "this week" KPIs.
  const d = new Date(now);
  const day = d.getDay(); // 0 = Sun
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfIsoWeek(now = new Date()): Date {
  const s = startOfIsoWeek(now);
  const e = new Date(s);
  e.setDate(s.getDate() + 7);
  return e;
}

/**
 * Wave 26.6 — pure compute path for the SocialSync dashboard KPIs. Extracted
 * from the route handler so the Copilot metricsContext can reuse it.
 */
export async function computeSocialsyncDashboardKpis(clientId: number) {
  const weekStart = startOfIsoWeek();
  const weekEnd = endOfIsoWeek();

  const postsThisWeekRow = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(socialsyncPosts)
    .where(
      and(
        eq(socialsyncPosts.client_id, clientId),
        sql`status IN ('queued', 'ready', 'publishing', 'published')`,
        sql`scheduled_for >= ${weekStart}`,
        sql`scheduled_for < ${weekEnd}`,
      ),
    );
  const postsThisWeek = Number(postsThisWeekRow[0]?.n ?? 0);

  const backlogRow = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(socialsyncPosts)
    .where(
      and(
        eq(socialsyncPosts.client_id, clientId),
        eq(socialsyncPosts.status, "pending_approval"),
      ),
    );
  const approvalBacklog = Number(backlogRow[0]?.n ?? 0);

  const waRow = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(socialsyncActivityLogs)
    .where(
      and(
        eq(socialsyncActivityLogs.client_id, clientId),
        sql`action IN ('whatsapp.message_received', 'whatsapp.message_sent')`,
        gte(socialsyncActivityLogs.created_at, weekStart),
      ),
    );
  const whatsappMessagesThisWeek = Number(waRow[0]?.n ?? 0);

  const connRows = await db
    .select({
      platform: socialsyncPlatformConnections.platform,
      status: socialsyncPlatformConnections.connection_status,
    })
    .from(socialsyncPlatformConnections)
    .where(eq(socialsyncPlatformConnections.client_id, clientId));

  const connections = { facebook: false, instagram: false, linkedin: false, whatsapp: false };
  for (const row of connRows) {
    const isOk = row.status === "connected" || row.status === "expiring_soon";
    if (row.platform === "facebook") connections.facebook = isOk;
    else if (row.platform === "instagram") connections.instagram = isOk;
    else if (row.platform === "linkedin") connections.linkedin = isOk;
    else if (row.platform === "whatsapp" || row.platform === "whatsapp_business") {
      connections.whatsapp = isOk;
    }
  }

  return {
    kpis: {
      postsThisWeek,
      avgEngagementRate: 0,
      approvalBacklog,
      whatsappMessagesThisWeek,
    },
    perPlatform: EMPTY_PER_PLATFORM,
    connections,
  };
}

export function registerPortalSocialsyncDashboardKpisRoutes(app: Express) {
  app.get(
    "/api/portal/socialsync/dashboard-kpis",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_DASHBOARD_RESPONSE,
        });
        if (clientId === null) return;

        const payload = await computeSocialsyncDashboardKpis(clientId);
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/socialsync/dashboard-kpis]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
