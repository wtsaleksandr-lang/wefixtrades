/**
 * reviewIntelligence.ts
 *
 * Multi-provider fallback chain for the free-audit E2 review-intelligence
 * step. Mirrors the provider-chain pattern in server/lib/serpOrchestrator.ts
 * and server/services/competitorSearch.ts (PRs #786, #1644).
 *
 * Provider order (fastest/cheapest first):
 *   1. Serper.dev         — POST /reviews, sync ~1s, free credits
 *   2. Outscraper         — existing impl (lifted from auditRoutes.ts);
 *                           skipped immediately on 402/401 while account
 *                           is unfunded, resumes when topped up
 *   3. DataForSEO         — task_post + poll, slowest (~20s), $0.0015/task
 *
 * Consumer contract (unchanged — callers treat result as `any`):
 *   {
 *     totalFetched: number
 *     ratingDistribution: Record<1|2|3|4|5, number>
 *     mostRecentReviewDate: string | null
 *     ownerResponseRate: number   // 0-100 integer
 *     reviewTexts: string[]
 *     provider: string            // additive — all consumers use `any`
 *   }
 *
 * Doppler env vars (missing → provider auto-skipped):
 *   SERPER_API_KEY
 *   OUTSCRAPER_API_KEY
 *   DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD
 */

import { createLogger } from "../lib/logger";

const log = createLogger("ReviewIntel");

/* ─── Contract ─── */

export interface ReviewIntelResult {
  totalFetched: number;
  ratingDistribution: Record<number, number>;
  mostRecentReviewDate: string | null;
  ownerResponseRate: number;
  reviewTexts: string[];
  provider: string;
}

/* ─── Shared helpers ─── */

function withSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function emptyDist(): Record<number, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

/* ─── Provider 1: Serper.dev ─── */

/**
 * Fetches up to 2 pages (~40 reviews) from Serper's /reviews endpoint.
 * Uses AbortController with an 8s timeout per request.
 */
export async function fetchSerperReviews(placeId: string): Promise<ReviewIntelResult> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new Error("SERPER_API_KEY not set");
  if (!placeId) throw new Error("placeId required");

  const reviews: any[] = [];
  let nextPageToken: string | undefined;

  // Page 1
  const { signal: sig1, clear: clear1 } = withSignal(8000);
  let page1Data: any;
  try {
    const r = await fetch("https://google.serper.dev/reviews", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ placeId }),
      signal: sig1,
    });
    if (!r.ok) {
      const txt = await r.text();
      log.warn("[E2 Serper reviews] page1 non-OK:", { status: r.status, body: txt.slice(0, 300) });
      throw new Error(`Serper HTTP ${r.status}`);
    }
    page1Data = await r.json();
  } finally {
    clear1();
  }

  const page1Reviews: any[] = Array.isArray(page1Data?.reviews) ? page1Data.reviews : [];
  reviews.push(...page1Reviews);
  nextPageToken = page1Data?.nextPageToken ?? undefined;
  log.info("[E2 Serper reviews] page1:", { count: page1Reviews.length, hasNext: !!nextPageToken });

  // Page 2 — only if we have a token and still under 40 reviews
  if (nextPageToken && reviews.length < 40) {
    const { signal: sig2, clear: clear2 } = withSignal(8000);
    try {
      const r2 = await fetch("https://google.serper.dev/reviews", {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ placeId, nextPageToken }),
        signal: sig2,
      });
      if (r2.ok) {
        const page2Data = await r2.json();
        const page2Reviews: any[] = Array.isArray(page2Data?.reviews) ? page2Data.reviews : [];
        reviews.push(...page2Reviews);
        log.info("[E2 Serper reviews] page2:", { count: page2Reviews.length });
      } else {
        log.warn("[E2 Serper reviews] page2 non-OK:", { status: r2.status });
      }
    } catch (err: any) {
      log.warn("[E2 Serper reviews] page2 error (ignored, page1 kept):", { msg: err?.message });
    } finally {
      clear2();
    }
  }

  // Map to contract
  const dist = emptyDist();
  let ownerReplies = 0;
  let mostRecentDate = "";
  const reviewTexts: string[] = [];

  for (const rev of reviews) {
    const text: string = rev.snippet || "";
    if (text) reviewTexts.push(text);

    const stars: number =
      typeof rev.rating === "number" ? rev.rating : 0;
    if (stars >= 1 && stars <= 5) dist[stars]++;

    if (rev.response != null) ownerReplies++;

    const d: string = rev.isoDate || rev.date || "";
    if (d && d > mostRecentDate) mostRecentDate = d;
  }

  const total = reviews.length || 1;
  return {
    totalFetched: reviews.length,
    ratingDistribution: dist,
    mostRecentReviewDate: mostRecentDate || null,
    ownerResponseRate: Math.round((ownerReplies / total) * 100),
    reviewTexts,
    provider: "serper",
  };
}

