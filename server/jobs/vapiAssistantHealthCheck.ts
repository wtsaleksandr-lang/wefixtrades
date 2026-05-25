/**
 * Vapi Assistant Provisioning Health Check
 *
 * Daily at 09:15 UTC. Queries the live Vapi inventory (GET /assistant) and
 * counts assistants tagged `metadata.source === "tradeline_template_engine"`
 * — the sentinel stamped by `upsertVapiAssistant()` in
 * `server/services/vapiService.ts`.
 *
 * Why this exists
 * ───────────────
 * The 2026-05-25 AI-infrastructure audit flagged that
 * `provisionTradeLineAssistant()` is wired end-to-end but the live Vapi
 * account showed zero TradeLine assistants. Two possible explanations:
 *   1) genuinely zero active TradeLine customers yet — fine, no alert;
 *   2) silent provisioning failures (the original root cause was a missing
 *      `model.model` string on the custom-llm payload — see PR docs at
 *      `docs/operations/tradeline-provisioning-health-2026-05-24.md`).
 *
 * This worker distinguishes the two cases. It alerts only when the live
 * Vapi inventory is empty AND the DB carries at least one tradeline
 * client_services row in status='active' (i.e. a paying customer is
 * expecting a working assistant).
 *
 * Failure modes that are NOT alerted:
 *   - Zero live + zero active DB rows  → nobody's paying yet, no problem.
 *   - VAPI_API_KEY missing             → environment misconfig, distinct
 *                                        from provisioning failure; we log
 *                                        a warning and return early.
 *   - Vapi reachability failure        → transient network/API issue; the
 *                                        scheduler's own retry wrapper
 *                                        (3x) handles it. After all
 *                                        retries are exhausted the
 *                                        scheduler fires its own
 *                                        worker_failed alert, so we don't
 *                                        double-alert here.
 *
 * Dedupe: fireAlert() dedupes (category + title) inside a 1h window, so a
 * follow-up manual Run-Now within the hour won't spam the inbox.
 */

import { createLogger } from "../lib/logger";
import { fireAlert } from "../services/alertService";
import { db } from "../db";
import { clientServices } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";

const log = createLogger("VapiAssistantHealthCheck");

const VAPI_API_BASE = "https://api.vapi.ai";
const VAPI_PAGE_LIMIT = 100;
const TRADELINE_SOURCE_SENTINEL = "tradeline_template_engine";

export interface VapiAssistantHealthResult {
  vapiReachable: boolean;
  vapiTradelineAssistants: number;
  vapiAssistantsTotal: number;
  activeTradelineServicesInDb: number;
  alertFired: boolean;
  skipped?: "no_api_key";
}

export async function runVapiAssistantHealthCheck(): Promise<VapiAssistantHealthResult> {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    log.warn("VAPI_API_KEY not set — skipping health check (cannot distinguish empty inventory from auth failure)");
    return {
      vapiReachable: false,
      vapiTradelineAssistants: 0,
      vapiAssistantsTotal: 0,
      activeTradelineServicesInDb: 0,
      alertFired: false,
      skipped: "no_api_key",
    };
  }

  // 1. Live Vapi inventory.
  // The Vapi REST API returns a flat array (no top-level paging object) so
  // we walk until a short page comes back. limit=100 matches what the
  // admin health widget uses (server/routes/adminTradelineVoicesRoutes.ts).
  let vapiAssistantsTotal = 0;
  let vapiTradelineAssistants = 0;
  let createdAtLt: string | undefined = undefined;
  let pages = 0;

  while (pages < 50) {
    pages++;
    const url = new URL(`${VAPI_API_BASE}/assistant`);
    url.searchParams.set("limit", String(VAPI_PAGE_LIMIT));
    if (createdAtLt) url.searchParams.set("createdAtLt", createdAtLt);

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Vapi GET /assistant returned ${resp.status}: ${body.slice(0, 200)}`);
    }
    const batch = (await resp.json()) as Array<Record<string, any>>;
    if (!Array.isArray(batch) || batch.length === 0) break;

    vapiAssistantsTotal += batch.length;
    for (const a of batch) {
      if (a?.metadata?.source === TRADELINE_SOURCE_SENTINEL) {
        vapiTradelineAssistants++;
      }
    }

    if (batch.length < VAPI_PAGE_LIMIT) break;
    // Page backwards via the oldest createdAt on this page.
    const oldest = batch[batch.length - 1]?.createdAt;
    if (!oldest || oldest === createdAtLt) break; // no progress — stop
    createdAtLt = String(oldest);
  }

  // 2. DB-side active TradeLine subscriptions. Counts only status='active' —
  //    'pending' rows are still in onboarding (provisioning hasn't run or is
  //    retrying) so a missing assistant for them is not yet an alertable
  //    failure. 'failed_permanent' is excluded by design (it has its own
  //    alert from tradelineRetryWorker).
  const [activeRow] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(clientServices)
    .where(and(
      sql`${clientServices.service_id} LIKE 'tradeline%'`,
      eq(clientServices.status, "active"),
    ));
  const activeTradelineServicesInDb = Number(activeRow?.n ?? 0);

  log.info("Vapi assistant inventory checked", {
    vapiAssistantsTotal: String(vapiAssistantsTotal),
    vapiTradelineAssistants: String(vapiTradelineAssistants),
    activeTradelineServicesInDb: String(activeTradelineServicesInDb),
  });

  // 3. Alert condition: zero live TradeLine assistants AND at least one
  //    active TradeLine subscription expecting one. fireAlert handles
  //    1-hour dedupe internally.
  let alertFired = false;
  if (vapiTradelineAssistants === 0 && activeTradelineServicesInDb > 0) {
    alertFired = true;
    await fireAlert({
      severity: "critical",
      category: "tradeline_assistant_provisioning_zero",
      title: `Zero TradeLine Vapi assistants live with ${activeTradelineServicesInDb} active subscription(s) in DB`,
      details:
        `The daily TradeLine assistant health check found 0 assistants tagged ` +
        `metadata.source="${TRADELINE_SOURCE_SENTINEL}" on Vapi, while ` +
        `${activeTradelineServicesInDb} client_services row(s) with service_id LIKE 'tradeline%' ` +
        `have status='active'. This indicates silent provisioning failure — ` +
        `inspect the admin health widget at /admin/tradeline/voices and the ` +
        `tradeline_retry worker history. Total Vapi assistants visible: ${vapiAssistantsTotal}.`,
      metadata: {
        vapi_tradeline_assistants: vapiTradelineAssistants,
        vapi_assistants_total: vapiAssistantsTotal,
        active_tradeline_services_in_db: activeTradelineServicesInDb,
      },
    });
  }

  return {
    vapiReachable: true,
    vapiTradelineAssistants,
    vapiAssistantsTotal,
    activeTradelineServicesInDb,
    alertFired,
  };
}
