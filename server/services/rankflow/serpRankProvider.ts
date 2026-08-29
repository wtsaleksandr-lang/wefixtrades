/**
 * Serper-based keyword rank provider (Lane H).
 *
 * PRIMARY rank-data source for RankFlow when SERPER_API_KEY is present.
 * Unlike Search Console (which only reports an average position for
 * queries that already earned impressions), this performs REAL rank
 * checks: it queries Serper.dev's Google search endpoint with the
 * client's location (gl/hl + location params) and finds the target
 * domain's organic position in the top 100, plus the local-pack
 * position when the client's business appears in the map pack.
 *
 * Economics (verified): Serper ≈ $1 / 1k queries (num=100 bills 2
 * credits ≈ $0.002/check). A Pro client at the 200-keyword cap costs
 * ~$0.87/mo vs the $899/mo tier — COGS < 0.1% of revenue.
 *
 * Budget guard: callers pass `maxQueries` (derived from the tier
 * keyword caps in scalingConfig.TIER_KEYWORD_CAPS); this module never
 * issues more Serper queries than that per invocation.
 *
 * Failure semantics (mirrors serpOrchestrator's graceful style):
 *   - transient errors (5xx / network / timeout) → one retry, then the
 *     keyword is returned with `skipped: true` so callers do NOT store
 *     a false "not ranking" null in rank history.
 *   - 429 / quota exhausted → abort the remaining keywords for this run
 *     (they come back `skipped: true`); next run picks them up.
 *   - SERPER_API_KEY absent → `serpRankAvailable()` is false and
 *     callers fall back to Search Console / legacy paths. Calling
 *     checkKeywordRanksViaSerp anyway returns everything skipped —
 *     never throws on missing config.
 *
 * Quota accounting reuses the shared serpQuotaTracker under the same
 * "serper" provider id as the serpOrchestrator, so the admin SERP
 * diagnostics stay accurate.
 */

import { createLogger } from "../../lib/logger";
import {
  ensureHydrated,
  freeQuotaRemaining,
  recordError,
  recordSuccess,
} from "../../lib/serpQuotaTracker";
import * as serper from "../../lib/serpProviders/serper";
import type { SerpRequest, SerpResult } from "../../lib/serpOrchestrator";

const log = createLogger("SerpRankProvider");

const REQUEST_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 1_000;
/** Ask for the full first 100 results so "not in top 100" is meaningful. */
const RESULTS_DEPTH = 100;

/* ─── Types ──────────────────────────────────────────────────────────── */

export const RANK_SOURCE_SERP = "serp_api" as const;
export const RANK_SOURCE_GSC = "search_console" as const;
export const RANK_SOURCE_SCRAPE = "scrape" as const;
export type RankSource =
  | typeof RANK_SOURCE_SERP
  | typeof RANK_SOURCE_GSC
  | typeof RANK_SOURCE_SCRAPE;

export interface SerpRankResult {
  keyword: string;
  /** Organic position 1-100; null = checked but not in top 100. */
  position: number | null;
  url_found: string | null;
  /** Local-pack (map pack) position when the business name matched; null otherwise. */
  local_pack_position: number | null;
  checked_at: string;
  source: typeof RANK_SOURCE_SERP;
  /** true = the check could NOT be performed (API error / budget /
   *  quota). Callers must not record a rank-history row for skipped
   *  keywords — a skipped check is not a "not ranking" signal. */
  skipped: boolean;
}

export interface SerpRankOptions {
  /** Per-run query budget (tier keyword cap). Keywords beyond the
   *  budget are returned skipped without any API call. */
  maxQueries: number;
  /** Business name used to match the local-pack entries (the map pack
   *  has no website link, so we match on title). Optional. */
  businessName?: string;
  /** ISO country code for gl=; derived from location when omitted. */
  country?: string;
}

/* ─── Availability ───────────────────────────────────────────────────── */

