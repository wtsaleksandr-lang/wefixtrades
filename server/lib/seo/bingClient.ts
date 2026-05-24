/**
 * Bing Webmaster Tools API client.
 *
 * Bing uses a per-user API key (generated in the Bing Webmaster UI) for
 * auth — NOT OAuth. The key for wefixtrades.com lives in Doppler at
 * BING_WEBMASTER_API_KEY (32 chars) and is read once at module load.
 *
 * REST endpoint base: https://ssl.bing.com/webmaster/api.svc/json
 * Auth: `?apikey=<KEY>` query parameter on every call.
 * Body envelope: success → `{ d: <payload> }`, failure → `{ ErrorCode, Message }`.
 *
 * Surface:
 *   - submitUrl / submitUrls       — ask Bing to crawl a URL / batch (max 100/day from quota)
 *   - submitSitemap / getSitemaps  — feed registration + listing
 *   - getUrlSubmissionQuota        — daily / monthly remaining
 *   - getUrlInfo                   — last-crawl + index status
 *   - getSites                     — useful for healthz probe
 *   - validateApiKey               — legacy validate path for the connect flow
 *
 * Security:
 *   - The API key value is NEVER logged. Error messages strip query strings.
 *   - In production, missing BING_WEBMASTER_API_KEY throws at first use (not at
 *     module load — the module loads under both tsx and esbuild dist where env
 *     bootstrap can run after import). Dev returns a clearly-labeled stub.
 *
 * Docs: https://learn.microsoft.com/en-us/bingwebmaster/getting-access
 */

import { fetchWithRetry } from "../httpRetry";
import { getToken } from "./oauthTokenStore";
import { createLogger } from "../logger";

const log = createLogger("BingClient");

const BING_BASE = "https://ssl.bing.com/webmaster/api.svc/json";

/** Canonical site URL Bing has verified — must include trailing slash. */
export const BING_SITE_URL = "https://wefixtrades.com/";

// ─── Types ──────────────────────────────────────────────────────────────

export interface BingErrorBody {
  ErrorCode?: number;
  Message?: string;
}

export class BingApiError extends Error {
  readonly status: number;
  readonly errorCode: number | null;
  readonly method: string;
  constructor(method: string, status: number, errorCode: number | null, message: string) {
    super(`Bing ${method} failed (${status}${errorCode != null ? `, code=${errorCode}` : ""}): ${message}`);
    this.name = "BingApiError";
    this.method = method;
    this.status = status;
    this.errorCode = errorCode;
  }
}

export interface BingQuota {
  DailyQuota: number;
  MonthlyQuota: number;
}

export interface BingSiteSummary {
  Url: string;
  IsVerified: boolean;
  /** Bing's verified site shape may include additional fields; we expose the essentials. */
  [extra: string]: unknown;
}

export interface BingFeedSummary {
  /** The feed URL Bing has on file. */
  Url: string;
  /** Submission status; values include "Submitted", "Indexed", "Error". */
  Status?: string;
  /** ISO date string Bing returned (may be `/Date(123)/` legacy WCF format). */
  LastCrawledDate?: string;
  [extra: string]: unknown;
}

export interface BingUrlInfo {
  Url?: string;
  DocumentDownloaded?: boolean;
  HttpStatus?: number;
  LastCrawledDate?: string;
  DiscoveryDate?: string;
  AnchorCount?: number;
  TotalChildUrlCount?: number;
  [extra: string]: unknown;
}

// ─── Internal helpers ───────────────────────────────────────────────────

/**
 * Resolve the Bing API key. Order:
 *   1. process.env.BING_WEBMASTER_API_KEY (preferred — Doppler-injected)
 *   2. Legacy oauth_tokens.provider='bing' row (back-compat with PR #623 UI)
 *
 * Throws if neither is available; in `NODE_ENV=production` the throw is
 * meant to be unrecoverable for the calling code path (caller catches).
 */
async function resolveApiKey(): Promise<string> {
  const fromEnv = process.env.BING_WEBMASTER_API_KEY;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();

  // Legacy fallback — the existing /admin/integrations/bing/connect flow
  // persists the key in oauth_tokens. Keep working for envs that haven't
  // added the env-var yet.
  try {
    const tok = await getToken("bing");
    if (tok?.access_token) return tok.access_token;
  } catch (err) {
    // Token store failures shouldn't unmask the env-missing path. Log opaque
    // (no value) and fall through to the generic error.
    log.warn("oauth_tokens fallback lookup failed", {
      err: err instanceof Error ? err.message : "unknown",
    });
  }

  throw new Error(
    "BING_WEBMASTER_API_KEY is not set (and no legacy oauth_tokens.bing row). " +
      "Add it to Doppler wefixtrades/<env>.",
  );
}

