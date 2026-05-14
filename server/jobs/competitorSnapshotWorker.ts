/**
 * Competitor snapshot worker — runs daily, pulls each tracked
 * competitor's public review stats via Outscraper, and writes a
 * daily snapshot row. Premium dashboard trend graphs read these rows.
 *
 * Tier-gated: only runs for clients with the `competitorTracking` feature
 * (Premium tier). Lower-tier clients can still add competitors but no
 * snapshots are produced.
 *
 * Outscraper is the same provider already wired into reviewMonitorWorker;
 * uses OUTSCRAPER_API_KEY env. If not configured we no-op.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { reputationCompetitors, reputationCompetitorSnapshots, clients as clientsTable } from "@shared/schema";
import { storage } from "../storage";
import { extractTier, canAccessFeature } from "@shared/reputationConfig";
import { createLogger } from "../lib/logger";

const log = createLogger("CompetitorSnapshot");

export interface SnapshotResult {
  clientsChecked: number;
  competitorsScanned: number;
  snapshotsWritten: number;
  errors: number;
}

export async function runCompetitorSnapshots(): Promise<SnapshotResult> {
  const result: SnapshotResult = { clientsChecked: 0, competitorsScanned: 0, snapshotsWritten: 0, errors: 0 };

  if (!process.env.OUTSCRAPER_API_KEY) {
    log.debug("OUTSCRAPER_API_KEY not configured — competitor snapshots skipped");
    return result;
  }

  // Find every client with at least one enabled competitor row.
  const rows = await db.select({
    client_id: reputationCompetitors.client_id,
  })
    .from(reputationCompetitors)
    .where(eq(reputationCompetitors.enabled, true))
    .groupBy(reputationCompetitors.client_id);

  const clientIds = rows.map((r) => r.client_id);
  result.clientsChecked = clientIds.length;

  // Snapshot one calendar day at a time; idempotent on (competitor, date).
  const today = new Date().toISOString().slice(0, 10);

  for (const clientId of clientIds) {
    try {
      const svc = await storage.getClientReputationService(clientId);
      const tier = svc ? extractTier(svc.serviceId) : null;
      if (!canAccessFeature(tier, "competitorTracking")) continue;

      const competitors = await db.select()
        .from(reputationCompetitors)
        .where(and(
          eq(reputationCompetitors.client_id, clientId),
          eq(reputationCompetitors.enabled, true),
        ));

      for (const comp of competitors) {
        result.competitorsScanned++;
        try {
          const stats = await fetchCompetitorStats(comp.place_id);
          if (!stats) continue;

          await db.insert(reputationCompetitorSnapshots).values({
            competitor_id: comp.id,
            client_id: clientId,
            snapshot_date: today,
            total_reviews: stats.totalReviews,
            average_rating: stats.averageRating != null ? String(stats.averageRating) : null,
            reviews_30d: stats.reviews30d ?? null,
            metadata: stats.metadata ?? null,
          } as any).onConflictDoNothing();

          result.snapshotsWritten++;
        } catch (err: any) {
          result.errors++;
          log.error(`Snapshot failed for competitor ${comp.id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      result.errors++;
      log.error(`Client ${clientId} loop error: ${err.message}`);
    }
  }

  if (result.snapshotsWritten > 0 || result.errors > 0) {
    log.info(`Competitor snapshot sweep — ${result.snapshotsWritten} written / ${result.errors} errors across ${result.competitorsScanned} competitors`);
  }
  return result;
}

interface CompetitorStats {
  totalReviews: number;
  averageRating: number | null;
  reviews30d?: number;
  metadata?: any;
}

/**
 * Pull public stats for a Google Business place via Outscraper. We use
 * the lighter "google-maps-search" endpoint (no review bodies) because
 * we only need aggregates for the snapshot.
 */
async function fetchCompetitorStats(placeId: string): Promise<CompetitorStats | null> {
  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) return null;

  const url = `https://api.outscraper.com/maps/search-v3?query=place_id:${encodeURIComponent(placeId)}&limit=1&async=false`;
  const resp = await fetch(url, {
    headers: { "X-API-KEY": apiKey },
  });
  if (!resp.ok) {
    log.warn(`Outscraper stats fetch failed for ${placeId}: HTTP ${resp.status}`);
    return null;
  }

  const data: any = await resp.json().catch(() => null);
  const item = data?.data?.[0]?.[0] ?? null;
  if (!item) return null;

  return {
    totalReviews: Number(item.reviews ?? item.reviews_count ?? 0),
    averageRating: item.rating != null ? Number(item.rating) : null,
    reviews30d: undefined, // Outscraper doesn't expose this in the basic search endpoint
    metadata: { name: item.name, address: item.address },
  };
}
