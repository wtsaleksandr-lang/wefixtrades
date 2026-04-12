/**
 * Review automation orchestrator — shared batch processing.
 *
 * Coordinates review sync across all enabled clients and platforms.
 * Used by both SocialSync scheduler and future ReputationShield automation.
 */
import { storage } from "../../storage";
import { syncGBPReviews, type SyncResult } from "./gbpReviewIngestion";
import type { ReplyContext } from "./reviewCore";

export interface BatchReviewResult {
  clients_processed: number;
  total_fetched: number;
  total_new: number;
  total_replied: number;
  errors: string[];
}

/**
 * Process reviews for all enabled clients with active platform connections.
 * Currently supports: Google Business Profile.
 * Future: Facebook reviews, Yelp, etc.
 */
export async function processAllClientReviews(): Promise<BatchReviewResult> {
  const batch: BatchReviewResult = { clients_processed: 0, total_fetched: 0, total_new: 0, total_replied: 0, errors: [] };

  const profiles = await storage.listEnabledSocialSyncProfiles();

  for (const profile of profiles) {
    const connections = await storage.listSocialSyncConnections(profile.client_id);
    const gbp = connections.find(c => c.platform === "google_business" && (c.connection_status === "connected" || c.connection_status === "expiring_soon"));
    if (!gbp || !gbp.external_page_id) continue;

    const replyContext: ReplyContext = {
      niche: profile.niche || undefined,
      location: profile.location || undefined,
      tone: profile.tone || undefined,
    };

    try {
      const result = await syncGBPReviews(profile.client_id, replyContext);
      batch.clients_processed++;
      batch.total_fetched += result.fetched;
      batch.total_new += result.new_reviews;
      batch.total_replied += result.replies_posted;
      if (result.errors.length > 0) {
        batch.errors.push(`Client ${profile.client_id}: ${result.errors.join("; ")}`);
      }
    } catch (err: any) {
      batch.errors.push(`Client ${profile.client_id} failed: ${err.message}`);
    }
  }

  return batch;
}

/**
 * Sync reviews for a single client. Platform-aware.
 */
export async function syncClientReviews(clientId: number): Promise<SyncResult> {
  const profile = await storage.getSocialSyncProfile(clientId);
  const replyContext: ReplyContext = {
    niche: profile?.niche || undefined,
    location: profile?.location || undefined,
    tone: profile?.tone || undefined,
  };
  return syncGBPReviews(clientId, replyContext);
}
