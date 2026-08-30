/**
 * OpenStreetMap check — via a Nominatim search endpoint.
 *
 * Why OSM
 * -------
 * OSM is upstream of a large slice of the long tail: it is a stated data
 * source for Apple Maps, and it feeds a long list of smaller maps and
 * apps. A business present in OSM propagates for free; a business missing
 * from OSM is invisible to all of them at once. It is also one of the very
 * few genuinely open, key-free, structured business indexes left — every
 * comparable source (Data Axle, Foursquare, Yelp) now sits behind a login,
 * a paid plan, or both.
 *
 * Why this is DISABLED BY DEFAULT
 * -------------------------------
 * The public instance at nominatim.openstreetmap.org is a donated service.
 * Its usage policy caps clients at 1 request/second, requires a User-Agent
 * that identifies the application, and — decisively — prohibits
 * "systematic queries". A nightly per-subscriber sweep is exactly that,
 * and abusing it earns an IP ban that would turn this check into a
 * permanent failure generator.
 *
 * The usage policy is not the only bar, and this is the part that changed:
 * nominatim.openstreetmap.org/robots.txt disallows `/search` outright (plus
 * `/lookup`, `/reverse` and `/details`). Every endpoint capable of answering
 * "is this business in OSM?" is excluded, so there is no polite rate at
 * which the public instance becomes acceptable — a slower disallowed request
 * is still a disallowed request. The `CITETRACK_OSM_USE_PUBLIC_INSTANCE`
 * opt-in that used to sit here has therefore been removed rather than
 * documented, and `nominatimBaseUrl()` refuses the public host even if
 * someone names it explicitly.
 *
 * So the only production path is a **self-hosted or commercially licensed**
 * Nominatim, pointed at by `CITETRACK_NOMINATIM_URL` — a different host,
 * governed by its own robots.txt and its own terms. This module still
 * serialises calls >1s apart process-wide regardless of endpoint.
 *
 * The cheapest compliant option today is LocationIQ, whose `/v1/search`
 * is Nominatim-compatible and whose free tier (5,000 req/day) explicitly
 * permits commercial use with attribution — comfortably more than a daily
 * per-subscriber sweep needs. Point `CITETRACK_NOMINATIM_URL` at
 * `https://us1.locationiq.com/v1` and set `CITETRACK_NOMINATIM_KEY`, and
 * this check turns on with no code change and no policy problem.
 *
 * Until one of those is set the registry reports OSM as NOT CHECKED — no
 * row, no status, no alert, and excluded from the customer-facing count.
 * That is the honest state: we are not checking it, so we do not claim to.
 *
 * Attribution: OSM data is ODbL. Any surface that renders a NAP sourced
 * here must carry "© OpenStreetMap contributors".
 */
import type { ScrapeContext, ScrapeResult } from "../directories";
import { candidateMatches, cityFromAddress, fetchJson, sleep, stateFromAddress } from "./httpClient";
import { createLogger } from "../../../lib/logger";

const log = createLogger("citation-tracker:osm");

const PUBLIC_NOMINATIM = "https://nominatim.openstreetmap.org";

/** Identifies the app and carries a contact address, per the usage policy. */
export const NOMINATIM_USER_AGENT =
  "WeFixTrades-CiteTrack/1.0 (+https://wefixtrades.com; support@wefixtrades.com)";

/** Public-instance floor is 1 req/s; 1.2s leaves headroom for clock skew. */
const MIN_INTERVAL_MS = 1_200;
let lastCallAt = 0;

