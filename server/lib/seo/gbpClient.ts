/**
 * Google Business Profile (GBP) shim — partial automation.
 *
 * Two auth paths are supported, preferred in this order:
 *
 *   1. **Service account** (preferred): the SA in `GOOGLE_APPLICATION_CREDENTIALS_JSON`
 *      mints a `business.manage` access token via google-auth-library JWT.
 *      No per-operator OAuth dance, no token-refresh churn — same pattern
 *      ga4DataClient.ts uses for the GA4 Data API. Requires:
 *        a. SA invited as a Manager on the GBP location (Alex action via
 *           business.google.com → Users → Add user → role: Manager).
 *        b. Per-minute quota > 0 on the GCP project for the GBP APIs
 *           (`mybusinessaccountmanagement.googleapis.com` +
 *           `mybusinessbusinessinformation.googleapis.com`) — Google
 *           ships these enabled-with-zero-quota by default and requires
 *           a one-time quota-increase request.
 *      See `docs/operations/gbp-service-account-setup.md`.
 *
 *   2. **OAuth fallback**: legacy path that uses the operator's google
 *      OAuth grant with the `business.manage` scope. Requires Google to
 *      approve the OAuth client for that scope (multi-week review). Kept
 *      so the system keeps working if anyone later prefers the OAuth
 *      flow over inviting the SA.
 *
 * Until the listing is created + verified outside the system, the API
 * surface here is a scaffold + prepared draft that Alex can use to seed
 * the listing manually in the GBP UI. After verification, this module
 * is the wiring point for: auto-sync hours, post weekly updates, fetch
 * performance metrics, alert on negative reviews.
 */

import { google } from "googleapis";
import { getToken, type StoredToken } from "./oauthTokenStore";
import { createLogger } from "../logger";

const log = createLogger("GbpClient");

/* ─── API base URLs (overridable for dev/mocking) ─────────────────── */

// v4 — local posts + reviews live here.
const GBP_V4_DEFAULT = "https://mybusiness.googleapis.com/v4";
// v1 Business Information — used for location PATCH (hours).
const GBP_INFO_V1_DEFAULT = "https://mybusinessbusinessinformation.googleapis.com/v1";

function gbpV4Base(): string {
  if (process.env.NODE_ENV !== "production" && process.env.GBP_API_BASE_OVERRIDE) {
    return process.env.GBP_API_BASE_OVERRIDE;
  }
  return GBP_V4_DEFAULT;
}

function gbpInfoV1Base(): string {
  if (process.env.NODE_ENV !== "production" && process.env.GBP_INFO_API_BASE_OVERRIDE) {
    return process.env.GBP_INFO_API_BASE_OVERRIDE;
  }
  return GBP_INFO_V1_DEFAULT;
}

export interface GbpListingDraft {
  business_name: string;
  primary_category: string;
  additional_categories: string[];
  description: string;
  hours: Record<string, { open: string; close: string } | "closed">;
  phone_e164: string;
  website: string;
  service_areas: string[];
  attributes: string[];
  manual_steps: string[];
}

export function generateListingDraft(): GbpListingDraft {
  return {
    business_name: "WeFixTrades",
    primary_category: "Marketing Agency",
    additional_categories: [
      "Software Company",
      "Website Designer",
      "Business Consultant",
    ],
    description: [
      "WeFixTrades gives trades businesses (plumbers, electricians, HVAC, roofers, ",
      "landscapers, garage doors, fencing, and 20+ more) the website, quote ",
      "calculator, booking, review funnel, and AI receptionist they need to win ",
      "more jobs — without a designer, developer, or marketing agency.",
    ].join(""),
    hours: {
      monday:    { open: "08:00", close: "18:00" },
      tuesday:   { open: "08:00", close: "18:00" },
      wednesday: { open: "08:00", close: "18:00" },
      thursday:  { open: "08:00", close: "18:00" },
      friday:    { open: "08:00", close: "18:00" },
      saturday:  { open: "10:00", close: "14:00" },
      sunday:    "closed",
    },
    phone_e164: "+18000000000",
    website: "https://wefixtrades.com",
    service_areas: ["United States"],
    attributes: [
      "Online appointments",
      "Online classes",
      "Wheelchair accessible",
    ],
    manual_steps: [
      "Visit https://business.google.com and click 'Add business'.",
      "Select 'Service business' (no storefront).",
      "Paste the prepared business name + category from this draft.",
      "Add the description, hours, phone, and website.",
      "Request verification (Google will mail a postcard with a code).",
      "Once verified, return to /admin/integrations/google and click 'Connect GBP'.",
    ],
  };
}

/* ─── Service-account auth (preferred path) ───────────────────────── */

const GBP_SA_SCOPES = ["https://www.googleapis.com/auth/business.manage"];

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  [k: string]: unknown;
}

let cachedSaKey: ServiceAccountKey | null = null;
let cachedSaKeyParsed = false;

