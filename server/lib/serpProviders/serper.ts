/**
 * Serper.dev provider (Wave 6.5).
 *
 * Existing key — we already use this for the paid Full Audit + Local
 * Rank Grid + Local Search Checker. Quota: ~2500 free credits one-time;
 * after that pay-as-you-go. Supports `google_web` and `google_maps`.
 *
 * Docs: https://serper.dev/api-docs
 */

import type {
  SerpRequest,
  SerpResult,
  SerpOrganicResult,
  SerpLocalPackResult,
  SerpAdResult,
} from "../serpOrchestrator";
import {
  envPresent,
  fetchWithTimeout,
  ProviderUnavailableError,
  type SerpProviderCall,
} from "./types";

export const ID = "serper";
export const MONTHLY_LIMIT = 2_500;        // 2500 free credits one-time bucket
export const SUPPORTED_ENGINES = new Set(["google_web", "google_maps"]);

const BASE = process.env.SERPER_BASE_URL || "https://google.serper.dev";

export const call: SerpProviderCall = async (req: SerpRequest, timeoutMs: number): Promise<SerpResult> => {
  const apiKey = process.env.SERPER_API_KEY;
  if (!envPresent("SERPER_API_KEY")) {
    throw new ProviderUnavailableError(ID, "SERPER_API_KEY not set");
  }
  const engine = req.engine ?? "google_web";
  if (!SUPPORTED_ENGINES.has(engine)) {
    throw new ProviderUnavailableError(ID, `engine ${engine} not supported`);
  }

  const headers = { "X-API-KEY": apiKey!, "Content-Type": "application/json" };
  const body: Record<string, unknown> = {
    q: req.query,
    gl: (req.country || "us").toLowerCase(),
    hl: (req.language || "en").toLowerCase(),
    num: Math.min(req.num ?? 10, 20),
  };
  if (req.location) body.location = req.location;
  if (typeof req.latitude === "number") body.latitude = req.latitude;
  if (typeof req.longitude === "number") body.longitude = req.longitude;

  const started = Date.now();

  if (engine === "google_maps") {
    const res = await fetchWithTimeout(`${BASE}/maps`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }, timeoutMs);
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      const err: any = new Error(`${res.status}: ${errBody.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    const json: any = await res.json();
    const places: any[] = Array.isArray(json?.places) ? json.places : [];
    const localPack: SerpLocalPackResult[] = places.map((p: any, i: number) => ({
      position: i + 1,
      title: p.title || p.name || "",
      rating: typeof p.rating === "number" ? p.rating : undefined,
      reviewCount: typeof p.ratingCount === "number" ? p.ratingCount : undefined,
      address: p.address || undefined,
      placeId: p.placeId || p.cid || undefined,
    }));
    return {
      organic: [],
      localPack,
      provider: ID,
      cached: false,
      queryTime: Date.now() - started,
    };
  }

  // google_web
  const res = await fetchWithTimeout(`${BASE}/search`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }, timeoutMs);
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const err: any = new Error(`${res.status}: ${errBody.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const json: any = await res.json();
  const organicRaw: any[] = Array.isArray(json?.organic) ? json.organic : [];
  const organic: SerpOrganicResult[] = organicRaw.map((o: any, i: number) => ({
    position: o.position ?? i + 1,
    title: o.title || "",
    link: o.link || "",
    snippet: o.snippet || undefined,
    displayedLink: o.displayedLink || undefined,
  }));
  const placesRaw: any[] = Array.isArray(json?.places) ? json.places : [];
  const localPack: SerpLocalPackResult[] | undefined = placesRaw.length
    ? placesRaw.map((p: any, i: number) => ({
        position: i + 1,
        title: p.title || p.name || "",
        rating: typeof p.rating === "number" ? p.rating : undefined,
        reviewCount: typeof p.ratingCount === "number" ? p.ratingCount : undefined,
        address: p.address || undefined,
        placeId: p.placeId || p.cid || undefined,
      }))
    : undefined;
  const adsRaw: any[] = Array.isArray(json?.ads) ? json.ads : [];
  const ads: SerpAdResult[] | undefined = adsRaw.length
    ? adsRaw.map((a: any) => ({
        title: a.title || "",
        displayedLink: a.displayedLink || undefined,
        link: a.link || undefined,
      }))
    : undefined;

  return {
    organic,
    localPack,
    ads,
    provider: ID,
    cached: false,
    queryTime: Date.now() - started,
  };
};
