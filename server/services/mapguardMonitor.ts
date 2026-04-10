/**
 * MapGuard Monitoring Engine
 *
 * Handles recurring scans for active MapGuard clients:
 * - Fetches fresh ranking + profile data
 * - Stores historical snapshots
 * - Detects changes vs previous snapshot
 * - Creates tasks when meaningful negative changes occur
 */

import { db } from "../db";
import { mapguardSnapshots, type InsertMapguardSnapshot, type MapguardSnapshot } from "@shared/schemas/mapguardMonitoring";
import { clients, clientServices, serviceCatalog } from "@shared/schemas/adminCrm";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import { createMapguardTask, getExecutionUsage } from "./mapguardTaskEngine";
import type { MapguardTask } from "@shared/schemas/mapguard";
import { processMapguardAlerts, getAlertCountSince, checkCostAlert } from "./mapguardAlerts";

/* ═══════════════════════════════════════════
   V1 SCAN CONFIGURATION
   ═══════════════════════════════════════════
   Which data sources to call and what to track.
   Intentionally lightweight — no PageSpeed,
   no AI narrative, no full website QA.
   ═══════════════════════════════════════════ */

const SERPER_TIMEOUT = 15_000;
const PLACES_TIMEOUT = 10_000;

/* ═══════════════════════════════════════════
   ACTIVE CLIENT DISCOVERY
   ═══════════════════════════════════════════ */

interface MapguardClient {
  client_id: number;
  client_service_id: number;
  business_name: string;
  place_id: string | null;
  trade_type: string | null;
  website_url: string | null;
  metadata: Record<string, any> | null;
}

export async function getActiveMapguardClients(): Promise<MapguardClient[]> {
  const rows = await db.select({
    client_id: clients.id,
    client_service_id: clientServices.id,
    business_name: clients.business_name,
    place_id: sql<string | null>`(${clients.metadata}->>'place_id')::text`,
    trade_type: clients.trade_type,
    website_url: clients.website_url,
    metadata: clients.metadata,
  })
  .from(clientServices)
  .innerJoin(clients, eq(clientServices.client_id, clients.id))
  .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
  .where(and(
    eq(clientServices.status, "active"),
    eq(clientServices.enabled, true),
    sql`${serviceCatalog.id} LIKE 'mapguard%'`,
  ))
  .orderBy(clients.id);

  return rows as MapguardClient[];
}

/* ═══════════════════════════════════════════
   DATA FETCHING (lightweight recurring scan)
   ═══════════════════════════════════════════ */

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function withSignal(ms: number): { signal: AbortSignal } {
  return { signal: AbortSignal.timeout(ms) };
}

/** Fetch fresh Google Places details for a business */
async function fetchPlaceDetails(placeId: string): Promise<{
  rating: number | null;
  reviewCount: number;
  photoCount: number;
  hasWebsite: boolean;
  hasDescription: boolean;
  hasHours: boolean;
  businessName: string;
} | null> {
  try {
    const key = requireEnv("GOOGLE_MAPS_API_KEY");
    const fields = "displayName,rating,userRatingCount,photos,websiteUri,regularOpeningHours,editorialSummary";
    const url = `https://places.googleapis.com/v1/places/${placeId}?fields=${fields}&key=${key}`;
    const res = await fetch(url, { ...withSignal(PLACES_TIMEOUT) });
    if (!res.ok) return null;
    const data = await res.json();

    return {
      rating: data.rating ?? null,
      reviewCount: data.userRatingCount ?? 0,
      photoCount: Array.isArray(data.photos) ? data.photos.length : 0,
      hasWebsite: !!data.websiteUri,
      hasDescription: !!(data.editorialSummary?.text),
      hasHours: !!data.regularOpeningHours,
      businessName: data.displayName?.text || "",
    };
  } catch (err: any) {
    console.error(`[mapguard-monitor] Places API error for ${placeId}:`, err.message);
    return null;
  }
}

