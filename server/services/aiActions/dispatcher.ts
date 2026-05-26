/**
 * Wave 34 — Universal AI-action dispatcher.
 *
 * Single backend entry point for every AI-recommended action across every
 * product (portal + admin). Replaces the five per-product `runAction.ts`
 * handlers (which now delegate here) and the Wave 12D `alertFixActions.ts`
 * (which now also delegates here).
 *
 * Flow:
 *   1. Look up the action in the shared registry. If not whitelisted →
 *      log the rejection + return { success: false, error: "not_whitelisted" }.
 *   2. Validate required params from the registry entry.
 *   3. Route to the product-specific handler (`./handlers/<product>.ts`).
 *   4. Write one row to `ai_action_audit_log` — success OR failure.
 *   5. Return the handler's result.
 *
 * The dispatcher NEVER mutates anything itself — handlers own the
 * subscription / permission / SMS-opt-in checks. That keeps the existing
 * security model intact while giving us a single audit pipe.
 */

import { db } from "../../db";
import { aiActionAuditLog } from "@shared/schema";
import {
  getAction,
  isAIActionProduct,
  type AIAction,
  type AIActionContext,
  type AIActionProduct,
} from "@shared/aiActions";
import { createLogger } from "../../lib/logger";
import { handleMapguardAction } from "./handlers/mapguard";
import { handleReputationshieldAction } from "./handlers/reputationshield";
import { handleQuotequickAction } from "./handlers/quotequick";
import { handleAdflowAction } from "./handlers/adflow";
import { handleWebcareAction } from "./handlers/webcare";
import { handleSystemAction } from "./handlers/system";

const log = createLogger("AiActionDispatcher");

/** Triggered-by source — `auto_approved` reserved for future Wave 35+. */
export type AIActionTrigger = "user_click" | "auto_approved";

export interface DispatchInput {
  /** Customer client id, when known. Nullable for admin-context calls. */
  clientId: number | null;
  product: AIActionProduct;
  context: AIActionContext;
  actionKey: string;
  params: Record<string, unknown>;
  triggeredBy: AIActionTrigger;
  /** Who clicked. Could be customer userId OR admin userId. */
  userId: number | null;
  /** Originating recommendation id — passed to `dismissAction` when relevant. */
  recommendationId?: string;
}

export interface DispatchResult {
  success: boolean;
  /** Human-readable confirmation or error message. Safe to surface to user. */
  message: string;
  /** Optional payload — typically a redirectUrl or details bag. */
  resultPayload?: Record<string, unknown>;
  /** True if the originating AI recommendation was dismissed server-side. */
  dismissed?: boolean;
  /** Set when the dispatcher itself refused (whitelist / params / auth). */
  errorCode?:
    | "not_whitelisted"
    | "invalid_params"
    | "subscription_required"
    | "preview_mode"
    | "handler_error"
    | "destructive_auto_blocked";
}

/**
 * Whitelist-check + param-validate + handler-route + audit-log.
 * Never throws — failures come back as `{ success: false, errorCode }`.
 */
export async function dispatchAction(
  input: DispatchInput,
): Promise<DispatchResult> {
  // 1. Whitelist lookup
  if (!isAIActionProduct(input.product)) {
    return audited(input, {
      success: false,
      message: `Unknown product "${input.product}".`,
      errorCode: "not_whitelisted",
    });
  }
  const action = getAction(input.product, input.context, input.actionKey);
  if (!action) {
    return audited(input, {
      success: false,
      message: `Action "${input.actionKey}" is not whitelisted for ${input.product}.`,
      errorCode: "not_whitelisted",
    });
  }

  // 2. Required-params validation
  const missing = (action.requiresParams ?? []).filter(
    (k) => input.params[k] === undefined || input.params[k] === null,
  );
  if (missing.length) {
    return audited(input, {
      success: false,
      message: `Missing required params: ${missing.join(", ")}.`,
      errorCode: "invalid_params",
    });
  }

  // 3. Destructive auto-approve guard (Alex's anti-pattern from the brief).
  if (
    input.triggeredBy === "auto_approved" &&
    action.destructive === true
  ) {
    return audited(input, {
      success: false,
      message: "Destructive actions cannot be auto-approved in v1.",
      errorCode: "destructive_auto_blocked",
    });
  }

  // 4. Route to handler
  let handlerResult: DispatchResult;
  try {
    handlerResult = await routeToHandler(action, input);
  } catch (err: any) {
    log.error("Dispatcher handler threw", {
      product: input.product,
      action: input.actionKey,
      error: err?.message,
    });
    handlerResult = {
      success: false,
      message: err?.message ? String(err.message) : "Handler error.",
      errorCode: "handler_error",
    };
  }

  return audited(input, handlerResult);
}

async function routeToHandler(
  action: AIAction,
  input: DispatchInput,
): Promise<DispatchResult> {
  switch (action.product) {
    case "mapguard":
      return handleMapguardAction(action, input);
    case "reputationshield":
      return handleReputationshieldAction(action, input);
    case "quotequick":
      return handleQuotequickAction(action, input);
    case "adflow":
      return handleAdflowAction(action, input);
    case "webcare":
      return handleWebcareAction(action, input);
    case "system":
      return handleSystemAction(action, input);
    // contentflow / rankflow / socialsync / tradeline are reserved for
    // Wave 35+. For now those products have no whitelisted entries, so
    // the registry lookup already rejected the call before we got here.
    default:
      return {
        success: false,
        message: `No handler wired for product "${action.product}".`,
        errorCode: "handler_error",
      };
  }
}

/**
 * Write to `ai_action_audit_log` and return the original result. Sanitises
 * params before persisting — keys named `password`, `secret`, `token`,
 * `apiKey`, `authorization` are redacted to `"[REDACTED]"`.
 */
async function audited(
  input: DispatchInput,
  result: DispatchResult,
): Promise<DispatchResult> {
  try {
    await db.insert(aiActionAuditLog).values({
      client_id: input.clientId,
      product: input.product,
      context: input.context,
      action_key: input.actionKey,
      params: sanitiseParams(input.params),
      result_payload: result.resultPayload
        ? (result.resultPayload as Record<string, unknown>)
        : null,
      success: result.success,
      error_message: result.success
        ? null
        : (result.errorCode ?? "error") + ": " + result.message,
      triggered_by: input.triggeredBy,
      user_id: input.userId,
      recommendation_id: input.recommendationId ?? null,
    });
  } catch (logErr: any) {
    // NEVER let an audit-log failure mask the actual result.
    log.warn("Failed to write ai_action_audit_log row", {
      product: input.product,
      action: input.actionKey,
      error: logErr?.message,
    });
  }
  return result;
}

const SENSITIVE_KEY_RE = /(password|secret|token|apikey|authorization|bearer)/i;

function sanitiseParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (SENSITIVE_KEY_RE.test(k)) {
      out[k] = "[REDACTED]";
      continue;
    }
    // Strings longer than 500 chars get truncated to keep the log tiny.
    if (typeof v === "string" && v.length > 500) {
      out[k] = v.slice(0, 500) + "…[truncated]";
      continue;
    }
    out[k] = v;
  }
  return out;
}
