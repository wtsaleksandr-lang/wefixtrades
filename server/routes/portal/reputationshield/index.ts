/**
 * Portal ReputationShield dashboard route registry — Wave 28.
 *
 * Bundles the new dashboard-supporting endpoints for the ReputationShield
 * UI upgrade. The existing `server/routes/portal/reputation.ts` keeps the
 * legacy /api/portal/reputation/* routes — this sibling adds:
 *
 *   GET   /api/portal/reputationshield/dashboard-kpis
 *   GET   /api/portal/reputationshield/inbox
 *   GET   /api/portal/reputationshield/funnel
 *   POST  /api/portal/reputationshield/run-action
 *   GET   /api/portal/reputationshield/notification-settings
 *   POST  /api/portal/reputationshield/notification-settings
 *   POST  /api/portal/reputationshield/reviews/:id/reply
 */

import type { Express } from "express";
import { registerPortalReputationshieldDashboardKpisRoutes } from "./dashboardKpis";
import { registerPortalReputationshieldInboxRoutes } from "./scorecard";
import { registerPortalReputationshieldFunnelRoutes } from "./funnel";
import { registerPortalReputationshieldRunActionRoutes } from "./runAction";
import { registerPortalReputationshieldNotificationSettingsRoutes } from "./notificationSettings";
import { registerPortalReputationshieldSaveReplyRoutes } from "./saveReply";

export function registerPortalReputationshieldDashboardRoutes(app: Express) {
  registerPortalReputationshieldDashboardKpisRoutes(app);
  registerPortalReputationshieldInboxRoutes(app);
  registerPortalReputationshieldFunnelRoutes(app);
  registerPortalReputationshieldRunActionRoutes(app);
  registerPortalReputationshieldNotificationSettingsRoutes(app);
  registerPortalReputationshieldSaveReplyRoutes(app);
}
