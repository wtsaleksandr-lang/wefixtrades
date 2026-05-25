/**
 * ScaleSerp provider (Wave 6.5).
 *
 * Quota: 100 queries/month FREE. Supports `google_web` and `google_maps`.
 *
 * Docs: https://www.scaleserp.com/docs
 */

import type {
  SerpRequest,
  SerpResult,
  SerpOrganicResult,
  SerpLocalPackResult,
} from "../serpOrchestrator";
import {
  envPresent,
  fetchWithTimeout,
  ProviderUnavailableError,
  type SerpProviderCall,
} from "./types";

export const ID = "scaleserp";
export const MONTHLY_LIMIT = 100;
export const SUPPORTED_ENGINES = new Set(["google_web", "google_maps"]);

export const call: SerpProviderCall = async (req: SerpRequest, timeoutMs: number): Promise<SerpResult> => {
  const apiKey = process.env.SCALESERP_API_KEY;
  if (!envPresent("SCALESERP_API_KEY")) {
    throw new ProviderUnavailableError(ID, "SCALESERP_API_KEY not set");
  }
  const engine = req.engine ?? "google_web";
  if (!SUPPORTED_ENGINES.has(engine)) {
    throw new ProviderUnavailableError(ID, `engine ${engine} not supported`);
  }

  const url = new URL("https://api.scaleserp.com/search");
  url.searchParams.set("api_key", apiKey!);
  url.searchParams.set("q", req.query);
  url.searchParams.set("num", String(Math.min(req.num ?? 10, 20)));
  if (req.location) url.searchParams.set("location", req.location);
  if (req.country) url.searchParams.set("gl", req.country.toLowerCase());
  if (req.language) url.searchParams.set("hl", req.language.toLowerCase());
  if (engine === "google_maps") {
    url.searchParams.set("search_type", "places");
  }

  const started = Date.now();
  const res = await fetchWithTimeout(url.toString(), { method: "GET" }, timeoutMs);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err: any = new Error(`${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const json: any = await res.json();

  if (engine === "google_maps") {
    const places: any[] = Array.isArray(json?.places_results) ? json.places_results : [];
    const localPack: SerpLocalPackResult[] = places.map((p: any, i: number) => ({
      position: p.position ?? i + 1,
      title: p.title || "",
      rating: typeof p.rating === "number" ? p.rating : undefined,
      reviewCount: typeof p.reviews === "number" ? p.reviews : undefined,
      address: p.address || undefined,
      placeId: p.place_id || undefined,
    }));
    return {
      organic: [],
      localPack,
      provider: ID,
      cached: false,
      queryTime: Date.now() - started,
    };
  }

  const organicRaw: any[] = Array.isArray(json?.organic_results) ? json.organic_results : [];
  const organic: SerpOrganicResult[] = organicRaw.map((o: any, i: number) => ({
    position: o.position ?? i + 1,
    title: o.title || "",
    link: o.link || "",
    snippet: o.snippet || undefined,
    displayedLink: o.displayed_link || undefined,
  }));
  const total = json?.search_information?.total_results;

  return {
    organic,
    totalResults: typeof total === "number" ? total : undefined,
    provider: ID,
    cached: false,
    queryTime: Date.now() - started,
  };
};