/* ─── Provider 2: Outscraper (lifted from auditRoutes.ts) ─── */

async function pollOutscraperReviews(
  resultsUrl: string,
  maxWaitMs = 15000,
  intervalMs = 1500,
): Promise<any[]> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const res = await fetch(resultsUrl, {
        headers: { "X-API-KEY": process.env.OUTSCRAPER_API_KEY || "" },
      });
      const data = await res.json();
      log.info("[E2 Outscraper poll] status:", {
        status: data.status,
        results: data.data?.length || 0,
      });
      if (data.status !== "Pending" && data.data) return data.data;
    } catch (err: any) {
      log.warn("[E2 Outscraper poll] error:", { msg: err?.message });
    }
  }
  log.info("[E2 Outscraper poll] timed out");
  return [];
}

/**
 * Outscraper reviews — exact behaviour of the original fetchOutscraperReviews
 * in auditRoutes.ts, lifted here so the original can be removed.
 */
export async function fetchOutscraperReviewsFallback(
  placeId: string,
): Promise<ReviewIntelResult> {
  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) throw new Error("OUTSCRAPER_API_KEY not set");
  if (!placeId) throw new Error("placeId required");

  const reviewParams = new URLSearchParams({
    query: placeId,
    reviewsLimit: "50",
    sort: "newest",
  });
  const requestUrl = `https://api.app.outscraper.com/maps/reviews-v3?${reviewParams}`;
  log.info("[E2 Outscraper reviews] request:", { url: requestUrl });

  const { signal, clear } = withSignal(20000);
  let r: globalThis.Response;
  let rawText: string;
  try {
    r = await fetch(requestUrl, {
      method: "GET",
      headers: { "X-API-KEY": apiKey },
      signal,
    });
    rawText = await r.text();
    log.info("[E2 Outscraper reviews] HTTP status:", { status: r.status });
  } finally {
    clear();
  }

  // 402 / 401 → caller falls through immediately
  if (r.status === 402 || r.status === 401) {
    throw new Error(`Outscraper HTTP ${r.status} (unfunded)`);
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    data = null;
  }

  if (!r.ok) {
    log.warn("[E2 Outscraper reviews] non-OK:", {
      status: r.status,
      body: rawText.slice(0, 500),
    });
    throw new Error(`Outscraper HTTP ${r.status}`);
  }

  let rawReviews = data?.data;
  if (data?.status === "Pending" && data?.results_location) {
    log.info("[E2 Outscraper reviews] 202 Pending, polling:", {
      url: data.results_location,
    });
    rawReviews = await pollOutscraperReviews(data.results_location, 15000);
  }

  const reviews: any[] = Array.isArray(rawReviews)
    ? rawReviews.flat()
    : Array.isArray(data)
    ? data.flat()
    : [];
  log.info("[E2 Outscraper reviews] parsed:", { count: reviews.length });

  const dist = emptyDist();
  let ownerReplies = 0;
  let mostRecentDate = "";
  const reviewTexts: string[] = [];

  for (const rev of reviews) {
    if (rev.review_text) reviewTexts.push(rev.review_text);
    const stars: number =
      typeof rev.review_rating === "number"
        ? rev.review_rating
        : typeof rev.rating === "number"
        ? rev.rating
        : 0;
    if (stars >= 1 && stars <= 5) dist[stars]++;
    if (rev.owner_answer || rev.response_text) ownerReplies++;
    const d: string = rev.review_datetime_utc || rev.date || "";
    if (d && d > mostRecentDate) mostRecentDate = d;
  }

  const total = reviews.length || 1;
  return {
    totalFetched: reviews.length,
    ratingDistribution: dist,
    mostRecentReviewDate: mostRecentDate || null,
    ownerResponseRate: Math.round((ownerReplies / total) * 100),
    reviewTexts,
    provider: "outscraper",
  };
}

