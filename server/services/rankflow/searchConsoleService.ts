/**
 * Google Search Console API service for RankFlow.
 *
 * Provides two primary functions:
 *   1. getSearchConsoleData — pulls clicks, impressions, CTR, and position
 *      from Search Analytics for top queries and pages.
 *   2. checkIndexStatus — uses the URL Inspection API to determine whether
 *      individual URLs are indexed, not indexed, redirecting, etc.
 *
 * Auth: reuses the existing Google OAuth credentials stored on each client
 * (same tokens used by Google Business Profile, with the added
 * webmasters.readonly scope).
 */

import { google } from "googleapis";
import { storage } from "../../storage";
import { decryptGoogleCredentials } from "../../lib/tokenEncryption";
import { createLogger } from "../../lib/logger";

const log = createLogger("SearchConsole");

// ─── Types ───────────────────────────────────────────────────────────

export interface GoogleCredentials {
  access_token: string | null;
  refresh_token: string | null;
  expiry_date: number | null;
  token_type: string | null;
}

export interface SearchConsoleQueryRow {
  query: string;
  page: string;
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsoleData {
  siteUrl: string;
  startDate: string;
  endDate: string;
  rows: SearchConsoleQueryRow[];
  /** Aggregated top queries (summed across pages/dates). */
  topQueries: { query: string; clicks: number; impressions: number; avgPosition: number; avgCtr: number }[];
  /** Aggregated top pages (summed across queries/dates). */
  topPages: { page: string; clicks: number; impressions: number; avgPosition: number; avgCtr: number }[];
}

export interface IndexStatusResult {
  url: string;
  verdict: string; // PASS, NEUTRAL, FAIL, VERDICT_UNSPECIFIED
  coverageState: string; // e.g. "Submitted and indexed", "Crawled - currently not indexed"
  indexingState: string; // INDEXING_ALLOWED, INDEXING_NOT_ALLOWED, etc.
  robotsTxtState: string; // ALLOWED, DISALLOWED
  lastCrawlTime: string | null;
  inspectedAt: string;
  error?: string;
}

// ─── Internal helpers ────────────────────────────────────────────────

function getClientConfig() {
  const clientId = process.env.GOOGLE_BUSINESS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_BUSINESS_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_BUSINESS_REDIRECT_URI;
  return { clientId, clientSecret, redirectUri };
}

function createOAuth2Client() {
  const { clientId, clientSecret, redirectUri } = getClientConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth not configured");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Build an authenticated OAuth2 client from a client's stored Google credentials.
 * Returns null if the client has no credentials or they are invalid.
 */
async function getAuthenticatedClient(wftClientId: number) {
  const client = await storage.getClientById(wftClientId);
  if (!client?.google_credentials) return null;

  const rawCreds = client.google_credentials as Record<string, unknown>;
  const creds = decryptGoogleCredentials(rawCreds) as any;
  if (!creds.refresh_token && !creds.access_token) return null;

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: creds.access_token,
    refresh_token: creds.refresh_token,
    expiry_date: creds.expiry_date,
    token_type: creds.token_type,
  });

  return oauth2Client;
}

/**
 * Resolve credentials either from a GoogleCredentials object or by looking
 * up a WeFixTrades client ID.
 */
function buildOAuth2Client(credentials: GoogleCredentials) {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: credentials.access_token,
    refresh_token: credentials.refresh_token,
    expiry_date: credentials.expiry_date,
    token_type: credentials.token_type,
  });
  return oauth2Client;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Pull search analytics data from Google Search Console.
 *
 * Calls searchanalytics.query with dimensions [query, page, date] for the
 * given site property. Returns raw rows plus aggregated top-queries and
 * top-pages summaries.
 *
 * Default date range: last 28 days (Search Console data has a ~3 day lag,
 * so "today" minus 3 to minus 31).
 */
