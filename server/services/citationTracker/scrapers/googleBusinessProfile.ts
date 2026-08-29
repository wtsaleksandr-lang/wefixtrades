/**
 * Google Business Profile check — via the Places API (New) Text Search.
 *
 * Why this directory, and why this method
 * ---------------------------------------
 * GBP carries roughly a fifth of local-pack ranking weight on its own —
 * more than every other listing in this registry combined. It is the one
 * directory whose absence or drift is unambiguously worth a customer's
 * attention, so it is the first thing CiteTrack should check.
 *
 * We do NOT use the Google Business Profile API. That API manages listings
 * the caller owns, requires a per-project access approval, and our project
 * currently sits at quota 0 (enabled, not approved). `gbpApiConfigured()`
 * below reserves the slot: when approval lands, an owner-authenticated
 * check can be added behind that flag without touching the registry.
 *
 * The Places API answers the question CiteTrack actually asks — "is this
 * business publicly listed, and does its public NAP still match?" — needs
 * only the `GOOGLE_MAPS_API_KEY` this repo already provisions, and reads
 * the same public index that feeds the local pack.
 *
 * Cost discipline — the two-stage design
 * --------------------------------------
 * Google bills a request at the HIGHEST field tier it touches, and since
 * 2025-03-01 the free allowance is a per-SKU monthly cap, not a pooled
 * credit. Requesting `displayName` promotes a call to Pro (5,000/mo free,
 * then $32/1k on Text Search); `nationalPhoneNumber` or `websiteUri` would
 * promote it to Enterprise. A naive "Text Search with a full mask every
 * day" costs ~$128/mo at 300 subscribers.
 *
 * So the check runs in two stages:
 *
 *   1. DISCOVERY — once, the first time we look for a subscription's
 *      listing. Text Search with a Pro mask, which is what lets us verify
 *      the candidate is genuinely this business. Roughly one call per
 *      subscriber for the lifetime of the subscription, so it stays far
 *      inside the 5,000/mo Pro cap.
 *
 *   2. RECHECK — every scan thereafter. Place Details on the stored place
 *      id with an **Essentials** mask (10,000/mo free, and Place Details
 *      Essentials is the cheapest tier that returns an address). This is
 *      the call that runs daily, and it answers the two questions that
 *      matter: is the listing still there, and did the address move?
 *
 * Net effect: $0/month up to ~330 daily-scanned subscribers, versus ~$128
 * for the naive design. The recheck deliberately does NOT request
 * `displayName`, so GBP name drift is not monitored daily — that is a
 * conscious trade, documented here so nobody "fixes" it by widening the
 * mask without re-reading this note. See DIRECTORY_COST_NOTES in
 * ../directories.ts.
 *
 * Evidence discipline
 * -------------------
 * Text Search is a relevance engine, not an exact-match lookup: querying
 * "Zzqqx Nonexistent Plumbing Co, Cincinnati OH" returns "Zins Plumbing",
 * a real and entirely unrelated business (verified against the live API).
 * Every candidate is therefore run through `candidateMatches`, and a
 * response with no qualifying candidate is a CONFIRMED ABSENCE. Any
 * transport failure, quota exhaustion (429) or auth failure (401/403) is
 * a CHECK FAILURE and returns `error`, never a clean `{ found: false }`.
 */
import type { ScrapeContext, ScrapeResult } from "../directories";
import { candidateMatches, cityFromAddress, fetchJson, stateFromAddress } from "./httpClient";

const SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";
const PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places/";

/**
 * DISCOVERY mask — Pro tier (because of `displayName`). Runs about once
 * per subscription. Adding `places.nationalPhoneNumber` or
 * `places.websiteUri` here silently promotes every call to the Enterprise
 * SKU — do not add them without re-doing the cost note in directories.ts.
 */
const DISCOVERY_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.businessStatus",
].join(",");

/**
 * RECHECK mask — Essentials tier, and this is the one that runs daily.
 * `formattedAddress` and `id` are Essentials fields; `displayName` is NOT
 * and would move this call to Pro. Keep this mask minimal.
 */
const RECHECK_FIELD_MASK = ["id", "formattedAddress"].join(",");

/** Google place ids are opaque but URL-safe; keep validation strict so a
 * malformed stored URL can't be interpolated into the details path. */
const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,255}$/;