/** Fetch keyword rankings via Serper */
async function fetchKeywordRankings(keywords: string[], businessName: string, city: string): Promise<{
  results: Array<{
    keyword: string;
    organicRank: number | null;
    localPackPosition: number | null;
    isInLocalPack: boolean;
  }>;
}> {
  const results: Array<{
    keyword: string;
    organicRank: number | null;
    localPackPosition: number | null;
    isInLocalPack: boolean;
  }> = [];

  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return { results };

  const nameLower = businessName.toLowerCase();

  // Run all keyword checks in parallel
  const promises = keywords.map(async (keyword) => {
    try {
      // Organic search
      const searchRes = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: `${keyword} ${city}`, num: 20, gl: "au" }),
        ...withSignal(SERPER_TIMEOUT),
      });
      const searchData = searchRes.ok ? await searchRes.json() : null;

      // Local pack
      const mapsRes = await fetch("https://google.serper.dev/maps", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: `${keyword} ${city}`, gl: "au" }),
        ...withSignal(SERPER_TIMEOUT),
      });
      const mapsData = mapsRes.ok ? await mapsRes.json() : null;

      // Extract organic rank
      let organicRank: number | null = null;
      const organic = searchData?.organic || [];
      for (let i = 0; i < organic.length; i++) {
        const title = (organic[i].title || "").toLowerCase();
        const link = (organic[i].link || "").toLowerCase();
        if (title.includes(nameLower) || link.includes(nameLower.replace(/\s+/g, ""))) {
          organicRank = i + 1;
          break;
        }
      }

      // Extract local pack position
      let localPackPosition: number | null = null;
      let isInLocalPack = false;
      const places = mapsData?.places || [];
      for (let i = 0; i < places.length; i++) {
        const title = (places[i].title || "").toLowerCase();
        if (title.includes(nameLower)) {
          localPackPosition = i + 1;
          isInLocalPack = true;
          break;
        }
      }

      return { keyword, organicRank, localPackPosition, isInLocalPack };
    } catch {
      return { keyword, organicRank: null, localPackPosition: null, isInLocalPack: false };
    }
  });

  const settled = await Promise.allSettled(promises);
  for (const result of settled) {
    if (result.status === "fulfilled") {
      results.push(result.value);
    }
  }

  return { results };
}

/* ═══════════════════════════════════════════
   SCORING (simplified for monitoring)
   ═══════════════════════════════════════════ */

function computeMonitoringScores(profile: NonNullable<Awaited<ReturnType<typeof fetchPlaceDetails>>>, keywords: Awaited<ReturnType<typeof fetchKeywordRankings>>["results"]) {
  // Google Maps score (simplified, 25pts max)
  let gmRating = 1;
  if ((profile.rating ?? 0) >= 4.5) gmRating = 10;
  else if ((profile.rating ?? 0) >= 4.0) gmRating = 7;
  else if ((profile.rating ?? 0) >= 3.5) gmRating = 4;

  let gmReviews = 1;
  if (profile.reviewCount >= 50) gmReviews = 8;
  else if (profile.reviewCount >= 30) gmReviews = 5;
  else if (profile.reviewCount >= 15) gmReviews = 3;

  let gmPhotos = 0;
  if (profile.photoCount >= 20) gmPhotos = 4;
  else if (profile.photoCount >= 10) gmPhotos = 2;

  const gmDesc = profile.hasDescription ? 2 : 0;
  const scoreGoogleMaps = Math.min(gmRating + gmReviews + gmPhotos + gmDesc, 25);

  // Search Visibility score (simplified, 20pts max)
  let searchPts = 0;
  for (const kw of keywords) {
    if (kw.isInLocalPack) {
      if (kw.localPackPosition === 1) searchPts += 6;
      else if (kw.localPackPosition! <= 3) searchPts += 4;
      else searchPts += 2;
    }
    if (kw.organicRank) {
      if (kw.organicRank <= 3) searchPts += 3;
      else if (kw.organicRank <= 7) searchPts += 2;
      else if (kw.organicRank <= 10) searchPts += 1;
    }
  }
  const scoreSearchVisibility = Math.min(searchPts, 20);

  // Total (without website/demand scores — those require deeper scans)
  const total = scoreGoogleMaps + scoreSearchVisibility;
  const maxRelevant = 45; // 25 + 20
  const normalizedTotal = Math.round((total / maxRelevant) * 100);

  let grade = "D";
  if (normalizedTotal >= 85) grade = "A";
  else if (normalizedTotal >= 70) grade = "B";
  else if (normalizedTotal >= 55) grade = "C";

  return {
    total: normalizedTotal,
    grade,
    googleMaps: scoreGoogleMaps,
    searchVisibility: scoreSearchVisibility,
  };
}

