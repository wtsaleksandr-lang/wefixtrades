/**
 * Portal WebCare dashboard route registry — Wave 31.
 *
 * Bundles the new dashboard-supporting endpoints for the WebCare UI
 * upgrade:
 *
 *   GET  /api/portal/webcare/dashboard-kpis
 *   GET  /api/portal/webcare/maintenance-log
 *   GET  /api/portal/webcare/site-inventory
 *   POST /api/portal/webcare/run-action
 *   GET  /api/portal/webcare/notification-settings
 *   POST /api/portal/webcare/notification-settings
 *
 * Mounted alongside the legacy webcare-related admin/portal routes in
 * `portalRoutes.ts` so the dashboard surface resolves first.
 */

import type { Express } from "express";
import { registerPortalWebcareDashboardKpisRoutes } from "./dashboardKpis";
import { registerPortalWebcareMaintenanceLogRoutes } from "./maintenanceLog";
import { registerPortalWebcareSiteInventoryRoutes } from "./siteInventory";
import { registerPortalWebcareRunActionRoutes } from "./runAction";
import { registerPortalWebcareNotificationSettingsRoutes } from "./notificationSettings";
import { registerPortalWebcareWave73KpiStatsRoutes } from "./wave73KpiStats";

export function registerPortalWebcareDashboardRoutes(app: Express) {
  registerPortalWebcareDashboardKpisRoutes(app);
  registerPortalWebcareMaintenanceLogRoutes(app);
  registerPortalWebcareSiteInventoryRoutes(app);
  registerPortalWebcareRunActionRoutes(app);
  registerPortalWebcareNotificationSettingsRoutes(app);
  registerPortalWebcareWave73KpiStatsRoutes(app);
}