function loadServiceAccountKey(): ServiceAccountKey | null {
  if (cachedSaKeyParsed) return cachedSaKey;
  cachedSaKeyParsed = true;
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccountKey;
    if (!parsed.client_email || !parsed.private_key) return null;
    cachedSaKey = {
      ...parsed,
      // Doppler-injected JSON often arrives with literal \n in the key.
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
    return cachedSaKey;
  } catch (err) {
    log.warn("Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON for GBP", {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** True when a parseable SA key is present in env. */
export function isGbpSaConfigured(): boolean {
  return !!loadServiceAccountKey();
}

/** Return the SA's `client_email`, or null if SA not configured. */
export function getGbpSaEmail(): string | null {
  const key = loadServiceAccountKey();
  return key?.client_email ?? null;
}

/**
 * Mint a `business.manage` access token from the SA. Cached for the
 * lifetime of the JWT client; google-auth-library handles refresh.
 */
let cachedSaJwt: InstanceType<typeof google.auth.JWT> | null = null;

function makeSaJwt(): InstanceType<typeof google.auth.JWT> | null {
  const key = loadServiceAccountKey();
  if (!key) return null;
  if (cachedSaJwt) return cachedSaJwt;
  cachedSaJwt = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: GBP_SA_SCOPES,
  });
  return cachedSaJwt;
}

async function getSaAccessToken(): Promise<string | null> {
  const jwt = makeSaJwt();
  if (!jwt) return null;
  try {
    const { token } = await jwt.getAccessToken();
    return token ?? null;
  } catch (err) {
    log.warn("GBP SA token mint failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Probe GBP reachability with the SA. Returns:
 *   - "ok"            — accounts endpoint returned 2xx (SA invited as
 *                       Manager AND project quota > 0)
 *   - "quota_zero"    — 429 RESOURCE_EXHAUSTED with quota_limit_value=0
 *                       (Alex must request quota increase from Google)
 *   - "no_access"     — 403/404 (SA not invited as Manager on the listing)
 *   - "unconfigured"  — SA key not in env
 *   - "error"         — network/other
 */
export type GbpSaProbe = "ok" | "quota_zero" | "no_access" | "unconfigured" | "error";

export async function probeGbpSaAccess(): Promise<GbpSaProbe> {
  const token = await getSaAccessToken();
  if (!token) return "unconfigured";
  try {
    const res = await fetch(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=1",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) return "ok";
    if (res.status === 429) {
      try {
        const body = await res.json();
        const detail = body?.error?.details?.find(
          (d: any) => d?.metadata?.quota_limit_value === "0",
        );
        if (detail) return "quota_zero";
      } catch {
        // fall through
      }
      return "quota_zero"; // 429 on a 0-quota project is the dominant case
    }
    if (res.status === 401 || res.status === 403 || res.status === 404) return "no_access";
    return "error";
  } catch {
    return "error";
  }
}

/**
 * Check whether the GBP API is reachable. True when EITHER the SA path
 * is configured + reachable, OR the legacy OAuth token has the
 * `business.manage` scope.
 */
export async function isApiAvailable(): Promise<boolean> {
  if (isGbpSaConfigured()) {
    const probe = await probeGbpSaAccess();
    if (probe === "ok") return true;
    // Fall through to OAuth check on any non-ok probe.
  }
  const tok = await getToken("google");
  if (!tok) return false;
  return tok.scopes.includes("https://www.googleapis.com/auth/business.manage");
}

/**
 * Stub for the post-approval performance-fetch operation. Returns null
 * until the GBP API integration is wired up after Google approves the
 * scope for production use.
 */
export async function fetchPerformanceMetrics(_locationId: string): Promise<null> {
  log.info("GBP performance metrics not yet wired — pending API approval + listing verification");
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
 * Automation API surface (used by server/cron/gbpAutomation.ts)
 *
 * All four helpers below resolve the active GBP credential from the
 * `oauth_tokens` table — preferring provider='gbp' (the dedicated
 * connection), falling back to provider='google' if that token already
 * has the business.manage scope. They return `null` (or an `ok:false`
 * envelope) when no credential is connected so callers can no-op
 * cleanly without throwing.
 * ═══════════════════════════════════════════════════════════════════ */

/** Resolved GBP credentials + target location selected for automation. */
export interface GbpAutomationContext {
  token: StoredToken;
  /** Full resource name, e.g. "accounts/123/locations/456". */
  locationName: string;
}

/** Standardised error/response envelope returned by automation calls. */
export interface GbpApiResult<T = unknown> {
  ok: boolean;
  status?: number;
  data?: T;
  error?: string;
  /** True for 4xx other than 429 — caller should not retry. */
  permanent?: boolean;
}

/**
 * Resolve the credential to use for automation. Returns `null` when GBP
 * isn't connected yet (cron should log "GBP not connected, skipping").
 *
 * Preference order:
 *   1. Service-account (preferred — minted JWT, no operator OAuth)
 *   2. Stored 'gbp' OAuth token
 *   3. Stored 'google' OAuth token if scopes include `business.manage`
 *
 * The target location must be supplied via the GBP_LOCATION_NAME env
 * var. Without it, automation can't proceed (we never guess location IDs).
 */
export async function getAutomationContext(): Promise<GbpAutomationContext | null> {
  const locationName = process.env.GBP_LOCATION_NAME;

  // SA path first — no DB read, no token-refresh ceremony.
  if (isGbpSaConfigured()) {
    const accessToken = await getSaAccessToken();
    if (accessToken) {
      if (!locationName) {
        log.warn("GBP SA credentials present but GBP_LOCATION_NAME env var unset — automation cannot target a location");
        return null;
      }
      const saTok: StoredToken = {
        provider: "gbp",
        account_email: getGbpSaEmail(),
        access_token: accessToken,
        refresh_token: null,
        expires_at: null,
        scopes: GBP_SA_SCOPES,
        connected_at: new Date(0),
        updated_at: new Date(0),
      };
      return { token: saTok, locationName };
    }
  }

  // OAuth fallback.
  const gbpTok = await getToken("gbp");
  const googleTok = gbpTok ? null : await getToken("google");

  const tok = gbpTok ?? (googleTok && googleTok.scopes.includes(
    "https://www.googleapis.com/auth/business.manage",
  ) ? googleTok : null);

  if (!tok) return null;

  if (!locationName) {
    log.warn("GBP token present but GBP_LOCATION_NAME env var unset — automation cannot target a location");
    return null;
  }

  return { token: tok, locationName };
}

async function gbpFetch<T>(
  url: string,
  init: RequestInit,
  token: string,
): Promise<GbpApiResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

    if (!res.ok) {
      const permanent =
        res.status >= 400 && res.status < 500 && res.status !== 429;
      return {
        ok: false,
        status: res.status,
        error: data?.error?.message || `GBP API ${res.status} ${res.statusText}`,
        permanent,
        data,
      };
    }
    return { ok: true, status: res.status, data: data as T };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "GBP fetch threw",
      permanent: false,
    };
  }
}

/**
 * Create a local post (UPDATE / OFFER / EVENT / ALERT) on the connected
 * GBP location. Mirrors the v4 `accounts/*/locations/*/localPosts`
 * endpoint.
 */
export interface GbpLocalPostInput {
  summary: string;
  topicType?: "STANDARD" | "EVENT" | "OFFER" | "ALERT";
  languageCode?: string;
  callToAction?: { actionType: string; url?: string };
  media?: Array<{ mediaFormat: string; sourceUrl: string }>;
}

export async function createLocalPost(
  ctx: GbpAutomationContext,
  post: GbpLocalPostInput,
): Promise<GbpApiResult<{ name: string }>> {
  const url = `${gbpV4Base()}/${ctx.locationName}/localPosts`;
  const body = {
    languageCode: post.languageCode ?? "en",
    summary: post.summary,
    topicType: post.topicType ?? "STANDARD",
    ...(post.callToAction ? { callToAction: post.callToAction } : {}),
    ...(post.media ? { media: post.media } : {}),
  };
  return gbpFetch<{ name: string }>(
    url,
    { method: "POST", body: JSON.stringify(body) },
    ctx.token.access_token,
  );
}

/** Minimal review shape we care about for monitoring. */
export interface GbpReview {
  reviewId: string;
  name?: string;
  starRating: string;
  comment?: string;
  createTime: string;
  updateTime?: string;
  reviewer?: { displayName?: string };
  reviewReply?: { comment: string; updateTime: string };
}

export async function listReviews(
  ctx: GbpAutomationContext,
  opts: { pageSize?: number } = {},
): Promise<GbpApiResult<{ reviews: GbpReview[]; totalReviewCount?: number }>> {
  const pageSize = opts.pageSize ?? 50;
  const url = `${gbpV4Base()}/${ctx.locationName}/reviews?pageSize=${pageSize}`;
  return gbpFetch(url, { method: "GET" }, ctx.token.access_token);
}

/**
 * PATCH the location's regular + special hours via Business Information v1.
 * `updateMask` is required by Google; we send only the fields we touch.
 */
export interface GbpHoursPayload {
  regularHours?: unknown;
  specialHours?: unknown;
}

export async function patchLocationHours(
  ctx: GbpAutomationContext,
  payload: GbpHoursPayload,
): Promise<GbpApiResult<unknown>> {
  const fields: string[] = [];
  if (payload.regularHours !== undefined) fields.push("regularHours");
  if (payload.specialHours !== undefined) fields.push("specialHours");
  if (fields.length === 0) {
    return { ok: true, status: 204, data: null };
  }
  const url =
    `${gbpInfoV1Base()}/${ctx.locationName}` +
    `?updateMask=${encodeURIComponent(fields.join(","))}`;
  return gbpFetch(url, { method: "PATCH", body: JSON.stringify(payload) }, ctx.token.access_token);
}
