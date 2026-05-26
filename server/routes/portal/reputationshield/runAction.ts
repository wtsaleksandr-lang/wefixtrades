/**
 * Portal ReputationShield 1-click Action Runner — Wave 28 (refactored Wave 34).
 *
 * POST /api/portal/reputationshield/run-action
 *
 * Body unchanged: `{ actionId, action, params? }`. Now delegates to the
 * universal dispatcher.
 *
 * Whitelisted action IDs (server-side authoritative):
 *   - reply-to-review        → opens AIDraftEditor for the target review
 *   - request-reviews-batch  → sends review-request SMS/email to last 10 jobs
 *   - escalate-to-owner      → forwards review to owner email
 *   - flag-as-fake           → submits Google review-flagging request
 *   - acknowledge            → dismiss the recommendation
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireClient } from "../../../auth";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";
import { dispatchAction } from "../../../services/aiActions/dispatcher";

const log = createLogger("PortalReputationshieldRunAction");

const ACTION_IDS = [
  "reply-to-review",
  "request-reviews-batch",
  "escalate-to-owner",
  "flag-as-fake",
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

export function registerPortalReputationshieldRunActionRoutes(app: Express) {
  app.post(
    "/api/portal/reputationshield/run-action",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: PREVIEW_RESPONSE,
          mode: "write",
          action: "reputationshield.run-action",
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
          product: "reputationshield",
          context: "portal",
          actionKey: action,
          params: params ?? {},
          triggeredBy: "user_click",
          userId: null,
          recommendationId: actionId,
        });

        if (!result.success) {
          // Preserve legacy error codes (sms_opt_in_required, reputationshield_required)
          // by mapping the dispatcher's errorCode + message back to the
          // status code consumers expect.
          const status =
            result.errorCode === "subscription_required" ? 403 : 400;
          // Frontend distinguishes "sms_opt_in_required" by string match.
          const legacyError = /Enable SMS/i.test(result.message)
            ? "sms_opt_in_required"
            : result.errorCode === "subscription_required"
              ? "reputationshield_required"
              : (result.errorCode ?? "error");
          return res.status(status).json({
            error: legacyError,
            message: result.message,
            ...(result.resultPayload ?? {}),
          });
        }

        log.info("reputationshield.run-action", {
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
        log.error(
          "[portal/reputationshield/run-action]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
