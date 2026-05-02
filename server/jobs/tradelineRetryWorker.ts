/**
 * TradeLine Retry Worker
 *
 * Runs every 15 minutes. Queries TradeLine services where assistant.status === "failed"
 * and attempts to re-provision. Max 3 retries per day per service.
 * If still failing after 3 retries, fires an alert.
 */

import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import { fireAlert } from "../services/alertService";
import { db } from "../db";
import { clientServices } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

const log = createLogger("TradeLineRetryWorker");

const MAX_RETRIES_PER_DAY = 3;

export async function processTradeLineRetries(): Promise<{ attempted: number; succeeded: number; exhausted: number }> {
  let attempted = 0;
  let succeeded = 0;
  let exhausted = 0;

  try {
    const services = await db.select({
      id: clientServices.id,
      metadata: clientServices.metadata,
      client_id: clientServices.client_id,
    })
      .from(clientServices)
      .where(and(
        sql`${clientServices.service_id} LIKE 'tradeline%'`,
        eq(clientServices.status, "active"),
      ));

    const failedServices = services.filter(svc => {
      const meta = (svc.metadata as Record<string, any>) ?? {};
      return meta?.tradeline?.assistant?.status === "failed";
    });

    if (failedServices.length === 0) {
      log.debug("No failed TradeLine services to retry");
      return { attempted: 0, succeeded: 0, exhausted: 0 };
    }

    const { provisionTradeLineAssistant } = await import("../services/vapiService");
    const today = new Date().toISOString().split("T")[0];

    for (const svc of failedServices) {
      const meta = (svc.metadata as Record<string, any>) ?? {};
      const retryInfo = meta?.tradeline?.retryInfo ?? {};
      const retryDate = retryInfo?.date;
      const retryCount = retryDate === today ? (retryInfo?.count ?? 0) : 0;

      if (retryCount >= MAX_RETRIES_PER_DAY) {
        if (!retryInfo?.alertFired) {
          exhausted++;
          await fireAlert({
            severity: "high",
            category: "tradeline_assistant_failed",
            title: `TradeLine assistant for service #${svc.id} failed after ${MAX_RETRIES_PER_DAY} retries`,
            details: `Last error: ${meta?.tradeline?.assistant?.lastBuildError || "unknown"}`,
            metadata: { client_service_id: svc.id, client_id: svc.client_id },
          });
          await storage.updateTradeLineConfig(svc.id, { retryInfo: { ...retryInfo, alertFired: true } } as any);
        }
        continue;
      }

      attempted++;
      const newRetryCount = retryCount + 1;

      try {
        const result = await provisionTradeLineAssistant(svc.id);
        if (result.assistantId && !result.error) {
          succeeded++;
          await storage.updateTradeLineConfig(svc.id, { retryInfo: { date: today, count: 0, alertFired: false } } as any);
          log.info("TradeLine retry succeeded", { clientServiceId: String(svc.id) });
        } else {
          await storage.updateTradeLineConfig(svc.id, { retryInfo: { date: today, count: newRetryCount, alertFired: false } } as any);
          log.warn("TradeLine retry did not succeed", { clientServiceId: String(svc.id), error: result.error || "unknown", attempt: String(newRetryCount) });
        }
      } catch (err) {
        await storage.updateTradeLineConfig(svc.id, { retryInfo: { date: today, count: newRetryCount, alertFired: false } } as any);
        log.error("TradeLine retry threw", { clientServiceId: String(svc.id), error: (err as Error).message, attempt: String(newRetryCount) });
      }
    }
  } catch (err) {
    log.error("TradeLine retry worker failed", { error: (err as Error).message });
    throw err;
  }

  log.info("TradeLine retry worker complete", { attempted: String(attempted), succeeded: String(succeeded), exhausted: String(exhausted) });
  return { attempted, succeeded, exhausted };
}
