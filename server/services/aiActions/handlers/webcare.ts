/**
 * Wave 34 — WebCare action handler (extracted from
 * server/routes/portal/webcare/runAction.ts).
 *
 * Identical behavior to Wave 31: each non-acknowledge action writes one
 * row to `webcare_action_log` so the customer sees it appear in the
 * Maintenance Log Inbox immediately.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../db";
import {
  clientServices,
  serviceCatalog,
  webcareActionLog,
} from "@shared/schema";
import { dismissAction } from "../../aiInsights/cache";
import { createLogger } from "../../../lib/logger";
import type { AIAction } from "@shared/aiActions";
import type { DispatchInput, DispatchResult } from "../dispatcher";

const log = createLogger("AiActionsWebcareHandler");

async function activeWebcareCs(clientId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clientServices.id })
    .from(clientServices)
    .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .where(
      and(
        eq(clientServices.client_id, clientId),
        sql`${serviceCatalog.id} LIKE 'webcare%'`,
        sql`${clientServices.status} IN ('active', 'onboarding')`,
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

interface ActionMeta {
  eventType: "updates" | "security" | "performance" | "backups" | "other";
  severity: "info" | "success" | "warning";
  plain: string;
  technical: string;
  dismissAfter: boolean;
  message: string;
}

function resolve(actionKey: string): ActionMeta | null {
  switch (actionKey) {
    case "apply-all-pending-updates":
      return {
        eventType: "updates",
        severity: "info",
        plain: "Queued: apply all pending plugin, theme and core updates",
        technical: "queue_wp_cli_update_all(backup=true)",
        dismissAfter: true,
        message:
          "Updates queued. A fresh backup is taken first — you'll see results in the log within a few minutes.",
      };
    case "clean-malware":
      return {
        eventType: "security",
        severity: "warning",
        plain: "Requested malware sweep and clean-up",
        technical: "queue_malware_scan_and_clean()",
        dismissAfter: true,
        message:
          "Malware sweep requested — our team will confirm and clean any findings within 4 hours.",
      };
    case "harden-security":
      return {
        eventType: "security",
        severity: "success",
        plain:
          "Enabled recommended hardening: 2FA, login throttling, file-edit lockdown",
        technical: "apply_hardening_profile(default)",
        dismissAfter: true,
        message:
          "Recommended security defaults turned on. Security grade re-checked within 15 minutes.",
      };
    case "optimize-performance":
      return {
        eventType: "performance",
        severity: "info",
        plain: "Queued: image compression and CSS minify pass",
        technical: "queue_perf_optimize(images=true, css=true, js=true)",
        dismissAfter: true,
        message:
          "Optimization queued — your next Lighthouse score updates within an hour.",
      };
    case "run-backup-now":
      return {
        eventType: "backups",
        severity: "info",
        plain: "On-demand backup running",
        technical: "queue_backup(on_demand=true)",
        dismissAfter: false,
        message:
          "Backup queued. The backup timeline will show a new green dot when it completes.",
      };
    case "acknowledge":
      return {
        eventType: "other",
        severity: "info",
        plain: "Recommendation acknowledged",
        technical: "ack",
        dismissAfter: true,
        message: "Recommendation acknowledged.",
      };
    default:
      return null;
  }
}

export async function handleWebcareAction(
  action: AIAction,
  input: DispatchInput,
): Promise<DispatchResult> {
  if (input.clientId === null) {
    return {
      success: false,
      message: "WebCare actions require a customer context.",
      errorCode: "invalid_params",
    };
  }
  const csId = await activeWebcareCs(input.clientId);
  if (!csId) {
    return {
      success: false,
      message:
        "WebCare 1-click actions require an active WebCare subscription.",
      resultPayload: { upgradeUrl: "/products/webcare" },
      errorCode: "subscription_required",
    };
  }

  const meta = resolve(action.key);
  if (!meta) {
    return {
      success: false,
      message: `Unhandled WebCare action "${action.key}".`,
      errorCode: "not_whitelisted",
    };
  }

  // Live maintenance feed: log everything except acknowledge.
  if (action.key !== "acknowledge") {
    try {
      await db.insert(webcareActionLog).values({
        client_id: input.clientId,
        client_service_id: csId,
        event_type: meta.eventType,
        severity: meta.severity,
        technical_summary: meta.technical,
        plain_language_summary: meta.plain,
        expanded_detail: input.params
          ? ({
              source: "customer_initiated",
              params: input.params,
            } as Record<string, unknown>)
          : ({ source: "customer_initiated" } as Record<string, unknown>),
      });
    } catch (insertErr: any) {
      log.warn("webcare action-log insert failed", {
        clientId: input.clientId,
        error: insertErr?.message,
      });
    }
  }

  let dismissed = false;
  if (meta.dismissAfter && input.recommendationId) {
    try {
      await dismissAction(input.clientId, input.recommendationId);
      dismissed = true;
    } catch {
      /* best-effort */
    }
  }

  return {
    success: true,
    message: meta.message,
    dismissed,
  };
}
