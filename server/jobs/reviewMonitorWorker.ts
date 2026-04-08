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
import {
  fetchGoogleReviews,
  normalizeReview,
  reviewDedupKey,
} from "../lib/outscraper";
import type { Client } from "@shared/schema";

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

async function syncClientReviews(client: Client): Promise<SyncResult> {
  const result: SyncResult = {
    clientId: client.id,
    businessName: client.business_name,
    newReviews: 0,
    updatedReviews: 0,
    totalFetched: 0,
  };

  if (!client.google_place_id) {
    result.error = "No google_place_id";
    return result;
  }

  // Fetch reviews from Outscraper
  const rawReviews = await fetchGoogleReviews(client.google_place_id, REVIEWS_PER_CLIENT);
  if (!rawReviews) {
    result.error = "Outscraper fetch returned null (API key missing or request failed)";
    return result;
  }

  result.totalFetched = rawReviews.length;

  for (const raw of rawReviews) {
    const normalized = normalizeReview(raw);
    const dedupKey = reviewDedupKey(client.google_place_id, normalized);

    try {
      const { review, isNew } = await storage.upsertMonitoredReview({
        client_id: client.id,
        google_place_id: client.google_place_id,
        platform: "google",
        dedup_key: dedupKey,
        external_review_id: normalized.externalId,
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

        // Log admin activity for new review
        await storage.logAdminActivity({
          actor_type: "system",
          actor_id: null,
          actor_name: "ReviewMonitor",
          action: normalized.rating <= 2 ? "review.new_negative" : "review.new",
          entity_type: "monitored_review",
          entity_id: review.id,
          summary: `New ${normalized.rating}★ review for ${client.business_name} by ${normalized.reviewerName}`,
          metadata: {
            client_id: client.id,
            rating: normalized.rating,
            reviewer: normalized.reviewerName,
            hasText: !!normalized.reviewText,
            platform: "google",
          },
        });
      } else if (review.response_added && !normalized.responseText) {
        // response_added was already true before this sync — no new event
      } else if (review.response_added) {
        result.updatedReviews++;

        // Log admin activity for new owner response
        await storage.logAdminActivity({
          actor_type: "system",
          actor_id: null,
          actor_name: "ReviewMonitor",
          action: "review.response_added",
          entity_type: "monitored_review",
          entity_id: review.id,
          summary: `Owner response added for ${normalized.rating}★ review on ${client.business_name}`,
          metadata: {
            client_id: client.id,
            rating: normalized.rating,
            reviewer: normalized.reviewerName,
            platform: "google",
          },
        });
      }
    } catch (err: any) {
      console.error(`[ReviewMonitor] Error upserting review for client ${client.id}:`, err.message);
    }
  }

  // Update client sync timestamp
  try {
    await storage.updateClient(client.id, { last_review_sync_at: new Date() });
  } catch (err: any) {
    console.error(`[ReviewMonitor] Error updating sync timestamp for client ${client.id}:`, err.message);
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
        console.log(
          `[ReviewMonitor] ${client.business_name}: ${result.newReviews} new, ${result.updatedReviews} updated (${result.totalFetched} fetched)`,
        );
      }
    } catch (err: any) {
      errors.push(`Client ${client.id}: ${err.message}`);
      console.error(`[ReviewMonitor] Error syncing client ${client.id}:`, err.message);
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
