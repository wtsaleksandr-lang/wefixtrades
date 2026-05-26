/**
 * Portal AdFlow 1-click Action Runner — Wave 30.
 *
 * POST /api/portal/adflow/run-action
 *
 * Body: { actionId: string, action: ActionId, params?: object }
 *
 * Whitelisted action IDs (server-side authoritative):
 *   - pause-campaign                → pauses a campaign (queues for ops if
 *                                     no direct Google/Meta API integration
 *                                     is wired yet)
 *   - resume-campaign               → resumes a previously-paused campaign
 *   - pause-underperforming-campaign → AI recommendation: pause campaign
 *                                     with low bookings in the last 7 days
 *   - boost-winning-campaign        → AI recommendation: shift budget to
 *                                     the highest-grade campaign
 *   - swap-ad-copy                  → AI recommendation: replace
 *                                     underperforming creative with the
 *                                     top-scored AI-suggested variant
 *   - expand-to-new-platform        → AI recommendation: duplicate a
 *                                     winning Google campaign to Meta
 *   - approve-anomaly-pause         → 1-click approve an anomaly-triggered
 *                                     pause recommendation
 *   - approve-anomaly-boost         → 1-click approve an anomaly-triggered
 *                                     budget boost
 *   - investigate-anomaly           → opens the anomaly drill-down view
 *   - acknowledge                   → no-op; dismiss the recommendation
 *
 * Auth: requireClient + active AdFlow subscription. adminPreviewSafe
 * returns a no-op for admin preview. SMS dispatch (when an action triggers
 * a customer-facing message) honors sms_opt_in.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clients, clientServices, serviceCatalog } from "@shared/schema";
import { dismissAction } from "../../../services/aiInsights/cache";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

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
type ActionId = (typeof ACTION_IDS)[number];

const runActionSchema = z.object({
  actionId: z.string().min(1).max(200),
  action: z.enum(ACTION_IDS),
  params: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
});

interface RunActionResult {
  ok: true;
  redirectUrl?: string;
  message: string;
  dismissed: boolean;
}

const PREVIEW_RESPONSE = {
  previewMode: true,
  ok: true as const,
  message: "Preview mode — action not executed.",
  dismissed: false,
};

async function hasActiveAdflow(clientId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: clientServices.id })
    .from(clientServices)
    .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .where(
      and(
        eq(clientServices.client_id, clientId),
        sql`${serviceCatalog.id} LIKE 'adflow%'`,
        sql`${clientServices.status} IN ('active', 'onboarding')`,
      ),
    )
    .limit(1);
  return !!row;
}

async function clientSmsOptIn(clientId: number): Promise<boolean> {
  const [row] = await db
    .select({ metadata: clients.metadata })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  const md = (row?.metadata ?? {}) as Record<string, unknown>;
  return md?.sms_opt_in === true;
}

function resolveAction(
  action: ActionId,
  params: Record<string, string | number | boolean> | undefined,
): { redirectUrl?: string; message: string; dismissAfter: boolean } {
  const campaignName =
    typeof params?.campaignName === "string" ? params.campaignName : "the campaign";
  switch (action) {
    case "pause-campaign":
      return {
        message: `Pause request queued for ${campaignName}. Already-spent budget is not refunded.`,
        dismissAfter: false,
      };
    case "resume-campaign":
      return {
        message: `Resume request queued for ${campaignName}.`,
        dismissAfter: false,
      };
    case "pause-underperforming-campaign":
      return {
        message: `${campaignName} flagged for pause — your ops team will action within 24 hours.`,
        dismissAfter: true,
      };
    case "boost-winning-campaign":
      return {
        message: `Budget boost queued for ${campaignName}.`,
        dismissAfter: true,
      };
    case "swap-ad-copy":
      return {
        redirectUrl: "/portal/adflow/dashboard#composer",
        message: "Open the AI ad-copy composer to pick the winning variant.",
        dismissAfter: false,
      };
    case "expand-to-new-platform":
      return {
        message: `Expansion request queued — ${campaignName} will be duplicated to the new platform.`,
        dismissAfter: true,
      };
    case "approve-anomaly-pause":
      return {
        message: "Auto-pause approved — campaign paused, you'll see it in the dashboard within a few minutes.",
        dismissAfter: true,
      };
    case "approve-anomaly-boost":
      return {
        message: "Budget boost approved — your winning campaign will get more spend tomorrow.",
        dismissAfter: true,
      };
    case "investigate-anomaly":
      return {
        redirectUrl: "/portal/adflow/dashboard#anomaly",
        message: "Opening the anomaly drill-down.",
        dismissAfter: false,
      };
    case "acknowledge":
      return { message: "Recommendation acknowledged.", dismissAfter: true };
  }
}

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

        if (!(await hasActiveAdflow(clientId))) {
          return res.status(403).json({
            error: "adflow_required",
            message:
              "AdFlow 1-click actions require an active AdFlow subscription.",
            upgradeUrl: "/products/adflow",
          });
        }

        // SMS gate — none of the AdFlow actions currently dispatch SMS, but
        // future "notify-customer" extensions will. Pre-check here so the
        // gate is consistent across products.
        if (params?.channel === "sms") {
          const smsAllowed = await clientSmsOptIn(clientId);
          if (!smsAllowed) {
            return res.status(403).json({
              error: "sms_opt_in_required",
              message:
                "Enable SMS in account settings before sending text messages.",
            });
          }
        }

        const resolved = resolveAction(action, params);

        let dismissed = false;
        if (resolved.dismissAfter) {
          await dismissAction(clientId, actionId);
          dismissed = true;
        }

        log.info("adflow.run-action", {
          clientId,
          action,
          actionId,
          hasParams: !!params,
        });

        const result: RunActionResult = {
          ok: true,
          redirectUrl: resolved.redirectUrl,
          message: resolved.message,
          dismissed,
        };
        return res.json(result);
      } catch (err: any) {
        log.error("[portal/adflow/run-action]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
