/**
 * Portal TradeLine dashboard route registry — Wave 26.
 *
 * Bundles the four new endpoints that back the TradeLine UI upgrade
 * (TradeLineDashboard.tsx). The existing `server/routes/portal/tradeline.ts`
 * keeps the production routes (config, mode, settings, calls list,
 * widget-config) — this sibling adds:
 *
 *   GET  /api/portal/tradeline/dashboard-kpis
 *   GET  /api/portal/tradeline/active-calls
 *   GET  /api/portal/tradeline/sentiment/:callId
 *   GET  /api/portal/tradeline/funnel
 *
 * Pattern matches the Wave 24 (RankFlow) and Wave 25 (SocialSync) sibling
 * registrars (server/routes/portal/rankflow/index.ts,
 * server/routes/portal/socialsync/index.ts) — pure additive, no behaviour
 * change to existing tradeline routes.
 */

import type { Express } from "express";
import { registerPortalTradelineDashboardKpisRoutes } from "./dashboardKpis";
import { registerPortalTradelineActiveCallsRoutes } from "./activeCalls";
import { registerPortalTradelineSentimentRoutes } from "./sentiment";
import { registerPortalTradelineFunnelRoutes } from "./funnel";

export function registerPortalTradelineDashboardRoutes(app: Express) {
  registerPortalTradelineDashboardKpisRoutes(app);
  registerPortalTradelineActiveCallsRoutes(app);
  registerPortalTradelineSentimentRoutes(app);
  registerPortalTradelineFunnelRoutes(app);
}
