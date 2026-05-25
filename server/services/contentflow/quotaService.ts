/**
 * ContentFlow Phase 4 — per-client quota service.
 *
 * Tracks monthly asset usage (images, articles, videos) against the
 * customer's tier limits. Counters live on clients.metadata.content_brand
 * .quota_usage (no DB migration). Read/write happens via the existing
 * storage.getClientById / storage.updateClient pair so the metadata
 * column round-trips cleanly with the brand profile.
 *
 * API:
 *   incrementQuota(clientId, type)   — bump a counter (called by
 *                                       image / article / video workers
 *                                       at success time).
 *   getQuotaState(clientId)          — { tier, limit, used, resetAt }
 *                                       for the portal banner + admin.
 *   resetMonthlyQuota(clientId)      — zero counters + stamp the new
 *                                       period_start. Called by the
 *                                       monthly cron OR auto-lazy when
 *                                       getQuotaState detects a stale
 *                                       period (so customers who didn't
 *                                       hit the cron see fresh counters
 *                                       the moment they open the portal).
 *
 * Tier resolution: scans clients → active clientServices for any
 * service_id in QUOTAS_BY_TIER. Returns the highest-numbered tier the
 * customer holds (Free < Starter < Creator < Studio < Agency). If the
 * customer has no active ContentFlow subscription, we still return the
 * Free tier shape — Phase 1 surfaces the prompt library + a small
 * free allowance to logged-in users without a paid SKU.
 */

import { storage } from "../../storage";
import {
  QUOTAS_BY_TIER,
  type QuotaLimit,
  type QuotaUsage,
  type ContentflowAssetType,
  getQuotaForTier,
  emptyUsage,
  nextMonthlyResetAt,
} from "@shared/contentflow/quotas";
import { createLogger } from "../../lib/logger";

const log = createLogger("ContentFlow:Quota");

/** Tier IDs ordered low → high. The customer's effective tier is the
 * highest active one (so a customer who somehow has both Free + Studio
 * gets Studio's allowance). */
const TIER_RANK: string[] = [
  "contentflow-free",
  "contentflow-starter",
  "contentflow-creator",
  "contentflow-studio",
  "contentflow-agency",
];

