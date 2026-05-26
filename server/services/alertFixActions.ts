/**
 * Wave 12D — Admin AI Diagnosis Panel: safe "Run fix" action whitelist.
 *
 * Phase 1 (this wave) — the AI Copilot can DIAGNOSE alerts and SUGGEST
 * fixes, but EVERY write is performed by a deterministic, server-side
 * function selected from this whitelist. The admin operator presses the
 * "Run fix" button; the frontend POSTs `{alertId, action}` and the route
 * looks the action up here. There is no string interpolation, no eval,
 * and no LLM-driven action dispatch.
 *
 * To widen the whitelist:
 *   1. Add a new entry to ACTION_HANDLERS below
 *   2. Bump the "Phase 1 = 4 actions" comment in the PR body
 *   3. Update docs/operations/* if the new action touches a third party
 *
 * Phase 2 — autonomous LLM-with-tools resolution — is deliberately
 * deferred to a future dedicated design pass. See PR #wave12d for the
 * scope decision.
 */

import type { AlertActionLog } from "@shared/schema";
import { storage } from "../storage";
import { db } from "../db";
import { alertActionsLog, clients } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("AlertFixActions");

/** All recognized action names. The frontend MUST send one of these — the
 * route rejects anything else BEFORE dispatching to a handler. */
export const ALERT_FIX_ACTIONS = [
  "acknowledge",
  "retry-vapi-assistant",
  "retry-mapguard-scan",
  "mark-known-issue",
] as const;

export type AlertFixAction = (typeof ALERT_FIX_ACTIONS)[number];

export function isWhitelistedAction(value: string): value is AlertFixAction {
  return (ALERT_FIX_ACTIONS as readonly string[]).includes(value);
}

interface ActionResult {
  message: string;
  /** Anything safe to surface back to the admin operator. NEVER include
   * raw secrets, API keys, or internal stack traces here. */
  details?: Record<string, unknown>;
}

interface ActionContext {
  alertId: number;
  alert: {
    id: number;
    category: string;
    metadata: Record<string, unknown> | null;
  };
  adminUserId: number;
}

type ActionHandler = (ctx: ActionContext) => Promise<ActionResult>;

/** The whitelist itself. Add new actions HERE only. */
const ACTION_HANDLERS: Record<AlertFixAction, ActionHandler> = {
  /** Mark alert acknowledged. The most common safe fix — the AI usually
   * recommends this when a known-issue alert fires post-fix. */
  acknowledge: async (ctx) => {
    const updated = await storage.acknowledgeSystemAlert(ctx.alertId, ctx.adminUserId);
    if (!updated) throw new Error("Alert not found or already acknowledged");
    return { message: `Alert #${ctx.alertId} acknowledged.` };
  },

  /** Re-run the Vapi assistant provisioning for a specific client_service.
   * Pulls the `client_service_id` from the alert metadata — operator
   * cannot direct it at an arbitrary service via the frontend. */
  "retry-vapi-assistant": async (ctx) => {
    const meta = ctx.alert.metadata ?? {};
    const csIdRaw = (meta as Record<string, unknown>)["client_service_id"];
    const csId = typeof csIdRaw === "number" ? csIdRaw : typeof csIdRaw === "string" ? parseInt(csIdRaw, 10) : NaN;
    if (!Number.isFinite(csId) || csId <= 0) {
      throw new Error("Alert metadata does not include a valid client_service_id");
    }
    const { provisionTradeLineAssistant } = await import("./vapiService");
    const result = await provisionTradeLineAssistant(csId);
    if (result.error) {
      return {
        message: `Retry attempted for service #${csId} but failed: ${result.error}`,
        details: { client_service_id: csId, success: false, error: result.error },
      };
    }
    if (result.assistantId) {
      // Auto-acknowledge the originating alert since the retry succeeded.
      await storage.acknowledgeSystemAlert(ctx.alertId, ctx.adminUserId).catch(() => undefined);
      return {
        message: `Retry succeeded — Vapi assistant ${result.assistantId} provisioned for service #${csId}.`,
        details: { client_service_id: csId, vapi_assistant_id: result.assistantId, success: true },
      };
    }
    return {
      message: `Retry skipped for service #${csId}: ${result.skipReason ?? "unknown reason"}`,
      details: { client_service_id: csId, skipped: true, skip_reason: result.skipReason },
    };
  },

  /** Re-run a single MapGuard scan for the client_id named in the alert
   * metadata. Same constraint: operator cannot redirect it. */
  "retry-mapguard-scan": async (ctx) => {
    const meta = ctx.alert.metadata ?? {};
    const clientIdRaw = (meta as Record<string, unknown>)["client_id"];
    const clientId = typeof clientIdRaw === "number" ? clientIdRaw : typeof clientIdRaw === "string" ? parseInt(clientIdRaw, 10) : NaN;
    if (!Number.isFinite(clientId) || clientId <= 0) {
      throw new Error("Alert metadata does not include a valid client_id");
    }
    const { getActiveMapguardClients, runMapguardScan } = await import("./mapguardMonitor");
    const all = await getActiveMapguardClients();
    const target = all.find((c) => c.client_id === clientId);
    if (!target) {
      throw new Error(`Client #${clientId} not active for MapGuard`);
    }
    try {
      const result = await runMapguardScan(target);
      await storage.acknowledgeSystemAlert(ctx.alertId, ctx.adminUserId).catch(() => undefined);
      return {
        message: `MapGuard scan re-ran for ${target.business_name} — ${result.tasksCreated} task(s) created.`,
        details: { client_id: clientId, tasks_created: result.tasksCreated, alerts_sent: result.alertsSent },
      };
    } catch (err: any) {
      return {
        message: `MapGuard scan retry failed for client #${clientId}: ${err.message}`,
        details: { client_id: clientId, success: false, error: err.message },
      };
    }
  },

  /** Tag the alert as a "known issue" — keeps the row in the DB but lifts
   * it out of the unacknowledged queue. We store the marker in metadata
   * rather than a new column to keep the migration footprint minimal. */
  "mark-known-issue": async (ctx) => {
    const existingMeta = (ctx.alert.metadata ?? {}) as Record<string, unknown>;
    const newMeta = { ...existingMeta, known_issue: true, marked_at: new Date().toISOString() };
    // Acknowledge it AND stash the marker. acknowledgeSystemAlert doesn't
    // touch metadata so do this through a direct update.
    const { systemAlerts } = await import("@shared/schema");
    await db.update(systemAlerts).set({
      acknowledged: true,
      acknowledged_by: ctx.adminUserId,
      acknowledged_at: new Date(),
      metadata: newMeta,
    }).where(eq(systemAlerts.id, ctx.alertId));
    return { message: `Alert #${ctx.alertId} marked as a known issue and acknowledged.` };
  },
};

