/**
 * Job registry — single source of truth for cron job names, expected
 * intervals (used to derive worker staleness), and callable handlers
 * for manual "run now" / retry from the admin system dashboard.
 *
 * Every cron entry in scheduler.ts is mirrored here. When a new cron
 * job is added, also add it here so it shows up in /admin/system.
 *
 * Email-system jobs are deliberately NOT added to MANUAL_JOBS — manual
 * triggering of email sends is owned by a separate agent.
 */

import { storage } from "../storage";

import { runDailyAggregation } from "./aggregation";
import { sendWeeklyReports } from "./weeklyReport";
import { processNotificationQueue } from "./notificationWorker";
import { processFollowupJobs } from "./followupWorker";
import { processAuditFollowups } from "./auditFollowupWorker";
import { processReviewFollowups } from "./reviewFollowupWorker";
import { processReviewMonitoring } from "./reviewMonitorWorker";
import { processReputationReports } from "./reputationReportWorker";
import { runDailyOpsIntelligence } from "./opsIntelligenceJob";
import { processOutboundSync } from "./outboundSyncWorker";
import { processRankFlowPlans } from "./rankflowWorker";
import { processRankFlowTracking } from "./trackingWorker";
import { processMapguardScans } from "./mapguardScanWorker";
import { processMapguardReports } from "./mapguardReportWorker";
import { processMapguardWeeklyUpdates } from "./mapguardWeeklyUpdateWorker";
import { processRankflowReports } from "./rankflowReportWorker";
import { processSocialsyncReports } from "./socialsyncReportWorker";
import { processAdflowReports } from "./adflowReportWorker";
import { processDunningQueue } from "./dunningWorker";
import { processTrialLifecycle, pauseExpiredTrials } from "./trialLifecycleWorker";
import { processImageRetention } from "./imageRetentionWorker";
import { processPerformanceQueue } from "./performanceWorker";
import { cleanupExpiredMemory } from "../services/chatMemory";
import { processQueue as processWordpressPublishQueue } from "../services/contentflow/wordpressQueue";
import { generateAllDue } from "../services/socialSync/orchestrator";
import { checkConnectionExpiry } from "../services/socialSync/connectionLifecycle";
import { cleanupOldMedia } from "../services/socialSync/mediaService";
import { processAllClientReviews } from "../services/reputation/reviewOrchestrator";
import { processReviewRequests } from "../services/reputation/reviewRequestService";
import { processJobLogsCleanup } from "./jobLogsCleanup";

export type JobName =
  | "daily_aggregation"
  | "weekly_email_report"
  | "notification_worker"
  | "followup_worker"
  | "audit_followup_worker"
  | "review_followup_worker"
  | "ops_daily_intelligence"
  | "review_monitoring"
  | "reputation_reports"
  | "chat_memory_cleanup"
  | "outbound_sync"
  | "rankflow_plan_generation"
  | "rankflow_tracking"
  | "mapguard_weekly_scan"
  | "mapguard_weekly_update"
  | "mapguard_monthly_reports"
  | "rankflow_monthly_reports"
  | "socialsync_monthly_reports"
  | "adflow_monthly_reports"
  | "trial_lifecycle"
  | "contentflow_publish_queue"
  | "contentflow_performance"
  | "socialsync_weekly_generation"
  | "socialsync_expiry_check"
  | "socialsync_media_cleanup"
  | "socialsync_review_automation"
  | "review_request_delivery"
  | "dunning_queue"
  | "contentflow_image_retention"
  | "job_logs_cleanup";

interface JobMeta {
  /** Expected interval between runs in minutes. Used to compute staleness. */
  schedule_minutes: number;
  /**
   * Manual handler. May be null for jobs the operator should not trigger
   * directly (e.g. anything email-related is owned by another agent).
   */
  fn: (() => Promise<any>) | null;
  /** Human label shown in the UI. */
  label: string;
}

