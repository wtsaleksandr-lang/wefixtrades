/**
 * QuoteQuick Public API v1 (Wave AJ-6).
 *
 * Mount point for the FIRST consumer-facing API surface. All endpoints
 * are scoped to the authenticated `req.apiUser.id` (set by the
 * `apiKeyAuth` middleware from Wave AJ-2). The `/v1` segment is the
 * version — future breaking changes go in `/v2` and `/v1` will be
 * maintained for at least 12 months after `/v2` releases.
 *
 * Mounting order:
 *   1. requestId — assigns req.requestId + X-Request-Id response header.
 *   2. apiKeyAuth — validates Bearer token, sets req.apiUser/req.apiKey,
 *      decrements quota + token bucket, hooks res.end for usage logging.
 *   3. Sub-routers (calculators, submissions, embeds, webhooks,
 *      templates, me).
 */
import { Router, type Express } from "express";
import { apiKeyAuth } from "../../middleware/apiKeyAuth";
import { requestId } from "../../middleware/requestId";
import { registerV1CalculatorsRoutes } from "./calculatorsRoutes";
import { registerV1SubmissionsRoutes } from "./submissionsRoutes";
import { registerV1EmbedsRoutes } from "./embedsRoutes";
import { registerV1WebhooksRoutes } from "./webhooksRoutes";
import { registerV1TemplatesRoutes } from "./templatesRoutes";
import { registerV1MeRoutes } from "./meRoutes";

export function registerApiV1Routes(app: Express): void {
  const router = Router();

  // requestId BEFORE apiKeyAuth so 401/403 responses also carry an id.
  router.use(requestId);
  router.use(apiKeyAuth);

  registerV1CalculatorsRoutes(router);
  registerV1SubmissionsRoutes(router);
  registerV1EmbedsRoutes(router);
  registerV1WebhooksRoutes(router);
  registerV1TemplatesRoutes(router);
  registerV1MeRoutes(router);

  app.use("/api/v1", router);
}