interface PlacesTextSearchResponse {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    businessStatus?: string;
  }>;
}

interface PlaceDetailsResponse {
  id?: string;
  formattedAddress?: string;
}

/** Recover the place id we stored in the listing_url on discovery. */
export function placeIdFromListingUrl(listingUrl: string | undefined): string | null {
  if (!listingUrl) return null;
  const m = /place_id:([A-Za-z0-9_-]+)/.exec(listingUrl);
  if (!m) return null;
  return PLACE_ID_RE.test(m[1]) ? m[1] : null;
}

function listingUrlForPlaceId(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
}

/** True when the public-index check can run. */
export function placesApiConfigured(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
}

/**
 * Reserved for the owner-authenticated GBP API check. Returns false until
 * the access request is approved and a token is provisioned; the registry
 * consults `placesApiConfigured` today.
 */
export function gbpApiConfigured(): boolean {
  return Boolean(process.env.GBP_API_ACCESS_TOKEN) && process.env.GBP_API_ENABLED === "true";
}

export async function scrapeGoogleBusinessProfile(
  ctx: ScrapeContext,
  opts: { politeDelayMs?: number } = {},
): Promise<ScrapeResult> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  // Defensive: the registry should have skipped us. If it didn't, report
  // "we never checked" rather than anything that resembles a finding.
  if (!key) return { found: false, error: "not_configured" };

  // STAGE 2 — we already know which place this is. Cheap daily recheck.
  const knownPlaceId = placeIdFromListingUrl(ctx.known_listing_url);
  if (knownPlaceId) {
    const res = await fetchJson<PlaceDetailsResponse>(
      PLACE_DETAILS_URL + encodeURIComponent(knownPlaceId),
      { ...opts, headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": RECHECK_FIELD_MASK } },
    );

    if (res.ok) {
      return {
        found: true,
        listing_url: listingUrlForPlaceId(knownPlaceId),
        // No `name`: displayName is a Pro-tier field and this call is
        // pinned to Essentials. diffNap treats an absent field as "no
        // opinion", so omitting it cannot manufacture a false drift alert.
        nap: { address: res.data?.formattedAddress },
      };
    }

    // Anything other than a 404 is a transport/quota problem that tells us
    // nothing about the listing.
    if (!(res.reason === "bad_status" && res.status === 404)) {
      return { found: false, error: res.reason };
    }

    // A 404 means THIS place id is gone — not necessarily that the business
    // is unlisted. Google issues a new id when a profile is deleted and
    // re-created, and merges retire the losing id. Returning "absent" here
    // would mean a customer who fixed their listing stays flagged as
    // removed forever, since we'd keep re-checking the dead id. So fall
    // through to discovery and let a fresh search decide. This costs one
    // extra Pro-tier call per scan only while a listing is actually
    // missing, which is rare and self-limiting.
  }

  // STAGE 1 — discovery.
  const city = cityFromAddress(ctx.address);
  const state = stateFromAddress(ctx.address);
  const textQuery = [ctx.business_name, city, state].filter(Boolean).join(", ");

  const res = await fetchJson<PlacesTextSearchResponse>(SEARCH_TEXT_URL, {
    ...opts,
    method: "POST",
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": DISCOVERY_FIELD_MASK },
    body: JSON.stringify({ textQuery, maxResultCount: 5 }),
  });

  if (!res.ok) return { found: false, error: res.reason };

  const places = Array.isArray(res.data?.places) ? res.data.places : [];

  // Prefer an OPERATIONAL match over a permanently-closed duplicate: chains
  // accumulate stale closed pins at old addresses, and matching one of those
  // would diff the customer's NAP against an address they left years ago.
  const candidates = places
    .map((p) => ({
      id: p.id,
      name: p.displayName?.text,
      address: p.formattedAddress,
      status: p.businessStatus,
    }))
    .filter((c) => candidateMatches(ctx, c));

  const match =
    candidates.find((c) => c.status === "OPERATIONAL") ?? candidates[0];

  // A clean 200 with no qualifying candidate is real evidence of absence.
  if (!match) return { found: false };

  return {
    found: true,
    // Storing the place id in the listing_url is what makes every later
    // scan take the cheap Stage-2 path.
    listing_url: match.id ? listingUrlForPlaceId(match.id) : undefined,
    nap: {
      name: match.name,
      address: match.address,
    },
  };
}
