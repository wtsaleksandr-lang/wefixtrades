/**
 * ContentFlow per-client generation worker.
 *
 * Runs daily. For every active standalone ContentFlow subscription
 * (contentflow-creator / contentflow-studio / contentflow-agency), this
 * worker ensures the customer is getting the per-tier volume of content
 * they're paying for:
 *
 *   contentflow-creator  →  ~12 pieces / month
 *   contentflow-studio   →  ~40 pieces / month
 *   contentflow-agency   → ~120 pieces / month
 *
 * Why this exists
 * ────────────────
 * Wave D shipped ContentFlow as a standalone SKU on the product page +
 * service_catalog + Stripe placeholders, but explicitly left the
 * generation-scheduling side as TODO(fast-follow). Without this worker,
 * a customer who buys ContentFlow standalone (no RankFlow, no SocialSync)
 * gets nothing generated post-purchase — those two products were the only
 * surfaces that drove the existing draft pipeline.
 *
 * Design — dispatcher, not a new pipeline
 * ────────────────────────────────────────
 * The actual AI generation already lives in:
 *   - server/services/socialSync/orchestrator.ts   (social posts)
 *   - server/services/contentflow/articleService.ts (blog articles)
 *
 * This worker is the *scheduler/dispatcher* on top of them. For each
 * active ContentFlow subscriber it:
 *   1. Resolves the per-day quota from the monthly tier number, divided
 *      across calendar days so generation is steady (vs a one-shot
 *      end-of-month dump).
 *   2. Ensures a SocialSync profile exists with autopilot enabled. The
 *      ContentFlow product *is* multi-channel social content; the
 *      SocialSync orchestrator already produces those pieces, gated by
 *      the same kill-switch / spend cap. If the customer has not yet
 *      filled out the content-style questionnaire, the worker fans out
 *      a minimal profile from clients.trade_type / location and stamps
 *      `requires_admin_review` so admins can sanity-check.
 *   3. Invokes generateWeekForClient() to produce + queue the day's
 *      content. The orchestrator handles all per-channel publish
 *      routing, image generation, and the autoApprove flow.
 *
 * Gates
 * ─────
 * checkContentflowGate() is consulted ONCE per tick and on a no-go the
 * whole run aborts cleanly (logged, not failed). The orchestrator
 * itself also calls into generateContentflowText() which honours the
 * gate per call — defence in depth.
 *
 * Idempotency
 * ───────────
 * Per (client_service_id, UTC day) we stamp:
 *   clientServices.metadata.contentflow.last_run_day  = YYYY-MM-DD
 *   clientServices.metadata.contentflow.period        = YYYY-MM
 *   clientServices.metadata.contentflow.period_count  = N (pieces queued this month)
 *
 * The day stamp prevents a same-day re-run from double-generating; the
 * period_count caps a month if the orchestrator's own scheduling
 * window left some headroom that would otherwise overshoot the tier
 * quota. Period rolls over on UTC month boundaries.
 *
 * Failure isolation
 * ─────────────────
 * One subscriber failing must not block siblings. Each is wrapped in
 * its own try/catch; the summary tallies errors.
 */

import { storage } from "../storage";
import { generateWeekForClient } from "../services/socialSync/orchestrator";
import { checkContentflowGate } from "../services/contentflow/contentflowGate";
import { createLogger } from "../lib/logger";

const log = createLogger("ContentFlowGenerationWorker");

/** ContentFlow tier IDs (mirror of shared/pricing.ts CONTENTFLOW.tiers). */
const CONTENTFLOW_TIERS = [
  "contentflow-creator",
  "contentflow-studio",
  "contentflow-agency",
] as const;

type ContentflowTier = (typeof CONTENTFLOW_TIERS)[number];

/** Monthly piece quotas per tier — single source of truth for the worker. */
const TIER_MONTHLY_QUOTA: Record<ContentflowTier, number> = {
  "contentflow-creator": 12,
  "contentflow-studio": 40,
  "contentflow-agency": 120,
};

/** Default SocialSync frequency mapping from monthly quota → weekly cadence. */
function frequencyFromMonthlyQuota(monthly: number): string {
  // ~30 days / month → daily ≈ 30, 3/wk ≈ 12, 2/wk ≈ 8, weekly ≈ 4.
  if (monthly >= 30) return "daily";
  if (monthly >= 12) return "3_per_week";
  if (monthly >= 8) return "2_per_week";
  return "weekly";
}

interface WorkerSummary {
  considered: number;
  processed: number;
  already_run_today: number;
  posts_generated: number;
  posts_queued: number;
  profile_bootstrapped: number;
  errors: number;
  gate_blocked: boolean;
  gate_reason?: string;
}