export async function getSearchConsoleData(
  siteUrl: string,
  credentials: GoogleCredentials,
  options?: { startDate?: string; endDate?: string },
): Promise<SearchConsoleData> {
  const oauth2Client = buildOAuth2Client(credentials);
  const webmasters = google.webmasters({ version: "v3", auth: oauth2Client });

  // Default range: 28 days ending 3 days ago (SC data lag)
  const end = options?.endDate
    ? options.endDate
    : formatDate(new Date(Date.now() - 3 * 86_400_000));
  const start = options?.startDate
    ? options.startDate
    : formatDate(new Date(Date.now() - 31 * 86_400_000));

  log.info("Fetching Search Console data", { siteUrl, start, end });

  const res = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: start,
      endDate: end,
      dimensions: ["query", "page", "date"],
      rowLimit: 5000,
    } as any,
  });

  const apiRows = (res as any).data.rows || [];

  const rows: SearchConsoleQueryRow[] = apiRows.map((r: any) => ({
    query: r.keys[0],
    page: r.keys[1],
    date: r.keys[2],
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));

  // Aggregate by query
  const queryMap = new Map<string, { clicks: number; impressions: number; positionSum: number; ctrSum: number; count: number }>();
  for (const row of rows) {
    const existing = queryMap.get(row.query);
    if (existing) {
      existing.clicks += row.clicks;
      existing.impressions += row.impressions;
      existing.positionSum += row.position;
      existing.ctrSum += row.ctr;
      existing.count += 1;
    } else {
      queryMap.set(row.query, { clicks: row.clicks, impressions: row.impressions, positionSum: row.position, ctrSum: row.ctr, count: 1 });
    }
  }

  const topQueries = Array.from(queryMap.entries())
    .map(([query, v]) => ({
      query,
      clicks: v.clicks,
      impressions: v.impressions,
      avgPosition: Math.round((v.positionSum / v.count) * 10) / 10,
      avgCtr: Math.round((v.ctrSum / v.count) * 1000) / 1000,
    }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 100);

  // Aggregate by page
  const pageMap = new Map<string, { clicks: number; impressions: number; positionSum: number; ctrSum: number; count: number }>();
  for (const row of rows) {
    const existing = pageMap.get(row.page);
    if (existing) {
      existing.clicks += row.clicks;
      existing.impressions += row.impressions;
      existing.positionSum += row.position;
      existing.ctrSum += row.ctr;
      existing.count += 1;
    } else {
      pageMap.set(row.page, { clicks: row.clicks, impressions: row.impressions, positionSum: row.position, ctrSum: row.ctr, count: 1 });
    }
  }

  const topPages = Array.from(pageMap.entries())
    .map(([page, v]) => ({
      page,
      clicks: v.clicks,
      impressions: v.impressions,
      avgPosition: Math.round((v.positionSum / v.count) * 10) / 10,
      avgCtr: Math.round((v.ctrSum / v.count) * 1000) / 1000,
    }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 100);

  log.info("Search Console data retrieved", { siteUrl, rowCount: rows.length, topQueryCount: topQueries.length });

  return {
    siteUrl,
    startDate: start,
    endDate: end,
    rows,
    topQueries,
    topPages,
  };
}

/**
 * Check the indexing status of individual URLs using the URL Inspection API.
 *
 * Rate limit: Google allows a maximum of 2000 URL inspections per day per
 * property. This function processes URLs sequentially with a small delay
 * to avoid hitting per-second rate limits.
 *
 * Each URL returns a verdict (PASS = indexed, FAIL = not indexed, etc.)
 * plus detailed coverage and crawl information.
 */
export async function checkIndexStatus(
  siteUrl: string,
  credentials: GoogleCredentials,
  urls: string[],
): Promise<IndexStatusResult[]> {
  const oauth2Client = buildOAuth2Client(credentials);
  const searchconsole = google.searchconsole({ version: "v1", auth: oauth2Client });

  const results: IndexStatusResult[] = [];
  const inspectedAt = new Date().toISOString();

  log.info("Starting URL inspection", { siteUrl, urlCount: urls.length });

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const res = await searchconsole.urlInspection.index.inspect({
        requestBody: {
          inspectionUrl: url,
          siteUrl,
        },
      });

      const result = res.data.inspectionResult;
      const indexStatus = result?.indexStatusResult;

      results.push({
        url,
        verdict: indexStatus?.verdict || "VERDICT_UNSPECIFIED",
        coverageState: indexStatus?.coverageState || "Unknown",
        indexingState: indexStatus?.indexingState || "INDEXING_STATE_UNSPECIFIED",
        robotsTxtState: indexStatus?.robotsTxtState || "ROBOTS_TXT_STATE_UNSPECIFIED",
        lastCrawlTime: indexStatus?.lastCrawlTime || null,
        inspectedAt,
      });
    } catch (err: any) {
      const status = err?.response?.status;
      const message = err?.response?.data?.error?.message || err.message;

      log.warn("URL inspection failed", { url, status, error: message });

      results.push({
        url,
        verdict: "ERROR",
        coverageState: "Inspection failed",
        indexingState: "UNKNOWN",
        robotsTxtState: "UNKNOWN",
        lastCrawlTime: null,
        inspectedAt,
        error: message,
      });

      // If we hit a rate limit, stop processing more URLs
      if (status === 429) {
        log.warn("URL Inspection API rate limit reached, stopping batch", { processedCount: i + 1, totalCount: urls.length });
        break;
      }
    }

    // Small delay between requests to avoid per-second rate limits
    if (i < urls.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  log.info("URL inspection complete", { siteUrl, processed: results.length, total: urls.length });

  return results;
}

/**
 * Convenience: get an authenticated client for a WeFixTrades client ID and
 * return credentials in the format expected by getSearchConsoleData / checkIndexStatus.
 */
export async function getCredentialsForClient(wftClientId: number): Promise<GoogleCredentials | null> {
  const client = await storage.getClientById(wftClientId);
  if (!client?.google_credentials) return null;

  const rawCreds = client.google_credentials as Record<string, unknown>;
  const creds = decryptGoogleCredentials(rawCreds) as any;
  if (!creds.refresh_token && !creds.access_token) return null;

  return {
    access_token: creds.access_token || null,
    refresh_token: creds.refresh_token || null,
    expiry_date: creds.expiry_date || null,
    token_type: creds.token_type || null,
  };
}

/**
 * Quick check: does the client have Search Console access?
 * Attempts a minimal query. Returns true if the API responds without error.
 */
export async function hasSearchConsoleAccess(
  siteUrl: string,
  credentials: GoogleCredentials,
): Promise<boolean> {
  try {
    const oauth2Client = buildOAuth2Client(credentials);
    const webmasters = google.webmasters({ version: "v3", auth: oauth2Client });

    // Try to list sites — if the siteUrl is accessible, this will succeed
    const res = await webmasters.sites.get({ siteUrl });
    return !!res.data.siteUrl;
  } catch (err: any) {
    log.debug("Search Console access check failed", { siteUrl, error: err.message });
    return false;
  }
}
