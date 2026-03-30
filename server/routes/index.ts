import type { Express } from "express";
import { type Server } from "http";
import auditRouter from "../auditRoutes";

import { registerAuthRoutes } from "./authRoutes";
import { registerMarketingRoutes } from "./marketingRoutes";
import { registerAiRoutes } from "./aiRoutes";
import { registerCalculatorRoutes } from "./calculatorRoutes";
import { registerLeadRoutes } from "./leadRoutes";
import { registerDashboardRoutes } from "./dashboardRoutes";
import { registerDomainRoutes } from "./domainRoutes";
import { registerBookingRoutes } from "./bookingRoutes";
import { registerStripeRoutes } from "./stripeRoutes";
import { registerTwilioRoutes } from "./twilioRoutes";
import { registerChatRoutes } from "./chatRoutes";
import { registerAdminRoutes } from "./adminRoutes";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use("/api/audit", auditRouter);

  registerAuthRoutes(app);
  registerMarketingRoutes(app);
  registerAiRoutes(app);
  registerCalculatorRoutes(app);
  registerLeadRoutes(app);
  registerDashboardRoutes(app);
  registerDomainRoutes(app);
  registerBookingRoutes(app);
  registerStripeRoutes(app);
  registerTwilioRoutes(app);
  registerChatRoutes(app);
  registerAdminRoutes(app);

  return httpServer;
}
