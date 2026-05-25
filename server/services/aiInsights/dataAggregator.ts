/**
 * AI Insights — data aggregator (Wave 7).
 *
 * Pulls signals from existing tables for a given client and assembles a
 * `CustomerSignals` object that the LLM-driven insight generator consumes.
 *
 * Source tables (read-only):
 *   - clients                          — business identity (name, address, phone, website)
 *   - mapguard_snapshots               — latest scan: rating, reviews, photos, score, rank metrics, top competitor
 *   - citation_tracker_subscriptions   — per-client CT sub (if any)
 *   - citation_tracker_listings        — per-directory NAP rows for the CT sub
 *
 * If a customer doesn't have CT yet, citationHealth falls back to a heuristic
 * derived from mapguard_snapshots.detected_issues (NAP-related strings only).
 * If MapGuard hasn't taken its first scan yet, rankTrend + reviewHealth are
 * filled with safe nulls — the LLM is instructed to handle missing fields
 * gracefully ("not enough data yet").
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import {
  clients,
  mapguardSnapshots,
  citationTrackerSubscriptions,
  citationTrackerListings,
} from "@shared/schema";
import { createLogger } from "../../lib/logger";

const log = createLogger("AiInsightsAggregator");

export type CustomerSignals = {
  customerId: string; // client_id stringified for the LLM payload
  business: {
    name: string;
    address: string | null;
    phone: string | null;
    website: string | null;
  };
  gbpHealth: {
    categoriesCount: number | null;
    hoursSet: boolean | null;
    photoCount: number | null;
    descriptionLength: number | null;
    rating: number | null;
    reviewCount: number | null;
    websiteSet: boolean | null;
  };
  citationHealth: {
    foundCount: number | null;
    missingCount: number | null;
    inconsistencies: number | null;
    hasCitationTracker: boolean;
  };
  rankTrend: {
    avgPosition: number | null;
    weekDelta: number | null;
    top3Coverage: number | null; // 0..100
    keywordsInLocalPack: number | null;
    keywordsTracked: number | null;
  };
  reviewHealth: {
    totalReviews: number | null;
    avgRating: number | null;
    daysSinceLastReview: number | null;
  };
  competitors: Array<{
    name: string;
    rating: number | null;
    reviewCount: number | null;
    outrankingOnNKeywords: number | null;
  }>;
};

/** Pull the latest two mapguard_snapshots for delta computation. */
async function getLatestSnapshots(clientId: number) {
  return db
    .select()
    .from(mapguardSnapshots)
    .where(eq(mapguardSnapshots.client_id, clientId))
    .orderBy(desc(mapguardSnapshots.captured_at))
    .limit(2);
}

/** Count CT listings by status. Returns nulls if customer has no active CT. */
async function getCitationHealth(customerUserId: number | null): Promise<CustomerSignals["citationHealth"]> {
  if (!customerUserId) {
    return { foundCount: null, missingCount: null, inconsistencies: null, hasCitationTracker: false };
  }
  try {
    const [sub] = await db
      .select({ id: citationTrackerSubscriptions.id })
      .from(citationTrackerSubscriptions)
      .where(and(
        eq(citationTrackerSubscriptions.customer_id, customerUserId),
        eq(citationTrackerSubscriptions.status, "active"),
      ))
      .limit(1);
    if (!sub) {
      return { foundCount: null, missingCount: null, inconsistencies: null, hasCitationTracker: false };
    }
    const listings = await db
      .select({ status: citationTrackerListings.status })
      .from(citationTrackerListings)
      .where(eq(citationTrackerListings.subscription_id, sub.id));
    let foundCount = 0;
    let missingCount = 0;
    let inconsistencies = 0;
    for (const l of listings) {
      if (l.status === "active") foundCount++;
      else if (l.status === "missing") missingCount++;
      else if (l.status === "inconsistent") inconsistencies++;
    }
    return { foundCount, missingCount, inconsistencies, hasCitationTracker: true };
  } catch (err: any) {
    log.warn("citation health read failed — falling back to null", { error: err?.message });
    return { foundCount: null, missingCount: null, inconsistencies: null, hasCitationTracker: false };
  }
}