/* ─── Provider 3: DataForSEO (task_post + poll) ─── */

/**
 * DataForSEO Google Reviews via task-based flow.
 * task_post → poll every 4s up to 28s; returns null if not done in time
 * (caller treats null as empty → next provider / graceful null).
 *
 * NOTE: place_id is REJECTED by the DataForSEO endpoint. Use keyword
 * (business name) + location_name instead.
 */
export async function fetchDataForSeoReviews(
  businessName: string,
  locationLabel: string,
): Promise<ReviewIntelResult | null> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error("DATAFORSEO credentials not set");
  if (!businessName) throw new Error("businessName required");

  const auth = Buffer.from(`${login}:${password}`).toString("base64");

  // 1. Post task
  const { signal: postSig, clear: postClear } = withSignal(10000);
  let taskId: string;
  try {
    const r = await fetch(
      "https://api.dataforseo.com/v3/business_data/google/reviews/task_post",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          {
            keyword: businessName,
            location_name: locationLabel,
            reviews_count: 40,
            language_code: "en",
          },
        ]),
        signal: postSig,
      },
    );
    if (!r.ok) {
      const txt = await r.text();
      log.warn("[E2 DataForSEO] task_post non-OK:", {
        status: r.status,
        body: txt.slice(0, 300),
      });
      throw new Error(`DataForSEO task_post HTTP ${r.status}`);
    }
    const body = await r.json();
    taskId = body?.tasks?.[0]?.id;
    if (!taskId) {
      log.warn("[E2 DataForSEO] no task id in response:", {
        body: JSON.stringify(body).slice(0, 500),
      });
      throw new Error("DataForSEO: no task id returned");
    }
    log.info("[E2 DataForSEO] task posted:", { taskId });
  } finally {
    postClear();
  }

  // 2. Poll up to 28s (intervals of 4s → up to 7 polls)
  const POLL_INTERVAL_MS = 4000;
  const POLL_DEADLINE_MS = 28000;
  const pollStart = Date.now();

  while (Date.now() - pollStart < POLL_DEADLINE_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const elapsed = Date.now() - pollStart;
    if (elapsed >= POLL_DEADLINE_MS) break;

    const { signal: pollSig, clear: pollClear } = withSignal(8000);
    let taskData: any = null;
    try {
      const pr = await fetch(
        `https://api.dataforseo.com/v3/business_data/google/reviews/task_get/${taskId}`,
        {
          headers: { Authorization: `Basic ${auth}` },
          signal: pollSig,
        },
      );
      if (pr.ok) {
        const pbody = await pr.json();
        taskData = pbody?.tasks?.[0];
        log.info("[E2 DataForSEO] poll:", {
          status: taskData?.status_code,
          items: taskData?.result?.[0]?.items?.length ?? 0,
          elapsedMs: elapsed,
        });
      } else {
        log.warn("[E2 DataForSEO] poll non-OK:", { status: pr.status });
      }
    } catch (err: any) {
      log.warn("[E2 DataForSEO] poll error:", { msg: err?.message });
    } finally {
      pollClear();
    }

    // status_code 20000 = success; 40602 = still processing
    if (taskData?.status_code === 20000) {
      const items: any[] = taskData?.result?.[0]?.items ?? [];
      log.info("[E2 DataForSEO] task complete:", { itemCount: items.length });

      const dist = emptyDist();
      let ownerReplies = 0;
      let mostRecentDate = "";
      const reviewTexts: string[] = [];

      for (const rev of items) {
        const text: string = rev.review_text || "";
        if (text) reviewTexts.push(text);

        const stars: number =
          typeof rev.rating?.value === "number"
            ? rev.rating.value
            : typeof rev.rating === "number"
            ? rev.rating
            : 0;
        if (stars >= 1 && stars <= 5) dist[stars]++;

        if (rev.owner_answer && String(rev.owner_answer).trim().length > 0) {
          ownerReplies++;
        }

        const d: string = rev.timestamp || "";
        if (d && d > mostRecentDate) mostRecentDate = d;
      }

      const total = items.length || 1;
      return {
        totalFetched: items.length,
        ratingDistribution: dist,
        mostRecentReviewDate: mostRecentDate || null,
        ownerResponseRate: Math.round((ownerReplies / total) * 100),
        reviewTexts,
        provider: "dataforseo",
      };
    }
  }

  log.warn("[E2 DataForSEO] timed out at 28s — returning null", { taskId });
  return null;
}

