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

  if (!client.google_place_id && !client.facebook_page_url) {
    result.error = "No google_place_id or facebook_page_url";
    return result;
  }

  // Google reviews
  if (client.google_place_id) {
    const rawGoogle = await fetchGoogleReviews(client.google_place_id, REVIEWS_PER_CLIENT);
    if (rawGoogle) {
      result.totalFetched += rawGoogle.length;
      await processReviews(client, rawGoogle, "google", client.google_place_id, result);
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