/** Serialise calls process-wide so a parallel scan can't burst the endpoint. */
async function throttle(): Promise<void> {
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

/**
 * The base URL to query, or null when OSM checking is not enabled.
 *
 * There is deliberately NO opt-in for the public instance. Its robots.txt
 * disallows `/search` — along with `/lookup`, `/reverse` and `/details`, so
 * every endpoint that could answer our question is excluded. An "accept the
 * risk explicitly" flag used to exist here; it has been removed, because the
 * risk was not ours to accept. A host that forbids the request has settled
 * the matter, and no environment variable should be able to reopen it.
 *
 * Pointing CITETRACK_NOMINATIM_URL at the public host is refused for the
 * same reason — otherwise removing the flag would just relocate it.
 */
export function nominatimBaseUrl(): string | null {
  const configured = process.env.CITETRACK_NOMINATIM_URL?.trim();
  if (!configured) return null;
  const base = configured.replace(/\/+$/, "");

  let host: string;
  try {
    host = new URL(base).host.toLowerCase();
  } catch {
    log.warn("CITETRACK_NOMINATIM_URL is not a valid URL; OSM check stays off");
    return null;
  }
  if (host === new URL(PUBLIC_NOMINATIM).host) {
    log.warn(
      "CITETRACK_NOMINATIM_URL points at the public Nominatim instance, whose robots.txt disallows /search. " +
        "The OSM check stays off. Use a self-hosted instance or a licensed Nominatim-compatible host.",
    );
    return null;
  }
  return base;
}

export function osmConfigured(): boolean {
  return nominatimBaseUrl() !== null;
}

interface NominatimPlace {
  osm_type?: string;
  osm_id?: number;
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
  extratags?: Record<string, string>;
}

/**
 * The exact URL this check requests against a given base. Exported so the
 * robots-compliance guard can prove that the path we ask for (`/search`) is
 * the very path the public instance forbids — which is the reason
 * `nominatimBaseUrl()` will not return that host.
 */
export function nominatimSearchUrl(base: string, ctx: ScrapeContext, apiKey?: string): string {
  const city = cityFromAddress(ctx.address);
  const state = stateFromAddress(ctx.address);
  const q = [ctx.business_name, city, state].filter(Boolean).join(", ");
  // LocationIQ (and other Nominatim-compatible hosts) authenticate with a
  // `key` query param; a self-hosted instance simply omits it.
  return (
    `${base.replace(/\/+$/, "")}/search?q=${encodeURIComponent(q)}` +
    "&format=jsonv2&limit=5&addressdetails=1&extratags=1" +
    (apiKey ? `&key=${encodeURIComponent(apiKey)}` : "")
  );
}

/** The public instance, exported for the guard that proves we refuse it. */
export const PUBLIC_NOMINATIM_URL = PUBLIC_NOMINATIM;

export async function scrapeOpenStreetMap(
  ctx: ScrapeContext,
  opts: { politeDelayMs?: number } = {},
): Promise<ScrapeResult> {
  const base = nominatimBaseUrl();
  if (!base) return { found: false, error: "not_configured" };

  const url = nominatimSearchUrl(base, ctx, process.env.CITETRACK_NOMINATIM_KEY?.trim());

  if (opts.politeDelayMs !== 0) await throttle();

  const res = await fetchJson<NominatimPlace[]>(url, {
    ...opts,
    userAgent: NOMINATIM_USER_AGENT,
  });
  if (!res.ok) return { found: false, error: res.reason };

  // A non-array body means the endpoint answered with something we don't
  // understand (an error envelope, an HTML error page that happened to
  // parse). That is a check failure, not an absence.
  if (!Array.isArray(res.data)) return { found: false, error: "parse_error" };

  const match = res.data
    .map((p) => ({
      osm_type: p.osm_type,
      osm_id: p.osm_id,
      name: p.name || p.address?.craft || p.address?.shop || p.address?.office,
      address: p.display_name,
      phone: p.extratags?.phone || p.extratags?.["contact:phone"],
      website: p.extratags?.website || p.extratags?.["contact:website"],
    }))
    .find((c) => candidateMatches(ctx, c));

  if (!match) return { found: false };

  return {
    found: true,
    listing_url:
      match.osm_type && match.osm_id
        ? `https://www.openstreetmap.org/${match.osm_type}/${match.osm_id}`
        : undefined,
    nap: {
      name: match.name,
      address: match.address,
      phone: match.phone,
      website: match.website,
    },
  };
}
