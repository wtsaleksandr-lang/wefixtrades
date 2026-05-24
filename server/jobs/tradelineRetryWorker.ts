/**
 * TradeLine Retry Worker
 *
 * Runs every 15 minutes. Queries TradeLine services where assistant.status === "failed"
 * and attempts to re-provision. Max 3 retries per day per service.
 * If still failing after 3 retries, fires an alert.
 *
 * Scans BOTH status='active' AND status='pending' services. Pending services are
 * the most common failure mode (failed initial provisioning) and were previously
 * being skipped by the filter (see PR #703).
 *
 * Lifetime retry cap (MAX_RETRIES_LIFETIME): after this many cumulative attempts
 * across all days, the service is marked status='failed_permanent' and a Sentry
 * alert + admin notification is raised. This prevents permanently-broken services
 * from retrying forever.
 */

import * as Sentry from "@sentry/node";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import { fireAlert } from "../services/alertService";
import { db } from "../db";
import { clientServices } from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

const log = createLogger("TradeLineRetryWorker");

const MAX_RETRIES_PER_DAY = 3;
const MAX_RETRIES_LIFETIME = 5;

export async function processTradeLineRetries(): Promise<{ attempted: number; succeeded: number; exhausted: number; permanentlyFailed: number }> {
  let attempted = 0;
  let succeeded = 0;
  let exhausted = 0;
  let permanentlyFailed = 0;

  try {
    const services = await db.select({
      id: clientServices.id,
      metadata: clientServices.metadata,
      client_id: clientServices.client_id,
      status: clientServices.status,
    })
      .from(clientServices)
      .where(and(
        sql`${clientServices.service_id} LIKE 'tradeline%'`,
        // PR #703 fix: include 'pending' services — they're the ones most likely
        // to need a retry (failed initial provisioning leaves status='pending').
        inArray(clientServices.status, ["active", "pending"]),
      ));

    const failedServices = services.filter(svc => {
      const meta = (svc.metadata as Record<string, any>) ?? {};
      return meta?.tradeline?.assistant?.status === "failed";
    });

    if (failedServices.length === 0) {
      log.debug("No failed TradeLine services to retry");
      return { attempted: 0, succeeded: 0, exhausted: 0, permanentlyFailed: 0 };
    }

    const { provisionTradeLineAssistant } = await import("../services/vapiService");
    const today = new Date().toISOString().split("T")[0];

    for (const svc of failedServices) {
      const meta = (svc.metadata as Record<string, any>) ?? {};
      const retryInfo = meta?.tradeline?.retryInfo ?? {};
      const retryDate = retryInfo?.date;
      const retryCount = retryDate === today ? (retryInfo?.count ?? 0) : 0;
      const lifetimeCount = retryInfo?.lifetimeCount ?? 0;

      // Lifetime cap: bounded-loop guard so a permanently-broken service does not
      // retry forever. After MAX_RETRIES_LIFETIME total attempts, flip the
      // client_services.status to 'failed_permanent' and escalate (Sentry + admin
      // notification). Only escalate once (alertFired sentinel).
      if (lifetimeCount >= MAX_RETRIES_LIFETIME) {
        if (!retryInfo?.permanentAlertFired) {
          permanentlyFailed++;
          const lastError = meta?.tradeline?.assistant?.lastBuildError || "unknown";
          const title = `TradeLine assistant for service #${svc.id} permanently failed after ${MAX_RETRIES_LIFETIME} lifetime retries`;
          const details = `Service flipped to status='failed_permanent'. Last error: ${lastError}`;

          // Sentry: surfaces in error tracker so on-call sees it.
          try {
            Sentry.captureMessage(`[tradeline-retry] ${title} — ${details}`, "error");
          } catch (sErr) {
            log.error("Sentry capture failed", { error: (sErr as Error).message });
          }

          // Admin notification (system_alerts row + admin email).
          await fireAlert({
            severity: "critical",
            category: "tradeline_assistant_failed_permanent",
            title,
            details,
            metadata: { client_service_id: svc.id, client_id: svc.client_id, lifetimeCount },
          });

          // Flip the service status so it's excluded from future retry sweeps and
          // visible in admin UI as needing manual intervention.
          await db.update(clientServices)
            .set({ status: "failed_permanent", updated_at: new Date() })
            .where(eq(clientServices.id, svc.id));

          await storage.updateTradeLineConfig(svc.id, {
            retryInfo: { ...retryInfo, permanentAlertFired: true },
          } as any);

          log.error("TradeLine service permanently failed", {
            clientServiceId: String(svc.id),
            lifetimeCount: String(lifetimeCount),
          });
        }
        continue;
      }

      if (retryCount >= MAX_RETRIES_PER_DAY) {
        if (!retryInfo?.alertFired) {
          exhausted++;
          await fireAlert({
            severity: "critical",
            category: "tradeline_assistant_failed",
            title: `TradeLine assistant for service #${svc.id} failed after ${MAX_RETRIES_PER_DAY} retries`,
            details: `Last error: ${meta?.tradeline?.assistant?.lastBuildError || "unknown"}`,
            metadata: { client_service_id: svc.id, client_id: svc.client_id, lifetimeCount },
          });
          await storage.updateTradeLineConfig(svc.id, { retryInfo: { ...retryInfo, alertFired: true } } as any);
        }
        continue;
      }

      attempted++;
      const newRetryCount = retryCount + 1;
      const newLifetimeCount = lifetimeCount + 1;

      try {
        const result = await provisionTradeLineAssistant(svc.id);
        if (result.assistantId && !result.error) {
          succeeded++;
          await storage.updateTradeLineConfig(svc.id, {
            retryInfo: { date: today, count: 0, lifetimeCount: newLifetimeCount, alertFired: false, permanentAlertFired: false },
          } as any);
          log.info("TradeLine retry succeeded", { clientServiceId: String(svc.id) });
        } else {
          await storage.updateTradeLineConfig(svc.id, {
            retryInfo: { date: today, count: newRetryCount, lifetimeCount: newLifetimeCount, alertFired: false },
          } as any);
          log.warn("TradeLine retry did not succeed", { clientServiceId: String(svc.id), error: result.error || "unknown", attempt: String(newRetryCount), lifetime: String(newLifetimeCount) });
        }
      } catch (err) {
        await storage.updateTradeLineConfig(svc.id, {
          retryInfo: { date: today, count: newRetryCount, lifetimeCount: newLifetimeCount, alertFired: false },
        } as any);
        log.error("TradeLine retry threw", { clientServiceId: String(svc.id), error: (err as Error).message, attempt: String(newRetryCount), lifetime: String(newLifetimeCount) });
      }
    }
  } catch (err) {
    log.error("TradeLine retry worker failed", { error: (err as Error).message });
    throw err;
  }

  log.info("TradeLine retry worker complete", {
    attempted: String(attempted),
    succeeded: String(succeeded),
    exhausted: String(exhausted),
    permanentlyFailed: String(permanentlyFailed),
  });
  return { attempted, succeeded, exhausted, permanentlyFailed };
}
