/**
 * WebCare action handler.
 *
 * WHAT CHANGED AND WHY
 * --------------------
 * Every action here used to be a facade. `run-backup-now` wrote a log row
 * reading "Backup queued. The backup timeline will show a new green dot
 * when it completes" and started nothing — no backup job existed anywhere
 * in the codebase, so the green dot never came. `clean-malware` promised
 * "our team will confirm and clean any findings within 4 hours" with no
 * scan and no team process behind it. `harden-security` claimed it had
 * "Enabled recommended hardening: 2FA, login throttling, file-edit
 * lockdown". `optimize-performance` promised "your next Lighthouse score
 * updates within an hour" for a Lighthouse score the product does not
 * measure at all. Each wrote a fabricated `technical_summary` naming a
 * function that does not exist (`queue_backup(on_demand=true)`).
 *
 * Now:
 *   - run-backup-now  → really captures + stores a verifiable archive.
 *   - scan-malware    → really scans and stores real findings.
 *     (replaces `clean-malware`: we can genuinely detect, we cannot
 *      genuinely promise remediation on a 4-hour SLA.)
 *   - harden-security and optimize-performance are GONE. Enabling 2FA,
 *     login throttling or file-edit lockdown requires installing plugins
 *     or editing wp-config.php, neither of which the WordPress REST API
 *     permits; and there is no image/CSS optimisation pipeline and no
 *     Lighthouse measurement. Undeliverable buttons are worse than absent
 *     ones, so they were removed rather than left to keep lying.
 *
 * The runners in services/webcare/runners.ts own the log-writing, and they
 * write it AFTER the work, in the past tense, describing what happened.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../db";
import { clientServices, serviceCatalog } from "@shared/schema";
import { dismissAction } from "../../aiInsights/cache";
import { createLogger } from "../../../lib/logger";
import {
  loadWebcareContext,
  runApplyUpdatesNow,
  runBackupNow,
  runMalwareScanNow,
} from "../../webcare/runners";
import type { RunnerOutcome } from "../../webcare/runners";
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
      message: "WebCare 1-click actions require an active WebCare subscription.",
      resultPayload: { upgradeUrl: "/products/webcare" },
      errorCode: "subscription_required",
    };
  }

  // `acknowledge` is the one action that legitimately does nothing but
  // dismiss a recommendation — there is no work to misreport.
  if (action.key === "acknowledge") {
    let dismissed = false;
    if (input.recommendationId) {
      try {
        await dismissAction(input.clientId, input.recommendationId);
        dismissed = true;
      } catch (err: any) {
        log.warn("dismissAction failed", {
          clientId: String(input.clientId),
          error: err?.message,
        });
      }
    }
    return { success: true, message: "Recommendation acknowledged.", dismissed };
  }

  const REAL_ACTIONS = ["run-backup-now", "scan-malware", "apply-all-pending-updates"] as const;
  type RealAction = (typeof REAL_ACTIONS)[number];
  if (!(REAL_ACTIONS as readonly string[]).includes(action.key)) {
    return {
      success: false,
      message: `Unhandled WebCare action "${action.key}".`,
      errorCode: "not_whitelisted",
    };
  }

  const ctx = await loadWebcareContext(input.clientId);
  if (!ctx) {
    return {
      success: false,
      message: "WebCare 1-click actions require an active WebCare subscription.",
      resultPayload: { upgradeUrl: "/products/webcare" },
      errorCode: "subscription_required",
    };
  }

  // Real work. The outcome reported to the customer is the outcome that
  // occurred — including failure, which is reported as failure.
  const runner: Record<RealAction, () => Promise<RunnerOutcome>> = {
    "run-backup-now": () => runBackupNow(ctx, "manual"),
    "scan-malware": () => runMalwareScanNow(ctx, "manual"),
    "apply-all-pending-updates": () => runApplyUpdatesNow(ctx, "manual"),
  };
  const outcome = await runner[action.key as RealAction]();

  if (!outcome.ok) {
    // DispatchResult.errorCode is a closed union, so the runner's specific
    // reason (credentials_missing, backup_failed, …) is logged rather than
    // returned. The customer-facing `message` carries the real explanation
    // in plain language — "we don't have WordPress access for your site
    // yet, so there's nothing we can back up" — not a generic failure.
    log.warn("webcare action failed", {
      clientId: String(input.clientId),
      action: action.key,
      reason: outcome.errorCode ?? "unknown",
    });
    return {
      success: false,
      message: outcome.message,
      errorCode: "handler_error",
    };
  }

  let dismissed = false;
  if (input.recommendationId) {
    try {
      await dismissAction(input.clientId, input.recommendationId);
      dismissed = true;
    } catch (err: any) {
      log.warn("dismissAction failed", {
        clientId: String(input.clientId),
        error: err?.message,
      });
    }
  }

  return { success: true, message: outcome.message, dismissed };
}
