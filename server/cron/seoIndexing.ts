/**
 * SEO indexing cron — automatically submits newly-discovered sitemap URLs
 * to Bing Webmaster.
 *
 * Schedule: every 6 hours at minute 17 (off-minute so it
 * doesn't pile on top of every other on-the-hour cron). Registered from
 * server/jobs/scheduler.ts.
 *
 * Per tick:
 *   1. Fetch live /sitemap.xml from PUBLIC_BASE_URL (or wefixtrades.com).
 *   2. Parse <loc> entries.
 *   3. Filter to URLs that have NO seo_indexing_history row with
 *      source='bing' AND action='index-requested' AND status='submitted'
 *      (i.e. we've never asked Bing to crawl them).
 *   4. Check quota via Bing GetUrlSubmissionQuota; cap submissions at
 *      min(remaining_daily - 20, 80) to leave headroom for manual
 *      admin submissions during the same UTC day.
 *   5. SubmitUrlBatch in one request (capped). On success, write one
 *      seo_indexing_history row per URL with action='index-requested'
 *      source='bing' status='submitted'.
 *
 * Idempotent across restarts: the per-URL history row is the source of
 * truth — running the cron twice in the same hour won't double-submit
 * any URL because step 3's filter eliminates already-submitted entries.
 *
 * Failure modes (all soft — log + return):
 *   - sitemap fetch 5xx / timeout → skip this tick
 *   - Bing key missing → skip this tick (validateApiKey would also fail)
 *   - Bing API error → log the redacted error, skip this tick
 *   - DB error → propagate so the scheduler logs it loudly
 */

import { db } from "../db";
import { seoIndexingHistory } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getQuota, submitUrls, BING_SITE_URL } from "../lib/seo/bingClient";

const log = createLogger("SeoIndexingCron");

const SITEMAP_URL =
  (process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "https://wefixtrades.com") + "/sitemap.xml";

/** Max URLs we'll submit in a single tick — leaves quota headroom. */
const MAX_PER_TICK = 80;
/** Reserve this much of the daily quota for manual admin submissions. */
const MANUAL_RESERVE = 20;

interface CronResult {
  fetched_urls: number;
  new_urls: number;
  submitted: number;
  remaining_daily: number;
  skipped_reason?: string;
}

/**
 * Pull <loc> values out of an XML sitemap. We use a forgiving regex
 * because the sitemap is small (~50 URLs) and self-generated — no need
 * to pull in a full XML parser dependency just for this.
 */
function parseSitemapLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const loc = m[1].trim();
    if (loc.startsWith("http://") || loc.startsWith("https://")) {
      out.push(loc);
    }
  }
  return out;
}

async function fetchSitemap(): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(SITEMAP_URL, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`sitemap fetch HTTP ${res.status}`);
    }
    const text = await res.text();
    return parseSitemapLocs(text);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Filter `urls` down to those that have NEVER been submitted to Bing.
 * The seo_indexing_history schema doesn't have a dedicated bing_submitted_at
 * column — instead we test by (source='bing', action='index-requested')
 * presence, which is how submitUrl writes its audit row.
 */
async function filterUnsubmitted(urls: string[]): Promise<string[]> {
  if (urls.length === 0) return [];
  // Bulk fetch the URLs we've already touched on Bing. The history table is
  // small (sub-thousand for the foreseeable future) — a single SELECT with
  // an IN-list scales fine, but to be safe we query without the IN-list and
  // intersect in JS.
  const rows = await db
    .select({ url: seoIndexingHistory.url })
    .from(seoIndexingHistory)
    .where(
      and(
        eq(seoIndexingHistory.source, "bing"),
        eq(seoIndexingHistory.action, "index-requested"),
      ),
    );
  const seen = new Set<string>(rows.map((r) => r.url));
  return urls.filter((u) => !seen.has(u));
}

async function recordSubmitted(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  await db.insert(seoIndexingHistory).values(
    urls.map((u) => ({
      url: u,
      action: "index-requested" as const,
      source: "bing" as const,
      status: "submitted" as const,
      details: { siteUrl: BING_SITE_URL, channel: "cron" } as Record<string, unknown>,
    })),
  );
}

/**
 * Run one tick of the indexing cron. Exported so the admin "Run now"
 * button (future) or a one-off `tsx` script can trigger it.
 */
export async function runBingIndexingTick(): Promise<CronResult> {
  if (!process.env.BING_WEBMASTER_API_KEY) {
    return {
      fetched_urls: 0,
      new_urls: 0,
      submitted: 0,
      remaining_daily: 0,
      skipped_reason: "BING_WEBMASTER_API_KEY not set",
    };
  }

  let urls: string[];
  try {
    urls = await fetchSitemap();
  } catch (err) {
    log.warn("sitemap fetch failed — skipping tick", {
      err: err instanceof Error ? err.message : "unknown",
    });
    return {
      fetched_urls: 0,
      new_urls: 0,
      submitted: 0,
      remaining_daily: 0,
      skipped_reason: "sitemap_unavailable",
    };
  }

  const unsubmitted = await filterUnsubmitted(urls);
  if (unsubmitted.length === 0) {
    return { fetched_urls: urls.length, new_urls: 0, submitted: 0, remaining_daily: 0 };
  }

  let quota: { DailyQuota: number; MonthlyQuota: number };
  try {
    quota = await getQuota();
  } catch (err) {
    log.warn("Bing GetUrlSubmissionQuota failed — skipping tick", {
      err: err instanceof Error ? err.message : "unknown",
    });
    return {
      fetched_urls: urls.length,
      new_urls: unsubmitted.length,
      submitted: 0,
      remaining_daily: 0,
      skipped_reason: "quota_unavailable",
    };
  }

  const allowance = Math.max(0, Math.min(MAX_PER_TICK, quota.DailyQuota - MANUAL_RESERVE));
  if (allowance === 0) {
    return {
      fetched_urls: urls.length,
      new_urls: unsubmitted.length,
      submitted: 0,
      remaining_daily: quota.DailyQuota,
      skipped_reason: "quota_exhausted_or_reserved",
    };
  }

  const batch = unsubmitted.slice(0, allowance);
  try {
    await submitUrls(batch);
  } catch (err) {
    log.warn("Bing SubmitUrlBatch failed — skipping recording", {
      err: err instanceof Error ? err.message : "unknown",
      count: batch.length,
    });
    return {
      fetched_urls: urls.length,
      new_urls: unsubmitted.length,
      submitted: 0,
      remaining_daily: quota.DailyQuota,
      skipped_reason: "submit_failed",
    };
  }

  await recordSubmitted(batch);
  log.info("Bing indexing tick complete", {
    fetched: urls.length,
    new: unsubmitted.length,
    submitted: batch.length,
    daily_quota_before: quota.DailyQuota,
  });

  return {
    fetched_urls: urls.length,
    new_urls: unsubmitted.length,
    submitted: batch.length,
    remaining_daily: Math.max(0, quota.DailyQuota - batch.length),
  };
}