/* ═══════════════════════════════════════════
   ISSUE DETECTION (from monitoring data)
   ═══════════════════════════════════════════ */

function detectMonitoringIssues(profile: NonNullable<Awaited<ReturnType<typeof fetchPlaceDetails>>>, keywords: Awaited<ReturnType<typeof fetchKeywordRankings>>["results"]): string[] {
  const issues: string[] = [];

  if (!profile.hasWebsite) issues.push("no-website");
  if (!profile.hasDescription) issues.push("no-gbp-description");
  if (profile.reviewCount < 100) issues.push("low-reviews");
  if ((profile.rating ?? 5) < 4.2) issues.push("bad-rating");

  const anyLocalPack = keywords.some(k => k.isInLocalPack);
  const majorityNotVisible = keywords.length === 0 ||
    keywords.filter(k => !k.organicRank || k.organicRank > 10).length > keywords.length / 2;
  if (!anyLocalPack && majorityNotVisible) issues.push("low-visibility");

  const hasLowRanking = keywords.length > 0 &&
    keywords.filter(k => !k.organicRank || k.organicRank > 10).length > keywords.length * 0.6;
  if (hasLowRanking) issues.push("low-search-ranking");

  return [...new Set(issues)];
}

/* ═══════════════════════════════════════════
   CHANGE DETECTION
   ═══════════════════════════════════════════ */

export interface SnapshotChanges {
  rating_delta: number | null;
  reviews_delta: number | null;
  score_delta: number | null;
  local_pack_delta: number | null;      // change in # of keywords in local pack
  avg_rank_delta: number | null;
  new_issues: string[];
  resolved_issues: string[];
  rank_drops: Array<{ keyword: string; from: number | null; to: number | null }>;
  rank_improvements: Array<{ keyword: string; from: number | null; to: number | null }>;
  significant: boolean;                 // whether changes warrant attention
}

function detectChanges(current: Partial<InsertMapguardSnapshot>, previous: MapguardSnapshot | null): SnapshotChanges {
  const changes: SnapshotChanges = {
    rating_delta: null,
    reviews_delta: null,
    score_delta: null,
    local_pack_delta: null,
    avg_rank_delta: null,
    new_issues: [],
    resolved_issues: [],
    rank_drops: [],
    rank_improvements: [],
    significant: false,
  };

  if (!previous) return changes;

  // Rating change
  if (current.rating != null && previous.rating != null) {
    changes.rating_delta = Math.round((current.rating - previous.rating) * 10) / 10;
  }

  // Review count change
  if (current.review_count != null && previous.review_count != null) {
    changes.reviews_delta = current.review_count - previous.review_count;
  }

  // Score change
  if (current.score_total != null && previous.score_total != null) {
    changes.score_delta = current.score_total - previous.score_total;
  }

  // Local pack keywords change
  if (current.keywords_in_local_pack != null && previous.keywords_in_local_pack != null) {
    changes.local_pack_delta = current.keywords_in_local_pack - previous.keywords_in_local_pack;
  }

  // Avg rank change
  if (current.avg_organic_rank != null && previous.avg_organic_rank != null) {
    changes.avg_rank_delta = Math.round((current.avg_organic_rank - previous.avg_organic_rank) * 10) / 10;
  }

  // Issue changes
  const currentIssues = (current.detected_issues as string[]) || [];
  const previousIssues = (previous.detected_issues as string[]) || [];
  changes.new_issues = currentIssues.filter(i => !previousIssues.includes(i));
  changes.resolved_issues = previousIssues.filter(i => !currentIssues.includes(i));

  // Keyword rank changes
  const currentKws = (current.keywords_data as any[]) || [];
  const previousKws = (previous.keywords_data as any[]) || [];
  const prevMap = new Map(previousKws.map(k => [k.keyword, k]));

  for (const kw of currentKws) {
    const prev = prevMap.get(kw.keyword);
    if (!prev) continue;

    const curRank = kw.organicRank || kw.localPackPosition;
    const prevRank = prev.organicRank || prev.localPackPosition;

    if (curRank && prevRank && curRank > prevRank + 2) {
      changes.rank_drops.push({ keyword: kw.keyword, from: prevRank, to: curRank });
    } else if (curRank && prevRank && curRank < prevRank - 2) {
      changes.rank_improvements.push({ keyword: kw.keyword, from: prevRank, to: curRank });
    }
  }

  // Determine significance
  changes.significant = !!(
    (changes.rating_delta !== null && changes.rating_delta < -0.2) ||
    (changes.score_delta !== null && changes.score_delta < -10) ||
    (changes.local_pack_delta !== null && changes.local_pack_delta < -1) ||
    changes.rank_drops.length >= 2 ||
    changes.new_issues.length >= 2
  );

  return changes;
}

