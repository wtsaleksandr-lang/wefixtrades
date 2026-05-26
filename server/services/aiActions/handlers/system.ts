/**
 * Wave 34 — Admin "system" action handler.
 *
 * The Wave 12D admin-alert flow (`server/services/alertFixActions.ts`)
 * continues to OWN the four whitelisted admin actions — they touch
 * Vapi provisioning, MapGuard scans, the system_alerts table, and have a
 * dedicated `alert_actions_log` audit trail that admin UI surfaces.
 *
 * This handler is a thin adapter: it pulls `alertId` from the input
 * params, delegates to `runAlertFix`, and translates the result back
 * into the universal `DispatchResult` shape (so cross-product audit
 * dashboards see one row per attempt regardless of route).
 *
 * Result: alert_actions_log AND ai_action_audit_log both get a row.
 * The duplication is intentional — the existing admin UI keeps reading
 * alert_actions_log; the universal cross-product dashboard reads
 * ai_action_audit_log. No data migration needed.
 */

import { runAlertFix } from "../../alertFixActions";
import type { AIAction } from "@shared/aiActions";
import type { DispatchInput, DispatchResult } from "../dispatcher";

export async function handleSystemAction(
  action: AIAction,
  input: DispatchInput,
): Promise<DispatchResult> {
  const alertIdRaw = input.params?.alertId;
  const alertId =
    typeof alertIdRaw === "number"
      ? alertIdRaw
      : typeof alertIdRaw === "string"
        ? parseInt(alertIdRaw, 10)
        : NaN;
  if (!Number.isFinite(alertId) || alertId <= 0) {
    return {
      success: false,
      message: "Admin system actions require a numeric alertId param.",
      errorCode: "invalid_params",
    };
  }
  if (input.userId === null) {
    return {
      success: false,
      message: "Admin system actions require an authenticated admin user.",
      errorCode: "invalid_params",
    };
  }

  try {
    const result = await runAlertFix({
      alertId,
      action: action.key,
      adminUserId: input.userId,
    });
    return {
      success: result.success,
      message: result.message,
      resultPayload: result.details
        ? { details: result.details, alertActionsLogId: result.logId }
        : { alertActionsLogId: result.logId },
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message ? String(err.message) : "Admin action failed.",
      errorCode: "handler_error",
    };
  }
}