/** YYYY-MM-01 in UTC. */
function utcPeriodStart(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/** Read content_brand.quota_usage off a clients row (raw, may be {}/null). */
function readUsageBlock(client: { metadata?: unknown } | null | undefined): {
  used: QuotaUsage;
  period_start: string;
} {
  const meta = ((client?.metadata as Record<string, any>) || {}) as Record<string, any>;
  const cb = (meta.content_brand && typeof meta.content_brand === "object"
    ? meta.content_brand
    : {}) as Record<string, any>;
  const qu = (cb.quota_usage && typeof cb.quota_usage === "object"
    ? cb.quota_usage
    : {}) as Record<string, any>;
  return {
    used: {
      images_used:   typeof qu.images_used   === "number" ? qu.images_used   : 0,
      articles_used: typeof qu.articles_used === "number" ? qu.articles_used : 0,
      videos_used:   typeof qu.videos_used   === "number" ? qu.videos_used   : 0,
    },
    period_start: typeof qu.period_start === "string" ? qu.period_start : utcPeriodStart(),
  };
}

/** Write content_brand.quota_usage, preserving all other metadata. */
async function writeUsageBlock(
  clientId: number,
  existingMetadata: unknown,
  next: { used: QuotaUsage; period_start: string },
): Promise<void> {
  const meta = (existingMetadata && typeof existingMetadata === "object")
    ? { ...(existingMetadata as Record<string, any>) }
    : {} as Record<string, any>;
  const cb = (meta.content_brand && typeof meta.content_brand === "object"
    ? { ...(meta.content_brand as Record<string, any>) }
    : {}) as Record<string, any>;
  cb.quota_usage = {
    images_used: next.used.images_used,
    articles_used: next.used.articles_used,
    videos_used: next.used.videos_used,
    period_start: next.period_start,
  };
  meta.content_brand = cb;
  await storage.updateClient(clientId, { metadata: meta } as any);
}

/**
 * Resolve the customer's effective ContentFlow tier from active
 * subscriptions. Falls back to "contentflow-free" if no paid tier is
 * active. The Free tier still has counters + a quota banner — that's
 * the point of Phase 4 for the free funnel.
 */
export async function resolveTierForClient(clientId: number): Promise<string> {
  let services: Awaited<ReturnType<typeof storage.listClientServices>>;
  try {
    services = await storage.listClientServices(clientId);
  } catch (err: any) {
    log.warn(`tier_resolve_failed clientId=${clientId} err=${err?.message}`);
    return "contentflow-free";
  }

  let bestRank = TIER_RANK.indexOf("contentflow-free");  // 0 = free
  for (const svc of services) {
    if (svc.status !== "active" || svc.enabled !== true) continue;
    const rank = TIER_RANK.indexOf(svc.service_id);
    if (rank > bestRank) bestRank = rank;
  }
  return TIER_RANK[bestRank] ?? "contentflow-free";
}

/**
 * Increment the per-asset counter for a client. No-op (logged) on bad
 * client id. Idempotency: callers should call this ONCE per successfully
 * generated asset — typically at the same place that writes to R2 /
 * publishes the draft. We do not gate on `isWithinQuota` here; gating
 * is the responsibility of the worker entry point. This is the post-
 * generation accounting step only.
 */
export async function incrementQuota(
  clientId: number,
  type: ContentflowAssetType,
): Promise<void> {
  const client = await storage.getClientById(clientId);
  if (!client) {
    log.warn(`increment_skipped_no_client clientId=${clientId}`);
    return;
  }
  const block = readUsageBlock(client);

  // Period roll-over guard — if the stored period is stale, reset
  // counters before the increment lands. Same logic as
  // resetMonthlyQuota but inline so a single client whose cron run
  // missed them still gets correct accounting on the next gen call.
  const currentPeriod = utcPeriodStart();
  let used = block.used;
  let period_start = block.period_start;
  if (period_start !== currentPeriod) {
    used = emptyUsage();
    period_start = currentPeriod;
  }

  switch (type) {
    case "image":   used.images_used   += 1; break;
    case "article": used.articles_used += 1; break;
    case "video":   used.videos_used   += 1; break;
  }

  await writeUsageBlock(clientId, client.metadata, { used, period_start });
}

export interface QuotaState {
  tier: string;
  limit: QuotaLimit;
  used: QuotaUsage;
  /** Start of next UTC month (ISO). */
  resetAt: string;
  /** Period the counters are stamped against (YYYY-MM-01). */
  period_start: string;
}

/**
 * Returns the current quota state for a client. Lazily resets counters
 * if the stored period_start is stale — that way a customer who logs
 * in before the monthly cron has run still sees fresh numbers.
 */
export async function getQuotaState(clientId: number): Promise<QuotaState> {
  const client = await storage.getClientById(clientId);
  const tier = await resolveTierForClient(clientId);
  const limit = getQuotaForTier(tier);
  const resetAt = nextMonthlyResetAt();

  if (!client) {
    return {
      tier,
      limit,
      used: emptyUsage(),
      resetAt,
      period_start: utcPeriodStart(),
    };
  }

  const block = readUsageBlock(client);
  const currentPeriod = utcPeriodStart();
  if (block.period_start !== currentPeriod) {
    // Stale — surface fresh numbers and persist the rollover so the
    // next write doesn't re-trigger the same branch.
    const fresh = { used: emptyUsage(), period_start: currentPeriod };
    await writeUsageBlock(clientId, client.metadata, fresh).catch((err: any) => {
      log.warn(`lazy_reset_persist_failed clientId=${clientId} err=${err?.message}`);
    });
    return { tier, limit, used: fresh.used, resetAt, period_start: currentPeriod };
  }

  return {
    tier,
    limit,
    used: block.used,
    resetAt,
    period_start: block.period_start,
  };
}

/**
 * Hard reset for a single client. Called by the monthly cron — sets all
 * counters to 0 and stamps the new period_start.
 */
export async function resetMonthlyQuota(clientId: number): Promise<void> {
  const client = await storage.getClientById(clientId);
  if (!client) {
    log.warn(`reset_skipped_no_client clientId=${clientId}`);
    return;
  }
  await writeUsageBlock(clientId, client.metadata, {
    used: emptyUsage(),
    period_start: utcPeriodStart(),
  });
}

/**
 * Reset every active ContentFlow subscriber. Used by the monthly cron
 * (scheduler.ts → "0 5 1 * *"). Failures on a single subscriber don't
 * block the rest — same isolation rule as the generation worker.
 */
export async function resetAllContentflowQuotas(): Promise<{
  considered: number;
  reset: number;
  errors: number;
}> {
  const summary = { considered: 0, reset: 0, errors: 0 };

  // Pull subscribers across every paid tier. The Free tier isn't backed
  // by a clientServices row, so Free customers reset lazily inside
  // getQuotaState() the next time they hit the portal — that's fine,
  // they have no recurring fulfilment cron of their own.
  const tiers = Object.keys(QUOTAS_BY_TIER).filter((t) => t !== "contentflow-free");
  const seen = new Set<number>();

  for (const tier of tiers) {
    let rows: Awaited<ReturnType<typeof storage.listSubscribersForService>> = [];
    try {
      rows = await storage.listSubscribersForService(tier);
    } catch (err: any) {
      log.error(`reset_list_failed tier=${tier} err=${err?.message}`);
      summary.errors += 1;
      continue;
    }
    for (const row of rows) {
      if (row.status !== "active" || row.enabled !== true) continue;
      if (seen.has(row.client_id)) continue;
      seen.add(row.client_id);
      summary.considered += 1;
      try {
        await resetMonthlyQuota(row.client_id);
        summary.reset += 1;
      } catch (err: any) {
        log.error(`reset_failed clientId=${row.client_id} err=${err?.message}`);
        summary.errors += 1;
      }
    }
  }
  log.info("monthly_quota_reset_complete", summary);
  return summary;
}
