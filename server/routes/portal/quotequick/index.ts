/**
 * Portal QuoteQuick dashboard route registry — Wave 29.
 *
 * Bundles the new dashboard-supporting endpoints for the QuoteQuick UI
 * upgrade. The existing `server/routes/portal/quotequick.ts` keeps the
 * legacy summary + leads endpoints — this sibling adds:
 *
 *   GET   /api/portal/quotequick/dashboard-kpis
 *   GET   /api/portal/quotequick/templates/:id/conversion
 *   GET   /api/portal/quotequick/brand-settings
 *   POST  /api/portal/quotequick/brand-settings
 *   POST  /api/portal/quotequick/run-action
 *   GET   /api/portal/quotequick/notification-settings
 *   POST  /api/portal/quotequick/notification-settings
 *   GET   /api/quotequick/quote/:token/stream    (SSE — live-editable quote)
 */

import type { Express } from "express";
import { registerPortalQuotequickDashboardKpisRoutes } from "./dashboardKpis";
import { registerPortalQuotequickConversionFunnelRoutes } from "./conversionFunnel";
import { registerPortalQuotequickBrandSettingsRoutes } from "./brandSettings";
import { registerPortalQuotequickRunActionRoutes } from "./runAction";
import { registerPortalQuotequickNotificationSettingsRoutes } from "./notificationSettings";
import { registerPortalQuotequickLiveStreamRoutes } from "./liveStream";
import { registerPortalQuotequickWave73KpiStatsRoutes } from "./wave73KpiStats";

export function registerPortalQuotequickDashboardRoutes(app: Express) {
  registerPortalQuotequickDashboardKpisRoutes(app);
  registerPortalQuotequickConversionFunnelRoutes(app);
  registerPortalQuotequickBrandSettingsRoutes(app);
  registerPortalQuotequickRunActionRoutes(app);
  registerPortalQuotequickNotificationSettingsRoutes(app);
  registerPortalQuotequickLiveStreamRoutes(app);
  registerPortalQuotequickWave73KpiStatsRoutes(app);
}
