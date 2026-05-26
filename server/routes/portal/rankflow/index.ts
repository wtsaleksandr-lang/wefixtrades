/**
 * Portal RankFlow dashboard route registry — Wave 24.
 *
 * Bundles the four new dashboard-supporting endpoints introduced in the
 * RankFlow UI upgrade. The existing `server/routes/portal/rankflow.ts`
 * (Wave 12) keeps the production routes (GET /api/portal/rankflow,
 * search-console-status, google-connect, onboard, settings) — this
 * sibling adds:
 *
 *   GET   /api/portal/rankflow/dashboard-kpis
 *   GET   /api/portal/rankflow/competitor-comparison
 *   GET   /api/portal/rankflow/ai-brain
 *   POST  /api/portal/rankflow/ai-brain/dispatch
 *   GET   /api/portal/rankflow/activity-feed
 */

import type { Express } from "express";
import { registerPortalRankflowDashboardKpisRoutes } from "./dashboardKpis";
import { registerPortalRankflowCompetitorComparisonRoutes } from "./competitorComparison";
import { registerPortalRankflowAiBrainRoutes } from "./aiBrain";
import { registerPortalRankflowActivityFeedRoutes } from "./activityFeed";

export function registerPortalRankflowDashboardRoutes(app: Express) {
  registerPortalRankflowDashboardKpisRoutes(app);
  registerPortalRankflowCompetitorComparisonRoutes(app);
  registerPortalRankflowAiBrainRoutes(app);
  registerPortalRankflowActivityFeedRoutes(app);
}