export function serpRankAvailable(): boolean {
  const v = process.env.SERPER_API_KEY;
  return typeof v === "string" && v.trim().length > 0;
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

export function normalizeDomain(domain: string): string {
  return domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function hostnameOf(link: string): string | null {
  try {
    return new URL(link).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Derive a gl= country code from a free-text location ("Toronto, ON",
 *  "Dallas, TX, USA"). Same heuristic the legacy scraper used. */
export function deriveCountry(location?: string | null): string {
  const loc = (location || "").toLowerCase();
  if (/\bcanada\b|\bontario\b|, on\b|, bc\b|, ab\b|, qc\b/.test(loc)) return "ca";
  return "us";
}

/** Find the target domain's first organic hit in a SerpResult. */
export function findOrganicPosition(
  result: SerpResult,
  cleanDomain: string,
): { position: number | null; url_found: string | null } {
  for (const o of result.organic) {
    const host = hostnameOf(o.link);
    if (host && (host === cleanDomain || host.endsWith(`.${cleanDomain}`))) {
      return { position: o.position, url_found: o.link };
    }
  }
  return { position: null, url_found: null };
}

/** Find the business in the local pack by (normalized) title match. */
export function findLocalPackPosition(
  result: SerpResult,
  businessName?: string,
): number | null {
  if (!businessName || !result.localPack?.length) return null;
  const target = businessName.trim().toLowerCase();
  if (!target) return null;
  for (const entry of result.localPack) {
    const title = (entry.title || "").trim().toLowerCase();
    if (title && (title === target || title.includes(target) || target.includes(title))) {
      return entry.position;
    }
  }
  return null;
}

function isTransient(err: any): boolean {
  const status = err?.status as number | undefined;
  if (status === 429) return false; // quota — abort, don't hammer
  if (typeof status === "number") return status >= 500;
  return true; // network / timeout / abort
}

/* ─── Main entry point ───────────────────────────────────────────────── */

/**
 * Check organic (and local-pack) positions for a batch of keywords via
 * Serper. Never throws — per-keyword failures come back `skipped`.
 */
export async function checkKeywordRanksViaSerp(
  keywords: { id: number; keyword: string }[],
  domain: string,
  location: string | undefined,
  opts: SerpRankOptions,
): Promise<(SerpRankResult & { keyword_id: number })[]> {
  const checkedAt = new Date().toISOString();
  const cleanDomain = normalizeDomain(domain);
  const results: (SerpRankResult & { keyword_id: number })[] = [];

  const skippedResult = (kw: { id: number; keyword: string }): SerpRankResult & { keyword_id: number } => ({
    keyword: kw.keyword,
    keyword_id: kw.id,
    position: null,
    url_found: null,
    local_pack_position: null,
    checked_at: checkedAt,
    source: RANK_SOURCE_SERP,
    skipped: true,
  });

  if (!serpRankAvailable()) {
    log.debug("SERPER_API_KEY not set — all keywords skipped");
    return keywords.map(skippedResult);
  }

  await ensureHydrated();

  const budget = Math.max(0, Math.floor(opts.maxQueries));
  const country = opts.country || deriveCountry(location);
  let aborted = false;
  let queriesUsed = 0;

  for (const kw of keywords) {
    if (aborted || queriesUsed >= budget) {
      results.push(skippedResult(kw));
      continue;
    }
    if (freeQuotaRemaining(serper.ID, serper.MONTHLY_LIMIT) <= 0) {
      log.warn("Serper monthly quota exhausted — skipping remaining keywords this run");
      aborted = true;
      results.push(skippedResult(kw));
      continue;
    }

    const req: SerpRequest = {
      query: kw.keyword,
      engine: "google_web",
      country,
      language: "en",
      num: RESULTS_DEPTH,
      ...(location ? { location } : {}),
    };

    let serpResult: SerpResult | null = null;
    for (let attempt = 0; attempt < 2 && !serpResult; attempt++) {
      try {
        queriesUsed++;
        serpResult = await serper.call(req, REQUEST_TIMEOUT_MS);
        recordSuccess(serper.ID, serper.MONTHLY_LIMIT);
      } catch (err: any) {
        const status = err?.status as number | undefined;
        const message = err?.message || String(err);
        recordError(serper.ID, serper.MONTHLY_LIMIT, message);
        if (status === 429) {
          log.warn("Serper returned 429 — aborting remaining rank checks this run", { keyword: kw.keyword });
          aborted = true;
          break;
        }
        if (attempt === 0 && isTransient(err) && queriesUsed < budget) {
          log.warn("Serper rank check failed, retrying once", {
            keyword: kw.keyword,
            status: status ?? "network",
            error: message.slice(0, 120),
          });
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        log.warn("Serper rank check failed — keyword skipped this run", {
          keyword: kw.keyword,
          status: status ?? "network",
          error: message.slice(0, 120),
        });
        break;
      }
    }

    if (!serpResult) {
      results.push(skippedResult(kw));
      continue;
    }

    const { position, url_found } = findOrganicPosition(serpResult, cleanDomain);
    results.push({
      keyword: kw.keyword,
      keyword_id: kw.id,
      position,
      url_found,
      local_pack_position: findLocalPackPosition(serpResult, opts.businessName),
      checked_at: checkedAt,
      source: RANK_SOURCE_SERP,
      skipped: false,
    });
  }

  const checked = results.filter((r) => !r.skipped).length;
  log.info("Serper rank check batch complete", {
    domain: cleanDomain,
    requested: keywords.length,
    checked,
    skipped: results.length - checked,
    queries_used: queriesUsed,
    budget,
  });

  return results;
}
