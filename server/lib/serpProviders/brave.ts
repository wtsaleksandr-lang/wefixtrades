/**
 * Brave Search API provider (Wave 6.5).
 *
 * Quota: 2000 queries/month FREE on the "Data for Search" plan (requires
 * a card on file but no charge while under quota). Brave's own index is
 * the best replacement for Bing's deprecated v7 endpoint — we use it for
 * both `google_web` (independent-index fallback) and `bing_equivalent`.
 *
 * Docs: https://brave.com/search/api/
 */

import type { SerpRequest, SerpResult, SerpOrganicResult } from "../serpOrchestrator";
import {
  envPresent,
  fetchWithTimeout,
  ProviderUnavailableError,
  type SerpProviderCall,
} from "./types";

export const ID = "brave";
export const MONTHLY_LIMIT = 2_000;
export const SUPPORTED_ENGINES = new Set(["google_web", "bing_equivalent"]);

export const call: SerpProviderCall = async (req: SerpRequest, timeoutMs: number): Promise<SerpResult> => {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!envPresent("BRAVE_SEARCH_API_KEY")) {
    throw new ProviderUnavailableError(ID, "BRAVE_SEARCH_API_KEY not set");
  }
  const engine = req.engine ?? "google_web";
  if (!SUPPORTED_ENGINES.has(engine)) {
    throw new ProviderUnavailableError(ID, `engine ${engine} not supported`);
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", req.query);
  url.searchParams.set("count", String(Math.min(req.num ?? 10, 20)));
  if (req.country) url.searchParams.set("country", req.country.toUpperCase());
  if (req.language) url.searchParams.set("search_lang", req.language.toLowerCase());

  const started = Date.now();
  const res = await fetchWithTimeout(
    url.toString(),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey!,
      },
    },
    timeoutMs,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err: any = new Error(`${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const json: any = await res.json();
  const resultsRaw: any[] = Array.isArray(json?.web?.results) ? json.web.results : [];
  const organic: SerpOrganicResult[] = resultsRaw.map((r: any, i: number) => ({
    position: i + 1,
    title: r.title || "",
    link: r.url || "",
    snippet: r.description || undefined,
    displayedLink: r.meta_url?.hostname || undefined,
  }));
  const totalRaw = json?.web?.total;

  return {
    organic,
    totalResults: typeof totalRaw === "number" ? totalRaw : undefined,
    provider: ID,
    cached: false,
    queryTime: Date.now() - started,
  };
};
