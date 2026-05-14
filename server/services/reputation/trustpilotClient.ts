/**
 * Trustpilot Business Generated Content (BGC) API client.
 *
 * Status: scaffolded but key-gated. The API surface is real (Trustpilot
 * publishes the BGC API; auth is OAuth2 client_credentials + a per-
 * business-unit access token). What this file ships:
 *   - shape-correct fetchReviews + postReply implementations
 *   - isConfigured() check — every caller bails early when TP creds
 *     are absent, so the rest of ReputationShield works fine on a
 *     Trustpilot-less install
 *   - normalization helpers that map Trustpilot's response shape into
 *     the same NormalizedReview shape the GBP path uses
 *
 * Activation steps (when Alex completes Trustpilot business
 * verification):
 *   1. Set TRUSTPILOT_API_KEY, TRUSTPILOT_API_SECRET, and per-client
 *      TRUSTPILOT_BUSINESS_UNIT_ID values via Doppler.
 *   2. Add a Trustpilot connection row to socialsync_platform_connections
 *      (platform='trustpilot') for the activated client.
 *   3. The reviewOrchestrator already iterates connected platforms and
 *      will pick this up.
 *
 * Reference: https://documentation-apidocumentation.trustpilot.com/
 */

import { createLogger } from "../../lib/logger";

const log = createLogger("trustpilot");

const TRUSTPILOT_API_BASE = "https://api.trustpilot.com/v1";

export interface NormalizedReview {
  external_review_id: string;
  reviewer_name: string;
  star_rating: number; // 1-5
  review_text: string | null;
  review_time: Date;
  reply_text: string | null;
  reply_time: Date | null;
  raw: any;
}

export function isConfigured(): boolean {
  return !!(process.env.TRUSTPILOT_API_KEY && process.env.TRUSTPILOT_API_SECRET);
}

/**
 * OAuth2 client_credentials grant. Trustpilot tokens are short-lived
 * (~24h); we just fetch fresh per request to keep this simple and let
 * Trustpilot's edge cache handle it.
 */
async function getAccessToken(): Promise<string | null> {
  if (!isConfigured()) return null;

  const basic = Buffer.from(
    `${process.env.TRUSTPILOT_API_KEY}:${process.env.TRUSTPILOT_API_SECRET}`,
  ).toString("base64");

  const resp = await fetch(`${TRUSTPILOT_API_BASE}/oauth/oauth-business-users-for-applications/accesstoken`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!resp.ok) {
    log.warn(`Trustpilot OAuth failed: HTTP ${resp.status}`);
    return null;
  }

  const data: any = await resp.json();
  return data?.access_token ?? null;
}

/**
 * Fetch the most recent reviews for a Trustpilot business unit.
 * Returns [] when not configured — caller treats that as "skip platform".
 */
export async function fetchTrustpilotReviews(input: {
  businessUnitId: string;
  perPage?: number;
}): Promise<NormalizedReview[]> {
  if (!isConfigured()) return [];

  const token = await getAccessToken();
  if (!token) return [];

  const perPage = Math.min(input.perPage ?? 50, 100);
  const url = `${TRUSTPILOT_API_BASE}/business-units/${input.businessUnitId}/reviews?perPage=${perPage}&orderBy=createdat.desc`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    log.warn(`Trustpilot fetch failed for ${input.businessUnitId}: HTTP ${resp.status}`);
    return [];
  }

  const data: any = await resp.json();
  const reviews: any[] = data?.reviews ?? [];

  return reviews.map((r): NormalizedReview => ({
    external_review_id: String(r.id),
    reviewer_name: r.consumer?.displayName ?? "Anonymous",
    star_rating: Number(r.stars ?? 0),
    review_text: r.text ?? null,
    review_time: new Date(r.createdAt),
    reply_text: r.companyReply?.text ?? null,
    reply_time: r.companyReply?.createdAt ? new Date(r.companyReply.createdAt) : null,
    raw: r,
  }));
}

/**
 * Post a company reply to a Trustpilot review. Returns ok/error matching
 * the shape postGoogleReviewReply uses, so the retry queue worker can
 * fan-out to this client transparently once `platform: 'trustpilot'`
 * rows start landing.
 */
export async function postTrustpilotReply(input: {
  businessUnitId: string;
  externalReviewId: string;
  replyText: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isConfigured()) {
    return { ok: false, error: "Trustpilot is not configured (TRUSTPILOT_API_KEY/SECRET missing)" };
  }

  const token = await getAccessToken();
  if (!token) return { ok: false, error: "Could not obtain Trustpilot access token" };

  const url = `${TRUSTPILOT_API_BASE}/private/business-units/${input.businessUnitId}/reviews/${input.externalReviewId}/reply`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: input.replyText }),
  });

  if (resp.ok) return { ok: true };

  let detail = "";
  try { detail = JSON.stringify(await resp.json()); } catch { /* ignore */ }
  return { ok: false, error: `HTTP ${resp.status} ${detail || resp.statusText}` };
}
