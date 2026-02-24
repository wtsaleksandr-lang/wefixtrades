import cron from "node-cron";
import { storage } from "../storage";
import { runDailyAggregation } from "./aggregation";
import { sendWeeklyReports } from "./weeklyReport";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

async function withRetry<T>(
  jobName: string,
  fn: () => Promise<T>,
  retries = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      console.error(`[Scheduler] ${jobName} attempt ${attempt}/${retries} failed:`, err.message);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }
  }

  throw lastError;
}

async function runJob(jobName: string, fn: () => Promise<any>) {
  let logId: number | null = null;

  try {
    const log = await storage.createJobLog({
      job_name: jobName,
      status: "running",
      started_at: new Date(),
      metadata: null,
    });
    logId = log.id;
  } catch (logErr: any) {
    console.error(`[Scheduler] Failed to create job log for ${jobName}:`, logErr.message);
  }

  try {
    const result = await withRetry(jobName, fn);
    if (logId) {
      await storage.updateJobLog(logId, {
        status: "completed",
        finished_at: new Date(),
        metadata: result,
      }).catch((e: any) => console.error(`[Scheduler] Failed to update job log:`, e.message));
    }
    console.log(`[Scheduler] ${jobName} completed:`, JSON.stringify(result));
    return result;
  } catch (err: any) {
    if (logId) {
      await storage.updateJobLog(logId, {
        status: "failed",
        finished_at: new Date(),
        error_message: err.message,
      }).catch((e: any) => console.error(`[Scheduler] Failed to update job log:`, e.message));
    }
    console.error(`[Scheduler] ${jobName} FAILED after ${MAX_RETRIES} retries:`, err.message);
    throw err;
  }
}

export function initScheduler() {
  console.log("[Scheduler] Initializing job scheduler...");

  cron.schedule("0 2 * * *", async () => {
    console.log("[Scheduler] Running daily aggregation...");
    try {
      await runJob("daily_aggregation", runDailyAggregation);
    } catch (err: any) {
      console.error("[Scheduler] daily_aggregation cron handler error:", err.message);
    }
  }, { timezone: "UTC" });

  cron.schedule("0 13 * * 1", async () => {
    console.log("[Scheduler] Running weekly email reports...");
    try {
      await runJob("weekly_email_report", sendWeeklyReports);
    } catch (err: any) {
      console.error("[Scheduler] weekly_email_report cron handler error:", err.message);
    }
  }, { timezone: "UTC" });

  console.log("[Scheduler] Jobs scheduled:");
  console.log("  - Daily aggregation: 02:00 UTC every day");
  console.log("  - Weekly email report: 13:00 UTC every Monday (~8AM EST)");
}
