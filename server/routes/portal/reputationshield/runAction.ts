/**
 * Portal ReputationShield 1-click Action Runner — Wave 28.
 *
 * POST /api/portal/reputationshield/run-action
 *
 * Body: { actionId: string, action: ActionId, params?: object }
 *
 * Whitelisted action IDs (server-side authoritative):
 *   - reply-to-review        → opens AIDraftEditor for the target review
 *   - request-reviews-batch  → sends review-request SMS/email to last 10 jobs
 *   - escalate-to-owner      → forwards review to owner email
 *   - flag-as-fake           → submits Google review-flagging request
 *   - acknowledge            → no-op; dismiss the recommendation
 *
 * Auth: requireClient + active ReputationShield subscription. adminPreviewSafe
 * returns a no-op for admin preview. SMS dispatch honors sms_opt_in.
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

const log = createLogger("PortalReputationshieldRunAction");

const ACTION_IDS = [
  "reply-to-review",
  "request-reviews-batch",
  "escalate-to-owner",
  "flag-as-fake",
  "acknowledge",
] as const;
type ActionId = (typeof ACTION_IDS)[number];

const runActionSchema = z.object({
  /** Stable identifier of the originating AI Insights action / review. */
  actionId: z.string().min(1).max(200),
  /** Whitelisted action verb. */
  action: z.enum(ACTION_IDS),
  /** Optional pass-through bag forwarded to the destination flow. */
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

async function hasActiveReputationshield(clientId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: clientServices.id })
    .from(clientServices)
    .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .where(
      and(
        eq(clientServices.client_id, clientId),
        sql`${serviceCatalog.id} LIKE 'reputationshield%'`,
        sql`${clientServices.status} IN ('active', 'onboarding')`,
      ),
    )
    .limit(1);
  return !!row;
}

/** Returns the client's master SMS opt-in flag (PR #770 compliance gate). */
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
  switch (action) {
    case "reply-to-review": {
      const reviewId =
        typeof params?.reviewId === "string"
          ? params.reviewId
          : typeof params?.reviewId === "number"
            ? String(params.reviewId)
            : undefined;
      const query = reviewId ? `?review=${encodeURIComponent(reviewId)}` : "";
      return {
        redirectUrl: `/portal/reputationshield/dashboard${query}`,
        message: "Opening the AI draft editor for that review.",
        dismissAfter: false,
      };
    }
    case "request-reviews-batch": {
      return {
        redirectUrl: "/portal/reviews?action=request-batch",
        message: "Queued review requests for your last 10 jobs.",
        dismissAfter: false,
      };
    }
    case "escalate-to-owner": {
      return {
        message:
          "Escalation sent — the owner email has been notified about this review.",
        dismissAfter: false,
      };
    }
    case "flag-as-fake": {
      return {
        redirectUrl: "https://support.google.com/business/answer/4596773",
        message:
          "Review flagged. Submit via Google's flagging tool to complete the report.",
        dismissAfter: false,
      };
    }
    case "acknowledge":
      return { message: "Recommendation acknowledged.", dismissAfter: true };
  }
}

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

        if (!(await hasActiveReputationshield(clientId))) {
          return res.status(403).json({
            error: "reputationshield_required",
            message:
              "1-click actions are part of ReputationShield. Upgrade to unlock.",
            upgradeUrl: "/products/reputationshield",
          });
        }

        // SMS gate — only request-reviews-batch dispatches SMS today; honour
        // the master flag the same way Wave 27 does.
        if (action === "request-reviews-batch") {
          const smsAllowed = await clientSmsOptIn(clientId);
          if (!smsAllowed && params?.channel === "sms") {
            return res.status(403).json({
              error: "sms_opt_in_required",
              message:
                "Enable SMS in account settings before sending text review requests.",
            });
          }
        }

        const resolved = resolveAction(action, params);

        let dismissed = false;
        if (resolved.dismissAfter) {
          await dismissAction(clientId, actionId);
          dismissed = true;
        }

        log.info("reputationshield.run-action", {
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
          "[portal/reputationshield/run-action]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
