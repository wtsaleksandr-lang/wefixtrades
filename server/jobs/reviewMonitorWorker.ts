/**
 * Review monitoring worker — periodically fetches public Google reviews
 * for active clients and stores/deduplicates them.
 *
 * Runs on a scheduled cadence (recommended: every 6-12 hours).
 * Processes clients in round-robin order using last_review_sync_at.
 *
 * Events generated:
 *   - new review discovered → admin activity log
 *   - owner response detected → admin activity log
 *   - negative review alert → admin activity log (rating <= 2)
 */

import { storage } from "../storage";
import { sendLowRatingAlert } from "../lib/lowRatingAlert";
import { mergeSettings } from "@shared/reputationConfig";
import {
  fetchGoogleReviews,
  fetchFacebookReviews,
  fetchYelpReviews,
  fetchTrustpilotReviews,
  normalizeReview,
  reviewDedupKey,
} from "../lib/outscraper";
import type { Client } from "@shared/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("ReviewMonitor");

/** Max clients to sync per run (rate-limit friendliness). */
const CLIENTS_PER_RUN = 5;

/** Max reviews to fetch per client per sync. */
const REVIEWS_PER_CLIENT = 30;

interface SyncResult {
  clientId: number;
  businessName: string;
  newReviews: number;
  updatedReviews: number;
  totalFetched: number;
  error?: string;
}

/** Process a batch of raw reviews for a client + platform. */
async function processReviews(
  client: Client,
  rawReviews: import("../lib/outscraper").OutscraperReview[],
  platform: string,
  placeIdKey: string,
  result: SyncResult,
): Promise<void> {
  for (const raw of rawReviews) {
    const normalized = normalizeReview(raw);
    const dedupKey = reviewDedupKey(placeIdKey, normalized);

    try {
      const { review, isNew } = await storage.upsertMonitoredReview({
        client_id: client.id,
        google_place_id: placeIdKey,
        platform,
        dedup_key: dedupKey,
        external_review_id: normalized.externalId,
        google_review_name: normalized.googleReviewName,
        reviewer_name: normalized.reviewerName,
        rating: normalized.rating,
        review_text: normalized.reviewText,
        published_at: normalized.publishedAt,
        response_text: normalized.responseText,
        response_date: normalized.responseDate,
        raw_payload: normalized.rawPayload,
        is_new: true,
        response_added: !!normalized.responseText,
      });

      if (isNew) {
        result.newReviews++;
        await storage.logAdminActivity({
          actor_type: "system",
          actor_id: null,
          actor_name: "ReviewMonitor",
          action: normalized.rating <= 2 ? "review.new_negative" : "review.new",
          entity_type: "monitored_review",
          entity_id: review.id,
          summary: `New ${normalized.rating}★ ${platform} review for ${client.business_name} by ${normalized.reviewerName}`,
          metadata: { client_id: client.id, rating: normalized.rating, reviewer: normalized.reviewerName, hasText: !!normalized.reviewText, platform },
        });

        // Send low-rating alert email if enabled
        if (normalized.rating <= 2 && client.contact_email) {
          try {
            const svc = await storage.getClientReputationService(client.id);
            const settings = mergeSettings(svc?.metadata?.reputation_settings);
            if (settings.low_rating_alerts) {
              // Use the standard fallback chain — REPLIT_DEV_DOMAIN-only
              // produced an empty string in production, which made the
              // alert email's "View & respond" CTA a relative link
              // (broken in every email client).
              const baseUrl = process.env.APP_URL
                || process.env.APP_PUBLIC_URL
                || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://wefixtrades.com");
              await sendLowRatingAlert({
                contactEmail: client.contact_email,
                businessName: client.business_name,
                reviewerName: normalized.reviewerName,
                rating: normalized.rating,
                reviewText: normalized.reviewText,
                platform,
                portalUrl: baseUrl,
              });
            }
          } catch (alertErr: any) {
            log.error(`[ReviewMonitor] Alert email error for client ${client.id}:`, alertErr.message);
          }
        }
      } else if (review.response_added) {
        result.updatedReviews++;
        await storage.logAdminActivity({
          actor_type: "system",
          actor_id: null,
          actor_name: "ReviewMonitor",
          action: "review.response_added",
          entity_type: "monitored_review",
          entity_id: review.id,
          summary: `Owner response added for ${normalized.rating}★ ${platform} review on ${client.business_name}`,
          metadata: { client_id: client.id, rating: normalized.rating, reviewer: normalized.reviewerName, platform },
        });
      }
    } catch (err: any) {
      log.error(`[ReviewMonitor] Error upserting ${platform} review for client ${client.id}:`, err.message);
    }
  }
}