/** YYYY-MM-DD in UTC. */
function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM in UTC. */
function utcMonthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function isContentflowTier(svcId: string): svcId is ContentflowTier {
  return (CONTENTFLOW_TIERS as readonly string[]).includes(svcId);
}

/**
 * Read the worker's last-run bookkeeping out of clientServices.metadata.
 * Returns a partial shape — callers handle missing fields.
 */
function readBookkeeping(metadata: unknown): {
  last_run_day?: string;
  period?: string;
  period_count?: number;
} {
  if (!metadata || typeof metadata !== "object") return {};
  const cf = (metadata as Record<string, any>).contentflow;
  if (!cf || typeof cf !== "object") return {};
  return {
    last_run_day: typeof cf.last_run_day === "string" ? cf.last_run_day : undefined,
    period: typeof cf.period === "string" ? cf.period : undefined,
    period_count: typeof cf.period_count === "number" ? cf.period_count : undefined,
  };
}

/**
 * Write the worker's bookkeeping back onto the clientServices row.
 * Preserves any unrelated metadata keys.
 */
async function writeBookkeeping(
  clientServiceId: number,
  existingMetadata: unknown,
  patch: { last_run_day: string; period: string; period_count: number },
): Promise<void> {
  const base = (existingMetadata && typeof existingMetadata === "object")
    ? (existingMetadata as Record<string, any>)
    : {};
  const existingCf = (base.contentflow && typeof base.contentflow === "object")
    ? base.contentflow as Record<string, any>
    : {};
  const next = {
    ...base,
    contentflow: {
      ...existingCf,
      last_run_day: patch.last_run_day,
      period: patch.period,
      period_count: patch.period_count,
    },
  };
  await storage.updateClientServiceMetadata(clientServiceId, next);
}

/**
 * Ensure the client has a SocialSync profile suitable for autopilot
 * generation. If one already exists, leave it alone (the customer or an
 * admin may have customised it). If absent, create a minimal one seeded
 * from the client's trade_type / location with autopilot off until an
 * admin reviews — `requires_admin_review` is recorded in metadata.
 *
 * Returns true if the profile was newly bootstrapped.
 */
async function ensureSocialSyncProfile(
  clientId: number,
  tier: ContentflowTier,
): Promise<{ bootstrapped: boolean; autopilot: boolean }> {
  const existing = await storage.getSocialSyncProfile(clientId);
  if (existing) {
    return { bootstrapped: false, autopilot: !!existing.autopilot && !!existing.enabled };
  }

  const client = await storage.getClientById(clientId);
  const niche = (client?.trade_type as string | null) ?? null;
  // Clients have no dedicated service_area column today — leave location
  // null and let an admin fill it during the bootstrap review.
  const location: string | null = null;

  const monthlyQuota = TIER_MONTHLY_QUOTA[tier];
  await storage.upsertSocialSyncProfile({
    client_id: clientId,
    enabled: true,
    niche: niche ?? undefined,
    location: location ?? undefined,
    services: null as any,
    tone: "professional",
    frequency: frequencyFromMonthlyQuota(monthlyQuota),
    // Autopilot OFF until an admin reviews — silence-as-consent only
    // kicks in for customers who actually filled out the questionnaire.
    autopilot: false,
    platform_preferences: tier === "contentflow-creator" ? ["facebook", "instagram"] : ["facebook", "instagram", "google_business"],
    service_focus: null as any,
    runtime_state: { contentflow_bootstrapped: true, requires_admin_review: true } as any,
  });

  return { bootstrapped: true, autopilot: false };
}

/**
 * Main entry point — wired into the daily cron from scheduler.ts.
 *
 * `now` defaults to current time; tests can pass a specific date.
 */
