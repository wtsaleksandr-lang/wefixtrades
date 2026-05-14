/**
 * Validate a Google Place ID before persisting it to a client's reputation
 * config. If we let an invalid place_id through, the review-monitor cron
 * silently fetches zero reviews — a long-tail diagnosis problem that has
 * historically been the #1 cause of "ReputationShield isn't working" tickets.
 *
 * Strategy: call the Place Details endpoint with `fields=place_id,name`
 * (cheapest billable SKU per Google docs). 200 + matching place_id → valid;
 * anything else → invalid with a human-readable reason.
 *
 * If `GOOGLE_MAPS_API_KEY` is not configured we return a soft-pass with a
 * warning so dev environments don't break — callers can decide whether to
 * accept the soft-pass or hard-fail.
 */

export type PlaceValidationResult =
  | { valid: true; placeName: string; placeId: string }
  | { valid: false; reason: string; soft?: boolean };

const FORMAT_OK = /^[A-Za-z0-9_-]+$/;

export async function validateGooglePlaceId(placeId: string): Promise<PlaceValidationResult> {
  const trimmed = (placeId || "").trim();
  if (!trimmed) return { valid: false, reason: "Place ID is empty" };
  if (trimmed.length < 10) return { valid: false, reason: "Place ID looks malformed (too short)" };
  if (!FORMAT_OK.test(trimmed)) {
    return { valid: false, reason: "Place ID contains invalid characters" };
  }

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    // Dev environments without the key: surface but don't block.
    return { valid: false, soft: true, reason: "GOOGLE_MAPS_API_KEY not configured — skipping live validation" };
  }

  const params = new URLSearchParams({
    place_id: trimmed,
    fields: "place_id,name",
    key,
  });

  let resp: Response;
  try {
    resp = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
  } catch (err: any) {
    return { valid: false, soft: true, reason: `Network error reaching Google Places: ${err.message}` };
  }

  if (!resp.ok) {
    return { valid: false, reason: `Google Places returned HTTP ${resp.status}` };
  }

  const data: any = await resp.json().catch(() => ({}));
  const status = data?.status;
  if (status === "OK" && data?.result?.place_id === trimmed) {
    return { valid: true, placeId: trimmed, placeName: data.result.name ?? "" };
  }
  if (status === "NOT_FOUND" || status === "INVALID_REQUEST") {
    return { valid: false, reason: "Google Places: place not found" };
  }
  if (status === "REQUEST_DENIED" || status === "OVER_QUERY_LIMIT") {
    return { valid: false, soft: true, reason: `Google Places API issue: ${status}` };
  }
  return { valid: false, reason: `Google Places returned status "${status ?? "UNKNOWN"}"` };
}
