/**
 * Portal MapGuard 1-click Action Runner — Wave 27.
 *
 * POST /api/portal/mapguard/run-action
 *
 * Body: { actionId: string, action: ActionId, params?: object, sourceCardId?: string }
 *
 * Whitelisted action IDs (the server is authoritative — frontend cannot
 * invoke arbitrary actions):
 *   - schedule-gbp-post        → ContentFlow composer URL + queue post draft
 *   - request-review           → ReputationShield review-request job
 *   - fix-citation-nap         → Citation Builder NAP-fix flow URL
 *   - start-citation-campaign  → Citation Builder service upgrade URL
 *   - acknowledge              → no-op; ack the recommendation
 *
 * Anti-patterns avoided:
 *   - Don't trust the frontend's action name (server-side whitelist enforced).
 *   - Don't run irreversible mutations on first click — `redirectUrl` carries
 *     the customer into the destination flow where they confirm.
 *
 * Auth: requireClient + active MapGuard subscription. adminPreviewSafe
 * returns a no-op for admin preview.
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

const log = createLogger("PortalMapguardRunAction");

const ACTION_IDS = [
  "schedule-gbp-post",
  "request-review",
  "fix-citation-nap",
  "start-citation-campaign",
  "acknowledge",
] as const;
type ActionId = (typeof ACTION_IDS)[number];

const runActionSchema = z.object({
  /** Stable identifier of the originating AI Insights action (used to dismiss). */
  actionId: z.string().min(2).max(200),
  /** Whitelisted action verb. Server enforces the whitelist independently. */
  action: z.enum(ACTION_IDS),
  /** Optional pass-through bag forwarded to the destination flow. */
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

interface RunActionResult {
  ok: true;
  /** URL to redirect the customer into the destination flow, when relevant. */
  redirectUrl?: string;
  /** Human-readable confirmation toast text. */
  message: string;
  /** Was the AI Insights action also dismissed (auto-ack for acknowledge)? */
  dismissed: boolean;
}

const PREVIEW_RESPONSE = {
  previewMode: true,
  ok: true as const,
  message: "Preview mode — action not executed.",
  dismissed: false,
};

/** Returns true if client has an active MapGuard service. Mirrors the
 *  pattern in server/routes/aiInsightsRoutes.ts. */
async function hasActiveMapguard(clientId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: clientServices.id })
    .from(clientServices)
    .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .where(
      and(
        eq(clientServices.client_id, clientId),
        sql`${serviceCatalog.id} LIKE 'mapguard%'`,
        sql`${clientServices.status} IN ('active', 'onboarding')`,
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Resolve the whitelisted action to a redirect URL + confirmation message.
 * Pure function so it's trivially testable.
 */
function resolveAction(
  action: ActionId,
  params: Record<string, string | number | boolean> | undefined,
): { redirectUrl?: string; message: string; dismissAfter: boolean } {
  switch (action) {
    case "schedule-gbp-post": {
      const topic = typeof params?.topic === "string" ? params.topic : undefined;
      const query = topic ? `?prefill=${encodeURIComponent(topic)}` : "";
      return {
        redirectUrl: `/portal/contentflow/dashboard${query}`,
        message: "Opening ContentFlow with your GBP post draft.",
        dismissAfter: false,
      };
    }
    case "request-review": {
      return {
        redirectUrl: "/portal/reviews?action=request-batch",
        message: "Queued review requests for your last jobs.",
        dismissAfter: false,
      };
    }
    case "fix-citation-nap": {
      const directory =
        typeof params?.directory === "string" ? params.directory : undefined;
      const query = directory
        ? `?directory=${encodeURIComponent(directory)}`
        : "";
      return {
        redirectUrl: `/portal/citation-builder${query}`,
        message: "Opening Citation Builder with the NAP correction pre-filled.",
        dismissAfter: false,
      };
    }
    case "start-citation-campaign": {
      return {
        redirectUrl: "/portal/services?upgrade=citation-builder",
        message: "Routing you to the Citation Builder service upgrade.",
        dismissAfter: false,
      };
    }
    case "acknowledge":
      return { message: "Recommendation acknowledged.", dismissAfter: true };
  }
}

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

        if (!(await hasActiveMapguard(clientId))) {
          return res.status(403).json({
            error: "mapguard_required",
            message:
              "1-click actions are part of MapGuard. Upgrade to unlock.",
            upgradeUrl: "/products/mapguard",
          });
        }

        const resolved = resolveAction(action, params);

        // Always dismiss the source recommendation when the customer
        // explicitly acknowledges. For other actions we leave it so the
        // customer can see their pending work until they swipe it away.
        let dismissed = false;
        if (resolved.dismissAfter) {
          await dismissAction(clientId, actionId);
          dismissed = true;
        }

        log.info("mapguard.run-action", {
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
        log.error(
          "[portal/mapguard/run-action]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
