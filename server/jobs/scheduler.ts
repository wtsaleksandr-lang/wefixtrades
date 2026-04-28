import cron from "node-cron";
import { storage } from "../storage";
import { runDailyAggregation } from "./aggregation";
import { sendWeeklyReports } from "./weeklyReport";
import { processNotificationQueue } from "./notificationWorker";
import { processFollowupJobs } from "./followupWorker";
import { processAuditFollowups } from "./auditFollowupWorker";
import { processReviewFollowups } from "./reviewFollowupWorker";
import { processReviewMonitoring } from "./reviewMonitorWorker";
import { processReputationReports } from "./reputationReportWorker";
import { cleanupExpiredMemory } from "../services/chatMemory";
import { runDailyOpsIntelligence } from "./opsIntelligenceJob";
import { processOutboundSync } from "./outboundSyncWorker";
import { processRankFlowPlans } from "./rankflowWorker";
import { processRankFlowTracking } from "./trackingWorker";
import { processMapguardScans } from "./mapguardScanWorker";
import { processMapguardReports } from "./mapguardReportWorker";
import { processRankflowReports } from "./rankflowReportWorker";
import { processSocialsyncReports } from "./socialsyncReportWorker";
import { processAdflowReports } from "./adflowReportWorker";
import { processMapguardWeeklyUpdates } from "./mapguardWeeklyUpdateWorker";
import { processTrialLifecycle, pauseExpiredTrials } from "./trialLifecycleWorker";
/* Sprint 10: import retained for backward-compat (legacy worker still
 * callable manually for one-off drains during cutover). Cron entry
 * that invoked it has been removed. */