async function syncClientReviews(client: Client): Promise<SyncResult> {
  const result: SyncResult = {
    clientId: client.id,
    businessName: client.business_name,
    newReviews: 0,
    updatedReviews: 0,
    totalFetched: 0,
  };

  // Resolve which Google place IDs to sync. Multi-location clients now
  // have rows in google_business_locations (Sprint 2-3); legacy single-
  // location clients still keep clients.google_place_id and have NO
  // rows in the new table — we fall back to the legacy field for them.
  const locationRows = await storage.listGoogleLocations(client.id);
  const enabledLocations = locationRows.filter((l) => l.enabled);

  // Build the work list. Each entry: { placeId, label (for logs/dedup) }.
  // For multi-location clients, label = location_name; for legacy, label = business_name.
  const googleWork: Array<{ placeId: string; label: string }> = [];
  if (enabledLocations.length > 0) {
    for (const loc of enabledLocations) {
      googleWork.push({ placeId: loc.place_id, label: loc.location_name });
    }
  } else if (client.google_place_id) {
    googleWork.push({ placeId: client.google_place_id, label: client.business_name });
  }

  if (googleWork.length === 0 && !client.facebook_page_url) {
    result.error = "No google_place_id, no multi-location rows, and no facebook_page_url";
    return result;
  }

  // Google reviews — one fetch per enabled location.
  for (const work of googleWork) {
    const rawGoogle = await fetchGoogleReviews(work.placeId, REVIEWS_PER_CLIENT);
    if (rawGoogle) {
      result.totalFetched += rawGoogle.length;
      // Pass the location-specific place_id as the placeIdKey so dedup
      // is scoped per-location (same review at two locations stays distinct).
      await processReviews(client, rawGoogle, "google", work.placeId, result);
    }
  }

  // Facebook reviews
  if (client.facebook_page_url) {
    try {
      const rawFb = await fetchFacebookReviews(client.facebook_page_url, REVIEWS_PER_CLIENT);
      if (rawFb) {
        result.totalFetched += rawFb.length;
        await processReviews(client, rawFb, "facebook", `fb:${client.facebook_page_url}`, result);
      }
    } catch (err: any) {
      log.error(`[ReviewMonitor] Facebook fetch error for client ${client.id}:`, err.message);
    }
  }

  // Yelp + Trustpilot reviews — the client connects these in their
  // ReputationShield settings (no dedicated client column). Each fetch
  // is isolated in its own try/catch so a bad platform response never
  // blocks the Google/Facebook sync above.
  try {
    const svc = await storage.getClientReputationService(client.id);
    const platforms = mergeSettings(svc?.metadata?.reputation_settings).platforms;

    if (platforms?.yelp_url) {
      try {
        const rawYelp = await fetchYelpReviews(platforms.yelp_url, REVIEWS_PER_CLIENT);
        if (rawYelp) {
          result.totalFetched += rawYelp.length;
          await processReviews(client, rawYelp, "yelp", `yelp:${platforms.yelp_url}`, result);
        }
      } catch (err: any) {
        log.error(`[ReviewMonitor] Yelp fetch error for client ${client.id}:`, err.message);
      }
    }

    if (platforms?.trustpilot_domain) {
      try {
        const rawTp = await fetchTrustpilotReviews(platforms.trustpilot_domain, REVIEWS_PER_CLIENT);
        if (rawTp) {
          result.totalFetched += rawTp.length;
          await processReviews(client, rawTp, "trustpilot", `tp:${platforms.trustpilot_domain}`, result);
        }
      } catch (err: any) {
        log.error(`[ReviewMonitor] Trustpilot fetch error for client ${client.id}:`, err.message);
      }
    }
  } catch (err: any) {
    log.error(`[ReviewMonitor] platform-settings load failed for client ${client.id}:`, err.message);
  }

  // Update sync timestamp
  try {
    await storage.updateClient(client.id, { last_review_sync_at: new Date() });
  } catch (err: any) {
    log.error(`[ReviewMonitor] Error updating sync timestamp for client ${client.id}:`, err.message);
  }

  return result;
}

/**
 * Main worker function — called by scheduler.
 * Processes a batch of clients, round-robin by oldest sync.
 */
export async function processReviewMonitoring(): Promise<{
  synced: number;
  totalNew: number;
  totalUpdated: number;
  errors: string[];
  results: SyncResult[];
}> {
  const errors: string[] = [];
  const results: SyncResult[] = [];
  let totalNew = 0;
  let totalUpdated = 0;

  // Get clients due for sync (ordered by oldest sync first, nulls first)
  const clients = await storage.listClientsForReviewSync(CLIENTS_PER_RUN);

  if (clients.length === 0) {
    return { synced: 0, totalNew: 0, totalUpdated: 0, errors: [], results: [] };
  }

  // Check API key once
  if (!process.env.OUTSCRAPER_API_KEY) {
    return {
      synced: 0,
      totalNew: 0,
      totalUpdated: 0,
      errors: ["OUTSCRAPER_API_KEY not configured"],
      results: [],
    };
  }

  for (const client of clients) {
    try {
      const result = await syncClientReviews(client);
      results.push(result);
      totalNew += result.newReviews;
      totalUpdated += result.updatedReviews;

      if (result.error) {
        errors.push(`Client ${client.id} (${client.business_name}): ${result.error}`);
      }

      if (result.newReviews > 0 || result.updatedReviews > 0) {
        log.info(
          `[ReviewMonitor] ${client.business_name}: ${result.newReviews} new, ${result.updatedReviews} updated (${result.totalFetched} fetched)`,
        );
      }
    } catch (err: any) {
      errors.push(`Client ${client.id}: ${err.message}`);
      log.error(`[ReviewMonitor] Error syncing client ${client.id}:`, err.message);
      // Fire alert (Slack + email + DB) — fireAlert dedupes 1h on
      // (category, title) so upstream outages don't spam the channel.
      const { notifyReviewSyncFailure } = await import("../services/reputation/reputationAlerts");
      notifyReviewSyncFailure({
        clientId: client.id,
        businessName: client.business_name || `Client #${client.id}`,
        platform: "google",
        error: err.message,
      }).catch(() => { /* alert is best-effort */ });
    }
  }

  return {
    synced: results.length,
    totalNew,
    totalUpdated,
    errors,
    results,
  };
}
