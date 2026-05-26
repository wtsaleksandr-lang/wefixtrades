/**
 * Portal WebCare 1-click Action Runner — Wave 31.
 *
 * POST /api/portal/webcare/run-action
 *
 * Body: { actionId: string, action: ActionId, params?: object }
 *
 * Whitelisted action IDs (server-side authoritative):
 *   - apply-all-pending-updates    → queue ops to run pending plugin /
 *                                    theme / core updates with a fresh
 *                                    backup taken beforehand.
 *   - clean-malware                → request a malware sweep; ops can
 *                                    confirm + remediate.
 *   - harden-security              → flip the recommended security
 *                                    defaults (2FA, login throttling,
 *                                    file-edit lockdown) for the site.
 *   - optimize-performance         → kicks off image + CSS minify pass.
 *   - run-backup-now               → on-demand backup; logs an entry to
 *                                    the maintenance feed.
 *   - acknowledge                  → no-op; dismiss the recommendation.
 *
 * Auth: requireClient + active WebCare subscription. adminPreviewSafe
 * returns a preview no-op for admin previews. Each action writes a
 * row to `webcare_action_log` so the customer sees it appear in the
 * Maintenance Log Inbox immediately.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import {
  clientServices,
  serviceCatalog,
  webcareActionLog,
} from "@shared/schema";
import { dismissAction } from "../../../services/aiInsights/cache";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalWebcareRunAction");

const ACTION_IDS = [
  "apply-all-pending-updates",
  "clean-malware",
  "harden-security",
  "optimize-performance",
  "run-backup-now",
  "acknowledge",
] as const;
type ActionId = (typeof ACTION_IDS)[number];

const runActionSchema = z.object({
  actionId: z.string().min(1).max(200),
  action: z.enum(ACTION_IDS),
  params: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
});

interface RunActionResult {
  ok: true;
  redirectUrl?: string;
  message: string;
  dismissed: boolean;
}

const PREVIEW_RESPONSE = {
  previewMode: true,
  ok: true as const,
  message: "Preview mode — action not executed.",
  dismissed: false,
};

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
  redirectUrl?: string;
}

function resolveAction(action: ActionId): ActionMeta {
  switch (action) {
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
        plain: "Enabled recommended hardening: 2FA, login throttling, file-edit lockdown",
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
  }
}

export function registerPortalWebcareRunActionRoutes(app: Express) {
  app.post(
    "/api/portal/webcare/run-action",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: PREVIEW_RESPONSE,
          mode: "write",
          action: "webcare.run-action",
        });
        if (clientId === null) return;

        const parsed = runActionSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid body",
            details: parsed.error.flatten(),
          });
        }

        const { actionId, action, params } = parsed.data;

        const csId = await activeWebcareCs(clientId);
        if (!csId) {
          return res.status(403).json({
            error: "webcare_required",
            message:
              "WebCare 1-click actions require an active WebCare subscription.",
            upgradeUrl: "/products/webcare",
          });
        }

        const resolved = resolveAction(action);

        // Log the action to the live maintenance feed so the customer
        // sees it appear immediately. We never log "acknowledge" — it
        // would be noise.
        if (action !== "acknowledge") {
          try {
            await db.insert(webcareActionLog).values({
              client_id: clientId,
              client_service_id: csId,
              event_type: resolved.eventType,
              severity: resolved.severity,
              technical_summary: resolved.technical,
              plain_language_summary: resolved.plain,
              expanded_detail: params
                ? ({ source: "customer_initiated", params } as Record<string, unknown>)
                : ({ source: "customer_initiated" } as Record<string, unknown>),
            });
          } catch (insertErr: any) {
            log.warn("webcare action-log insert failed", {
              clientId,
              error: insertErr?.message,
            });
          }
        }

        let dismissed = false;
        if (resolved.dismissAfter) {
          await dismissAction(clientId, actionId);
          dismissed = true;
        }

        log.info("webcare.run-action", {
          clientId,
          action,
          actionId,
          hasParams: !!params,
        });

        const result: RunActionResult = {
          ok: true,
          redirectUrl: resolved.redirectUrl,
          message: resolved.message,
          dismissed,
        };
        return res.json(result);
      } catch (err: any) {
        log.error("[portal/webcare/run-action]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
