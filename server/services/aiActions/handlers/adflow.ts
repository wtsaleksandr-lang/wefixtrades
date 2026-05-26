/**
 * Wave 34 — AdFlow action handler (extracted from
 * server/routes/portal/adflow/runAction.ts).
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../db";
import { clients, clientServices, serviceCatalog } from "@shared/schema";
import { dismissAction } from "../../aiInsights/cache";
import type { AIAction } from "@shared/aiActions";
import type { DispatchInput, DispatchResult } from "../dispatcher";

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
  if (!(await hasActiveAdflow(input.clientId))) {
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

  switch (action.key) {
    case "pause-campaign":
      message = `Pause request queued for ${campaignName}. Already-spent budget is not refunded.`;
      break;
    case "resume-campaign":
      message = `Resume request queued for ${campaignName}.`;
      break;
    case "pause-underperforming-campaign":
      message = `${campaignName} flagged for pause — your ops team will action within 24 hours.`;
      dismissAfter = true;
      break;
    case "boost-winning-campaign":
      message = `Budget boost queued for ${campaignName}.`;
      dismissAfter = true;
      break;
    case "swap-ad-copy":
      redirectUrl = "/portal/adflow/dashboard#composer";
      message = "Open the AI ad-copy composer to pick the winning variant.";
      break;
    case "expand-to-new-platform":
      message = `Expansion request queued — ${campaignName} will be duplicated to the new platform.`;
      dismissAfter = true;
      break;
    case "approve-anomaly-pause":
      message =
        "Auto-pause approved — campaign paused, you'll see it in the dashboard within a few minutes.";
      dismissAfter = true;
      break;
    case "approve-anomaly-boost":
      message =
        "Budget boost approved — your winning campaign will get more spend tomorrow.";
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
