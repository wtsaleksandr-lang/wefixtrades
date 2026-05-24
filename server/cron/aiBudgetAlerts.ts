/**
 * AI budget threshold alerts cron (W-AX-3).
 *
 * Schedule: every 2 hours at minute 19 (off-minute so we don't pile on top
 * of other on-the-hour crons). Registered from server/jobs/scheduler.ts.
 *
 * Per tick:
 *   1. Read every ai_system_gates row that has an alert_threshold_pct set
 *      AND a non-null monthly_budget_cents (otherwise % is meaningless).
 *   2. Compute spent_pct = monthly_spent_cents / monthly_budget_cents.
 *   3. For each tier in THRESHOLDS (50 / 80 / 100), if spent_pct crosses
 *      that tier AND alerts_sent.<tier> is not yet recorded for the
 *      current monthly_reset_at period, fire an alert (Sentry +
 *      fireAlert() → writes a row in system_alerts AND emails admin) and
 *      append the tier to alerts_sent.
 *
 * The alert_threshold_pct column on the row is the BASELINE (per-surface
 * default for the "warning" tier). We additionally always-on-fire 100%
 * (cap reached). Surfaces can be tuned per-row via the admin UI.
 *
 * Idempotent: alerts_sent is a jsonb array of tier strings (e.g.
 * ["50","80"]). The same threshold for the same surface in the same
 * monthly period fires exactly once. The monthly reset in aiSystemGate.ts
 * already clears alerts_sent when monthly_spent_cents zeroes out.
 *
 * Fail-soft: every per-row failure is logged but doesn't abort the loop —
 * one bad row should not silence alerts for the other 20 surfaces.
 */

import * as Sentry from "@sentry/node";
import { db } from "../db";
import { aiSystemGates } from "@shared/schema";
import { eq, isNotNull, and } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { fireAlert } from "../services/alertService";

const log = createLogger("AiBudgetAlertsCron");

/** Threshold tiers (% of monthly budget) at which we fire alerts.
 *  Each tier fires exactly once per surface per monthly reset period. */
const THRESHOLDS = [50, 80, 100] as const;

export interface AlertsCronResult {
  rows_checked: number;
  alerts_fired: number;
  errors: number;
}

function severityForThreshold(pct: number): "critical" | "warning" | "info" {
  if (pct >= 100) return "critical";
  if (pct >= 80) return "warning";
  return "info";
}

export async function runAiBudgetAlerts(): Promise<AlertsCronResult> {
  let rowsChecked = 0;
  let alertsFired = 0;
  let errors = 0;

  let rows: Array<typeof aiSystemGates.$inferSelect>;
  try {
    rows = await db
      .select()
      .from(aiSystemGates)
      .where(and(isNotNull(aiSystemGates.alert_threshold_pct), isNotNull(aiSystemGates.monthly_budget_cents)));
  } catch (err: any) {
    log.error("failed to read ai_system_gates", { error: err?.message });
    Sentry.captureMessage(`ai_budget_alerts: gate read failed — ${err?.message ?? "unknown"}`, "error");
    return { rows_checked: 0, alerts_fired: 0, errors: 1 };
  }

  for (const row of rows) {
    rowsChecked++;
    const cap = row.monthly_budget_cents;
    if (cap == null || cap <= 0) continue;
    const spent = row.monthly_spent_cents ?? 0;
    const spentPct = (spent / cap) * 100;

    // alerts_sent is jsonb default []. Coerce defensively.
    const sentRaw = (row.alerts_sent ?? []) as unknown;
    const sent = new Set<string>(
      Array.isArray(sentRaw) ? sentRaw.map((v) => String(v)) : [],
    );

    for (const threshold of THRESHOLDS) {
      if (spentPct < threshold) continue;
      const key = String(threshold);
      if (sent.has(key)) continue;

      const severity = severityForThreshold(threshold);
      const title = `AI surface "${row.surface}" reached ${threshold}% of monthly budget`;
      const details =
        `Spend: $${(spent / 100).toFixed(2)} of $${(cap / 100).toFixed(2)} ` +
        `(${spentPct.toFixed(1)}%). Threshold tier: ${threshold}%.`;

      // Sentry levels are a fixed enum: fatal/error/warning/log/info/debug.
      // Map our fireAlert severities into the Sentry equivalent.
      const sentryLevel: "error" | "warning" | "info" =
        severity === "critical" ? "error" : severity === "warning" ? "warning" : "info";

      try {
        // Sentry: surfaces in our error tracker so on-call sees it too.
        Sentry.captureMessage(`[ai-budget] ${title} — ${details}`, sentryLevel);

        // fireAlert: writes a system_alerts row (admin notification feed)
        // and emails the admin. Already deduped 1h per (category,title).
        await fireAlert({
          severity,
          category: "ai_budget_threshold",
          title,
          details,
          metadata: {
            surface: row.surface,
            monthly_spent_cents: spent,
            monthly_budget_cents: cap,
            spent_pct: Number(spentPct.toFixed(2)),
            threshold_pct: threshold,
          },
        });

        sent.add(key);
        alertsFired++;
        log.info("alert fired", { surface: row.surface, threshold, spent_pct: spentPct.toFixed(1) });
      } catch (err: any) {
        errors++;
        log.error("alert dispatch failed", { surface: row.surface, threshold, error: err?.message });
        // Don't record into alerts_sent — let the next tick retry.
        continue;
      }
    }

    // Persist the updated alerts_sent if it changed.
    const newSent = Array.from(sent).sort();
    const oldSent = Array.isArray(sentRaw) ? (sentRaw as unknown[]).map((v) => String(v)).sort() : [];
    if (newSent.join(",") !== oldSent.join(",")) {
      try {
        await db
          .update(aiSystemGates)
          .set({ alerts_sent: newSent, updated_at: new Date() })
          .where(eq(aiSystemGates.surface, row.surface));
      } catch (err: any) {
        errors++;
        log.error("alerts_sent persist failed", { surface: row.surface, error: err?.message });
      }
    }
  }

  return { rows_checked: rowsChecked, alerts_fired: alertsFired, errors };
}
