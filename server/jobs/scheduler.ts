import cron from "node-cron";
import { storage } from "../storage";
import { runDailyAggregation } from "./aggregation";
import { sendWeeklyReports } from "./weeklyReport";
import { processNotificationQueue } from "./notificationWorker";
import { processFollowupJobs } from "./followupWorker";
import { processAuditFollowups } from "./auditFollowupWorker";
import { cleanupExpiredMemory } from "../services/chatMemory";
import { processSocialSyncQueue } from "./socialSyncWorker";
import { generateAllDue } from "../services/socialSync/orchestrator";
import { checkConnectionExpiry } from "../services/socialSync/connectionLifecycle";
import { cleanupOldMedia } from "../services/socialSync/mediaService";
import { processAllClientReviews } from "../services/socialSync/reviewAutomation";

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

  cron.schedule("* * * * *", async () => {
    try {
      await processNotificationQueue();
    } catch (err: any) {
      console.error("[Scheduler] notification_worker error:", err.message);
    }
  });

  cron.schedule("* * * * *", async () => {
    try {
      await processFollowupJobs();
    } catch (err: any) {
      console.error("[Scheduler] followup_worker error:", err.message);
    }
  });

  cron.schedule("* * * * *", async () => {
    try {
      await processAuditFollowups();
    } catch (err: any) {
      console.error("[Scheduler] audit_followup_worker error:", err.message);
    }
  });

  // Chat memory cleanup — runs daily at 3 AM UTC, removes expired 7-day records
  cron.schedule("0 3 * * *", async () => {
    console.log("[Scheduler] Running chat memory cleanup...");
    try {
      await runJob("chat_memory_cleanup", async () => {
        await cleanupExpiredMemory();
        return { status: "ok" };
      });
    } catch (err: any) {
      console.error("[Scheduler] chat_memory_cleanup cron handler error:", err.message);
    }
  }, { timezone: "UTC" });

  // SocialSync publish queue — runs every 2 minutes
  cron.schedule("*/2 * * * *", async () => {
    try {
      await runJob("socialsync_queue_worker", processSocialSyncQueue);
    } catch (err: any) {
      console.error("[Scheduler] socialsync_queue_worker error:", err.message);
    }
  });

  // SocialSync content generation — runs weekly on Sunday at 6 AM UTC
  // Generates the upcoming week's content for all autopilot clients
  cron.schedule("0 6 * * 0", async () => {
    console.log("[Scheduler] Running SocialSync weekly content generation...");
    try {
      await runJob("socialsync_weekly_generation", generateAllDue);
    } catch (err: any) {
      console.error("[Scheduler] socialsync_weekly_generation error:", err.message);
    }
  }, { timezone: "UTC" });

  // SocialSync connection expiry check — runs daily at 4 AM UTC
  cron.schedule("0 4 * * *", async () => {
    console.log("[Scheduler] Running SocialSync connection expiry check...");
    try {
      await runJob("socialsync_expiry_check", checkConnectionExpiry);
    } catch (err: any) {
      console.error("[Scheduler] socialsync_expiry_check error:", err.message);
    }
  }, { timezone: "UTC" });

  console.log("[Scheduler] Jobs scheduled:");
  console.log("  - Daily aggregation: 02:00 UTC every day");
  console.log("  - Chat memory cleanup: 03:00 UTC every day");
  console.log("  - Weekly email report: 13:00 UTC every Monday (~8AM EST)");
  console.log("  - Notification queue worker: every minute");
  console.log("  - Follow-up jobs worker: every minute");
  console.log("  - Audit follow-up worker: every minute");
  console.log("  - SocialSync queue worker: every 2 minutes");
  console.log("  - SocialSync weekly generation: 06:00 UTC every Sunday");
  console.log("  - SocialSync expiry check: 04:00 UTC every day");

  // SocialSync media cleanup — runs daily at 5 AM UTC
  cron.schedule("0 5 * * *", async () => {
    console.log("[Scheduler] Running SocialSync media cleanup...");
    try {
      await runJob("socialsync_media_cleanup", cleanupOldMedia);
    } catch (err: any) {
      console.error("[Scheduler] socialsync_media_cleanup error:", err.message);
    }
  }, { timezone: "UTC" });

  console.log("  - SocialSync media cleanup: 05:00 UTC every day");

  // SocialSync review automation — runs every 6 hours
  cron.schedule("0 */6 * * *", async () => {
    console.log("[Scheduler] Running SocialSync review automation...");
    try {
      await runJob("socialsync_review_automation", processAllClientReviews);
    } catch (err: any) {
      console.error("[Scheduler] socialsync_review_automation error:", err.message);
    }
  }, { timezone: "UTC" });

  console.log("  - SocialSync review automation: every 6 hours");
}
