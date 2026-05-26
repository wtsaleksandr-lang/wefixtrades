/**
 * Portal MapGuard 1-click Action Runner — Wave 27 (refactored Wave 34).
 *
 * POST /api/portal/mapguard/run-action
 *
 * Body shape: `{ actionId: string, action: ActionId, params?: object }`
 * unchanged — this is the legacy contract still consumed by
 * client/src/pages/portal/mapguard/MapGuardDashboard.tsx. The route now
 * delegates to the universal dispatcher (server/services/aiActions/
 * dispatcher.ts) which writes the cross-product audit log row.
 *
 * Whitelisted action IDs (server-side authoritative):
 *   - schedule-gbp-post        → ContentFlow composer URL + queue post draft
 *   - request-review           → ReputationShield review-request job
 *   - fix-citation-nap         → Citation Builder NAP-fix flow URL
 *   - start-citation-campaign  → Citation Builder service upgrade URL
 *   - acknowledge              → no-op; ack the recommendation
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireClient } from "../../../auth";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";
import { dispatchAction } from "../../../services/aiActions/dispatcher";

const log = createLogger("PortalMapguardRunAction");

const ACTION_IDS = [
  "schedule-gbp-post",
  "request-review",
  "fix-citation-nap",
  "start-citation-campaign",
  "acknowledge",
] as const;

const runActionSchema = z.object({
  actionId: z.string().min(2).max(200),
  action: z.enum(ACTION_IDS),
  params: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
});

const PREVIEW_RESPONSE = {
  previewMode: true,
  ok: true as const,
  message: "Preview mode — action not executed.",
  dismissed: false,
};

export function registerPortalMapguardRunActionRoutes(app: Express) {
  app.post(
    "/api/portal/mapguard/run-action",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: PREVIEW_RESPONSE,
          mode: "write",
          action: "mapguard.run-action",
        });
        if (clientId === null) return;

        const parsed = runActionSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid body",
            details: parsed.error.flatten(),
          });
        }

        const { actionId, action, params } = parsed.data;

        const result = await dispatchAction({
          clientId,
          product: "mapguard",
          context: "portal",
          actionKey: action,
          params: params ?? {},
          triggeredBy: "user_click",
          userId: null,
          recommendationId: actionId,
        });

        if (!result.success) {
          const status =
            result.errorCode === "subscription_required" ? 403 : 400;
          return res.status(status).json({
            error: result.errorCode ?? "error",
            message: result.message,
            ...(result.resultPayload ?? {}),
          });
        }

        log.info("mapguard.run-action", {
          clientId,
          action,
          actionId,
          hasParams: !!params,
        });

        return res.json({
          ok: true,
          redirectUrl: (result.resultPayload?.redirectUrl as string) ?? undefined,
          message: result.message,
          dismissed: result.dismissed ?? false,
        });
      } catch (err: any) {
        log.error("[portal/mapguard/run-action]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
