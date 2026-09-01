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
 *
 * Mounted BEFORE the legacy `GET /api/portal/adflow/:csId/reports` in
 * `portalRoutes.ts` so the specific paths above resolve first.
 *
 * REMOVED: /heatmaps/profitable-trade and /heatmaps/day-parting. Neither could
 * be served without inventing its own input. The day-parting grid spread each
 * day's total across 24 hours using a hardcoded HOUR_WEIGHTS curve — nothing in
 * this system has ever held hour-level ad data — and the trade grid valued each
 * booking at a flat $250 and guessed the platform from the campaign name. See
 * the guard in server/services/aiActions/handlers/adflow.test.ts.
 */

import type { Express } from "express";
import { registerPortalAdflowDashboardKpisRoutes } from "./dashboardKpis";
import { registerPortalAdflowCampaignsRoutes } from "./campaigns";
import { registerPortalAdflowCopyRoutes } from "./copy";
import { registerPortalAdflowAnomaliesRoutes } from "./anomalies";
import { registerPortalAdflowRunActionRoutes } from "./runAction";
import { registerPortalAdflowNotificationSettingsRoutes } from "./notificationSettings";
import { registerPortalAdflowWave73KpiStatsRoutes } from "./wave73KpiStats";

export function registerPortalAdflowDashboardRoutes(app: Express) {
  registerPortalAdflowDashboardKpisRoutes(app);
  registerPortalAdflowCampaignsRoutes(app);
  registerPortalAdflowCopyRoutes(app);
  registerPortalAdflowAnomaliesRoutes(app);
  registerPortalAdflowRunActionRoutes(app);
  registerPortalAdflowNotificationSettingsRoutes(app);
  registerPortalAdflowWave73KpiStatsRoutes(app);
}
