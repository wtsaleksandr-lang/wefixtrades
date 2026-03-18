import type { Express } from "express";
import { type Server } from "http";

import { registerMarketingRoutes } from "./marketingRoutes";
// Legacy monolith contains all remaining routes — being progressively extracted.
import { registerRoutes as registerLegacyRoutes } from "./_legacy";

/**
 * Route registration barrel.
 *
 * Extracted route modules are registered first, then the legacy monolith
 * handles everything else. As modules are extracted from _legacy.ts,
 * they get their own import + registration call here.
 *
 * Extraction order (Phase 1):
 *   [x] marketingRoutes.ts — robots, sitemap, contact, pageview
 *   [ ] calculatorRoutes.ts
 *   [ ] leadRoutes.ts
 *   [ ] dashboardRoutes.ts
 *   [ ] aiRoutes.ts
 *   [ ] bookingRoutes.ts
 *   [ ] stripeRoutes.ts
 *   [ ] domainRoutes.ts
 *   [ ] twilioRoutes.ts
 */
export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Extracted domain modules
  registerMarketingRoutes(app);

  // Legacy monolith — all remaining routes
  return registerLegacyRoutes(httpServer, app);
}
