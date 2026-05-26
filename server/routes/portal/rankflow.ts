/**
 * Portal RankFlow routes.
 *
 * Mounted under /api/portal/rankflow* (plus the related search-console-status,
 * google-connect, onboard, and PATCH settings endpoints).
 * Auth: requireClient / requireClientStrict.
 *
 * Extracted from portalRoutes.ts as wave 12 of the portal sub-registrar
 * refactor. Pure code move — zero behaviour change. The parent registrar
 * (registerPortalRoutes) invokes registerPortalRankflowRoutes(app) so the
 * wiring in routes/index.ts is unchanged.
 *
 * Endpoints
 *   GET    /api/portal/rankflow                          (client-facing dashboard)
 *   GET    /api/portal/rankflow/search-console-status
 *   GET    /api/portal/rankflow/google-connect
 *   POST   /api/portal/rankflow/onboard
 *   PATCH  /api/portal/rankflow/settings
 */

import type { Express, Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { requireClient, requireClientStrict } from "../../auth";
import { storage } from "../../storage";
import { db } from "../../db";
import {
  clients,
  clientServices,
  rankflowProfiles,
  rankflowTasks,
  rankflowMonthlyPlans,
} from "@shared/schema";
import { generateMonthlyPlan } from "../../services/rankflow/planGenerator";
import { generateTasksFromPlan } from "../../services/rankflow/taskGenerator";
import { generateKeywordTargets, clusterKeywords, deriveTargetServices } from "../../services/rankflow/keywordHelper";
import { createDraftFromRankflowTask, generateArticleBody } from "../../services/contentflow/articleService";
import { createLogger } from "../../lib/logger";
import { withClientIdOrPreview } from "../../middleware/adminPreviewSafe";

const log = createLogger("PortalRankflow");

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

const TASK_TYPE_LABELS: Record<string, string> = {
  page_create: "Page created",
  meta_fix: "Page optimization",
  citation_build: "Directory listing",
  internal_linking: "Internal linking",
  content_support: "SEO content support",
  schema_basic: "Search visibility improvement",
};

export function registerPortalRankflowRoutes(app: Express) {
  /* ═══════════════════════════════════════════
     RankFlow Client Dashboard
     ═══════════════════════════════════════════ */

  app.get("/api/portal/rankflow", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const month = new Date().toISOString().slice(0, 7);

      // Profile
      const [profile] = await db.select().from(rankflowProfiles)
        .where(eq(rankflowProfiles.client_id, clientId)).limit(1);

      if (!profile) return res.json({ active: false });

      // Current month plan
      const [plan] = await db.select().from(rankflowMonthlyPlans)
        .where(and(eq(rankflowMonthlyPlans.client_id, clientId), eq(rankflowMonthlyPlans.month, month)))
        .limit(1);

      // Tasks for this month (only done or in-progress — hide internal clutter)
      const allTasks = plan
        ? await db.select().from(rankflowTasks).where(eq(rankflowTasks.plan_id, plan.id))
        : [];

      const completed = allTasks.filter(t => t.status === "done");
      const inProgress = allTasks.filter(t => ["assigned", "in_progress", "submitted", "qa_review", "pending"].includes(t.status));

      // Transform to client-safe language
      const completedItems = completed.map(t => ({
        label: TASK_TYPE_LABELS[t.type] || t.type.replace(/_/g, " "),
        detail: t.title.replace(/^(Create SEO page|Optimize title tag|Build citation|Add internal links|Add schema markup|Content recommendation).*?—?\s*/i, "").trim() || t.title,
        completedAt: t.completed_at,
      }));

      const inProgressItems = inProgress.map(t => ({
        label: TASK_TYPE_LABELS[t.type] || t.type.replace(/_/g, " "),
        detail: t.title,
      }));

      // Progress stats
      const totalTasks = allTasks.length;
      const doneTasks = completed.length;
      const pagesCreated = completed.filter(t => t.type === "page_create").length;
      const citationsBuilt = completed.filter(t => t.type === "citation_build").length;
      const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

      // Status line
      let statusLine = "Work is underway this month";
      if (!profile.enabled) statusLine = "RankFlow is currently paused";
      else if (!plan) statusLine = "This month's plan is being prepared";
      else if (doneTasks === totalTasks && totalTasks > 0) statusLine = "This month's SEO work is complete";
      else if (doneTasks === 0) statusLine = "Work is starting this month";

      // What's next (simple narrative)
      const nextUp: string[] = [];
      const pendingTypes = new Set(inProgress.map(t => t.type));
      if (pendingTypes.has("page_create")) nextUp.push("Creating optimized service pages");
      if (pendingTypes.has("meta_fix")) nextUp.push("Optimizing page titles and descriptions");
      if (pendingTypes.has("citation_build")) nextUp.push("Expanding local directory coverage");
      if (pendingTypes.has("internal_linking")) nextUp.push("Improving internal page connections");
      if (pendingTypes.has("content_support")) nextUp.push("Preparing next month's content strategy");
      if (pendingTypes.has("schema_basic")) nextUp.push("Enhancing search result visibility");
      if (nextUp.length === 0 && totalTasks > 0 && doneTasks < totalTasks) nextUp.push("Finalizing this month's SEO improvements");
      if (nextUp.length === 0 && doneTasks === totalTasks) nextUp.push("Reviewing keyword progress for next month");

      // Ranking highlights (from signals table)
      const signals = await storage.getSignalSummary(clientId);
      const rankingHighlights: string[] = [];
      if (signals) {
        if (signals.keywords_top_10 > 0) rankingHighlights.push(`${signals.keywords_top_10} keyword${signals.keywords_top_10 > 1 ? "s" : ""} in top 10`);
        if (signals.keywords_improved > 0) rankingHighlights.push(`${signals.keywords_improved} keyword${signals.keywords_improved > 1 ? "s" : ""} improved this month`);
        if (signals.pages_indexed > 0) rankingHighlights.push(`${signals.pages_indexed} page${signals.pages_indexed > 1 ? "s" : ""} indexed on Google`);
        if (signals.keywords_top_20 > signals.keywords_top_10) rankingHighlights.push(`${signals.keywords_top_20} keyword${signals.keywords_top_20 > 1 ? "s" : ""} in top 20`);
      }

      // Indexing summary
      const pages = await storage.listPagesByClient(clientId);
      const indexedPages = pages.filter(p => p.indexed).length;
      const pendingIndex = pages.length - indexedPages;

      // Monthly narrative (rule-based)
      const narrativeParts: string[] = [];
      if (doneTasks > 0) narrativeParts.push(`This month we completed ${doneTasks} SEO improvement${doneTasks > 1 ? "s" : ""}`);
      if (pagesCreated > 0) narrativeParts.push(`created ${pagesCreated} new page${pagesCreated > 1 ? "s" : ""}`);
      if (citationsBuilt > 0) narrativeParts.push(`built ${citationsBuilt} local listing${citationsBuilt > 1 ? "s" : ""}`);
      if (signals?.keywords_improved && signals.keywords_improved > 0) narrativeParts.push(`${signals.keywords_improved} keyword${signals.keywords_improved > 1 ? "s" : ""} improved in Google`);
      if (indexedPages > 0) narrativeParts.push(`${indexedPages} page${indexedPages > 1 ? "s are" : " is"} indexed on Google`);
      let narrative = narrativeParts.length > 0
        ? narrativeParts.join(", ") + "."
        : "We are setting up your SEO plan and will begin work shortly.";
      // Capitalize first letter
      narrative = narrative.charAt(0).toUpperCase() + narrative.slice(1);

      res.json({
        active: profile.enabled,
        plan_tier: profile.plan_tier,
        month,
        statusLine,
        narrative,
        metrics: {
          tasksCompleted: doneTasks,
          totalTasks,
          pagesCreated,
          citationsBuilt,
          progressPct,
        },
        ranking: {
          highlights: rankingHighlights,
          keywordsTracked: signals?.total_keywords || 0,
          keywordsTop10: signals?.keywords_top_10 || 0,
          keywordsTop20: signals?.keywords_top_20 || 0,
          keywordsImproved: signals?.keywords_improved || 0,
          avgPosition: signals?.avg_position ? Number(signals.avg_position) : null,
        },
        indexing: {
          totalPages: pages.length,
          indexed: indexedPages,
          pending: pendingIndex,
        },
        completed: completedItems,
        inProgress: inProgressItems,
        nextUp,
      });
    } catch (err: any) {
      log.error("[portal-rankflow] error:", err.message);
      res.status(500).json({ error: "Failed to load RankFlow dashboard" });
    }
  });

  /* ═══════════════════════════════════════════
     RankFlow Search Console Connection
     ═══════════════════════════════════════════ */

  /**
   * GET /api/portal/rankflow/search-console-status
   * Returns whether Google Search Console is connected and accessible for the client's site.
   */
  app.get("/api/portal/rankflow/search-console-status", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const featureEnabled = process.env.GOOGLE_SEARCH_CONSOLE_ENABLED === "true";
      if (!featureEnabled) {
        return res.json({ enabled: false, googleConnected: false, searchConsoleConnected: false });
      }

      const { isGoogleOAuthConfigured, hasGoogleConnection } = await import("../../services/googleBusinessService");
      const oauthConfigured = isGoogleOAuthConfigured();
      const googleConnected = oauthConfigured ? await hasGoogleConnection(clientId) : false;

      let searchConsoleConnected = false;
      if (googleConnected) {
        try {
          const { getCredentialsForClient, hasSearchConsoleAccess } = await import("../../services/rankflow/searchConsoleService");
          const credentials = await getCredentialsForClient(clientId);
          if (credentials) {
            // Try to detect the site URL from the client's RankFlow profile
            const profile = await storage.getRankFlowProfile(clientId);
            const siteUrl = profile?.website_url;
            if (siteUrl) {
              const normalizedUrl = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
              searchConsoleConnected = await hasSearchConsoleAccess(normalizedUrl, credentials);
            }
          }
        } catch (err: any) {
          log.debug("[portal-rankflow] Search Console access check failed", { error: err.message });
        }
      }

      res.json({
        enabled: true,
        oauthConfigured,
        googleConnected,
        searchConsoleConnected,
      });
    } catch (err: any) {
      log.error("[portal-rankflow] search-console-status error:", err.message);
      res.status(500).json({ error: "Failed to check Search Console status" });
    }
  });

  /**
   * GET /api/portal/rankflow/google-connect
   * Initiates Google OAuth flow for the authenticated client (for Search Console access).
   * Reuses the same OAuth flow as Google Business Profile with the added webmasters.readonly scope.
   */
  app.get("/api/portal/rankflow/google-connect", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { isGoogleOAuthConfigured, getGoogleAuthUrl } = await import("../../services/googleBusinessService");
      if (!isGoogleOAuthConfigured()) {
        return res.status(503).json({ error: "Google connection is not available right now" });
      }

      const state = JSON.stringify({ clientId, source: "portal" });
      const authUrl = getGoogleAuthUrl(state);
      res.json({ authUrl });
    } catch (err: any) {
      log.error("[portal-rankflow] google-connect error:", err.message);
      res.status(500).json({ error: "Failed to start connection" });
    }
  });

  /* ═══════════════════════════════════════════
     RankFlow Onboarding
     ═══════════════════════════════════════════ */

  app.post("/api/portal/rankflow/onboard", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { business_name, website_url, niche, location, additional_services, additional_locations, plan_tier } = req.body;

      if (!business_name || !website_url || !niche || !location) {
        return res.status(400).json({ error: "business_name, website_url, niche, and location are required" });
      }

      // Check if profile already exists and is enabled
      const existing = await storage.getRankFlowProfile(clientId);
      if (existing?.enabled) {
        return res.status(409).json({ error: "RankFlow is already active for this client" });
      }

      // Derive target services and locations
      const targetServices = deriveTargetServices(niche, additional_services);
      const targetLocations = [location, ...(additional_locations || [])].filter(Boolean);

      // Create or update profile
      const profile = await storage.upsertRankFlowProfile(clientId, {
        niche,
        location,
        website_url,
        target_services: targetServices,
        target_locations: targetLocations,
        plan_tier: plan_tier || "starter",
        enabled: true,
      });

      // Generate initial monthly plan + tasks
      const month = new Date().toISOString().slice(0, 7);
      let planResult = null;

      const existingPlan = await storage.getMonthlyPlan(clientId, month);
      if (!existingPlan) {
        const planData = generateMonthlyPlan(profile, month);
        const plan = await storage.createMonthlyPlan({
          client_id: clientId,
          month,
          plan_data: planData,
          status: "draft",
        });

        const taskDefs = generateTasksFromPlan(plan.id, planData, profile);
        let tasksCreated = 0;
        for (const t of taskDefs) {
          const task = await storage.createRankFlowTask(t as any);
          tasksCreated++;
          if (task.type === "page_create") {
            try {
              const draft = await createDraftFromRankflowTask({ task, profile });
              generateArticleBody(draft.id).catch((err) =>
                log.error(`[contentflow] background article generation rejected for draft ${draft.id}:`, err),
              );
            } catch (hookErr: any) {
              log.error(`[contentflow] article hook failed for task ${task.id}:`, hookErr.message);
            }
          }
        }

        await storage.updateMonthlyPlanStatus(plan.id, "active");
        planResult = { planId: plan.id, month, tasksCreated };
      }

      // Generate structured keyword targets and save to tracking table
      const keywords = generateKeywordTargets(niche, location, additional_locations, additional_services);
      const clusters = clusterKeywords(keywords);

      // Save keywords to tracking table (max 40)
      const kwToSave = keywords.slice(0, 40).map(k => ({
        client_id: clientId,
        keyword: k.keyword,
        cluster: k.cluster,
        priority: k.priority,
      }));
      await storage.createKeywords(kwToSave);

      log.info(`[rankflow-onboard] Client ${clientId} onboarded — ${kwToSave.length} keywords saved, ${clusters.length} clusters, plan: ${planResult ? "created" : "already exists"}`);

      res.status(201).json({
        profile,
        plan: planResult,
        keywords_saved: kwToSave.length,
        clusters: clusters.length,
      });
    } catch (err: any) {
      log.error("[rankflow-onboard] error:", err.message);
      res.status(500).json({ error: "Failed to complete onboarding" });
    }
  });

  /**
   * PATCH /api/portal/rankflow/settings
   * Body: { article_generation_paused: boolean }
   * Stores in the rankflow client_service metadata.
   */
  app.patch("/api/portal/rankflow/settings", requireClientStrict, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) return;

      const { article_generation_paused } = req.body;
      if (typeof article_generation_paused !== "boolean") {
        return res.status(400).json({ error: "article_generation_paused must be a boolean" });
      }

      const services = await db.select({
        id: clientServices.id,
        metadata: clientServices.metadata,
      })
        .from(clientServices)
        .where(and(
          eq(clientServices.client_id, clientId),
          sql`${clientServices.service_id} LIKE '%rankflow%'`,
          eq(clientServices.status, "active"),
        ))
        .limit(1);

      if (services.length === 0) {
        return res.status(404).json({ error: "No active RankFlow service found" });
      }

      const svc = services[0];
      const existing = (svc.metadata as Record<string, any>) ?? {};
      await db.update(clientServices)
        .set({ metadata: { ...existing, article_generation_paused }, updated_at: new Date() })
        .where(eq(clientServices.id, svc.id));

      log.info("[portal/rankflow/settings] article_generation_paused toggled", { clientId, article_generation_paused });
      res.json({ ok: true, article_generation_paused });
    } catch (err: any) {
      log.error("[portal/rankflow/settings] Error:", { error: err.message });
      res.status(500).json({ error: "Failed to update RankFlow settings" });
    }
  });
}