import { processSocialSyncQueue } from "./socialSyncWorker";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _legacyWorkerExportRetained = processSocialSyncQueue;
import { processQueue as processWordpressPublishQueue } from "../services/contentflow/wordpressQueue";
import { generateAllDue } from "../services/socialSync/orchestrator";
import { checkConnectionExpiry } from "../services/socialSync/connectionLifecycle";
import { cleanupOldMedia } from "../services/socialSync/mediaService";
import { processAllClientReviews } from "../services/reputation/reviewOrchestrator";
import { processReviewRequests } from "../services/reputation/reviewRequestService";

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
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
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

  // Background AI Ops Engine — runs daily at 07:00 UTC
  cron.schedule("0 7 * * *", async () => {
    console.log("[Scheduler] Running daily ops intelligence...");
    try {
      await runJob("ops_daily_intelligence", runDailyOpsIntelligence);
    } catch (err: any) {
      console.error("[Scheduler] ops_daily_intelligence cron handler error:", err.message);
    }
  }, { timezone: "UTC" });

  cron.schedule("* * * * *", async () => {
    try {
      await processReviewFollowups();
    } catch (err: any) {
      console.error("[Scheduler] review_followup_worker error:", err.message);
    }
  });

  cron.schedule("0 */6 * * *", async () => {
    console.log("[Scheduler] Running review monitoring...");
    try {
      await runJob("review_monitoring", processReviewMonitoring);
    } catch (err: any) {
      console.error("[Scheduler] review_monitoring cron handler error:", err.message);
    }
  }, { timezone: "UTC" });

  cron.schedule("0 9 * * *", async () => {
    console.log("[Scheduler] Running reputation reports...");
    try {
      await runJob("reputation_reports", processReputationReports);
    } catch (err: any) {
      console.error("[Scheduler] reputation_reports cron handler error:", err.message);
    }
  }, { timezone: "UTC" });


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

  // Outbound sync — push pending prospects to Instantly/Smartlead every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    try {
      await runJob("outbound_sync", processOutboundSync);
    } catch (err: any) {
      console.error("[Scheduler] outbound_sync cron handler error:", err.message);
    }
  });


  cron.schedule("0 4 * * 1", async () => {
    console.log("[Scheduler] Running RankFlow plan generation...");
    try {
      await runJob("rankflow_plan_generation", processRankFlowPlans);
    } catch (err: any) {
      console.error("[Scheduler] rankflow_plan_generation cron handler error:", err.message);
    }
  }, { timezone: "UTC" });

  cron.schedule("0 5 * * 3", async () => {
    console.log("[Scheduler] Running RankFlow tracking...");
    try {
      await runJob("rankflow_tracking", processRankFlowTracking);
    } catch (err: any) {
      console.error("[Scheduler] rankflow_tracking cron handler error:", err.message);
    }
  }, { timezone: "UTC" });

  cron.schedule("0 4 * * 2", async () => {
    console.log("[Scheduler] Running MapGuard weekly monitoring scan...");
    try {
      await runJob("mapguard_weekly_scan", processMapguardScans);
    } catch (err: any) {
      console.error("[Scheduler] mapguard_weekly_scan cron handler error:", err.message);
    }
  }, { timezone: "UTC" });

  cron.schedule("0 9 * * 5", async () => {
    console.log("[Scheduler] Running MapGuard weekly client updates...");
    try {
      await runJob("mapguard_weekly_update", processMapguardWeeklyUpdates);
    } catch (err: any) {
      console.error("[Scheduler] mapguard_weekly_update cron handler error:", err.message);
    }
  }, { timezone: "UTC" });

  cron.schedule("0 10 2 * *", async () => {
    console.log("[Scheduler] Running MapGuard monthly reports...");
    try {
      await runJob("mapguard_monthly_reports", processMapguardReports);
    } catch (err: any) {
      console.error("[Scheduler] mapguard_monthly_reports cron handler error:", err.message);
    }
  }, { timezone: "UTC" });

  // RankFlow monthly reports — 11:00 UTC on the 2nd of each month
  // (one hour after MapGuard to spread the rollup-batch load).
  // Idempotent per period via client_service.metadata.last_rankflow_report_period,
  // so safe even if the cron fires twice or the deploy restarts mid-run.
  cron.schedule("0 11 2 * *", async () => {
    console.log("[Scheduler] Running RankFlow monthly reports...");
    try {
      await runJob("rankflow_monthly_reports", processRankflowReports);
    } catch (err: any) {
      console.error("[Scheduler] rankflow_monthly_reports cron handler error:", err.message);
    }
  }, { timezone: "UTC" });

  // SocialSync monthly reports — 12:00 UTC on the 2nd of each month
  // (one hour after RankFlow to spread the rollup-batch load).
  // Idempotent per period via client_service.metadata.last_socialsync_report_period,
  // so safe even if the cron fires twice or the deploy restarts mid-run.
  cron.schedule("0 12 2 * *", async () => {
    console.log("[Scheduler] Running SocialSync monthly reports...");
    try {
      await runJob("socialsync_monthly_reports", processSocialsyncReports);
    } catch (err: any) {
      console.error("[Scheduler] socialsync_monthly_reports cron handler error:", err.message);
    }
  }, { timezone: "UTC" });

  // AdFlow monthly reports — 13:00 UTC on the 2nd of each month
  // (one hour after SocialSync to spread the rollup-batch load).
  //
  // STRICT-GATED — unlike the other monthly reports, AdFlow metrics are
  // admin-entered, not auto-collected. The batch sender only fires for
  // services where metadata.latest_report.period_start falls within the
  // previous calendar month. Clients with missing or stale metrics are
  // bucketed under skipped_missing_current_report (visible in job_logs)
  // so ops can see who still needs metrics entered.
  //
  // Idempotent per period via client_service.metadata.last_report_period,
  // so safe even if the cron fires twice or the deploy restarts mid-run.
  // Existing admin-trigger path (task.delivered → compileAndSendAdFlowReport)
  // is unaffected — this cron is a parallel sweep, not a replacement.
  cron.schedule("0 13 2 * *", async () => {
    console.log("[Scheduler] Running AdFlow monthly reports...");
    try {
      await runJob("adflow_monthly_reports", processAdflowReports);
    } catch (err: any) {
      console.error("[Scheduler] adflow_monthly_reports cron handler error:", err.message);
    }
  }, { timezone: "UTC" });

  cron.schedule("0 9 * * *", async () => {
    console.log("[Scheduler] Running trial lifecycle worker...");
    try {
      await runJob("trial_lifecycle", async () => {
        const emailResult = await processTrialLifecycle();
        const pauseResult = await pauseExpiredTrials();
        return { ...emailResult, paused: pauseResult.paused, pauseErrors: pauseResult.errors };
      });
    } catch (err: any) {
      console.error("[Scheduler] trial_lifecycle cron handler error:", err.message);
    }
  });

  /* Sprint 10: SocialSync legacy queue worker — RETIRED.
   *
   * The cron entry that previously called processSocialSyncQueue every
   * 2 min is removed. SocialSync now publishes through ContentFlow's
   * unified publishQueue (see below) via the facebook / instagram /
   * gbp_post adapters. The legacy worker file remains in
   * server/jobs/socialSyncWorker.ts (marked @deprecated) for one
   * release cycle as a rollback path. The socialsync_publish_queue
   * table also remains — Sprint 11 or 12 will drop both.
   *
   * In-flight legacy queue rows at deploy time: drained one final
   * time by manual invocation via the existing dev test endpoint
   * before this code path was removed. */

  // Sprint 5/8/9/10: ContentFlow unified publish queue. Drains all 5
  // channels (wordpress / gbp / facebook / instagram / gbp_post) per
  // tick via atomic FOR UPDATE SKIP LOCKED claims. The `isRunning`
  // guard prevents two ticks of the same cron from overlapping if a
  // tick takes longer than the 2-minute interval.
  let publishQueueRunning = false;
  cron.schedule("*/2 * * * *", async () => {
    if (publishQueueRunning) {
      console.log("[Scheduler] contentflow_publish_queue skipped — previous tick still running");
      return;
    }
    publishQueueRunning = true;
    try {
      await runJob("contentflow_publish_queue", processWordpressPublishQueue);
    } catch (err: any) {
      console.error("[Scheduler] contentflow_publish_queue error:", err.message);
    } finally {
      publishQueueRunning = false;
    }
  });

  cron.schedule("0 6 * * 0", async () => {
    console.log("[Scheduler] Running SocialSync weekly content generation...");
    try {
      await runJob("socialsync_weekly_generation", generateAllDue);
    } catch (err: any) {
      console.error("[Scheduler] socialsync_weekly_generation error:", err.message);
    }
  }, { timezone: "UTC" });

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
  console.log("  - Background ops intelligence: 07:00 UTC every day");
  console.log("  - Trial lifecycle emails: 09:00 UTC every day");
  console.log("  - Weekly email report: 13:00 UTC every Monday (~8AM EST)");
  console.log("  - RankFlow plan generation: 04:00 UTC every Monday");
  console.log("  - RankFlow tracking: 05:00 UTC every Wednesday");
  console.log("  - MapGuard weekly scan: 04:00 UTC every Tuesday");
  console.log("  - MapGuard weekly client update: 09:00 UTC every Friday");
  console.log("  - MapGuard monthly reports: 10:00 UTC on the 2nd of each month");
  console.log("  - Notification queue worker: every minute");
  console.log("  - Follow-up jobs worker: every minute");
  console.log("  - Audit follow-up worker: every minute");
  console.log("  - Outbound sync worker: every 15 minutes");
  console.log("  - Review follow-up worker: every minute");
  console.log("  - Review monitoring: every 6 hours");
  console.log("  - Reputation reports: 09:00 UTC daily");
  console.log("  - SocialSync queue worker: every 2 minutes");
  console.log("  - SocialSync weekly generation: 06:00 UTC every Sunday");
  console.log("  - SocialSync expiry check: 04:00 UTC every day");
  console.log("  - SocialSync monthly reports: 12:00 UTC on the 2nd of each month");
  console.log("  - AdFlow monthly reports: 13:00 UTC on the 2nd of each month (strict-gated)");

  cron.schedule("0 5 * * *", async () => {
    console.log("[Scheduler] Running SocialSync media cleanup...");
    try {
      await runJob("socialsync_media_cleanup", cleanupOldMedia);
    } catch (err: any) {
      console.error("[Scheduler] socialsync_media_cleanup error:", err.message);
    }
  }, { timezone: "UTC" });

  console.log("  - SocialSync media cleanup: 05:00 UTC every day");

  cron.schedule("0 */6 * * *", async () => {
    console.log("[Scheduler] Running SocialSync review automation...");
    try {
      await runJob("socialsync_review_automation", processAllClientReviews);
    } catch (err: any) {
      console.error("[Scheduler] socialsync_review_automation error:", err.message);
    }
  }, { timezone: "UTC" });

  console.log("  - SocialSync review automation: every 6 hours");

  cron.schedule("*/15 * * * *", async () => {
    try {
      await runJob("review_request_delivery", processReviewRequests);
    } catch (err: any) {
      console.error("[Scheduler] review_request_delivery error:", err.message);
    }
  });

  console.log("  - Review request delivery: every 15 minutes");
}
