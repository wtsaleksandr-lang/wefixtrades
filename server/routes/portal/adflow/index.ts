/**
 * Portal AdFlow dashboard route registry — Wave 30.
 *
 * Bundles the new dashboard-supporting endpoints for the AdFlow UI upgrade:
 *
 *   GET  /api/portal/adflow/dashboard-kpis
 *   GET  /api/portal/adflow/campaigns
 *   POST /api/portal/adflow/copy/generate
 *   GET  /api/portal/adflow/anomalies
 *   POST /api/portal/adflow/run-action
 *   GET  /api/portal/adflow/notification-settings
 *   POST /api/portal/adflow/notification-settings
 *   GET  /api/portal/adflow/heatmaps/profitable-trade
 *   GET  /api/portal/adflow/heatmaps/day-parting
 *
 * Mounted BEFORE the legacy `GET /api/portal/adflow/:csId/reports` in
 * `portalRoutes.ts` so the specific paths above resolve first.
 */

import type { Express } from "express";
import { registerPortalAdflowDashboardKpisRoutes } from "./dashboardKpis";
import { registerPortalAdflowCampaignsRoutes } from "./campaigns";
import { registerPortalAdflowCopyRoutes } from "./copy";
import { registerPortalAdflowAnomaliesRoutes } from "./anomalies";
import { registerPortalAdflowRunActionRoutes } from "./runAction";
import { registerPortalAdflowNotificationSettingsRoutes } from "./notificationSettings";
import { registerPortalAdflowHeatmapsRoutes } from "./heatmaps";

export function registerPortalAdflowDashboardRoutes(app: Express) {
  registerPortalAdflowDashboardKpisRoutes(app);
  registerPortalAdflowCampaignsRoutes(app);
  registerPortalAdflowCopyRoutes(app);
  registerPortalAdflowAnomaliesRoutes(app);
  registerPortalAdflowRunActionRoutes(app);
  registerPortalAdflowNotificationSettingsRoutes(app);
  registerPortalAdflowHeatmapsRoutes(app);
}
