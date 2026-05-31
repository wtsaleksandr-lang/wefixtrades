/**
 * Wave 34 — ReputationShield action handler (extracted from
 * server/routes/portal/reputationshield/runAction.ts).
 *
 * Subscription + SMS-opt-in checks identical to Wave 28; only the
 * plumbing changed.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../db";
import { clients, clientServices, serviceCatalog } from "@shared/schema";
import { dismissAction } from "../../aiInsights/cache";
import type { AIAction } from "@shared/aiActions";
import type { DispatchInput, DispatchResult } from "../dispatcher";

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

async function clientSmsOptIn(clientId: number): Promise<boolean> {
  const [row] = await db
    .select({ metadata: clients.metadata })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  const md = (row?.metadata ?? {}) as Record<string, unknown>;
  return md?.sms_opt_in === true;
}

export async function handleReputationshieldAction(
  action: AIAction,
  input: DispatchInput,
): Promise<DispatchResult> {
  if (input.clientId === null) {
    return {
      success: false,
      message: "ReputationShield actions require a customer context.",
      errorCode: "invalid_params",
    };
  }
  if (!(await hasActiveReputationshield(input.clientId))) {
    return {
      success: false,
      message:
        "1-click actions are part of ReputationShield. Upgrade to unlock.",
      resultPayload: { upgradeUrl: "/products/reputationshield" },
      errorCode: "subscription_required",
    };
  }

  const params = input.params as Record<string, string | number | boolean>;

  // SMS gate — only the batch-request currently dispatches SMS.
  if (action.key === "request-reviews-batch" && params?.channel === "sms") {
    const smsAllowed = await clientSmsOptIn(input.clientId);
    if (!smsAllowed) {
      return {
        success: false,
        message:
          "Enable SMS in account settings before sending text review requests.",
        errorCode: "subscription_required",
      };
    }
  }

  let redirectUrl: string | undefined;
  let message: string;
  let dismissAfter = false;

  switch (action.key) {
    case "reply-to-review": {
      const reviewId =
        typeof params?.reviewId === "string"
          ? params.reviewId
          : typeof params?.reviewId === "number"
            ? String(params.reviewId)
            : undefined;
      const query = reviewId ? `?review=${encodeURIComponent(reviewId)}` : "";
      redirectUrl = `/portal/reputationshield/dashboard${query}`;
      message = "Opening the AI draft editor for that review.";
      break;
    }
    case "request-reviews-batch":
      redirectUrl = "/portal/reviews?action=request-batch";
      message = "Opening the review-request tool.";
      break;
    case "escalate-to-owner":
      redirectUrl = "/portal/reputationshield/dashboard";
      message = "Opening this review so you can escalate it to the owner.";
      break;
    case "flag-as-fake":
      redirectUrl = "https://support.google.com/business/answer/4596773";
      message =
        "Opening Google's review-flagging tool — submit there to report it.";
      break;
    case "acknowledge":
      message = "Recommendation acknowledged.";
      dismissAfter = true;
      break;
    default:
      return {
        success: false,
        message: `Unhandled ReputationShield action "${action.key}".`,
        errorCode: "not_whitelisted",
      };
  }

  let dismissed = false;
  if (dismissAfter && input.recommendationId) {
    try {
      await dismissAction(input.clientId, input.recommendationId);
      dismissed = true;
    } catch {
      /* best-effort */
    }
  }

  return {
    success: true,
    message,
    resultPayload: redirectUrl ? { redirectUrl } : undefined,
    dismissed,
  };
}
