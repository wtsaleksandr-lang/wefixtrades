import cron from "node-cron";
import { createLogger } from "../lib/logger";
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
import { processWebcareHealthChecks } from "./webcareHealthWorker";
import { processDunningQueue } from "./dunningWorker";
import { processMapguardWeeklyUpdates } from "./mapguardWeeklyUpdateWorker";
import { processTrialLifecycle, pauseExpiredTrials } from "./trialLifecycleWorker";
/* Sprint 15: deprecated processSocialSyncQueue + socialSyncWorker.ts
 * deleted. SocialSync admin endpoints now route through ContentFlow's
 * unified queue (processQueue below). No rollback path needed —
 * Sprint 10 cron retirement was already in production. */
import { processImageRetention } from "./imageRetentionWorker";
import { processPerformanceQueue } from "./performanceWorker";
import { processQueue as processWordpressPublishQueue } from "../services/contentflow/wordpressQueue";
import { generateAllDue } from "../services/socialSync/orchestrator";
import { checkConnectionExpiry } from "../services/socialSync/connectionLifecycle";
import { cleanupOldMedia } from "../services/socialSync/mediaService";
import { processAllClientReviews } from "../services/reputation/reviewOrchestrator";
import { processReviewRequests } from "../services/reputation/reviewRequestService";
import { processAutoActivation } from "./autoActivationWorker";

const log = createLogger("Scheduler");

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
      log.warn(`${jobName} attempt ${attempt}/${retries} failed`, { error: err.message });
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
    const jobLog = await storage.createJobLog({
      job_name: jobName,
      status: "running",
      started_at: new Date(),
      metadata: null,
    });
    logId = jobLog.id;
  } catch (logErr: any) {
    log.error(`Failed to create job log for ${jobName}`, { error: logErr.message });
  }

  try {
    const result = await withRetry(jobName, fn);
    if (logId) {
      await storage.updateJobLog(logId, {
        status: "completed",
        finished_at: new Date(),
        metadata: result,
      }).catch((e: any) => log.error("Failed to update job log", { error: e.message }));
    }
    log.info(`${jobName} completed`, { result });
    return result;
  } catch (err: any) {
    if (logId) {
      await storage.updateJobLog(logId, {
        status: "failed",
        finished_at: new Date(),
        error_message: err.message,
      }).catch((e: any) => log.error("Failed to update job log", { error: e.message }));
    }
    log.error(`${jobName} FAILED after ${MAX_RETRIES} retries`, { error: err.message });
    throw err;
  }
}