/* ═══════════════════════════════════════════
   TASK AUTO-CREATION FROM CHANGES
   ═══════════════════════════════════════════ */

async function createTasksFromChanges(
  clientId: number,
  clientServiceId: number | null,
  changes: SnapshotChanges,
  snapshot: Partial<InsertMapguardSnapshot>,
): Promise<MapguardTask[]> {
  const tasks: MapguardTask[] = [];

  // Rating drop → review response task
  if (changes.rating_delta !== null && changes.rating_delta < -0.3) {
    tasks.push(await createMapguardTask({
      client_id: clientId,
      client_service_id: clientServiceId,
      task_type: "review_issue_response",
      title: `Rating dropped from ${((snapshot.rating ?? 0) - (changes.rating_delta ?? 0)).toFixed(1)} to ${snapshot.rating?.toFixed(1)}`,
      description: "Rating has declined. Review recent negative reviews and create a response strategy.",
      source_type: "monitoring",
      created_by_system: true,
      status: "pending",
      priority: "high",
      next_step_hint: "Check recent reviews for negative feedback. Respond professionally and address root cause.",
      input_data: { rating_delta: changes.rating_delta, current_rating: snapshot.rating },
    }, { type: "system", name: "mapguard-monitor" }));
  }

  // Significant rank drops → competitor reaction
  if (changes.rank_drops.length >= 2) {
    tasks.push(await createMapguardTask({
      client_id: clientId,
      client_service_id: clientServiceId,
      task_type: "competitor_reaction",
      title: `Rankings dropped for ${changes.rank_drops.length} keywords`,
      description: `Keywords lost positions: ${changes.rank_drops.map(r => `${r.keyword} (${r.from}→${r.to})`).join(", ")}`,
      source_type: "monitoring",
      created_by_system: true,
      status: "pending",
      priority: "high",
      next_step_hint: "Investigate competitor changes. Check if GBP profile needs updates or if new competitors entered the market.",
      input_data: { rank_drops: changes.rank_drops },
    }, { type: "system", name: "mapguard-monitor" }));
  }

  // Score dropped significantly → baseline review
  if (changes.score_delta !== null && changes.score_delta < -15) {
    tasks.push(await createMapguardTask({
      client_id: clientId,
      client_service_id: clientServiceId,
      task_type: "baseline_audit_review",
      title: `Visibility score dropped by ${Math.abs(changes.score_delta)} points`,
      description: "Overall monitoring score has declined significantly. Full review needed.",
      source_type: "monitoring",
      created_by_system: true,
      status: "pending",
      priority: "urgent",
      next_step_hint: "Compare current and previous snapshot. Identify which areas worsened and create targeted action plan.",
      input_data: { score_delta: changes.score_delta, current_score: snapshot.score_total },
    }, { type: "system", name: "mapguard-monitor" }));
  }

  // New issues detected → profile content update
  const actionableIssues = changes.new_issues.filter(i => ["no-gbp-description", "no-website"].includes(i));
  if (actionableIssues.length > 0) {
    tasks.push(await createMapguardTask({
      client_id: clientId,
      client_service_id: clientServiceId,
      task_type: "profile_content_update",
      title: `New profile issues detected: ${actionableIssues.join(", ")}`,
      description: "Profile issues appeared that weren't present in the previous scan.",
      source_type: "monitoring",
      created_by_system: true,
      status: "pending",
      priority: "normal",
      next_step_hint: "Check if profile content was removed or modified. Restore and optimize.",
      input_data: { new_issues: actionableIssues },
    }, { type: "system", name: "mapguard-monitor" }));
  }

  return tasks;
}

/* ═══════════════════════════════════════════
   RUN SCAN FOR A SINGLE CLIENT
   ═══════════════════════════════════════════ */

