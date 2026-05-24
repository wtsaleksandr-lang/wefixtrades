/**
 * GA4 Data API — service-account auth.
 *
 * Different from `server/lib/seo/ga4Client.ts`: that one is the GA4 *Admin*
 * API (provision properties, list data streams) and uses the operator's
 * OAuth grant. THIS one is the GA4 *Data* API (read sessions, page views,
 * top pages) and uses the service account `wefixtrades@acx-audiobooks.iam.gserviceaccount.com`
 * that has Editor on property 537753613.
 *
 * Service-account auth avoids the per-operator OAuth dance: as long as
 * `GOOGLE_APPLICATION_CREDENTIALS_JSON` is in Doppler the admin
 * dashboard can always read live numbers, even when no operator has
 * recently signed in.
 *
 * Surface kept small — only what the admin SEO Integrations GA4 card needs.
 */

import { google } from "googleapis";
import { createLogger } from "../logger";

const log = createLogger("Ga4DataClient");

const DATA_API_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  [k: string]: unknown;
}

/**
 * Parse the Doppler-injected service-account JSON exactly once per
 * process. Falls back to throwing — callers swallow at the route level
 * so an unconfigured Doppler key surfaces as "GA4 summary unavailable"
 * in the admin UI rather than a 500.
 */
let cachedKey: ServiceAccountKey | null = null;
let cachedKeyParsed = false;

function loadServiceAccountKey(): ServiceAccountKey | null {
  if (cachedKeyParsed) return cachedKey;
  cachedKeyParsed = true;
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) {
    log.warn("GOOGLE_APPLICATION_CREDENTIALS_JSON not set — GA4 Data API disabled");
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as ServiceAccountKey;
    if (!parsed.client_email || !parsed.private_key) {
      log.warn("GOOGLE_APPLICATION_CREDENTIALS_JSON missing client_email/private_key");
      return null;
    }
    cachedKey = {
      ...parsed,
      // Doppler-injected multi-line JSON often arrives with literal \n's
      // in place of real newlines. Restore them so jwt-sign accepts the key.
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
    return cachedKey;
  } catch (err) {
    log.warn("Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON", {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Lazy-built `analyticsdata` client. JWT-auth is cached internally by
 * the googleapis client, so this is cheap to call per request.
 */
function makeDataClient() {
  const key = loadServiceAccountKey();
  if (!key) throw new Error("ga4_data_api_unconfigured");
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: DATA_API_SCOPES,
  });
  return google.analyticsdata({ version: "v1beta", auth });
}

/**
 * Check whether the Data API client is callable — used by the admin
 * status endpoint to render a "Configure" callout when not.
 */
export function isGa4DataApiConfigured(): boolean {
  return !!loadServiceAccountKey();
}

export interface SessionsAndPageviews {
  sessions: number;
  pageviews: number;
  newUsers: number;
}

/**
 * Aggregate metrics for the last `daysBack` days, ending yesterday
 * (today is incomplete in GA's pipeline so we exclude it for stability).
 */
export async function getSessionsAndPageviews(opts: {
  propertyId: string;
  daysBack: number;
}): Promise<SessionsAndPageviews> {
  const client = makeDataClient();
  const startDate = `${opts.daysBack}daysAgo`;
  const endDate = "yesterday";

  const { data } = await client.properties.runReport({
    property: `properties/${opts.propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: "sessions" },
        { name: "screenPageViews" },
        { name: "newUsers" },
      ],
    },
  });

  const row = data.rows?.[0];
  const sessions = parseInt(row?.metricValues?.[0]?.value ?? "0", 10);
  const pageviews = parseInt(row?.metricValues?.[1]?.value ?? "0", 10);
  const newUsers = parseInt(row?.metricValues?.[2]?.value ?? "0", 10);
  return {
    sessions: Number.isFinite(sessions) ? sessions : 0,
    pageviews: Number.isFinite(pageviews) ? pageviews : 0,
    newUsers: Number.isFinite(newUsers) ? newUsers : 0,
  };
}

export interface TopPageRow {
  path: string;
  views: number;
}

/**
 * Top `limit` pages by view count over the last `daysBack` days.
 * Returns an empty array on any error — the card degrades gracefully.
 */
export async function getTopPages(opts: {
  propertyId: string;
  daysBack: number;
  limit: number;
}): Promise<TopPageRow[]> {
  const client = makeDataClient();
  const { data } = await client.properties.runReport({
    property: `properties/${opts.propertyId}`,
    requestBody: {
      dateRanges: [{ startDate: `${opts.daysBack}daysAgo`, endDate: "yesterday" }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: String(opts.limit),
    },
  });
  return (data.rows ?? []).map((r) => ({
    path: r.dimensionValues?.[0]?.value ?? "",
    views: parseInt(r.metricValues?.[0]?.value ?? "0", 10),
  }));
}