export const JOB_REGISTRY: Record<JobName, JobMeta> = {
  daily_aggregation:           { schedule_minutes: 24 * 60,        fn: runDailyAggregation,        label: "Daily aggregation" },
  weekly_email_report:         { schedule_minutes: 7 * 24 * 60,    fn: null,                       label: "Weekly email report" },
  notification_worker:         { schedule_minutes: 1,              fn: null,                       label: "Notification queue" },
  followup_worker:             { schedule_minutes: 1,              fn: null,                       label: "Follow-up jobs" },
  audit_followup_worker:       { schedule_minutes: 1,              fn: null,                       label: "Audit follow-ups" },
  review_followup_worker:      { schedule_minutes: 1,              fn: null,                       label: "Review follow-ups" },
  ops_daily_intelligence:      { schedule_minutes: 24 * 60,        fn: runDailyOpsIntelligence,    label: "Ops intelligence" },
  review_monitoring:           { schedule_minutes: 6 * 60,         fn: processReviewMonitoring,    label: "Review monitoring" },
  reputation_reports:          { schedule_minutes: 24 * 60,        fn: processReputationReports,   label: "Reputation reports" },
  chat_memory_cleanup:         { schedule_minutes: 24 * 60,        fn: async () => { await cleanupExpiredMemory(); return { status: "ok" }; }, label: "Chat memory cleanup" },
  outbound_sync:               { schedule_minutes: 15,             fn: processOutboundSync,        label: "Outbound sync" },
  rankflow_plan_generation:    { schedule_minutes: 7 * 24 * 60,    fn: processRankFlowPlans,       label: "RankFlow plan generation" },
  rankflow_tracking:           { schedule_minutes: 7 * 24 * 60,    fn: processRankFlowTracking,    label: "RankFlow tracking" },
  mapguard_weekly_scan:        { schedule_minutes: 7 * 24 * 60,    fn: processMapguardScans,       label: "MapGuard weekly scan" },
  mapguard_weekly_update:      { schedule_minutes: 7 * 24 * 60,    fn: processMapguardWeeklyUpdates, label: "MapGuard weekly client update" },
  mapguard_monthly_reports:    { schedule_minutes: 30 * 24 * 60,   fn: processMapguardReports,     label: "MapGuard monthly reports" },
  rankflow_monthly_reports:    { schedule_minutes: 30 * 24 * 60,   fn: processRankflowReports,     label: "RankFlow monthly reports" },
  socialsync_monthly_reports:  { schedule_minutes: 30 * 24 * 60,   fn: processSocialsyncReports,   label: "SocialSync monthly reports" },
  adflow_monthly_reports:      { schedule_minutes: 30 * 24 * 60,   fn: processAdflowReports,       label: "AdFlow monthly reports" },
  trial_lifecycle:             { schedule_minutes: 24 * 60,        fn: async () => {
    const emailResult = await processTrialLifecycle();
    const pauseResult = await pauseExpiredTrials();
    return { ...emailResult, paused: pauseResult.paused, pauseErrors: pauseResult.errors };
  }, label: "Trial lifecycle" },
  contentflow_publish_queue:   { schedule_minutes: 2,              fn: processWordpressPublishQueue, label: "ContentFlow publish queue" },
  contentflow_performance:     { schedule_minutes: 30,             fn: processPerformanceQueue,    label: "ContentFlow performance" },
  socialsync_weekly_generation:{ schedule_minutes: 7 * 24 * 60,    fn: generateAllDue,             label: "SocialSync weekly generation" },
  socialsync_expiry_check:     { schedule_minutes: 24 * 60,        fn: checkConnectionExpiry,      label: "SocialSync expiry check" },
  socialsync_media_cleanup:    { schedule_minutes: 24 * 60,        fn: cleanupOldMedia,            label: "SocialSync media cleanup" },
  socialsync_review_automation:{ schedule_minutes: 6 * 60,         fn: processAllClientReviews,    label: "SocialSync review automation" },
  review_request_delivery:     { schedule_minutes: 15,             fn: null,                       label: "Review request delivery" },
  dunning_queue:               { schedule_minutes: 5,              fn: null,                       label: "Dunning queue" },
  contentflow_image_retention: { schedule_minutes: 24 * 60,        fn: processImageRetention,      label: "ContentFlow image retention" },
  job_logs_cleanup:            { schedule_minutes: 24 * 60,        fn: processJobLogsCleanup,      label: "Job logs cleanup" },
};

/**
 * Wraps a manual job invocation in the same job_logs lifecycle the
 * scheduler uses (running → completed/failed). Caller decides whether
 * to await this; the admin "Run now" endpoint kicks it off and returns
 * immediately.
 */
export async function runJobByName(name: string): Promise<{ ok: true; result: any } | { ok: false; error: string }> {
  const meta = (JOB_REGISTRY as any)[name] as JobMeta | undefined;
  if (!meta) return { ok: false, error: `Unknown job: ${name}` };
  if (!meta.fn) return { ok: false, error: `Job ${name} is not manually triggerable` };

  let logId: number | null = null;
  try {
    const log = await storage.createJobLog({
      job_name: name,
      status: "running",
      started_at: new Date(),
      metadata: { trigger: "manual" },
    });
    logId = log.id;
  } catch (err: any) {
    console.error(`[Registry] Failed to create job log for ${name}:`, err.message);
  }

  try {
    const result = await meta.fn();
    if (logId !== null) {
      await storage.updateJobLog(logId, {
        status: "completed",
        finished_at: new Date(),
        metadata: { trigger: "manual", result },
      }).catch(() => {});
    }
    return { ok: true, result };
  } catch (err: any) {
    if (logId !== null) {
      await storage.updateJobLog(logId, {
        status: "failed",
        finished_at: new Date(),
        error_message: err?.message ?? String(err),
      }).catch(() => {});
    }
    return { ok: false, error: err?.message ?? String(err) };
  }
}

export function isManuallyTriggerable(name: string): boolean {
  const meta = (JOB_REGISTRY as any)[name] as JobMeta | undefined;
  return !!meta?.fn;
}

export function getJobNames(): string[] {
  return Object.keys(JOB_REGISTRY);
}
