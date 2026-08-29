/**
 * Wave 34 — AdFlow action handler (extracted from
 * server/routes/portal/adflow/runAction.ts).
 *
 * HONESTY CONTRACT (see the guard in adflow.test.ts)
 * ---------------------------------------------------
 * WeFixTrades has NO ad-platform integration. There is no Google Ads or Meta
 * Ads API client anywhere in this codebase, no OAuth to an ad account, and no
 * write path to any campaign. AdFlow metrics are typed in by hand by ops
 * (see server/jobs/adflowMetricsCheckWorker.ts, which nags for exactly that).
 *
 * So NO action here may claim a campaign changed state. This handler used to
 * reply "Auto-pause approved — campaign paused, you'll see it in the dashboard
 * within a few minutes" while doing nothing whatsoever: no task, no email, no
 * ops notification, and a campaign status the dashboard reads out of a
 * hand-typed JSON blob that would keep saying "Active" forever.
 *
 * Every request-shaped action now creates a REAL fulfillment task, so the
 * words "request logged / your team will action it" are true. The copy states
 * plainly that nothing on the live campaign has changed yet.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../db";
import { clients, clientServices, serviceCatalog } from "@shared/schema";
import { storage } from "../../../storage";
import { dismissAction } from "../../aiInsights/cache";
import { createLogger } from "../../../lib/logger";
import type { AIAction } from "@shared/aiActions";
import type { DispatchInput, DispatchResult } from "../dispatcher";

const log = createLogger("AiActionsAdflowHandler");

async function activeAdflowCs(clientId: number): Promise<number | null> {
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
  return row?.id ?? null;
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

export async function handleAdflowAction(
  action: AIAction,
  input: DispatchInput,
): Promise<DispatchResult> {
  if (input.clientId === null) {
    return {
      success: false,
      message: "AdFlow actions require a customer context.",
      errorCode: "invalid_params",
    };
  }
  const csId = await activeAdflowCs(input.clientId);
  if (csId === null) {
    return {
      success: false,
      message:
        "AdFlow 1-click actions require an active AdFlow subscription.",
      resultPayload: { upgradeUrl: "/products/adflow" },
      errorCode: "subscription_required",
    };
  }

  const params = input.params as Record<string, string | number | boolean>;

  // SMS gate — none of the current actions trigger SMS, but the original
  // Wave 30 handler had the gate pre-armed for future "notify-customer"
  // variants. Keep the parity so audit logging is consistent.
  if (params?.channel === "sms") {
    const smsAllowed = await clientSmsOptIn(input.clientId);
    if (!smsAllowed) {
      return {
        success: false,
        message:
          "Enable SMS in account settings before sending text messages.",
        errorCode: "subscription_required",
      };
    }
  }

  const campaignName =
    typeof params?.campaignName === "string"
      ? params.campaignName
      : "the campaign";

  let redirectUrl: string | undefined;
  let message: string;
  let dismissAfter = false;
  /**
   * Set for actions that ask a human to change a live campaign. Creates a
   * fulfillment task; the confirmation only ever promises the request was
   * logged, never that the campaign changed.
   */
  let request: { title: string; detail: string } | null = null;

  // Shared suffix so no confirmation can imply an automated platform change.
  const NOT_YET_LIVE = "Nothing has changed on your live campaign yet.";

  switch (action.key) {
    case "pause-campaign":
      request = {
        title: `Pause campaign — ${campaignName}`,
        detail: `Client requested a pause of "${campaignName}" from the AdFlow dashboard. Pause it in the ad platform and update the campaign status in the next metrics entry.`,
      };
      message = `Pause request logged for ${campaignName}. Your ads team applies it manually — ${NOT_YET_LIVE} Already-spent budget is not refunded.`;
      break;
    case "resume-campaign":
      request = {
        title: `Resume campaign — ${campaignName}`,
        detail: `Client requested a resume of "${campaignName}" from the AdFlow dashboard. Resume it in the ad platform and update the campaign status in the next metrics entry.`,
      };
      message = `Resume request logged for ${campaignName}. Your ads team applies it manually — ${NOT_YET_LIVE}`;
      break;
    case "pause-underperforming-campaign":
      request = {
        title: `Pause worst-performing campaign — ${campaignName}`,
        detail: `Client asked us to pause their lowest-grade campaign (${campaignName}) from the AdFlow quick actions. Identify it, pause it in the ad platform, and reply to the client.`,
      };
      message = `Request logged — your ads team will review and pause the weakest campaign. ${NOT_YET_LIVE}`;
      dismissAfter = true;
      break;
    case "boost-winning-campaign":
      request = {
        title: `Boost top campaign budget — ${campaignName}`,
        detail: `Client requested a budget shift toward their highest-grade campaign (${campaignName}) from the AdFlow quick actions. Confirm the budget change with the client before applying it.`,
      };
      message = `Budget-increase request logged for ${campaignName}. We'll confirm the new spend with you before changing anything. ${NOT_YET_LIVE}`;
      dismissAfter = true;
      break;
    case "swap-ad-copy":
      redirectUrl = "/portal/adflow/dashboard#composer";
      message = "Open the AI ad-copy composer to pick the winning variant.";
      break;
    case "expand-to-new-platform":
      request = {
        title: `Expand campaign to a new platform — ${campaignName}`,
        detail: `Client requested that "${campaignName}" be duplicated to an additional ad platform. Scope the work, confirm the extra spend with the client, then build it.`,
      };
      message = `Expansion request logged for ${campaignName}. We'll scope it and confirm the extra spend with you first. ${NOT_YET_LIVE}`;
      dismissAfter = true;
      break;
    case "approve-anomaly-pause":
      request = {
        title: `Anomaly pause approved — ${campaignName}`,
        detail: `Client approved pausing "${campaignName}" in response to a spend/performance anomaly. Pause it in the ad platform as a priority and confirm back to the client.`,
      };
      message = `Approval logged — your ads team will pause ${campaignName} as a priority. ${NOT_YET_LIVE} We'll confirm once it's done.`;
      dismissAfter = true;
      break;
    case "approve-anomaly-boost":
      request = {
        title: `Anomaly budget boost approved — ${campaignName}`,
        detail: `Client approved a budget increase on "${campaignName}" in response to a performance anomaly. Confirm the new daily spend with the client, then apply it.`,
      };
      message = `Approval logged — your ads team will raise the budget on ${campaignName} after confirming the amount with you. ${NOT_YET_LIVE}`;
      dismissAfter = true;
      break;
    case "investigate-anomaly":
      redirectUrl = "/portal/adflow/dashboard#anomaly";
      message = "Opening the anomaly drill-down.";
      break;
    case "acknowledge":
      message = "Recommendation acknowledged.";
      dismissAfter = true;
      break;
    default:
      return {
        success: false,
        message: `Unhandled AdFlow action "${action.key}".`,
        errorCode: "not_whitelisted",
      };
  }

  // Create the human work item BEFORE replying. If we cannot record the
  // request we must not tell the customer it was logged.
  if (request) {
    try {
      await storage.createFulfillmentTask({
        client_service_id: csId,
        client_id: input.clientId,
        title: request.title,
        description:
          `${request.detail}\n\n` +
          `Raised automatically from the client's AdFlow dashboard 1-click action ` +
          `"${action.key}". There is no ad-platform API integration — this is manual work.`,
        status: "not_started",
        priority: "high",
        handled_by: "internal",
        actor_type: "system",
        metadata: {
          type: "adflow_action_request",
          action_key: action.key,
          campaign_name: campaignName,
          recommendation_id: input.recommendationId ?? null,
          requested_at: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      log.error("AdFlow action task creation failed", {
        clientId: input.clientId,
        actionKey: action.key,
        error: err?.message,
      });
      return {
        success: false,
        message:
          "We couldn't log that request just now — nothing was changed. Please try again or contact support.",
        errorCode: "handler_error",
      };
    }
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
