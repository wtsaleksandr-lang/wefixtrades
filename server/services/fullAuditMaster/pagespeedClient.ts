/**
 * Shared PageSpeed Insights v5 client for the Master Audit pipeline.
 *
 * Wave 3.6 (2026-05-25). Three sections (speed, mobile, accessibility) all
 * call Google's PageSpeed API but with different `strategy`/`category`
 * combos — so we centralise:
 *
 *   - request shape + 30-second per-call timeout
 *   - 1-hour in-memory cache keyed by (url, strategy, category) so a
 *     single audit doesn't fire PageSpeed three times for the same site
 *     (and so repeated audits of the same site within the hour stay free)
 *   - friendly null-on-failure return so callers can degrade gracefully
 *
 * No new deps — uses Node 20's global `fetch` + AbortController. Cache is
 * process-local; horizontal scaling is fine because PageSpeed's free
 * tier handles plenty of traffic and a cache miss just hits the API again.
 */
import { createLogger } from "../../lib/logger";

const log = createLogger("pagespeed-client");

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour per spec
const TIMEOUT_MS = 30_000;

type Strategy = "mobile" | "desktop";
type Category = "performance" | "accessibility" | "seo" | "best-practices";

interface CacheEntry {
  expiresAt: number;
  payload: any;
}
const cache = new Map<string, CacheEntry>();

function cacheKey(url: string, strategy: Strategy, category: Category): string {
  return `${strategy}|${category}|${url}`;
}

export interface PageSpeedResult {
  /** 0-100, rounded from Lighthouse's 0-1 category score. */
  score: number;
  /** Lighthouse audits keyed by audit id. */
  audits: Record<string, any>;
  /** Top opportunities (audits with `details.type === "opportunity"`). */
  opportunities: Array<{ id: string; title: string; description: string; savingsMs?: number }>;
}

/**
 * Run PageSpeed Insights and return a parsed envelope, or null if the API
 * key is missing / the request failed / the response wasn't usable.
 *
 * Results are cached per (url, strategy, category) for 1 hour. Cached hits
 * skip the network entirely.
 */
export async function runPageSpeed(
  url: string,
  strategy: Strategy,
  category: Category,
): Promise<PageSpeedResult | null> {
  const key = process.env.PAGESPEED_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    log.warn("PAGESPEED_API_KEY not set — section will fall back");
    return null;
  }

  const ck = cacheKey(url, strategy, category);
  const hit = cache.get(ck);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.payload;
  }

  const params = new URLSearchParams({ url, strategy, key, category });
  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(endpoint, { signal: ctrl.signal });
    if (!r.ok) {
      log.warn("pagespeed non-ok", { status: r.status, strategy, category });
      return null;
    }
    const data: any = await r.json();
    const lhr = data?.lighthouseResult;
    const score01 = lhr?.categories?.[category]?.score;
    if (score01 == null) {
      log.warn("pagespeed missing category score", { strategy, category });
      return null;
    }
    const audits = lhr?.audits || {};
    const opportunities = Object.entries<any>(audits)
      .filter(([, v]) => v?.details?.type === "opportunity" && (v?.score ?? 1) < 0.9)
      .map(([id, v]) => ({
        id,
        title: String(v?.title || id),
        description: String(v?.description || ""),
        savingsMs: typeof v?.details?.overallSavingsMs === "number" ? v.details.overallSavingsMs : undefined,
      }))
      .sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0));

    const payload: PageSpeedResult = {
      score: Math.round(score01 * 100),
      audits,
      opportunities,
    };
    cache.set(ck, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
    return payload;
  } catch (err: any) {
    log.warn("pagespeed fetch threw", { error: err?.message, strategy, category });
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Test hook — clears the per-process cache. Not exported via the index
 * barrel so it can't be called from app code by accident.
 */
export function __clearPageSpeedCache(): void {
  cache.clear();
}