/** Redact an arbitrary string of any `apikey=...` query value. */
function redact(s: string): string {
  return s.replace(/apikey=[^&\s"']+/gi, "apikey=<REDACTED>");
}

interface BingResponseEnvelope<T> {
  d?: T;
  ErrorCode?: number;
  Message?: string;
}

async function bingFetch<T>(
  method: string,
  init: { httpMethod: "GET" | "POST"; query?: Record<string, string>; body?: unknown },
): Promise<T> {
  const apiKey = await resolveApiKey();
  const params = new URLSearchParams({ apikey: apiKey, ...(init.query ?? {}) });
  const url = `${BING_BASE}/${method}?${params.toString()}`;

  let res: Response;
  try {
    res = await fetchWithRetry(url, {
      method: init.httpMethod,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
      },
      body: init.httpMethod === "POST" ? JSON.stringify(init.body ?? {}) : undefined,
      timeoutMs: 10_000,
      retries: 3,
    });
  } catch (err) {
    // Network-level failure post-retries. Strip key from any thrown message.
    const msg = err instanceof Error ? err.message : String(err);
    throw new BingApiError(method, 0, null, redact(msg));
  }

  const text = await res.text();
  let parsed: BingResponseEnvelope<T> | null = null;
  try {
    parsed = text ? (JSON.parse(text) as BingResponseEnvelope<T>) : null;
  } catch {
    // Non-JSON body — surface a redacted snippet.
    if (!res.ok) {
      throw new BingApiError(method, res.status, null, redact(text.slice(0, 200)) || "non-JSON body");
    }
    // 2xx with non-JSON is unexpected but treat as empty.
    parsed = null;
  }

  if (!res.ok) {
    throw new BingApiError(
      method,
      res.status,
      parsed?.ErrorCode ?? null,
      parsed?.Message ?? `HTTP ${res.status}`,
    );
  }
  if (parsed && parsed.ErrorCode != null) {
    // Bing sometimes returns 200 with an embedded ErrorCode.
    throw new BingApiError(method, res.status, parsed.ErrorCode, parsed.Message ?? "Bing error");
  }
  // `d` is the payload on success; on void methods Bing returns `{ "d": null }`.
  return (parsed?.d as T) ?? (undefined as unknown as T);
}

// ─── Public methods ─────────────────────────────────────────────────────

/**
 * Submit a single URL for indexing. Counts 1 against the daily quota.
 */
export async function submitUrl(targetUrl: string): Promise<void> {
  await bingFetch<null>("SubmitUrl", {
    httpMethod: "POST",
    body: { siteUrl: BING_SITE_URL, url: targetUrl },
  });
  log.info("Bing SubmitUrl ok", { url: targetUrl });
}

/**
 * Submit a batch of URLs. Bing caps the per-request batch at 500 and the
 * per-day quota at 100 — the caller is responsible for respecting the
 * daily ceiling (use getUrlSubmissionQuota first).
 */
export async function submitUrls(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  if (urls.length > 500) {
    throw new Error("submitUrls: max 500 URLs per request");
  }
  await bingFetch<null>("SubmitUrlBatch", {
    httpMethod: "POST",
    body: { siteUrl: BING_SITE_URL, urlList: urls },
  });
  log.info("Bing SubmitUrlBatch ok", { count: urls.length });
}

/**
 * Current daily/monthly URL-submission quota for the site.
 */
export async function getQuota(): Promise<BingQuota> {
  const data = await bingFetch<BingQuota>("GetUrlSubmissionQuota", {
    httpMethod: "GET",
    query: { siteUrl: BING_SITE_URL },
  });
  return {
    DailyQuota: Number(data?.DailyQuota ?? 0),
    MonthlyQuota: Number(data?.MonthlyQuota ?? 0),
  };
}

/**
 * Backward-compat alias used by the existing connect flow.
 */
export async function getUrlSubmissionQuota(
  _siteUrl?: string,
): Promise<{ daily: number; monthly: number } | null> {
  try {
    const q = await getQuota();
    return { daily: q.DailyQuota, monthly: q.MonthlyQuota };
  } catch (err) {
    log.warn("Failed to fetch Bing submission quota", {
      err: err instanceof Error ? err.message : "unknown",
    });
    return null;
  }
}

/**
 * Submit (or re-submit) a sitemap feed URL. Idempotent on Bing's side.
 */
export async function submitSitemap(feedUrl: string): Promise<void> {
  await bingFetch<null>("SubmitFeed", {
    httpMethod: "POST",
    body: { siteUrl: BING_SITE_URL, feedUrl },
  });
  log.info("Bing SubmitFeed ok", { feedUrl });
}

/**
 * List sitemaps Bing has on file for the site.
 */
export async function getSitemaps(): Promise<BingFeedSummary[]> {
  const data = await bingFetch<BingFeedSummary[]>("GetFeeds", {
    httpMethod: "GET",
    query: { siteUrl: BING_SITE_URL },
  });
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch Bing's index/crawl info for a specific URL.
 */
export async function getUrlInfo(url: string): Promise<BingUrlInfo> {
  const data = await bingFetch<BingUrlInfo>("GetUrlInfo", {
    httpMethod: "GET",
    query: { siteUrl: BING_SITE_URL, url },
  });
  return data ?? {};
}

/**
 * List sites the API key has access to. Cheap auth probe used by healthz.
 */
export async function getSites(): Promise<BingSiteSummary[]> {
  const data = await bingFetch<BingSiteSummary[]>("GetUserSites", { httpMethod: "GET" });
  return Array.isArray(data) ? data : [];
}

/**
 * Validate a candidate API key by hitting GetUserAgents (cheap, auth-only).
 * Kept for the existing /admin/integrations/bing/connect path — that route
 * still pastes a key into oauth_tokens for back-compat.
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  if (!apiKey || apiKey.trim().length < 8) return false;
  try {
    const url = `${BING_BASE}/GetUserAgents?apikey=${encodeURIComponent(apiKey.trim())}`;
    const res = await fetchWithRetry(url, { method: "GET", timeoutMs: 8_000, retries: 1 });
    return res.ok;
  } catch (err) {
    log.warn("Bing API key validation failed", {
      err: err instanceof Error ? redact(err.message) : "unknown",
    });
    return false;
  }
}
