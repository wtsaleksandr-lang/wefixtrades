/**
 * Wave 34 — MapGuard action handler (extracted from
 * server/routes/portal/mapguard/runAction.ts).
 *
 * Subscription check + per-action resolution lives here. The dispatcher
 * owns whitelist + audit log; the legacy `/api/portal/mapguard/run-action`
 * route now delegates to the dispatcher which routes back into this
 * function — same behavior, single source of truth.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../db";
import { clientServices, serviceCatalog } from "@shared/schema";
import { dismissAction } from "../../aiInsights/cache";
import type { AIAction } from "@shared/aiActions";
import type { DispatchInput, DispatchResult } from "../dispatcher";

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

export async function handleMapguardAction(
  action: AIAction,
  input: DispatchInput,
): Promise<DispatchResult> {
  if (input.clientId === null) {
    return {
      success: false,
      message: "MapGuard actions require a customer context.",
      errorCode: "invalid_params",
    };
  }
  if (!(await hasActiveMapguard(input.clientId))) {
    return {
      success: false,
      message:
        "1-click actions are part of MapGuard. Upgrade to unlock.",
      resultPayload: { upgradeUrl: "/products/mapguard" },
      errorCode: "subscription_required",
    };
  }

  const params = input.params as Record<string, string | number | boolean>;
  let redirectUrl: string | undefined;
  let message: string;
  let dismissAfter = false;

  switch (action.key) {
    case "schedule-gbp-post": {
      const topic =
        typeof params?.topic === "string" ? params.topic : undefined;
      const query = topic ? `?prefill=${encodeURIComponent(topic)}` : "";
      redirectUrl = `/portal/contentflow/dashboard${query}`;
      message = "Opening ContentFlow with your GBP post draft.";
      break;
    }
    case "request-review":
      redirectUrl = "/portal/reviews?action=request-batch";
      message = "Queued review requests for your last jobs.";
      break;
    case "fix-citation-nap": {
      const directory =
        typeof params?.directory === "string" ? params.directory : undefined;
      const query = directory
        ? `?directory=${encodeURIComponent(directory)}`
        : "";
      redirectUrl = `/portal/citation-builder${query}`;
      message = "Opening Citation Builder with the NAP correction pre-filled.";
      break;
    }
    case "start-citation-campaign":
      redirectUrl = "/portal/services?upgrade=citation-builder";
      message = "Routing you to the Citation Builder service upgrade.";
      break;
    case "acknowledge":
      message = "Recommendation acknowledged.";
      dismissAfter = true;
      break;
    default:
      return {
        success: false,
        message: `Unhandled MapGuard action "${action.key}".`,
        errorCode: "not_whitelisted",
      };
  }

  let dismissed = false;
  if (dismissAfter && input.recommendationId) {
    try {
      await dismissAction(input.clientId, input.recommendationId);
      dismissed = true;
    } catch {
      // best-effort — audit log captures the failure.
    }
  }

  return {
    success: true,
    message,
    resultPayload: redirectUrl ? { redirectUrl } : undefined,
    dismissed,
  };
}
