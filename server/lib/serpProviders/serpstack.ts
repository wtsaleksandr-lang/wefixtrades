/**
 * SerpStack provider (Wave 6.5).
 *
 * Quota: 100 queries/month FREE. NOTE: the free plan exposes ONLY
 * `http://` — HTTPS requires a paid tier. We hit HTTP here intentionally;
 * upgrade to the paid endpoint by setting SERPSTACK_USE_HTTPS=1.
 *
 * Docs: https://serpstack.com/documentation
 */

import type { SerpRequest, SerpResult, SerpOrganicResult } from "../serpOrchestrator";
import {
  envPresent,
  fetchWithTimeout,
  ProviderUnavailableError,
  type SerpProviderCall,
} from "./types";

export const ID = "serpstack";
export const MONTHLY_LIMIT = 100;
export const SUPPORTED_ENGINES = new Set(["google_web"]);

export const call: SerpProviderCall = async (req: SerpRequest, timeoutMs: number): Promise<SerpResult> => {
  const apiKey = process.env.SERPSTACK_API_KEY;
  if (!envPresent("SERPSTACK_API_KEY")) {
    throw new ProviderUnavailableError(ID, "SERPSTACK_API_KEY not set");
  }
  const engine = req.engine ?? "google_web";
  if (!SUPPORTED_ENGINES.has(engine)) {
    throw new ProviderUnavailableError(ID, `engine ${engine} not supported`);
  }

  // HTTP intentional on free tier — see file header.
  const scheme = process.env.SERPSTACK_USE_HTTPS === "1" ? "https" : "http";
  const url = new URL(`${scheme}://api.serpstack.com/search`);
  url.searchParams.set("access_key", apiKey!);
  url.searchParams.set("query", req.query);
  url.searchParams.set("num", String(Math.min(req.num ?? 10, 20)));
  if (req.location) url.searchParams.set("location", req.location);
  if (req.country) url.searchParams.set("gl", req.country.toLowerCase());
  if (req.language) url.searchParams.set("hl", req.language.toLowerCase());

  const started = Date.now();
  const res = await fetchWithTimeout(url.toString(), { method: "GET" }, timeoutMs);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err: any = new Error(`${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const json: any = await res.json();
  // serpstack errors come back 200 OK with success:false — normalize.
  if (json && json.success === false) {
    const err: any = new Error(`serpstack: ${json?.error?.info || "unknown error"}`);
    err.status = json?.error?.code || 400;
    throw err;
  }
  const organicRaw: any[] = Array.isArray(json?.organic_results) ? json.organic_results : [];
  const organic: SerpOrganicResult[] = organicRaw.map((o: any, i: number) => ({
    position: o.position ?? i + 1,
    title: o.title || "",
    link: o.url || "",
    snippet: o.snippet || undefined,
    displayedLink: o.displayed_url || undefined,
  }));

  return {
    organic,
    totalResults: typeof json?.search_information?.total_results === "number"
      ? json.search_information.total_results
      : undefined,
    provider: ID,
    cached: false,
    queryTime: Date.now() - started,
  };
};
