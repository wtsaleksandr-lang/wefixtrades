/**
 * Portal QuoteQuick 1-click Action Runner — Wave 29 (refactored Wave 34).
 *
 * POST /api/portal/quotequick/run-action
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

const log = createLogger("PortalQuotequickRunAction");

const ACTION_IDS = [
  "nudge-customer",
  "extend-quote-expiration",
  "add-discount-offer",
  "request-feedback",
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

export function registerPortalQuotequickRunActionRoutes(app: Express) {
  app.post(
    "/api/portal/quotequick/run-action",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: PREVIEW_RESPONSE,
          mode: "write",
          action: "quotequick.run-action",
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
          product: "quotequick",
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
              ? "quotequick_required"
              : (result.errorCode ?? "error");
          return res.status(status).json({
            error: legacyError,
            message: result.message,
            ...(result.resultPayload ?? {}),
          });
        }

        log.info("quotequick.run-action", {
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
        log.error("[portal/quotequick/run-action]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
