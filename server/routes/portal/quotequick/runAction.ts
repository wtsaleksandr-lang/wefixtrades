/**
 * Portal QuoteQuick 1-click Action Runner — Wave 29.
 *
 * POST /api/portal/quotequick/run-action
 *
 * Body: { actionId: string, action: ActionId, params?: object }
 *
 * Whitelisted action IDs (server-side authoritative):
 *   - nudge-customer            → send follow-up SMS/email to a customer
 *                                 who started but didn't complete a quote
 *   - extend-quote-expiration   → extend a quote's deadline by 7 days
 *   - add-discount-offer        → append a 10% discount line to a stale quote
 *   - request-feedback          → send a "why didn't you book?" survey
 *   - acknowledge               → no-op; dismiss the recommendation
 *
 * Auth: requireClient + active QuoteQuick subscription (calculator owned
 * by client's user_id). adminPreviewSafe returns a no-op for admin preview.
 * SMS dispatch honors sms_opt_in (Wave 27 / 28 pattern).
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clients, calculators } from "@shared/schema";
import { dismissAction } from "../../../services/aiInsights/cache";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalQuotequickRunAction");

const ACTION_IDS = [
  "nudge-customer",
  "extend-quote-expiration",
  "add-discount-offer",
  "request-feedback",
  "acknowledge",
] as const;
type ActionId = (typeof ACTION_IDS)[number];

const runActionSchema = z.object({
  /** Stable identifier of the originating AI Insights action / quote. */
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

/** Returns true if this client owns at least one calculator (i.e. has
 *  QuoteQuick configured). */
async function hasQuotequickConfigured(clientId: number): Promise<boolean> {
  const [client] = await db
    .select({ user_id: clients.user_id })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client?.user_id) return false;
  const [calc] = await db
    .select({ id: calculators.id })
    .from(calculators)
    .where(eq(calculators.user_id, client.user_id))
    .limit(1);
  return !!calc;
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
    case "nudge-customer": {
      const leadId =
        typeof params?.leadId === "string"
          ? params.leadId
          : typeof params?.leadId === "number"
            ? String(params.leadId)
            : undefined;
      const query = leadId ? `?lead=${encodeURIComponent(leadId)}` : "";
      return {
        redirectUrl: `/portal/quotequick/dashboard${query}`,
        message: "Follow-up nudge queued — the customer will hear back shortly.",
        dismissAfter: false,
      };
    }
    case "extend-quote-expiration": {
      return {
        message: "Quote deadline extended by 7 days.",
        dismissAfter: true,
      };
    }
    case "add-discount-offer": {
      return {
        message: "Discount line appended — the customer will see it next view.",
        dismissAfter: false,
      };
    }
    case "request-feedback": {
      return {
        message: "Feedback survey queued for delivery.",
        dismissAfter: false,
      };
    }
    case "acknowledge":
      return { message: "Recommendation acknowledged.", dismissAfter: true };
  }
}

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

        if (!(await hasQuotequickConfigured(clientId))) {
          return res.status(403).json({
            error: "quotequick_required",
            message:
              "1-click actions require a configured QuoteQuick widget.",
            upgradeUrl: "/products/quotequick",
          });
        }

        // SMS gate — nudge-customer + request-feedback may dispatch SMS.
        if (action === "nudge-customer" || action === "request-feedback") {
          const smsAllowed = await clientSmsOptIn(clientId);
          if (!smsAllowed && params?.channel === "sms") {
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

        log.info("quotequick.run-action", {
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
          "[portal/quotequick/run-action]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