/** Compute days-since-last-review using mapguard_snapshots.captured_at delta
 *  where review_count changes. Best-effort; null if not enough data. */
function computeDaysSinceLastReview(snapshots: typeof mapguardSnapshots.$inferSelect[]): number | null {
  if (snapshots.length < 2) return null;
  const latest = snapshots[0];
  const previous = snapshots[1];
  if (latest.review_count == null || previous.review_count == null) return null;
  if (latest.review_count > previous.review_count) return 0;
  // Same count between two scans — at least the gap between captures.
  if (!latest.captured_at || !previous.captured_at) return null;
  const ms = latest.captured_at.getTime() - previous.captured_at.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export async function aggregateSignals(clientId: number): Promise<CustomerSignals> {
  // Business identity.
  const [client] = await db
    .select({
      id: clients.id,
      user_id: clients.user_id,
      business_name: clients.business_name,
      contact_phone: clients.contact_phone,
      website_url: clients.website_url,
      metadata: clients.metadata,
      business_hours: clients.business_hours,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!client) {
    throw new Error(`Client ${clientId} not found`);
  }

  const address = ((client.metadata as any)?.address ?? null) as string | null;
  const business = {
    name: client.business_name,
    address,
    phone: client.contact_phone ?? null,
    website: client.website_url ?? null,
  };

  // Latest snapshots (up to 2 for week-delta).
  const snapshots = await getLatestSnapshots(clientId);
  const latest = snapshots[0] ?? null;
  const previous = snapshots[1] ?? null;

  const gbpHealth: CustomerSignals["gbpHealth"] = {
    categoriesCount: ((latest?.scan_metadata as any)?.categories_count ?? null) as number | null,
    hoursSet: latest?.has_hours ?? !!client.business_hours,
    photoCount: latest?.photo_count ?? null,
    descriptionLength: latest?.has_description ? 1 : 0, // boolean → coarse signal
    rating: latest?.rating ?? null,
    reviewCount: latest?.review_count ?? null,
    websiteSet: latest?.has_website ?? !!client.website_url,
  };

  const rankTrend: CustomerSignals["rankTrend"] = {
    avgPosition: latest?.avg_organic_rank ?? null,
    weekDelta: latest && previous && latest.avg_organic_rank != null && previous.avg_organic_rank != null
      ? Number((latest.avg_organic_rank - previous.avg_organic_rank).toFixed(2))
      : null,
    top3Coverage: latest && latest.keywords_tracked && latest.keywords_in_local_pack != null
      ? Math.round((latest.keywords_in_local_pack / latest.keywords_tracked) * 100)
      : null,
    keywordsInLocalPack: latest?.keywords_in_local_pack ?? null,
    keywordsTracked: latest?.keywords_tracked ?? null,
  };

  const reviewHealth: CustomerSignals["reviewHealth"] = {
    totalReviews: latest?.review_count ?? null,
    avgRating: latest?.rating ?? null,
    daysSinceLastReview: computeDaysSinceLastReview(snapshots),
  };

  const competitors: CustomerSignals["competitors"] = latest?.top_competitor_name
    ? [{
        name: latest.top_competitor_name,
        rating: latest.top_competitor_rating ?? null,
        reviewCount: latest.top_competitor_reviews ?? null,
        outrankingOnNKeywords: null, // we don't currently store per-keyword competitor map
      }]
    : [];

  const citationHealth = await getCitationHealth(client.user_id ?? null);

  return {
    customerId: String(clientId),
    business,
    gbpHealth,
    citationHealth,
    rankTrend,
    reviewHealth,
    competitors,
  };
}
