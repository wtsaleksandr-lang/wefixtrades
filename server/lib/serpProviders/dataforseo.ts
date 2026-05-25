/**
 * DataForSEO provider (Wave 6.5) — paid fallback.
 *
 * ~$0.001 per call, $25 minimum top-up (lasts ~25k calls). Only fires
 * when EVERY free-tier provider is exhausted or explicitly requested.
 * Tracked with monthlyLimit = 0 → quotaRemaining() returns Infinity so
 * the orchestrator never skips it for quota reasons.
 *
 * Docs: https://docs.dataforseo.com/v3/serp/google/organic/live/regular/
 */

import type { SerpRequest, SerpResult, SerpOrganicResult } from "../serpOrchestrator";
import {
  envPresent,
  fetchWithTimeout,
  ProviderUnavailableError,
  type SerpProviderCall,
} from "./types";

export const ID = "dataforseo";
export const MONTHLY_LIMIT = 0;            // pay-as-you-go, no monthly cap tracked
export const SUPPORTED_ENGINES = new Set(["google_web", "google_maps", "bing_equivalent"]);

export const call: SerpProviderCall = async (req: SerpRequest, timeoutMs: number): Promise<SerpResult> => {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!envPresent("DATAFORSEO_LOGIN") || !envPresent("DATAFORSEO_PASSWORD")) {
    throw new ProviderUnavailableError(ID, "DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD not set");
  }

  // Buffer.from is fine here — auth pair, not a secret value we'd log.
  const basic = Buffer.from(`${login}:${password}`).toString("base64");
  const headers = {
    Authorization: `Basic ${basic}`,
    "Content-Type": "application/json",
  };

  const engine = req.engine ?? "google_web";
  const url =
    engine === "google_maps"
      ? "https://api.dataforseo.com/v3/serp/google/maps/live/advanced"
      : "https://api.dataforseo.com/v3/serp/google/organic/live/regular";

  const task: Record<string, unknown> = {
    keyword: req.query,
    language_code: (req.language || "en").toLowerCase(),
    location_name: req.location,
    location_code: undefined,
    depth: Math.min(req.num ?? 10, 20),
  };
  if (!req.location && req.country) {
    // DataForSEO requires either location_name OR location_code; use
    // country as a fallback location string when no city is given.
    task.location_name = req.country.toUpperCase();
  }

  const started = Date.now();
  const res = await fetchWithTimeout(
    url,
    { method: "POST", headers, body: JSON.stringify([task]) },
    timeoutMs,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err: any = new Error(`${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const json: any = await res.json();
  // DataForSEO wraps everything in tasks[0].result[0].items.
  const items: any[] = json?.tasks?.[0]?.result?.[0]?.items ?? [];

  if (engine === "google_maps") {
    const localPack = items
      .filter((it: any) => it?.type === "maps_search")
      .map((it: any, i: number) => ({
        position: it.rank_absolute ?? i + 1,
        title: it.title || "",
        rating: typeof it.rating?.value === "number" ? it.rating.value : undefined,
        reviewCount: typeof it.rating?.votes_count === "number" ? it.rating.votes_count : undefined,
        address: it.address || undefined,
        placeId: it.place_id || it.cid || undefined,
      }));
    return {
      organic: [],
      localPack,
      provider: ID,
      cached: false,
      queryTime: Date.now() - started,
    };
  }

  const organicItems = items.filter((it: any) => it?.type === "organic");
  const organic: SerpOrganicResult[] = organicItems.map((o: any, i: number) => ({
    position: o.rank_absolute ?? i + 1,
    title: o.title || "",
    link: o.url || "",
    snippet: o.description || undefined,
    displayedLink: o.breadcrumb || undefined,
  }));
  const total = json?.tasks?.[0]?.result?.[0]?.se_results_count;

  return {
    organic,
    totalResults: typeof total === "number" ? total : undefined,
    provider: ID,
    cached: false,
    queryTime: Date.now() - started,
  };
};
