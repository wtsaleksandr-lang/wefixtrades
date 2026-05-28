/**
 * Portal MapGuard dashboard route registry — Wave 27.
 *
 * Bundles the four new dashboard-supporting endpoints introduced in the
 * MapGuard UI upgrade. The existing `server/routes/portal/mapguard.ts`
 * keeps the production routes (config, GBP connect, posts, monthly
 * report, etc.) — this sibling adds:
 *
 *   GET   /api/portal/mapguard/dashboard-kpis
 *   GET   /api/portal/mapguard/competitor-alerts
 *   POST  /api/portal/mapguard/run-action
 *   GET   /api/portal/mapguard/notification-settings
 *   POST  /api/portal/mapguard/notification-settings
 */

import type { Express } from "express";
import { registerPortalMapguardDashboardKpisRoutes } from "./dashboardKpis";
import { registerPortalMapguardCompetitorAlertsRoutes } from "./competitorAlerts";
import { registerPortalMapguardRunActionRoutes } from "./runAction";
import { registerPortalMapguardNotificationSettingsRoutes } from "./notificationSettings";
import { registerPortalMapguardWave73KpiStatsRoutes } from "./wave73KpiStats";

export function registerPortalMapguardDashboardRoutes(app: Express) {
  registerPortalMapguardDashboardKpisRoutes(app);
  registerPortalMapguardCompetitorAlertsRoutes(app);
  registerPortalMapguardRunActionRoutes(app);
  registerPortalMapguardNotificationSettingsRoutes(app);
  registerPortalMapguardWave73KpiStatsRoutes(app);
}
