/**
 * Portal SocialSync dashboard route registry — Wave 25.
 *
 * Bundles the four new dashboard-supporting endpoints introduced in the
 * SocialSync UI upgrade. The existing `server/routes/portal/socialsync.ts`
 * (which exports `registerPortalSocialsyncRoutes`) keeps the production
 * routes (profile, posts, pending, approve/reject/edit, connections,
 * settings, facebook-page, WhatsApp send) — this sibling adds:
 *
 *   GET   /api/portal/socialsync/dashboard-kpis
 *   GET   /api/portal/socialsync/approvals
 *   POST  /api/portal/socialsync/approvals/:id/regenerate
 *   GET   /api/portal/socialsync/calendar
 *   PATCH /api/portal/socialsync/calendar/:id/reschedule
 *   GET   /api/portal/socialsync/best-time-scores
 */

import type { Express } from "express";
import { registerPortalSocialsyncDashboardKpisRoutes } from "./dashboardKpis";
import { registerPortalSocialsyncApprovalsRoutes } from "./approvals";
import { registerPortalSocialsyncCalendarRoutes } from "./calendar";
import { registerPortalSocialsyncBestTimeScoresRoutes } from "./bestTimeScores";

export function registerPortalSocialsyncDashboardRoutes(app: Express) {
  registerPortalSocialsyncDashboardKpisRoutes(app);
  registerPortalSocialsyncApprovalsRoutes(app);
  registerPortalSocialsyncCalendarRoutes(app);
  registerPortalSocialsyncBestTimeScoresRoutes(app);
}
