/**
 * Portal WebCare 1-click Action Runner — Wave 31 (refactored Wave 34).
 *
 * POST /api/portal/webcare/run-action
 *
 * Body unchanged: `{ actionId, action, params? }`. Now delegates to the
 * universal dispatcher. The handler in
 * server/services/aiActions/handlers/webcare.ts still writes one row to
 * `webcare_action_log` per non-acknowledge action so the Maintenance Log
 * Inbox reflects it immediately.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireClient } from "../../../auth";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";
import { dispatchAction } from "../../../services/aiActions/dispatcher";

const log = createLogger("PortalWebcareRunAction");

const ACTION_IDS = [
  "apply-all-pending-updates",
  "clean-malware",
  "harden-security",
  "optimize-performance",
  "run-backup-now",
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

export function registerPortalWebcareRunActionRoutes(app: Express) {
  app.post(
    "/api/portal/webcare/run-action",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: PREVIEW_RESPONSE,
          mode: "write",
          action: "webcare.run-action",
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
          product: "webcare",
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
          const legacyError =
            result.errorCode === "subscription_required"
              ? "webcare_required"
              : (result.errorCode ?? "error");
          return res.status(status).json({
            error: legacyError,
            message: result.message,
            ...(result.resultPayload ?? {}),
          });
        }

        log.info("webcare.run-action", {
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
        log.error("[portal/webcare/run-action]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
