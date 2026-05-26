/**
 * Portal MapGuard routes.
 *
 * Mounted under /api/portal/mapguard/*. Auth: requireClient.
 *
 * Extracted from portalRoutes.ts as the next step of the portal sub-registrar
 * refactor (PR #711 plan; PRs #713/#718/#721/#722/#727 established the
 * pattern). Pure code move — zero behaviour change. The parent registrar
 * (registerPortalRoutes) invokes registerPortalMapguardRoutes(app) so the
 * wiring in routes/index.ts is unchanged.
 *
 * Endpoints
 *   GET   /api/portal/mapguard/config
 *   PUT   /api/portal/mapguard/config
 *   GET   /api/portal/mapguard/gbp/status
 *   GET   /api/portal/mapguard/gbp/connect-url
 *   GET   /api/portal/mapguard/posts
 *   GET   /api/portal/mapguard
 *   POST  /api/portal/mapguard/upsell/dismiss
 *   GET   /api/portal/mapguard/report/:year/:month
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { requireClient } from "../../auth";
import { storage } from "../../storage";
import { db } from "../../db";
import {
  clients,
  clientServices,
  serviceCatalog,
  mapguardSnapshots,
  mapguardTasks,
  parseMapguardConfig,
  mapguardConfigSchema,
  DEFAULT_MAPGUARD_CONFIG,
} from "@shared/schema";
import { compileMonthlyReport } from "../../services/mapguardReports";
import { getExecutionUsage } from "../../services/mapguardTaskEngine";
import { generateClientActivityFeed } from "../../services/mapguardRetention";
import { getClientPerformanceSummary } from "../../services/mapguardMonitor";
import { getUpsellStatus, dismissUpsell } from "../../services/mapguardUpsell";
import { createLogger } from "../../lib/logger";
import { withClientIdOrPreview } from "../../middleware/adminPreviewSafe";

const log = createLogger("PortalMapguard");

/** Resolve client_id from the authenticated user's id. Returns null if no client record linked. */
async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Wave 12C: admin users without a linked clients row receive 200 with
 * `{previewMode:true, persisted:false, ...previewShape}` instead of 403.
 */
async function withClientId(
  req: Request,
  res: Response,
  previewShape: Record<string, unknown> = {},
): Promise<number | null> {
  return withClientIdOrPreview(req, res, { previewShape });
}

