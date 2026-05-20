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
import { checkAdflowMissingMetrics } from "./adflowMetricsCheckWorker";
import { processWebcareHealthChecks } from "./webcareHealthWorker";
import { processDunningQueue } from "./dunningWorker";
import { processMapguardWeeklyUpdates } from "./mapguardWeeklyUpdateWorker";
import { processMapguardPostDrain } from "./mapguardPostDrainer";
import { fanoutMonthlyPosts } from "../services/mapguard/mapguardPostScheduler";
import { processMapguardReviewResponses } from "../services/mapguard/mapguardReviewResponder";
import { processTrialLifecycle, pauseExpiredTrials } from "./trialLifecycleWorker";
/* Sprint 15: deprecated processSocialSyncQueue + socialSyncWorker.ts
 * deleted. SocialSync admin endpoints now route through ContentFlow's
 * unified queue (processQueue below). No rollback path needed —
 * Sprint 10 cron retirement was already in production. */
import { processImageRetention } from "./imageRetentionWorker";
import { processPerformanceQueue } from "./performanceWorker";
import { processContentflowGeneration } from "./contentflowGenerationWorker";
import { processQueue as processWordpressPublishQueue } from "../services/contentflow/wordpressQueue";
import { generateAllDue } from "../services/socialSync/orchestrator";
import { checkConnectionExpiry } from "../services/socialSync/connectionLifecycle";
import { cleanupOldMedia } from "../services/socialSync/mediaService";
import { processAllClientReviews } from "../services/reputation/reviewOrchestrator";
import { processReviewRequests } from "../services/reputation/reviewRequestService";
import { processAutoActivation } from "./autoActivationWorker";
import { processRecurringTasks } from "./recurringTaskWorker";
import { processUpsellEmails } from "./upsellWorker";
import { processWebcareMaintenance } from "./webcareMaintenanceWorker";
import { processRetention } from "./retentionWorker";
import { processTradeLineModeSync } from "./tradelineModeWorker";
import { processTradeLineRetries } from "./tradelineRetryWorker";
import { fireAlert } from "../services/alertService";
import { processEmailQueue } from "../services/emailQueueService";
import { processEmbedBrokenDetection } from "./embedBrokenDetector";
import { processBillRetention } from "./tradelineBillRetentionWorker";
import { processProTrialExpiry } from "./trialProExpiryWorker";
import { processTradelineProvisionRetry } from "./tradelineProvisionRetryWorker";
import { processRoutingEngine } from "../engine/routingWorker";
import { releaseStaleSlugs } from "../services/quotequickSlugLifecycle";

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