/* ─── Orchestrator ─── */

export interface FetchReviewIntelligenceParams {
  placeId: string;
  businessName: string;
  locationLabel: string;
}

/**
 * Provider chain: Serper → Outscraper → DataForSEO.
 *
 * Each provider is skipped when:
 *   - Its env var(s) are missing (misconfigured)
 *   - It throws / times out
 *   - It returns totalFetched === 0 (empty result)
 *
 * Outscraper gets a cheap pre-check: if its first response is 402 or 401
 * it falls through immediately without waiting for a poll cycle.
 *
 * Returns null only when every provider fails — the existing graceful-null
 * path in the caller handles this identically to the pre-existing behaviour.
 */
export async function fetchReviewIntelligence({
  placeId,
  businessName,
  locationLabel,
}: FetchReviewIntelligenceParams): Promise<ReviewIntelResult | null> {
  // ── 1. Serper ──
  if (process.env.SERPER_API_KEY) {
    try {
      log.info("[E2 chain] trying Serper");
      const result = await fetchSerperReviews(placeId);
      if (result.totalFetched > 0) {
        log.info("[E2 chain] Serper succeeded:", {
          totalFetched: result.totalFetched,
          provider: result.provider,
        });
        return result;
      }
      log.warn("[E2 chain] Serper returned 0 reviews — falling through");
    } catch (err: any) {
      log.warn("[E2 chain] Serper failed:", { msg: err?.message });
    }
  } else {
    log.info("[E2 chain] Serper skipped: SERPER_API_KEY not set");
  }

  // ── 2. Outscraper ──
  if (process.env.OUTSCRAPER_API_KEY) {
    try {
      log.info("[E2 chain] trying Outscraper");
      const result = await fetchOutscraperReviewsFallback(placeId);
      if (result.totalFetched > 0) {
        log.info("[E2 chain] Outscraper succeeded:", {
          totalFetched: result.totalFetched,
          provider: result.provider,
        });
        return result;
      }
      log.warn("[E2 chain] Outscraper returned 0 reviews — falling through");
    } catch (err: any) {
      // 402/401 → cheap skip; other errors → also fall through
      log.warn("[E2 chain] Outscraper failed:", { msg: err?.message });
    }
  } else {
    log.info("[E2 chain] Outscraper skipped: OUTSCRAPER_API_KEY not set");
  }

  // ── 3. DataForSEO ──
  if (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD) {
    try {
      log.info("[E2 chain] trying DataForSEO");
      const result = await fetchDataForSeoReviews(businessName, locationLabel);
      if (result && result.totalFetched > 0) {
        log.info("[E2 chain] DataForSEO succeeded:", {
          totalFetched: result.totalFetched,
          provider: result.provider,
        });
        return result;
      }
      if (result === null) {
        log.warn("[E2 chain] DataForSEO timed out (28s) — all providers exhausted");
      } else {
        log.warn("[E2 chain] DataForSEO returned 0 reviews — all providers exhausted");
      }
    } catch (err: any) {
      log.warn("[E2 chain] DataForSEO failed:", { msg: err?.message });
    }
  } else {
    log.info("[E2 chain] DataForSEO skipped: credentials not set");
  }

  log.warn("[E2 chain] all providers failed — returning null");
  return null;
}
