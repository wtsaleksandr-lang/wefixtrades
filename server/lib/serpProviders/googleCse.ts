/**
 * Google Custom Search API provider (Wave 6.5).
 *
 * Quota: 100 queries/day FREE, then $5/1k up to 10k/day. We track only
 * the monthly counter (3000/mo conservative) — the orchestrator will
 * trip the day cap via a 429 anyway. Supports `google_web` ONLY; the
 * orchestrator skips this provider for maps / bing engines.
 *
 * Docs: https://developers.google.com/custom-search/v1/overview
 */

import type { SerpRequest, SerpResult, SerpOrganicResult } from "../serpOrchestrator";
import {
  envPresent,
  fetchWithTimeout,
  ProviderUnavailableError,
  type SerpProviderCall,
} from "./types";

export const ID = "googleCse";
export const MONTHLY_LIMIT = 3_000;        // 100/day × 30 = effective floor
export const SUPPORTED_ENGINES = new Set(["google_web"]);

export const call: SerpProviderCall = async (req: SerpRequest, timeoutMs: number): Promise<SerpResult> => {
  const apiKey = process.env.GOOGLE_CUSTOMSEARCH_API_KEY;
  const cx = process.env.GOOGLE_CUSTOMSEARCH_CX;
  if (!envPresent("GOOGLE_CUSTOMSEARCH_API_KEY") || !envPresent("GOOGLE_CUSTOMSEARCH_CX")) {
    throw new ProviderUnavailableError(ID, "GOOGLE_CUSTOMSEARCH_API_KEY or GOOGLE_CUSTOMSEARCH_CX not set");
  }
  if (req.engine && !SUPPORTED_ENGINES.has(req.engine)) {
    throw new ProviderUnavailableError(ID, `engine ${req.engine} not supported`);
  }

  const num = Math.min(req.num ?? 10, 10);  // CSE caps at 10 per request
  const url = new URL("https://customsearch.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey!);
  url.searchParams.set("cx", cx!);
  url.searchParams.set("q", req.query);
  url.searchParams.set("num", String(num));
  if (req.country) {
    url.searchParams.set("cr", `country${req.country.toUpperCase()}`);
    url.searchParams.set("gl", req.country.toLowerCase());
  }
  if (req.language) {
    url.searchParams.set("lr", `lang_${req.language.toLowerCase()}`);
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
  const items: any[] = Array.isArray(json?.items) ? json.items : [];
  const organic: SerpOrganicResult[] = items.map((it: any, i: number) => ({
    position: i + 1,
    title: it.title || "",
    link: it.link || "",
    snippet: it.snippet || undefined,
    displayedLink: it.displayLink || undefined,
  }));
  const totalResultsRaw = json?.searchInformation?.totalResults;
  const totalResults =
    typeof totalResultsRaw === "string" ? Number.parseInt(totalResultsRaw, 10) : undefined;

  return {
    organic,
    totalResults: Number.isFinite(totalResults) ? (totalResults as number) : undefined,
    provider: ID,
    cached: false,
    queryTime: Date.now() - started,
  };
};