/**
 * Run a whitelisted action against an alert and log the attempt to
 * `alert_actions_log` for audit. Throws if the action name is not on the
 * whitelist or if the action handler rejects. The route layer translates
 * thrown errors into HTTP responses.
 */
export async function runAlertFix(opts: {
  alertId: number;
  action: string;
  adminUserId: number;
}): Promise<{ success: boolean; message: string; details?: Record<string, unknown>; logId: number }> {
  if (!isWhitelistedAction(opts.action)) {
    // Log the rejection so we have an audit trail of attempted off-whitelist
    // calls. Then throw — the route returns 400.
    const [logRow] = await db.insert(alertActionsLog).values({
      alert_id: opts.alertId,
      admin_user_id: opts.adminUserId,
      action: opts.action,
      params: null,
      result: null,
      success: false,
      error_message: `Action "${opts.action}" is not on the whitelist`,
    }).returning();
    throw new Error(`Action "${opts.action}" is not on the whitelist. Valid: ${ALERT_FIX_ACTIONS.join(", ")}`);
  }

  // Look up the alert so we can pass typed metadata to the handler. We do
  // a fresh DB read here rather than trusting the request payload — the
  // operator could refresh the page between the AI's diagnosis and the
  // button click, and we want the latest metadata either way.
  const alerts = await storage.listSystemAlerts({ limit: 1 });
  let alert = alerts.find((a) => a.id === opts.alertId);
  if (!alert) {
    // Try a direct lookup if the recent-list scan missed it.
    const { systemAlerts } = await import("@shared/schema");
    const [direct] = await db.select().from(systemAlerts).where(eq(systemAlerts.id, opts.alertId)).limit(1);
    alert = direct;
  }
  if (!alert) {
    throw new Error(`Alert #${opts.alertId} not found`);
  }

  const ctx: ActionContext = {
    alertId: opts.alertId,
    alert: { id: alert.id, category: alert.category, metadata: (alert.metadata ?? null) as Record<string, unknown> | null },
    adminUserId: opts.adminUserId,
  };

  const handler = ACTION_HANDLERS[opts.action];
  try {
    const result = await handler(ctx);
    const [logRow] = await db.insert(alertActionsLog).values({
      alert_id: opts.alertId,
      admin_user_id: opts.adminUserId,
      action: opts.action,
      params: { alertCategory: alert.category },
      result: { message: result.message, details: result.details ?? null },
      success: true,
      error_message: null,
    }).returning();
    log.info("Alert fix action ran successfully", { alertId: opts.alertId, action: opts.action, adminUserId: opts.adminUserId, logId: logRow.id });
    return { success: true, message: result.message, details: result.details, logId: logRow.id };
  } catch (err: any) {
    const [logRow] = await db.insert(alertActionsLog).values({
      alert_id: opts.alertId,
      admin_user_id: opts.adminUserId,
      action: opts.action,
      params: { alertCategory: alert.category },
      result: null,
      success: false,
      error_message: String(err?.message ?? err).slice(0, 1000),
    }).returning();
    log.error("Alert fix action failed", { alertId: opts.alertId, action: opts.action, error: err?.message });
    // Re-throw so the route returns 500/4xx. The audit log is already in place.
    throw err;
  }
}

/** Get the recent audit log entries for an alert — surfaced in the UI so
 * the operator can see previous fix attempts before clicking "Run fix". */
export async function listAlertActions(alertId: number, limit = 20): Promise<AlertActionLog[]> {
  return db.select().from(alertActionsLog)
    .where(eq(alertActionsLog.alert_id, alertId))
    .limit(limit);
}