export function registerPortalMapguardRoutes(app: Express) {
  /**
   * GET /api/portal/mapguard/config
   * Customer-overridable MapGuard config (city / keywords / alerts).
   */
  app.get("/api/portal/mapguard/config", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const [client] = await db
        .select({ metadata: clients.metadata, trade_type: clients.trade_type })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      const config = parseMapguardConfig(client?.metadata);
      // Surface the resolved city even when the customer hasn't
      // overridden it, so the editor can show what we're using.
      const resolved_city = config.city ?? ((client?.metadata as any)?.city ?? null);

      res.json({
        config,
        defaults: DEFAULT_MAPGUARD_CONFIG,
        resolved_city,
        trade_type: client?.trade_type ?? null,
      });
    } catch (err) {
      log.error("Portal mapguard config GET error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load MapGuard config" });
    }
  });

  /**
   * PUT /api/portal/mapguard/config
   * Replace the full MapGuard config blob.
   */
  app.put("/api/portal/mapguard/config", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const parsed = mapguardConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid MapGuard config", details: parsed.error.flatten() });
      }

      const [existing] = await db.select({ metadata: clients.metadata }).from(clients).where(eq(clients.id, clientId)).limit(1);
      const prev = (existing?.metadata ?? {}) as Record<string, unknown>;
      const next = { ...prev, mapguard_config: parsed.data };

      const [updated] = await db
        .update(clients)
        .set({ metadata: next, updated_at: new Date() })
        .where(eq(clients.id, clientId))
        .returning({ metadata: clients.metadata });

      res.json({ config: parseMapguardConfig(updated.metadata) });
    } catch (err) {
      log.error("Portal mapguard config PUT error:", { error: String(err) });
      res.status(500).json({ error: "Failed to update MapGuard config" });
    }
  });

  /**
   * GET /api/portal/mapguard/gbp/status
   * Reports whether the authenticated client has an active Google
   * Business connection (used to drive the "Connect Google Business"
   * button shown on /portal/mapguard).
   */
  app.get("/api/portal/mapguard/gbp/status", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const connections = await storage.listSocialSyncConnections(clientId);
      const conn = connections.find((c) => c.platform === "google_business");
      const connected = !!(conn && conn.connection_status === "connected" && conn.external_page_id);

      const { validateGoogleBusinessConfig } = await import("../../services/socialSync/googleBusinessService");
      const configCheck = validateGoogleBusinessConfig();

      res.json({
        connected,
        configured: configCheck.valid,
        location_name: conn?.external_page_id || null,
      });
    } catch (err) {
      log.error("Portal mapguard GBP status error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load GBP status" });
    }
  });

  /**
   * GET /api/portal/mapguard/gbp/connect-url
   * Returns an OAuth URL to start the customer-initiated Google
   * Business connection. State is signed with source='portal-mapguard'
   * so the OAuth callback knows to redirect back to /portal/mapguard.
   */
  app.get("/api/portal/mapguard/gbp/connect-url", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { validateGoogleBusinessConfig, buildGoogleOAuthUrl } = await import("../../services/socialSync/googleBusinessService");
      const configCheck = validateGoogleBusinessConfig();
      if (!configCheck.valid) {
        return res.status(503).json({ error: "Google Business not configured", missing: configCheck.missing });
      }

      const url = buildGoogleOAuthUrl(clientId, { source: "portal-mapguard" });
      res.json({ url });
    } catch (err: any) {
      log.error("Portal mapguard GBP connect-url error:", { error: err.message });
      res.status(500).json({ error: "Failed to generate connect URL" });
    }
  });

  /**
   * GET /api/portal/mapguard/posts
   * Customer-safe post calendar. Returns every mapguard_posts row for
   * the authenticated client, ordered by scheduled_for desc, so the
   * portal can render a "what we posted / what's queued" timeline.
   * Excludes internal-only fields (generator metadata, retry counters,
   * raw error messages). Last 6 months only — older posts roll off.
   */
  app.get("/api/portal/mapguard/posts", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { mapguardPosts } = await import("@shared/schemas/mapguardPosts");
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 6);

      const rows = await db
        .select({
          id: mapguardPosts.id,
          status: mapguardPosts.status,
          theme: mapguardPosts.theme,
          scheduled_for: mapguardPosts.scheduled_for,
          published_at: mapguardPosts.published_at,
          content: mapguardPosts.content,
          gbp_post_id: mapguardPosts.gbp_post_id,
          quota_period: mapguardPosts.quota_period,
        })
        .from(mapguardPosts)
        .where(and(
          eq(mapguardPosts.client_id, clientId),
          gte(mapguardPosts.scheduled_for, cutoff),
        ))
        .orderBy(desc(mapguardPosts.scheduled_for))
        .limit(100);

      // Group by quota_period (YYYY-MM) so the frontend can render
      // month-by-month sections without re-bucketing every render.
      const byPeriod: Record<string, typeof rows> = {};
      for (const row of rows) {
        const key = row.quota_period;
        (byPeriod[key] ||= []).push(row);
      }

      res.json({
        posts: rows,
        by_period: byPeriod,
      });
    } catch (err: any) {
      log.error("Portal mapguard posts error:", { error: err.message });
      res.status(500).json({ error: "Failed to load posts" });
    }
  });

  /**
   * GET /api/portal/mapguard
   * Client-safe MapGuard dashboard data.
   * Returns snapshots, health, and trend data — no tasks, alerts, or supplier info.
   */
  app.get("/api/portal/mapguard", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      // Check if client has active MapGuard service
      const [mgService] = await db.select({ id: clientServices.id, status: clientServices.status })
        .from(clientServices)
        .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
        .where(and(
          eq(clientServices.client_id, clientId),
          sql`${serviceCatalog.id} LIKE 'mapguard%'`,
          sql`${clientServices.status} IN ('active', 'onboarding')`,
        ))
        .limit(1);

      if (!mgService) {
        // No active monthly plan — surface the setup-completion upsell
        // banner if the customer has a completed mapguard-setup. This
        // replaces the bland "MapGuard is not active" empty state for
        // customers who finished the setup project but haven't yet
        // chosen a Basic/Pro tier.
        const upsell = await getUpsellStatus(clientId);
        return res.json({ active: false, snapshots: [], health: null, setup_completed_upsell: upsell });
      }

      // Get last 12 snapshots (newest first)
      const snapshots = await db.select({
        id: mapguardSnapshots.id,
        captured_at: mapguardSnapshots.captured_at,
        rating: mapguardSnapshots.rating,
        review_count: mapguardSnapshots.review_count,
        photo_count: mapguardSnapshots.photo_count,
        has_website: mapguardSnapshots.has_website,
        has_description: mapguardSnapshots.has_description,
        keywords_in_local_pack: mapguardSnapshots.keywords_in_local_pack,
        keywords_in_top_10: mapguardSnapshots.keywords_in_top_10,
        score_total: mapguardSnapshots.score_total,
        score_grade: mapguardSnapshots.score_grade,
        score_google_maps: mapguardSnapshots.score_google_maps,
        score_search_visibility: mapguardSnapshots.score_search_visibility,
        changes: mapguardSnapshots.changes,
      })
      .from(mapguardSnapshots)
      .where(eq(mapguardSnapshots.client_id, clientId))
      .orderBy(desc(mapguardSnapshots.captured_at))
      .limit(12);

      const latest = snapshots[0] || null;
      const previous = snapshots[1] || null;

      // Compute client-safe health status
      let health: string = "monitoring";
      if (latest && previous) {
        const changes = latest.changes as any;
        const scoreDelta = changes?.score_delta ?? null;
        if (scoreDelta !== null && scoreDelta > 5) health = "improving";
        else if (scoreDelta !== null && scoreDelta < -8) health = "needs_attention";
        else if (scoreDelta !== null && scoreDelta < -3) health = "watch_closely";
        else health = "healthy";
      } else if (latest) {
        health = "healthy";
      }

      // Build client-safe snapshot data (strip internal fields)
      const clientSnapshots = snapshots.map(s => ({
        captured_at: s.captured_at,
        score: s.score_total,
        grade: s.score_grade,
        rating: s.rating,
        review_count: s.review_count,
        keywords_in_local_pack: s.keywords_in_local_pack,
        keywords_in_top_10: s.keywords_in_top_10,
      }));

      // Compute simple deltas for display
      const deltas = latest && previous ? {
        score: (latest.changes as any)?.score_delta ?? null,
        rating: (latest.changes as any)?.rating_delta ?? null,
        reviews: (latest.changes as any)?.reviews_delta ?? null,
        local_pack: (latest.changes as any)?.local_pack_delta ?? null,
      } : null;

      // Build client-friendly activity list from recent tasks
      const TASK_TYPE_TRANSLATIONS: Record<string, string> = {
        baseline_audit_review: "Reviewing your visibility data and planning improvements",
        gbp_optimization: "Optimizing your Google Business profile",
        citation_cleanup: "Improving your online listings consistency",
        review_issue_response: "Handling and improving your customer reviews",
        competitor_reaction: "Monitoring competitors and adjusting your visibility strategy",
        profile_content_update: "Updating your profile content for better performance",
        photo_upload: "Refreshing your business photos",
        post_scheduling: "Creating and scheduling posts for your profile",
        suspension_support: "Resolving a profile issue with Google",
        monthly_report_review: "Preparing your monthly performance review",
        manual_followup: "Following up on an improvement action",
      };

      const recentTaskTypes = await db.selectDistinct({ task_type: mapguardTasks.task_type })
        .from(mapguardTasks)
        .where(and(
          eq(mapguardTasks.client_id, clientId),
          sql`${mapguardTasks.status} NOT IN ('completed', 'cancelled')`,
        ))
        .limit(5);

      const activities = recentTaskTypes
        .map(r => TASK_TYPE_TRANSLATIONS[r.task_type])
        .filter(Boolean);

      // Add recent completions as past-tense signals
      const [recentCompleted] = await db.select({ count: sql<number>`count(*)::int` })
        .from(mapguardTasks)
        .where(and(
          eq(mapguardTasks.client_id, clientId),
          eq(mapguardTasks.status, "completed"),
          sql`${mapguardTasks.completed_at} > NOW() - INTERVAL '30 days'`,
        ));
      const completedCount = recentCompleted?.count || 0;

      // Client-safe execution progress (no internal limits exposed)
      let executionProgress: { completed: number; pending: number; has_more: boolean } | null = null;
      try {
        const usage = await getExecutionUsage(clientId);
        executionProgress = {
          completed: usage.used,
          pending: usage.backlog_count,
          has_more: usage.upgrade_recommended,
        };
      } catch { /* skip on error */ }

      res.json({
        active: true,
        health,
        last_scan: latest?.captured_at || null,
        activities,
        completed_last_30d: completedCount,
        execution_progress: executionProgress,
        activity_feed: await generateClientActivityFeed(clientId, 8),
        since_start: await (async () => {
          try {
            const perf = await getClientPerformanceSummary(clientId);
            if (!perf || perf.score_change == null) return null;
            return { score_change: perf.score_change, reviews_gained: perf.reviews_gained, days_active: perf.days_active };
          } catch { return null; }
        })(),
        current: latest ? {
          score: latest.score_total,
          grade: latest.score_grade,
          rating: latest.rating,
          review_count: latest.review_count,
          photo_count: latest.photo_count,
          has_website: latest.has_website,
          has_description: latest.has_description,
          keywords_in_local_pack: latest.keywords_in_local_pack,
          keywords_in_top_10: latest.keywords_in_top_10,
        } : null,
        deltas,
        snapshots: clientSnapshots.reverse(), // chronological for charts
      });
    } catch (err: any) {
      log.error("Portal MapGuard error:", err);
      res.status(500).json({ error: "Failed to load MapGuard data" });
    }
  });

  /**
   * POST /api/portal/mapguard/upsell/dismiss
   * Customer dismissed the "your setup is complete, continue with Basic/Pro"
   * banner. Sets metadata.upsell_dismissed=true on the most recent completed
   * mapguard-setup so the banner won't render again. Idempotent.
   */
  app.post("/api/portal/mapguard/upsell/dismiss", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;
      const result = await dismissUpsell(clientId);
      res.json(result);
    } catch (err: any) {
      log.error("Portal MapGuard upsell dismiss error:", err);
      res.status(500).json({ error: "Failed to dismiss upsell" });
    }
  });

  /**
   * GET /api/portal/mapguard/report/:year/:month
   * Client-safe monthly report data.
   */
  app.get("/api/portal/mapguard/report/:year/:month", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const year = parseInt(req.params.year as string);
      const month = parseInt(req.params.month as string);
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: "Invalid date parameters" });
      }

      const report = await compileMonthlyReport(clientId, year, month);
      if (!report) return res.status(404).json({ error: "No report data for this month" });

      // Return client-safe subset (strip internal counts)
      res.json({
        month_label: report.month_label,
        business_name: report.business_name,
        score_end: report.score_end,
        score_delta: report.score_delta,
        grade_end: report.grade_end,
        rating_end: report.rating_end,
        rating_delta: report.rating_delta,
        reviews_end: report.reviews_end,
        reviews_gained: report.reviews_gained,
        local_pack_end: report.local_pack_end,
        scans_this_month: report.scans_this_month,
        has_website: report.has_website,
        has_description: report.has_description,
        photo_count: report.photo_count,
        completed_actions: report.completed_actions,
        active_work: report.active_work,
        movement: report.movement,
      });
    } catch (err: any) {
      log.error("Portal MapGuard report error:", err);
      res.status(500).json({ error: "Failed to load report" });
    }
  });
}