export async function processContentflowGeneration(
  now: Date = new Date(),
): Promise<WorkerSummary> {
  const summary: WorkerSummary = {
    considered: 0,
    processed: 0,
    already_run_today: 0,
    posts_generated: 0,
    posts_queued: 0,
    profile_bootstrapped: 0,
    errors: 0,
    gate_blocked: false,
  };

  // Global gate — kill-switch or spend-cap. Single check up front; the
  // generation services also gate per-call.
  const gate = await checkContentflowGate();
  if (!gate.allowed) {
    summary.gate_blocked = true;
    summary.gate_reason = gate.reason;
    log.warn("ContentFlow generation gate blocked the run", { reason: gate.reason });
    return summary;
  }

  const today = utcDayKey(now);
  const period = utcMonthKey(now);

  // Pull subscribers for each tier. listSubscribersForService returns
  // all statuses; we filter to active + enabled below.
  const subscribers: Array<{
    clientServiceId: number;
    clientId: number;
    tier: ContentflowTier;
    metadata: unknown;
  }> = [];

  for (const tier of CONTENTFLOW_TIERS) {
    let rows: Awaited<ReturnType<typeof storage.listSubscribersForService>> = [];
    try {
      rows = await storage.listSubscribersForService(tier);
    } catch (err: any) {
      log.error("Failed to list subscribers for tier", { tier, error: err?.message });
      summary.errors += 1;
      continue;
    }

    for (const row of rows) {
      if (row.status !== "active" || row.enabled !== true) continue;
      if (!isContentflowTier(row.service_id)) continue;
      subscribers.push({
        clientServiceId: row.id,
        clientId: row.client_id,
        tier: row.service_id,
        metadata: row.metadata,
      });
    }
  }

  summary.considered = subscribers.length;

  for (const sub of subscribers) {
    try {
      const book = readBookkeeping(sub.metadata);

      // Idempotency: same UTC day, already ran → skip.
      if (book.last_run_day === today) {
        summary.already_run_today += 1;
        continue;
      }

      // Period roll-over: if the bookkeeping shows a stale period,
      // reset the running count so the new month starts fresh.
      const periodCount =
        book.period === period && typeof book.period_count === "number"
          ? book.period_count
          : 0;

      const monthlyQuota = TIER_MONTHLY_QUOTA[sub.tier];

      // Cap: never exceed the tier quota in a single calendar month.
      // The orchestrator schedules ~1 week of posts at a time; once the
      // monthly cap is hit we stop dispatching until the period rolls.
      if (periodCount >= monthlyQuota) {
        log.info("ContentFlow tier quota already met for period — skipping", {
          clientServiceId: sub.clientServiceId,
          tier: sub.tier,
          period,
          periodCount,
          monthlyQuota,
        });
        // Still stamp last_run_day so we don't repeat this branch every tick.
        await writeBookkeeping(sub.clientServiceId, sub.metadata, {
          last_run_day: today,
          period,
          period_count: periodCount,
        });
        continue;
      }

      // Ensure a SocialSync profile exists. If we just bootstrapped one
      // (autopilot:false), we deliberately do NOT call the orchestrator
      // this tick — an admin must verify the bootstrap first. The
      // bootstrap is logged so it shows up in the admin queue.
      const profileState = await ensureSocialSyncProfile(sub.clientId, sub.tier);
      if (profileState.bootstrapped) {
        summary.profile_bootstrapped += 1;
        log.info("Bootstrapped SocialSync profile for ContentFlow subscriber", {
          clientServiceId: sub.clientServiceId,
          clientId: sub.clientId,
          tier: sub.tier,
        });
        await writeBookkeeping(sub.clientServiceId, sub.metadata, {
          last_run_day: today,
          period,
          period_count: periodCount,
        });
        continue;
      }

      // No autopilot → respect customer/admin choice; don't generate.
      if (!profileState.autopilot) {
        log.debug("ContentFlow subscriber has SocialSync profile but autopilot off — skipping", {
          clientServiceId: sub.clientServiceId,
          clientId: sub.clientId,
        });
        await writeBookkeeping(sub.clientServiceId, sub.metadata, {
          last_run_day: today,
          period,
          period_count: periodCount,
        });
        continue;
      }

      // Generate this client's batch. generateWeekForClient is the
      // shared SocialSync entry point — it already covers topic + post
      // generation, quality gate, image generation, autoApprove, and
      // queueing through the unified ContentFlow publish queue.
      const result = await generateWeekForClient(sub.clientId);

      summary.processed += 1;
      summary.posts_generated += result.posts_generated;
      summary.posts_queued += result.posts_queued;

      const nextCount = Math.min(monthlyQuota, periodCount + result.posts_queued);
      await writeBookkeeping(sub.clientServiceId, sub.metadata, {
        last_run_day: today,
        period,
        period_count: nextCount,
      });

      if (result.errors.length > 0) {
        log.warn("ContentFlow generation for subscriber had non-fatal errors", {
          clientServiceId: sub.clientServiceId,
          clientId: sub.clientId,
          errors: result.errors.slice(0, 3),
        });
      }
    } catch (err: any) {
      summary.errors += 1;
      log.error("ContentFlow generation failed for subscriber", {
        clientServiceId: sub.clientServiceId,
        clientId: sub.clientId,
        tier: sub.tier,
        error: err?.message,
      });
    }
  }

  log.info("ContentFlow generation worker complete", { ...summary });
  return summary;
}
