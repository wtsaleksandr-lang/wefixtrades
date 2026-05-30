/**
 * Outscraper client — Google Maps search (V3).
 *
 * Thin wrapper around https://api.app.outscraper.com/maps/search-v3 used by
 * the admin outbound scrape endpoint. We intentionally keep this surface
 * small: ONE call (`searchGoogleMaps`) that takes a query + region and
 * returns a normalised list of leads in the shape our CSV import path
 * already understands. The handler in adminOutboundRoutes.ts feeds the
 * returned rows back through the SAME dedupe / blacklist / heuristics
 * pipeline as the manual-CSV path — so this file does no scoring or DB
 * work of its own.
 *
 * Auth: Outscraper expects the API key in the `X-API-KEY` request header.
 * Source: https://app.outscraper.com/api-docs (Google-Maps-search-V3).
 *
 * Polling: Outscraper jobs are async — the initial POST returns a
 * request ID, then `/requests/{id}` returns `Pending` until results land.
 * For our admin use case (small batches, admin clicks "Scrape" + waits a
 * few seconds) we synchronously poll up to ~30s. Larger batches should
 * be moved to a background worker — leaving a TODO.
 */

import { createLogger } from "../lib/logger";

const log = createLogger("OutscraperClient");

const BASE_URL = "https://api.app.outscraper.com";
const DEFAULT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1_500;
const POLL_MAX_ATTEMPTS = 20; // ~30s wall-clock

/** Normalised lead row — matches our CSV_MAP keys in adminOutboundRoutes.ts. */
export interface OutscraperLead {
  name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  reviews_count: number | null;
  place_id: string | null;
  category: string | null;
  /** Original row stored as-is so the import path can save it to raw_data. */
  raw: Record<string, unknown>;
}

export interface SearchOptions {
  /** "plumber in Toronto, ON, CA" — single free-text query. */
  query: string;
  /** Two-letter region / country code (e.g. "US", "CA"). */
  region?: string;
  /** ISO language code (e.g. "en"). */
  language?: string;
  /** Max results to fetch. Outscraper caps at 500 per query. */
  limit?: number;
  /** Override default timeout for very large pulls. */
  timeoutMs?: number;
}

export interface SearchResult {
  leads: OutscraperLead[];
  requestId: string | null;
  truncated: boolean;
}

/* ─── Errors ─── */
export class OutscraperError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "OutscraperError";
  }
}

/* ─── Internals ─── */

function apiKey(): string {
  const key = process.env.OUTSCRAPER_API_KEY;
  if (!key) {
    throw new OutscraperError("OUTSCRAPER_API_KEY is not set");
  }
  return key;
}

/** Map an Outscraper result row to our normalised shape. */
function normaliseRow(row: Record<string, any>): OutscraperLead {
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  };
  const int = (v: unknown): number | null => {
    const n = num(v);
    return n === null ? null : Math.round(n);
  };
  const str = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s.length === 0 ? null : s;
  };

  return {
    name: str(row.name ?? row.title ?? row.business_name),
    phone: str(row.phone ?? row.phone_number),
    email: str(row.email ?? row.email_1),
    website: str(row.site ?? row.website),
    address: str(row.full_address ?? row.address),
    city: str(row.city),
    state: str(row.state),
    country: str(row.country ?? row.country_code),
    lat: num(row.latitude ?? row.lat),
    lng: num(row.longitude ?? row.lng),
    rating: num(row.rating),
    reviews_count: int(row.reviews ?? row.reviews_count),
    place_id: str(row.place_id ?? row.google_id),
    category: str(row.category ?? row.main_category ?? row.type),
    raw: row,
  };
}

async function poll(requestId: string, deadlineMs: number): Promise<any[]> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    if (Date.now() > deadlineMs) {
      throw new OutscraperError(`Outscraper poll timed out after ${POLL_MAX_ATTEMPTS} attempts`);
    }
    const res = await fetch(`${BASE_URL}/requests/${requestId}`, {
      method: "GET",
      headers: { "X-API-KEY": apiKey() },
    });
    if (!res.ok) {
      throw new OutscraperError(`Poll failed: ${res.status} ${res.statusText}`, res.status);
    }
    const body = await res.json() as { status?: string; data?: any[][] };
    if (body.status === "Success" && Array.isArray(body.data)) {
      // Outscraper returns `data: [[ row, row, ... ]]` (outer = query, inner = rows).
      return body.data[0] ?? [];
    }
    if (body.status === "Failed") {
      throw new OutscraperError("Outscraper job reported Failed status");
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new OutscraperError("Outscraper poll exceeded max attempts");
}

/* ─── Public ─── */

/**
 * Search Google Maps via Outscraper and return normalised leads.
 *
 * Synchronously polls the async Outscraper job for up to ~30s. For
 * larger batches (>200 leads) consider moving to a background worker
 * and surfacing progress through the import_batches table. (TODO.)
 */
export async function searchGoogleMaps(opts: SearchOptions): Promise<SearchResult> {
  const limit = Math.max(1, Math.min(opts.limit ?? 100, 500));
  const region = opts.region ?? "US";
  const language = opts.language ?? "en";
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  const url = new URL(`${BASE_URL}/maps/search-v3`);
  url.searchParams.set("query", opts.query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("region", region);
  url.searchParams.set("language", language);
  url.searchParams.set("async", "true");

  // Email acquisition (CASL implied-consent path): opt-in website-crawl email
  // enrichment. Outscraper's "Emails & Contacts" (domains_service) visits each
  // business's own website and extracts the published contact email — the
  // emails we're allowed to cold-contact under CASL's B2B exemption. Base Maps
  // results rarely include an email, so without this the funnel starves.
  // Costs ~$3 per 1,000 extra, so it's OFF by default — flip
  // OUTBOUND_EMAIL_ENRICHMENT=true once the spend is approved.
  if (process.env.OUTBOUND_EMAIL_ENRICHMENT === "true") {
    url.searchParams.append("enrichment", "domains_service");
    log.info("[outscraper] email enrichment ON (domains_service)");
  }

  log.info(`[outscraper] search: q="${opts.query}" region=${region} limit=${limit}`);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { "X-API-KEY": apiKey() },
  });

  if (res.status === 202) {
    // Async accepted — body contains { id, status: 'Pending' }
    const accepted = await res.json() as { id?: string; results_location?: string };
    const requestId = accepted.id ?? null;
    if (!requestId) {
      throw new OutscraperError("Outscraper returned 202 with no request id");
    }
    const rows = await poll(requestId, deadline);
    const leads = rows.map(normaliseRow);
    return { leads, requestId, truncated: leads.length >= limit };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OutscraperError(`Search failed: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`, res.status);
  }

  // Synchronous response (some Outscraper plans return results inline for
  // small queries). Shape: { data: [[ row, row, ... ]], status: 'Success' }
  const body = await res.json() as { data?: any[][] };
  const rows = body.data?.[0] ?? [];
  const leads = rows.map(normaliseRow);
  return { leads, requestId: null, truncated: leads.length >= limit };
}

/** Build the canonical "trade in city, state, country" query string. */
export function buildMapsQuery(trade: string, city: string, state?: string | null, country?: string | null): string {
  const loc = [city, state, country].filter(Boolean).join(", ");
  return `${trade} in ${loc}`;
}