export function initScheduler() {
  log.info("Initializing job scheduler...");

  cron.schedule("0 2 * * *", async () => {
    log.info("Running daily aggregation...");
    try {
      await runJob("daily_aggregation", runDailyAggregation);
    } catch (err: any) {
      log.error("daily_aggregation cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

  cron.schedule("0 13 * * 1", async () => {
    log.info("Running weekly email reports...");
    try {
      await runJob("weekly_email_report", sendWeeklyReports);
    } catch (err: any) {
      log.error("weekly_email_report cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

  cron.schedule("* * * * *", async () => {
    try {
      await processNotificationQueue();
    } catch (err: any) {
      log.error("notification_worker error", { error: err.message });
    }
  });

  cron.schedule("* * * * *", async () => {
    try {
      await processFollowupJobs();
    } catch (err: any) {
      log.error("followup_worker error", { error: err.message });
    }
  });

  cron.schedule("* * * * *", async () => {
    try {
      await processAuditFollowups();
    } catch (err: any) {
      log.error("audit_followup_worker error", { error: err.message });
    }
  });

  // Background AI Ops Engine — runs daily at 07:00 UTC
  cron.schedule("0 7 * * *", async () => {
    log.info("Running daily ops intelligence...");
    try {
      await runJob("ops_daily_intelligence", runDailyOpsIntelligence);
    } catch (err: any) {
      log.error("ops_daily_intelligence cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

  cron.schedule("* * * * *", async () => {
    try {
      await processReviewFollowups();
    } catch (err: any) {
      log.error("review_followup_worker error", { error: err.message });
    }
  });

  cron.schedule("0 */6 * * *", async () => {
    log.info("Running review monitoring...");
    try {
      await runJob("review_monitoring", processReviewMonitoring);
    } catch (err: any) {
      log.error("review_monitoring cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

  cron.schedule("0 9 * * *", async () => {
    log.info("Running reputation reports...");
    try {
      await runJob("reputation_reports", processReputationReports);
    } catch (err: any) {
      log.error("reputation_reports cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });


  cron.schedule("0 3 * * *", async () => {
    log.info("Running chat memory cleanup...");
    try {
      await runJob("chat_memory_cleanup", async () => {
        await cleanupExpiredMemory();
        return { status: "ok" };
      });
    } catch (err: any) {
      log.error("chat_memory_cleanup cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

  // Outbound sync — push pending prospects to Instantly/Smartlead every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    try {
      await runJob("outbound_sync", processOutboundSync);
    } catch (err: any) {
      log.error("outbound_sync cron handler error", { error: err.message });
    }
  });


  cron.schedule("0 4 * * 1", async () => {
    log.info("Running RankFlow plan generation...");
    try {
      await runJob("rankflow_plan_generation", processRankFlowPlans);
    } catch (err: any) {
      log.error("rankflow_plan_generation cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

  cron.schedule("0 5 * * 3", async () => {
    log.info("Running RankFlow tracking...");
    try {
      await runJob("rankflow_tracking", processRankFlowTracking);
    } catch (err: any) {
      log.error("rankflow_tracking cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

  cron.schedule("0 4 * * 2", async () => {
    log.info("Running MapGuard weekly monitoring scan...");
    try {
      await runJob("mapguard_weekly_scan", processMapguardScans);
    } catch (err: any) {
      log.error("mapguard_weekly_scan cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

  cron.schedule("0 9 * * 5", async () => {
    log.info("Running MapGuard weekly client updates...");
    try {
      await runJob("mapguard_weekly_update", processMapguardWeeklyUpdates);
    } catch (err: any) {
      log.error("mapguard_weekly_update cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

  cron.schedule("0 10 2 * *", async () => {
    log.info("Running MapGuard monthly reports...");
    try {
      await runJob("mapguard_monthly_reports", processMapguardReports);
    } catch (err: any) {
      log.error("mapguard_monthly_reports cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

  // RankFlow monthly reports — 11:00 UTC on the 2nd of each month
  // (one hour after MapGuard to spread the rollup-batch load).
  // Idempotent per period via client_service.metadata.last_rankflow_report_period,
  // so safe even if the cron fires twice or the deploy restarts mid-run.
  cron.schedule("0 11 2 * *", async () => {
    log.info("Running RankFlow monthly reports...");
    try {
      await runJob("rankflow_monthly_reports", processRankflowReports);
    } catch (err: any) {
      log.error("rankflow_monthly_reports cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

  // SocialSync monthly reports — 12:00 UTC on the 2nd of each month
  // (one hour after RankFlow to spread the rollup-batch load).
  // Idempotent per period via client_service.metadata.last_socialsync_report_period,
  // so safe even if the cron fires twice or the deploy restarts mid-run.
  cron.schedule("0 12 2 * *", async () => {
    log.info("Running SocialSync monthly reports...");
    try {
      await runJob("socialsync_monthly_reports", processSocialsyncReports);
    } catch (err: any) {
      log.error("socialsync_monthly_reports cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

  /* AdFlow monthly reports — RETIRED (Sprint 1: AdFlow dropped).
   * Worker stub still exists but is a no-op. Cron removed. */

  cron.schedule("0 9 * * *", async () => {
    log.info("Running trial lifecycle worker...");
    try {
      await runJob("trial_lifecycle", async () => {
        const emailResult = await processTrialLifecycle();
        const pauseResult = await pauseExpiredTrials();
        return { ...emailResult, paused: pauseResult.paused, pauseErrors: pauseResult.errors };
      });
    } catch (err: any) {
      log.error("trial_lifecycle cron handler error", { error: err.message });
    }
  });

  /* Sprint 10/15: SocialSync legacy queue worker — REMOVED.
   *
   * Sprint 10 retired the cron entry; Sprint 15 deleted the worker
   * file (server/jobs/socialSyncWorker.ts) and the legacy admin
   * endpoints that still called it. SocialSync now publishes through
   * ContentFlow's unified publishQueue (see below) via the facebook /
   * instagram / gbp_post adapters. The socialsync_publish_queue
   * table remains in the schema (no migration this sprint) but is
   * orphaned — no code path writes to it. */

  // Sprint 5/8/9/10: ContentFlow unified publish queue. Drains all 5
  // channels (wordpress / gbp / facebook / instagram / gbp_post) per
  // tick via atomic FOR UPDATE SKIP LOCKED claims. The `isRunning`
  // guard prevents two ticks of the same cron from overlapping if a
  // tick takes longer than the 2-minute interval.
  let publishQueueRunning = false;
  cron.schedule("*/2 * * * *", async () => {
    if (publishQueueRunning) {
      log.debug("contentflow_publish_queue skipped — previous tick still running");
      return;
    }
    publishQueueRunning = true;
    try {
      await runJob("contentflow_publish_queue", processWordpressPublishQueue);
    } catch (err: any) {
      log.error("contentflow_publish_queue error", { error: err.message });
    } finally {
      publishQueueRunning = false;
    }
  });

  /* Sprint 17: ContentFlow performance worker. Pulls per-channel
   * engagement signals into draft.metadata.performance, computes a
   * 0-100 score, and stamps high/low_performer flags. Generators
   * read these flags to inject "successful pattern" hints into
   * future prompts. Cadence is 30 minutes — long enough to avoid
   * external API abuse, short enough that the feedback loop stays
   * meaningful for clients posting daily. Overlap-guarded. */
  let performanceWorkerRunning = false;
  cron.schedule("*/30 * * * *", async () => {
    if (performanceWorkerRunning) {
      log.debug("contentflow_performance skipped — previous tick still running");
      return;
    }
    performanceWorkerRunning = true;
    try {
      await runJob("contentflow_performance", processPerformanceQueue);
    } catch (err: any) {
      log.error("contentflow_performance error", { error: err.message });
    } finally {
      performanceWorkerRunning = false;
    }
  });

  cron.schedule("0 6 * * 0", async () => {
    log.info("Running SocialSync weekly content generation...");
    try {
      await runJob("socialsync_weekly_generation", generateAllDue);
    } catch (err: any) {
      log.error("socialsync_weekly_generation error", { error: err.message });
    }
  }, { timezone: "UTC" });

  cron.schedule("0 4 * * *", async () => {
    log.info("Running SocialSync connection expiry check...");
    try {
      await runJob("socialsync_expiry_check", checkConnectionExpiry);
    } catch (err: any) {
      log.error("socialsync_expiry_check error", { error: err.message });
    }
  }, { timezone: "UTC" });

  log.info("Jobs scheduled", {
    schedule: [
      "Daily aggregation: 02:00 UTC every day",
      "Chat memory cleanup: 03:00 UTC every day",
      "Background ops intelligence: 07:00 UTC every day",
      "Trial lifecycle emails: 09:00 UTC every day",
      "Weekly email report: 13:00 UTC every Monday (~8AM EST)",
      "RankFlow plan generation: 04:00 UTC every Monday",
      "RankFlow tracking: 05:00 UTC every Wednesday",
      "MapGuard weekly scan: 04:00 UTC every Tuesday",
      "MapGuard weekly client update: 09:00 UTC every Friday",
      "MapGuard monthly reports: 10:00 UTC on the 2nd of each month",
      "Notification queue worker: every minute",
      "Follow-up jobs worker: every minute",
      "Audit follow-up worker: every minute",
      "Outbound sync worker: every 15 minutes",
      "Review follow-up worker: every minute",
      "Review monitoring: every 6 hours",
      "Reputation reports: 09:00 UTC daily",
      "SocialSync queue worker: every 2 minutes",
      "SocialSync weekly generation: 06:00 UTC every Sunday",
      "SocialSync expiry check: 04:00 UTC every day",
      "SocialSync monthly reports: 12:00 UTC on the 2nd of each month",
      "WebCare health checks: every 15 minutes",
      "Auto-activation worker: every 5 minutes",
    ],
  });

  cron.schedule("0 5 * * *", async () => {
    log.info("Running SocialSync media cleanup...");
    try {
      await runJob("socialsync_media_cleanup", cleanupOldMedia);
    } catch (err: any) {
      log.error("socialsync_media_cleanup error", { error: err.message });
    }
  }, { timezone: "UTC" });

  cron.schedule("0 */6 * * *", async () => {
    log.info("Running SocialSync review automation...");
    try {
      await runJob("socialsync_review_automation", processAllClientReviews);
    } catch (err: any) {
      log.error("socialsync_review_automation error", { error: err.message });
    }
  }, { timezone: "UTC" });

  cron.schedule("*/15 * * * *", async () => {
    try {
      await runJob("review_request_delivery", processReviewRequests);
    } catch (err: any) {
      log.error("review_request_delivery error", { error: err.message });
    }
  });

  // Dunning queue worker — drains pending billing_dunning_events whose
  // scheduled_for has elapsed. Runs every 5 minutes so reminders go out
  // promptly when their day-2 / day-5 / day-7 window opens, while
  // staying out of the per-minute critical-path workers' lane.
  // Idempotent + 24h resend-guarded inside sendDunningRow().
  cron.schedule("*/5 * * * *", async () => {
    try {
      await runJob("dunning_queue", processDunningQueue);
    } catch (err: any) {
      log.error("dunning_queue error", { error: err.message });
    }
  });

  /* Sprint 11: ContentFlow image retention sweep. Daily at 04:30 UTC
   * (off-peak). Identifies generated images past retention thresholds
   * (180 days for unpublished, 2 years for published), best-effort
   * deletes from R2, and clears the URL pointers on the draft. */
  cron.schedule("30 4 * * *", async () => {
    try {
      await runJob("contentflow_image_retention", processImageRetention);
    } catch (err: any) {
      log.error("contentflow_image_retention error", { error: err.message });
    }
  }, { timezone: "UTC" });

  let webcareHealthRunning = false;
  cron.schedule("*/15 * * * *", async () => {
    if (webcareHealthRunning) {
      log.debug("webcare_health skipped — previous tick still running");
      return;
    }
    webcareHealthRunning = true;
    try {
      await runJob("webcare_health", processWebcareHealthChecks);
    } catch (err: any) {
      log.error("webcare_health error", { error: err.message });
    } finally {
      webcareHealthRunning = false;
    }
  });

  // Sprint 2: Auto-activation worker. Every 5 minutes, checks
  // onboarding services whose readiness conditions are met and
  // activates them without a human go-live gate. Overlap-guarded
  // in case a tick runs longer than 5 minutes.
  let autoActivationRunning = false;
  cron.schedule("*/5 * * * *", async () => {
    if (autoActivationRunning) {
      log.debug("auto_activation skipped — previous tick still running");
      return;
    }
    autoActivationRunning = true;
    try {
      await runJob("auto_activation", processAutoActivation);
    } catch (err: any) {
      log.error("auto_activation error", { error: err.message });
    } finally {
      autoActivationRunning = false;
    }
  });
}