export async function runMapguardScan(client: MapguardClient): Promise<{
  snapshot: MapguardSnapshot;
  changes: SnapshotChanges;
  tasksCreated: number;
  alertsSent: number;
}> {
  const startTime = Date.now();
  const errors: string[] = [];

  // Build keywords from trade + city (simplified version)
  const trade = client.trade_type || "trades";
  const city = (client.metadata as any)?.city || "local area";
  const keywords = buildMonitorKeywords(trade, city);

  // Fetch data in parallel
  const [profileData, rankingData] = await Promise.all([
    client.place_id ? fetchPlaceDetails(client.place_id) : Promise.resolve(null),
    fetchKeywordRankings(keywords, client.business_name, city),
  ]);

  if (!profileData) errors.push("places_api_failed");

  // Compute scores and issues
  const profile = profileData || {
    rating: null, reviewCount: 0, photoCount: 0,
    hasWebsite: false, hasDescription: false, hasHours: false, businessName: client.business_name,
  };

  const scores = computeMonitoringScores(profile, rankingData.results);
  const issues = detectMonitoringIssues(profile, rankingData.results);

  // Compute ranking aggregates
  const rankedKeywords = rankingData.results.filter(k => k.organicRank);
  const avgOrganic = rankedKeywords.length > 0
    ? rankedKeywords.reduce((sum, k) => sum + k.organicRank!, 0) / rankedKeywords.length
    : null;

  // Get previous snapshot for change detection
  const [previousSnapshot] = await db.select().from(mapguardSnapshots)
    .where(eq(mapguardSnapshots.client_id, client.client_id))
    .orderBy(desc(mapguardSnapshots.captured_at))
    .limit(1);

  // Build snapshot data
  const snapshotData: InsertMapguardSnapshot = {
    client_id: client.client_id,
    client_service_id: client.client_service_id,
    captured_at: new Date(),
    place_id: client.place_id,
    business_name: profile.businessName || client.business_name,
    rating: profile.rating,
    review_count: profile.reviewCount,
    photo_count: profile.photoCount,
    has_website: profile.hasWebsite,
    has_description: profile.hasDescription,
    has_hours: profile.hasHours,
    keywords_tracked: rankingData.results.length,
    keywords_in_local_pack: rankingData.results.filter(k => k.isInLocalPack).length,
    best_local_pack_position: rankingData.results
      .filter(k => k.localPackPosition)
      .reduce((best, k) => Math.min(best, k.localPackPosition!), 99) === 99
        ? null
        : rankingData.results.filter(k => k.localPackPosition).reduce((best, k) => Math.min(best, k.localPackPosition!), 99),
    avg_organic_rank: avgOrganic ? Math.round(avgOrganic * 10) / 10 : null,
    keywords_in_top_10: rankedKeywords.filter(k => k.organicRank! <= 10).length,
    score_total: scores.total,
    score_grade: scores.grade,
    score_google_maps: scores.googleMaps,
    score_search_visibility: scores.searchVisibility,
    score_competitor: null,
    top_competitor_name: null,
    top_competitor_rating: null,
    top_competitor_reviews: null,
    keywords_data: rankingData.results,
    detected_issues: issues,
    scan_metadata: {
      duration_ms: Date.now() - startTime,
      apis_called: ["places", "serper"].filter(Boolean),
      errors,
      keywords_count: keywords.length,
    },
    changes: null,
  };

  // Detect changes
  const changes = detectChanges(snapshotData, previousSnapshot || null);
  snapshotData.changes = changes as any;

  // Store snapshot
  const [snapshot] = await db.insert(mapguardSnapshots).values(snapshotData).returning();

  // Create tasks from significant changes
  let tasksCreated = 0;
  if (changes.significant) {
    const tasks = await createTasksFromChanges(
      client.client_id,
      client.client_service_id,
      changes,
      snapshotData,
    );
    tasksCreated = tasks.length;
  }

  // Process alerts (dedup + email)
  let alertsSent = 0;
  try {
    const alertResult = await processMapguardAlerts(
      client.client_id,
      profile.businessName || client.business_name,
      changes,
      snapshotData,
      snapshot.id,
    );
    alertsSent = alertResult.sent;
  } catch (err: any) {
    console.error(`[mapguard-monitor] Alert processing failed for ${client.business_name}:`, err.message);
  }

  // Check cost threshold
  try {
    await checkCostAlert(client.client_id, profile.businessName || client.business_name);
  } catch { /* non-critical */ }

  return { snapshot, changes, tasksCreated, alertsSent };
}

