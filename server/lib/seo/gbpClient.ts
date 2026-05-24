/**
 * Google Business Profile (GBP) shim — partial automation.
 *
 * GBP API access requires Google to approve the OAuth client for the
 * `business.manage` scope (manual application, multi-week review). Until
 * the listing is created + verified outside the system, the API surface
 * here is a scaffold + prepared draft that Alex can use to seed the
 * listing manually in the GBP UI.
 *
 * After approval + listing creation, this module is the wiring point
 * for: auto-sync hours, post weekly updates, fetch performance metrics,
 * alert on negative reviews.
 *
 * For v1 scaffold:
 *   - generatePrepFile() returns a listing draft (name/categories/hours
 *     /description/photos placeholder) ready for paste into GBP UI
 *   - isApiAvailable() probes whether `business.manage` was granted
 */

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

/**
 * Check whether the connected Google token actually has the
 * `business.manage` scope (it may have been omitted from consent).
 */
export async function isApiAvailable(): Promise<boolean> {
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
 * The target location can be supplied via the GBP_LOCATION_NAME env
 * var. Without it, automation can't proceed (we never guess location
 * IDs).
 */
export async function getAutomationContext(): Promise<GbpAutomationContext | null> {
  const gbpTok = await getToken("gbp");
  const googleTok = gbpTok ? null : await getToken("google");

  const tok = gbpTok ?? (googleTok && googleTok.scopes.includes(
    "https://www.googleapis.com/auth/business.manage",
  ) ? googleTok : null);

  if (!tok) return null;

  const locationName = process.env.GBP_LOCATION_NAME;
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
