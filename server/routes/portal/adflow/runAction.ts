/**
 * Portal AdFlow 1-click Action Runner — Wave 30 (refactored Wave 34).
 *
 * POST /api/portal/adflow/run-action
 *
 * Body unchanged: `{ actionId, action, params? }`. Now delegates to the
 * universal dispatcher.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireClient } from "../../../auth";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";
import { dispatchAction } from "../../../services/aiActions/dispatcher";

const log = createLogger("PortalAdflowRunAction");

const ACTION_IDS = [
  "pause-campaign",
  "resume-campaign",
  "pause-underperforming-campaign",
  "boost-winning-campaign",
  "swap-ad-copy",
  "expand-to-new-platform",
  "approve-anomaly-pause",
  "approve-anomaly-boost",
  "investigate-anomaly",
  "acknowledge",
] as const;

const runActionSchema = z.object({
  actionId: z.string().min(1).max(200),
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

export function registerPortalAdflowRunActionRoutes(app: Express) {
  app.post(
    "/api/portal/adflow/run-action",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: PREVIEW_RESPONSE,
          mode: "write",
          action: "adflow.run-action",
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
          product: "adflow",
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
          const legacyError = /Enable SMS/i.test(result.message)
            ? "sms_opt_in_required"
            : result.errorCode === "subscription_required"
              ? "adflow_required"
              : (result.errorCode ?? "error");
          return res.status(status).json({
            error: legacyError,
            message: result.message,
            ...(result.resultPayload ?? {}),
          });
        }

        log.info("adflow.run-action", {
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
        log.error("[portal/adflow/run-action]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