/* ═══════════════════════════════════════════
   KEYWORD GENERATION (simplified)
   ═══════════════════════════════════════════ */

function buildMonitorKeywords(trade: string, city: string): string[] {
  const base = trade.toLowerCase();
  return [
    `${base} ${city}`,
    `${base} near me`,
    `best ${base} ${city}`,
    `${base} services ${city}`,
    `emergency ${base} ${city}`,
    `local ${base} ${city}`,
  ];
}

/* ═══════════════════════════════════════════
   BATCH SCAN (all active clients)
   ═══════════════════════════════════════════ */

export async function runMapguardBatchScan(): Promise<{
  scanned: number;
  errors: number;
  tasksCreated: number;
  alertsSent: number;
  results: Array<{ client_id: number; business_name: string; score: number | null; significant: boolean; error?: string }>;
}> {
  const activeClients = await getActiveMapguardClients();
  console.log(`[mapguard-monitor] Starting batch scan for ${activeClients.length} clients`);

  let scanned = 0;
  let errorCount = 0;
  let totalTasks = 0;
  let totalAlerts = 0;
  const results: Array<{ client_id: number; business_name: string; score: number | null; significant: boolean; error?: string }> = [];

  // Process sequentially to avoid API rate limits
  for (const client of activeClients) {
    try {
      const { snapshot, changes, tasksCreated, alertsSent } = await runMapguardScan(client);
      scanned++;
      totalTasks += tasksCreated;
      totalAlerts += alertsSent;
      results.push({
        client_id: client.client_id,
        business_name: client.business_name,
        score: snapshot.score_total,
        significant: changes.significant,
      });
      console.log(`[mapguard-monitor] Scanned ${client.business_name}: score=${snapshot.score_total}, changes=${changes.significant ? "SIGNIFICANT" : "normal"}, tasks=${tasksCreated}`);
    } catch (err: any) {
      errorCount++;
      results.push({
        client_id: client.client_id,
        business_name: client.business_name,
        score: null,
        significant: false,
        error: err.message,
      });
      console.error(`[mapguard-monitor] Scan failed for ${client.business_name}:`, err.message);
    }

    // Brief pause between clients to be polite to APIs
    if (activeClients.indexOf(client) < activeClients.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`[mapguard-monitor] Batch complete: ${scanned} scanned, ${errorCount} errors, ${totalTasks} tasks created, ${totalAlerts} alerts sent`);
  return { scanned, errors: errorCount, tasksCreated: totalTasks, alertsSent: totalAlerts, results };
}

/* ═══════════════════════════════════════════
   SNAPSHOT QUERIES
   ═══════════════════════════════════════════ */

export async function getLatestSnapshot(clientId: number): Promise<MapguardSnapshot | null> {
  const [row] = await db.select().from(mapguardSnapshots)
    .where(eq(mapguardSnapshots.client_id, clientId))
    .orderBy(desc(mapguardSnapshots.captured_at))
    .limit(1);
  return row || null;
}

export async function getSnapshotHistory(clientId: number, limit = 12): Promise<MapguardSnapshot[]> {
  return db.select().from(mapguardSnapshots)
    .where(eq(mapguardSnapshots.client_id, clientId))
    .orderBy(desc(mapguardSnapshots.captured_at))
    .limit(limit);
}

export interface MonitoringSummary {
  latest: MapguardSnapshot | null;
  previous: MapguardSnapshot | null;
  trend: "improving" | "stable" | "declining" | "unknown";
  snapshot_count: number;
}

export async function getMonitoringSummary(clientId: number): Promise<MonitoringSummary> {
  const snapshots = await db.select().from(mapguardSnapshots)
    .where(eq(mapguardSnapshots.client_id, clientId))
    .orderBy(desc(mapguardSnapshots.captured_at))
    .limit(2);

  const [countRow] = await db.select({ count: sql<number>`count(*)::int` })
    .from(mapguardSnapshots)
    .where(eq(mapguardSnapshots.client_id, clientId));

  const latest = snapshots[0] || null;
  const previous = snapshots[1] || null;

  let trend: "improving" | "stable" | "declining" | "unknown" = "unknown";
  if (latest && previous && latest.score_total != null && previous.score_total != null) {
    const delta = latest.score_total - previous.score_total;
    if (delta > 5) trend = "improving";
    else if (delta < -5) trend = "declining";
    else trend = "stable";
  }

  return {
    latest,
    previous,
    trend,
    snapshot_count: countRow?.count || 0,
  };
}

/** Get clients with recent significant changes */
export async function getClientsWithRecentDrops(days = 7): Promise<MapguardSnapshot[]> {
  return db.select().from(mapguardSnapshots)
    .where(and(
      sql`${mapguardSnapshots.captured_at} > NOW() - INTERVAL '${sql.raw(String(days))} days'`,
      sql`(${mapguardSnapshots.changes}->>'significant')::boolean = true`,
    ))
    .orderBy(desc(mapguardSnapshots.captured_at))
    .limit(50);
}

/* ═══════════════════════════════════════════
   PORTFOLIO DASHBOARD AGGREGATION
   ═══════════════════════════════════════════ */

export interface PortfolioClientRow {
  client_id: number;
  client_service_id: number;
  business_name: string;
  trade_type: string | null;
  // Latest snapshot
  score_total: number | null;
  score_grade: string | null;
  rating: number | null;
  review_count: number | null;
  keywords_in_local_pack: number | null;
  keywords_in_top_10: number | null;
  detected_issues: string[] | null;
  captured_at: string | null;
  // Deltas from changes
  score_delta: number | null;
  rating_delta: number | null;
  reviews_delta: number | null;
  local_pack_delta: number | null;
  significant: boolean;
  // Task state
  open_tasks: number;
  blocked_tasks: number;
  waiting_supplier_tasks: number;
  needs_review_tasks: number;
  // Health state
  health: "healthy" | "improved" | "at_risk" | "blocked" | "waiting_delivery" | "no_recent_scan" | "new";
  // Upsell
  upgrade_recommended: boolean;
}

export interface PortfolioDashboard {
  metrics: {
    total_clients: number;
    significant_drops: number;
    improved: number;
    at_risk: number;
    blocked_tasks: number;
    waiting_supplier: number;
    needs_review: number;
    auto_tasks_7d: number;
    alerts_7d: number;
    avg_score: number | null;
    upgrade_opportunities: number;
  };
  clients: PortfolioClientRow[];
}

export async function getMapguardPortfolioDashboard(): Promise<PortfolioDashboard> {
  // 1. Get all active MapGuard clients
  const activeClients = await getActiveMapguardClients();
  if (activeClients.length === 0) {
    return {
      metrics: { total_clients: 0, significant_drops: 0, improved: 0, at_risk: 0, blocked_tasks: 0, waiting_supplier: 0, needs_review: 0, auto_tasks_7d: 0, alerts_7d: 0, avg_score: null, upgrade_opportunities: 0 },
      clients: [],
    };
  }

  const clientIds = activeClients.map(c => c.client_id);

  // 2. Get latest snapshot per client (using DISTINCT ON)
  const latestSnapshots = await db.execute(sql`
    SELECT DISTINCT ON (client_id) *
    FROM mapguard_snapshots
    WHERE client_id = ANY(${clientIds})
    ORDER BY client_id, captured_at DESC
  `);
  const snapshotMap = new Map<number, any>();
  for (const row of latestSnapshots.rows) {
    snapshotMap.set(row.client_id as number, row);
  }

  // 3. Get open task counts per client
  const taskCounts = await db.execute(sql`
    SELECT
      client_id,
      COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled')) AS open_tasks,
      COUNT(*) FILTER (WHERE status = 'blocked') AS blocked_tasks,
      COUNT(*) FILTER (WHERE status = 'waiting_supplier') AS waiting_supplier_tasks,
      COUNT(*) FILTER (WHERE status = 'needs_review') AS needs_review_tasks
    FROM mapguard_tasks
    WHERE client_id = ANY(${clientIds})
    GROUP BY client_id
  `);
  const taskMap = new Map<number, any>();
  for (const row of taskCounts.rows) {
    taskMap.set(row.client_id as number, row);
  }

  // 4. Count auto-created tasks in last 7 days
  const [autoTaskRow] = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM mapguard_tasks
    WHERE client_id = ANY(${clientIds})
      AND created_by_system = true
      AND created_at > NOW() - INTERVAL '7 days'
  `).then(r => r.rows);

  // 5. Build client rows with health logic
  const rows: PortfolioClientRow[] = [];
  let significantDrops = 0;
  let improved = 0;
  let atRisk = 0;
  let totalBlocked = 0;
  let totalWaiting = 0;
  let totalReview = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  let upgradeOpportunities = 0;

  // 5. Get execution usage per client (batch-friendly: one call per client)
  const usageMap = new Map<number, Awaited<ReturnType<typeof getExecutionUsage>>>();
  for (const client of activeClients) {
    try {
      usageMap.set(client.client_id, await getExecutionUsage(client.client_id));
    } catch { /* skip on error */ }
  }

  for (const client of activeClients) {
    const snap = snapshotMap.get(client.client_id);
    const tasks = taskMap.get(client.client_id);
    const changes = snap?.changes as any;
    const usage = usageMap.get(client.client_id);

    const openTasks = Number(tasks?.open_tasks || 0);
    const blockedTasks = Number(tasks?.blocked_tasks || 0);
    const waitingSupplier = Number(tasks?.waiting_supplier_tasks || 0);
    const needsReview = Number(tasks?.needs_review_tasks || 0);

    const scoreDelta = changes?.score_delta ?? null;
    const ratingDelta = changes?.rating_delta ?? null;
    const reviewsDelta = changes?.reviews_delta ?? null;
    const localPackDelta = changes?.local_pack_delta ?? null;
    const significant = changes?.significant === true;
    const upgradeRecommended = usage?.upgrade_recommended === true;

    // Health state
    let health: PortfolioClientRow["health"] = "new";
    if (!snap) {
      health = "no_recent_scan";
    } else if (blockedTasks > 0) {
      health = "blocked";
    } else if (significant && (scoreDelta !== null && scoreDelta < 0)) {
      health = "at_risk";
    } else if (waitingSupplier > 0) {
      health = "waiting_delivery";
    } else if (scoreDelta !== null && scoreDelta > 5) {
      health = "improved";
    } else if (snap) {
      health = "healthy";
    }

    // Aggregate metrics
    if (significant && scoreDelta !== null && scoreDelta < 0) significantDrops++;
    if (scoreDelta !== null && scoreDelta > 5) improved++;
    if (health === "at_risk") atRisk++;
    totalBlocked += blockedTasks;
    totalWaiting += waitingSupplier;
    totalReview += needsReview;
    if (snap?.score_total != null) { scoreSum += snap.score_total; scoreCount++; }
    if (upgradeRecommended) upgradeOpportunities++;

    rows.push({
      client_id: client.client_id,
      client_service_id: client.client_service_id,
      business_name: client.business_name,
      trade_type: client.trade_type,
      score_total: snap?.score_total ?? null,
      score_grade: snap?.score_grade ?? null,
      rating: snap?.rating ?? null,
      review_count: snap?.review_count ?? null,
      keywords_in_local_pack: snap?.keywords_in_local_pack ?? null,
      keywords_in_top_10: snap?.keywords_in_top_10 ?? null,
      detected_issues: snap?.detected_issues as string[] ?? null,
      captured_at: snap?.captured_at ?? null,
      score_delta: scoreDelta,
      rating_delta: ratingDelta,
      reviews_delta: reviewsDelta,
      local_pack_delta: localPackDelta,
      significant,
      open_tasks: openTasks,
      blocked_tasks: blockedTasks,
      waiting_supplier_tasks: waitingSupplier,
      needs_review_tasks: needsReview,
      health,
      upgrade_recommended: upgradeRecommended,
    });
  }

  // Sort: at_risk first, then blocked, then waiting, then by score ascending
  const HEALTH_ORDER: Record<string, number> = { at_risk: 0, blocked: 1, waiting_delivery: 2, no_recent_scan: 3, new: 4, improved: 5, healthy: 6 };
  rows.sort((a, b) => (HEALTH_ORDER[a.health] ?? 9) - (HEALTH_ORDER[b.health] ?? 9) || (a.score_total ?? 0) - (b.score_total ?? 0));

  return {
    metrics: {
      total_clients: activeClients.length,
      significant_drops: significantDrops,
      improved,
      at_risk: atRisk,
      blocked_tasks: totalBlocked,
      waiting_supplier: totalWaiting,
      needs_review: totalReview,
      auto_tasks_7d: Number((autoTaskRow as any)?.count || 0),
      alerts_7d: await getAlertCountSince(7),
      avg_score: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
      upgrade_opportunities: upgradeOpportunities,
    },
    clients: rows,
  };
}
