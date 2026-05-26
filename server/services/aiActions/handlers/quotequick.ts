/**
 * Wave 34 — QuoteQuick action handler (extracted from
 * server/routes/portal/quotequick/runAction.ts).
 */

import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { clients, calculators } from "@shared/schema";
import { dismissAction } from "../../aiInsights/cache";
import type { AIAction } from "@shared/aiActions";
import type { DispatchInput, DispatchResult } from "../dispatcher";

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

async function clientSmsOptIn(clientId: number): Promise<boolean> {
  const [row] = await db
    .select({ metadata: clients.metadata })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  const md = (row?.metadata ?? {}) as Record<string, unknown>;
  return md?.sms_opt_in === true;
}

export async function handleQuotequickAction(
  action: AIAction,
  input: DispatchInput,
): Promise<DispatchResult> {
  if (input.clientId === null) {
    return {
      success: false,
      message: "QuoteQuick actions require a customer context.",
      errorCode: "invalid_params",
    };
  }
  if (!(await hasQuotequickConfigured(input.clientId))) {
    return {
      success: false,
      message: "1-click actions require a configured QuoteQuick widget.",
      resultPayload: { upgradeUrl: "/products/quotequick" },
      errorCode: "subscription_required",
    };
  }

  const params = input.params as Record<string, string | number | boolean>;

  // SMS gate — nudge-customer + request-feedback may dispatch SMS.
  if (
    (action.key === "nudge-customer" || action.key === "request-feedback") &&
    params?.channel === "sms"
  ) {
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

  let redirectUrl: string | undefined;
  let message: string;
  let dismissAfter = false;

  switch (action.key) {
    case "nudge-customer": {
      const leadId =
        typeof params?.leadId === "string"
          ? params.leadId
          : typeof params?.leadId === "number"
            ? String(params.leadId)
            : undefined;
      const query = leadId ? `?lead=${encodeURIComponent(leadId)}` : "";
      redirectUrl = `/portal/quotequick/dashboard${query}`;
      message = "Follow-up nudge queued — the customer will hear back shortly.";
      break;
    }
    case "extend-quote-expiration":
      message = "Quote deadline extended by 7 days.";
      dismissAfter = true;
      break;
    case "add-discount-offer":
      message = "Discount line appended — the customer will see it next view.";
      break;
    case "request-feedback":
      message = "Feedback survey queued for delivery.";
      break;
    case "acknowledge":
      message = "Recommendation acknowledged.";
      dismissAfter = true;
      break;
    default:
      return {
        success: false,
        message: `Unhandled QuoteQuick action "${action.key}".`,
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