export async function runJob(jobName: string, fn: () => Promise<any>) {
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

    // Fire a system alert for any worker failure
    fireAlert({
      severity: "critical",
      category: "worker_failed",
      title: `Worker "${jobName}" failed after ${MAX_RETRIES} retries`,
      details: err.message,
      metadata: { job_name: jobName, job_log_id: logId },
    }).catch(() => {});

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

  let notificationWorkerRunning = false;
  cron.schedule("* * * * *", async () => {
    if (notificationWorkerRunning) {
      log.debug("notification_worker skipped — previous tick still running");
      return;
    }
    notificationWorkerRunning = true;
    try {
      await processNotificationQueue();
    } catch (err: any) {
      log.error("notification_worker error", { error: err.message });
    } finally {
      notificationWorkerRunning = false;
    }
  });

  let followupWorkerRunning = false;
  cron.schedule("* * * * *", async () => {
    if (followupWorkerRunning) {
      log.debug("followup_worker skipped — previous tick still running");
      return;
    }
    followupWorkerRunning = true;
    try {
      await processFollowupJobs();
    } catch (err: any) {
      log.error("followup_worker error", { error: err.message });
    } finally {
      followupWorkerRunning = false;
    }
  });

  let auditFollowupWorkerRunning = false;
  cron.schedule("* * * * *", async () => {
    if (auditFollowupWorkerRunning) {
      log.debug("audit_followup_worker skipped — previous tick still running");
      return;
    }
    auditFollowupWorkerRunning = true;
    try {
      await processAuditFollowups();
    } catch (err: any) {
      log.error("audit_followup_worker error", { error: err.message });
    } finally {
      auditFollowupWorkerRunning = false;
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

  let reviewFollowupWorkerRunning = false;
  cron.schedule("* * * * *", async () => {
    if (reviewFollowupWorkerRunning) {
      log.debug("review_followup_worker skipped — previous tick still running");
      return;
    }
    reviewFollowupWorkerRunning = true;
    try {
      await processReviewFollowups();
    } catch (err: any) {
      log.error("review_followup_worker error", { error: err.message });
    } finally {
      reviewFollowupWorkerRunning = false;
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


  // Wave P-E — QuoteQuick slug lifecycle. Daily at 04:30 UTC. Warns
  // free-tier owners at day 23 of inactivity; releases the slug at day 30
  // (sets calculators.slug = NULL so the subdomain returns to the pool).
  // Paid tiers are excluded.
  cron.schedule("30 4 * * *", async () => {
    try {
      await runJob("quotequick_slug_release", async () => {
        const result = await releaseStaleSlugs();
        return result;
      });
    } catch (err: any) {
      log.error("quotequick_slug_release cron handler error", { error: err.message });
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

  // Tradeline bill retention — daily at 03:30 UTC, 90-day cleanup
  cron.schedule("30 3 * * *", async () => {
    try {
      await runJob("tradeline_bill_retention", processBillRetention);
    } catch (err: any) {
      log.error("tradeline_bill_retention cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

  // Pro-features trial expiry — daily at 04:00 UTC; flips the trial flag
  // on clients past their 14-day window and emails the trade.
  cron.schedule("0 4 * * *", async () => {
    try {
      await runJob("trial_pro_expiry", processProTrialExpiry);
    } catch (err: any) {
      log.error("trial_pro_expiry cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

  // Tradeline provision retry — hourly; picks up queued rows when admin Twilio creds land
  cron.schedule("17 * * * *", async () => {
    try {
      await runJob("tradeline_provision_retry", processTradelineProvisionRetry);
    } catch (err: any) {
      log.error("tradeline_provision_retry cron handler error", { error: err.message });
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

  // MapGuard GBP post fan-out — 03:00 UTC on the 1st of each month.
  // Inserts N scheduled rows per active mapguard-basic / mapguard-pro
  // subscriber (N = tier quota). Idempotent per (client_service_id,
  // quota_period). See mapguardPostScheduler.ts.
  cron.schedule("0 3 1 * *", async () => {
    log.info("Running MapGuard monthly post fan-out...");
    try {
      await runJob("mapguard_post_fanout", () => fanoutMonthlyPosts());
    } catch (err: any) {
      log.error("mapguard_post_fanout cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

  // MapGuard GBP post drainer — 14:30 UTC daily. Picks up scheduled
  // rows whose scheduled_for has passed, generates content via Claude,
  // and publishes via the Google Business Profile localPosts API.
  cron.schedule("30 14 * * *", async () => {
    log.info("Running MapGuard post drainer...");
    try {
      await runJob("mapguard_post_drain", () => processMapguardPostDrain());
    } catch (err: any) {
      log.error("mapguard_post_drain cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

  // MapGuard review responder — 08:00 UTC daily. For each active
  // ongoing MapGuard subscriber with a GBP connection, ingests fresh
  // reviews, drafts AI replies, and auto-posts where policy allows.
  // Human-attention-required reviews are held back for ops review.
  cron.schedule("0 8 * * *", async () => {
    log.info("Running MapGuard review responder...");
    try {
      await runJob("mapguard_review_responder", processMapguardReviewResponses);
    } catch (err: any) {
      log.error("mapguard_review_responder cron handler error", { error: err.message });
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

  // AdFlow monthly reports — 13:00 UTC on the 2nd of each month
  // (one hour after SocialSync to spread the rollup-batch load).
  // Metrics are manually entered via admin; worker skips clients
  // without current-period data. Idempotent per period via
  // client_service.metadata.last_report_period.
  cron.schedule("0 13 2 * *", async () => {
    log.info("Running AdFlow monthly reports...");
    try {
      await runJob("adflow_monthly_reports", processAdflowReports);
    } catch (err: any) {
      log.error("adflow_monthly_reports cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

  // AdFlow missing-metrics check — 08:00 UTC daily (runs logic only on 28th-30th)
  // Fires a system alert listing clients without current-month metrics entered.
  cron.schedule("0 8 * * *", async () => {
    try {
      await runJob("adflow_metrics_check", checkAdflowMissingMetrics);
    } catch (err: any) {
      log.error("adflow_metrics_check cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

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

  /* ContentFlow per-client generation worker.
   *
   * Daily at 08:30 UTC. For every active standalone ContentFlow
   * subscription (Creator / Studio / Agency), dispatches the SocialSync
   * orchestrator to generate that tier's slice of monthly content. The
   * worker is the scheduler + dispatcher only — actual AI generation
   * lives in server/services/socialSync/orchestrator.ts and
   * server/services/contentflow/*. Both the global ContentFlow gate
   * (kill-switch + spend-cap) and the per-tier monthly quota are
   * enforced here; per-call gating is also applied inside aiText.ts.
   *
   * Idempotent per (client_service_id, UTC day) via the bookkeeping
   * stamped on clientServices.metadata.contentflow.
   *
   * Overlap-guarded: a long-running generation tick (sequential per
   * client, with AI calls) MUST NOT overlap with the next day's tick. */
  let contentflowGenerationRunning = false;
  cron.schedule("30 8 * * *", async () => {
    if (contentflowGenerationRunning) {
      log.debug("contentflow_generation skipped — previous tick still running");
      return;
    }
    contentflowGenerationRunning = true;
    try {
      await runJob("contentflow_generation", processContentflowGeneration);
    } catch (err: any) {
      log.error("contentflow_generation cron handler error", { error: err.message });
    } finally {
      contentflowGenerationRunning = false;
    }
  }, { timezone: "UTC" });

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
      "ContentFlow per-client generation: 08:30 UTC every day",
      "SocialSync queue worker: every 2 minutes",
      "SocialSync weekly generation: 06:00 UTC every Sunday",
      "SocialSync expiry check: 04:00 UTC every day",
      "SocialSync monthly reports: 12:00 UTC on the 2nd of each month",
      "AdFlow monthly reports: 13:00 UTC on the 2nd of each month",
      "AdFlow metrics check: 08:00 UTC daily (active 28th-30th only)",
      "WebCare health checks: every 15 minutes",
      "Embed broken detection: 06:00 UTC daily",
      "Recurring task generation: 01:00 UTC every day",
      "Auto-activation worker: every 5 minutes",
      "Upsell emails: 10:00 UTC daily",
      "WebCare monthly maintenance: 03:00 UTC on the 1st of each month",
      "Routing engine: every 5 minutes",
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

  // Sprint 2-3: reply-post retry queue. Drains the durable queue for
  // failed Google replies (and future multi-platform replies) every 2
  // minutes. Backoff is per-row so this just needs to wake up often
  // enough to dispatch due rows; exponential schedule is in the worker.
  cron.schedule("*/2 * * * *", async () => {
    try {
      const { drainReplyPostQueue } = await import("./replyPostQueueWorker");
      await runJob("reply_post_queue_drain", drainReplyPostQueue);
    } catch (err: any) {
      log.error("reply_post_queue_drain error", { error: err.message });
    }
  });

  // Sprint 3: competitor tracking snapshot — daily 04:30 UTC. One row
  // per (competitor, day); idempotent via the daily unique index.
  cron.schedule("30 4 * * *", async () => {
    try {
      const { runCompetitorSnapshots } = await import("./competitorSnapshotWorker");
      await runJob("competitor_snapshots", runCompetitorSnapshots);
    } catch (err: any) {
      log.error("competitor_snapshots error", { error: err.message });
    }
  }, { timezone: "UTC" });

  // Sprint 4: proactive Google OAuth token refresh for ReputationShield.
  // Refreshes tokens expiring inside 24h ahead of time so background syncs
  // don't fail with a stale-token error and customers don't see broken
  // states the first time they open the portal after token expiry.
  // Daily at 03:15 UTC — off-peak, after most providers' rate-limit windows reset.
  cron.schedule("15 3 * * *", async () => {
    try {
      const { runReputationTokenRefresh } = await import("./reputationTokenRefreshWorker");
      await runJob("reputation_token_refresh", runReputationTokenRefresh);
    } catch (err: any) {
      log.error("reputation_token_refresh error", { error: err.message });
    }
  }, { timezone: "UTC" });

  // ReputationShield "connect Google" re-nudge — daily at 16:00 UTC.
  // Follows up with customers who activated RS but never completed the
  // Google OAuth step (without which the product produces nothing).
  // Capped at 2 nudges/customer; idempotent via client_services.metadata.
  cron.schedule("0 16 * * *", async () => {
    try {
      const { processReputationConnectNudges } = await import("./reputationConnectNudgeWorker");
      await runJob("reputation_connect_nudge", processReputationConnectNudges);
    } catch (err: any) {
      log.error("reputation_connect_nudge error", { error: err.message });
    }
  }, { timezone: "UTC" });

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

  // Recurring task worker — generates monthly fulfillment tasks for
  // recurring services (WebCare, SocialSync, etc.) from templates
  // marked is_recurring = true. Runs daily at 01:00 UTC, idempotent
  // per month via title-prefix dedup.
  cron.schedule("0 1 * * *", async () => {
    log.info("Running recurring task generation...");
    try {
      await runJob("recurring_task_generation", processRecurringTasks);
    } catch (err: any) {
      log.error("recurring_task_generation cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

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

  // Upsell emails — daily at 10:00 UTC. Sends WebCare upsell
  // 7 days after SiteLaunch or WebFix delivery completes.
  // Idempotent via metadata.upsell_email_sent flag.
  cron.schedule("0 10 * * *", async () => {
    log.info("Running upsell email worker...");
    try {
      await runJob("upsell_emails", processUpsellEmails);
    } catch (err: any) {
      log.error("upsell_emails cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

  // WebCare monthly maintenance — 03:00 UTC on the 1st of each month.
  // Runs plugin updates, site health checks, generates monthly reports,
  // and processes content changes for WebCare Pro clients.
  // Idempotent per month via client_service.metadata.last_maintenance_period.
  let webcareMaintenanceRunning = false;
  cron.schedule("0 3 1 * *", async () => {
    if (webcareMaintenanceRunning) {
      log.debug("webcare_maintenance skipped — previous run still active");
      return;
    }
    webcareMaintenanceRunning = true;
    log.info("Running WebCare monthly maintenance...");
    try {
      await runJob("webcare_monthly_maintenance", processWebcareMaintenance);
    } catch (err: any) {
      log.error("webcare_monthly_maintenance cron handler error", { error: err.message });
    } finally {
      webcareMaintenanceRunning = false;
    }
  }, { timezone: "UTC" });

  // Data retention — weekly Sunday 02:30 UTC. Purges aged-out rows
  // from integration_error_logs (30d) and processed_stripe_events (90d).
  cron.schedule("30 2 * * 0", async () => {
    log.info("Running data retention cleanup...");
    try {
      await runJob("data_retention", processRetention);
    } catch (err: any) {
      log.error("data_retention cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

  // Email queue worker — drains pending emails every minute.
  // Overlap-guarded to prevent double-sends if a tick runs long.
  let emailQueueRunning = false;
  cron.schedule("* * * * *", async () => {
    if (emailQueueRunning) {
      log.debug("email_queue skipped — previous tick still running");
      return;
    }
    emailQueueRunning = true;
    try {
      await processEmailQueue();
    } catch (err: any) {
      log.error("email_queue error", { error: err.message });
    } finally {
      emailQueueRunning = false;
    }
  });

  // Embed broken detector — daily at 06:00 UTC.
  // Checks published calculators with 0 views in the last 14 days
  // (created > 14 days ago) and fires system alerts.
  cron.schedule("0 6 * * *", async () => {
    log.info("Running embed broken detection...");
    try {
      await runJob("embed_broken_detection", processEmbedBrokenDetection);
    } catch (err: any) {
      log.error("embed_broken_detection cron handler error", { error: err.message });
    }
  }, { timezone: "UTC" });

  // TradeLine mode worker — auto-switches mode based on business hours.
  let tradelineModeRunning = false;
  cron.schedule("*/5 * * * *", async () => {
    if (tradelineModeRunning) {
      log.debug("tradeline_mode_sync skipped — previous tick still running");
      return;
    }
    tradelineModeRunning = true;
    try {
      await runJob("tradeline_mode_sync", processTradeLineModeSync);
    } catch (err: any) {
      log.error("tradeline_mode_sync error", { error: err.message });
    } finally {
      tradelineModeRunning = false;
    }
  });

  // Rules & Routing Engine — every 5 minutes. Reads existing entity
  // state, applies typed rule functions per domain, and writes
  // routing_events. Overlap-guarded both in-process (the flag below)
  // and via jobLogs (see server/engine/routingWorker.ts) so a slow
  // cycle on a busy DB cannot double-fire.
  let routingEngineRunning = false;
  cron.schedule("*/5 * * * *", async () => {
    if (routingEngineRunning) {
      log.debug("routing_engine skipped — previous tick still running");
      return;
    }
    routingEngineRunning = true;
    try {
      await processRoutingEngine();
    } catch (err: any) {
      log.error("routing_engine error", { error: err.message });
    } finally {
      routingEngineRunning = false;
    }
  });

  // TradeLine retry worker — retries failed assistant builds every 15 min.
  let tradelineRetryRunning = false;
  cron.schedule("*/15 * * * *", async () => {
    if (tradelineRetryRunning) {
      log.debug("tradeline_retry skipped — previous tick still running");
      return;
    }
    tradelineRetryRunning = true;
    try {
      await runJob("tradeline_retry", processTradeLineRetries);
    } catch (err: any) {
      log.error("tradeline_retry error", { error: err.message });
    } finally {
      tradelineRetryRunning = false;
    }
  });
}
