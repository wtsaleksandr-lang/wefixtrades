/**
 * TradeLine Mode Worker
 *
 * Runs every 5 minutes. For each active TradeLine client_service with
 * businessHours.schedule configured, checks current time in client's timezone
 * and auto-switches mode between "available" and "after_hours".
 * Skips if manual override was applied within the last 30 minutes.
 */

import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import { db } from "../db";
import { clientServices } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

const log = createLogger("TradeLineModeWorker");

const MANUAL_OVERRIDE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

interface DaySchedule {
  start: string;
  end: string;
}

interface BusinessHoursSchedule {
  [day: string]: DaySchedule | undefined;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function isWithinBusinessHours(schedule: BusinessHoursSchedule, timezone: string): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "long",
  });

  const parts = formatter.formatToParts(now);
  const dayPart = parts.find(p => p.type === "weekday")?.value?.toLowerCase() || "";
  const hourPart = parts.find(p => p.type === "hour")?.value || "0";
  const minutePart = parts.find(p => p.type === "minute")?.value || "0";

  const currentMinutes = parseInt(hourPart) * 60 + parseInt(minutePart);
  const daySchedule = schedule[dayPart];
  if (!daySchedule) return false;

  const startMinutes = timeToMinutes(daySchedule.start);
  const endMinutes = timeToMinutes(daySchedule.end);

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

function wasRecentlyManuallyOverridden(metadata: Record<string, any>): boolean {
  const lastManualSwitch = metadata?.tradeline?.lastManualModeSwitch;
  if (!lastManualSwitch) return false;
  const elapsed = Date.now() - new Date(lastManualSwitch).getTime();
  return elapsed < MANUAL_OVERRIDE_WINDOW_MS;
}

export async function processTradeLineModeSync(): Promise<{ checked: number; switched: number; skipped: number }> {
  let checked = 0;
  let switched = 0;
  let skipped = 0;

  try {
    const services = await db.select({
      id: clientServices.id,
      metadata: clientServices.metadata,
    })
      .from(clientServices)
      .where(and(
        sql`${clientServices.service_id} LIKE 'tradeline%'`,
        eq(clientServices.status, "active"),
      ));

    for (const svc of services) {
      const meta = (svc.metadata as Record<string, any>) ?? {};
      const tradeline = meta?.tradeline;
      if (!tradeline) continue;

      const schedule = tradeline?.businessHours?.schedule as BusinessHoursSchedule | undefined;
      const timezone = tradeline?.businessHours?.timezone as string | undefined;

      if (!schedule || Object.keys(schedule).length === 0) continue;
      if (!timezone) continue;

      checked++;

      if (wasRecentlyManuallyOverridden(meta)) { skipped++; continue; }
      if (tradeline?.assistant?.status === "disabled") { skipped++; continue; }

      const currentMode = tradeline?.currentMode || "available";

      try {
        const withinHours = isWithinBusinessHours(schedule, timezone);
        const desiredMode = withinHours ? "available" : "after_hours";

        if (currentMode !== desiredMode) {
          await storage.setTradeLineMode(svc.id, desiredMode, "schedule");
          switched++;
          log.info("Auto-switched TradeLine mode", { clientServiceId: String(svc.id), from: currentMode, to: desiredMode });
        }
      } catch (err) {
        log.error("Failed to check/switch mode for service", { clientServiceId: String(svc.id), error: (err as Error).message });
      }
    }
  } catch (err) {
    log.error("TradeLine mode sync failed", { error: (err as Error).message });
    throw err;
  }

  log.info("TradeLine mode sync complete", { checked: String(checked), switched: String(switched), skipped: String(skipped) });
  return { checked, switched, skipped };
}
