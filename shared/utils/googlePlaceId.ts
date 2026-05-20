/**
 * Google Place ID extraction.
 *
 * Admins frequently paste a full Google Maps URL when they meant to paste
 * a clean ChIJ... place_id. The Places v1 API rejects the URL form, so
 * downstream MapGuard scans + ReputationShield review polling silently
 * fail. This helper normalises every form we've seen in the wild.
 *
 * Supported inputs:
 *   - Bare place_id (`ChIJN1t_tDeuEmsRUsoyG83frY4`)
 *   - Place-ID-encoded URL (`...?q=place_id:ChIJ...`)
 *   - Full Maps URL with data segment (`/data=!...!1s<hex>:<hex>...`) —
 *     the `<hex>:<hex>` pair IS a valid place reference for the v1 API.
 *   - Surrounding whitespace / quotes
 *
 * Inputs that need server-side expansion (we surface a reason for ops):
 *   - maps.app.goo.gl short URLs
 *   - `?cid=<n>` Customer-ID URLs
 *
 * Pure function — no I/O, safe to import from server and client.
 */

export type PlaceIdExtraction = {
  /** Normalised place_id (ChIJ... or hex:hex) ready to pass to Places API. */
  placeId: string | null;
  /** When placeId is null OR was rewritten, why. Useful for ops/UI messaging. */
  reason?:
    | "empty"
    | "already_clean"
    | "extracted_from_query_param"
    | "extracted_from_data_segment"
    | "short_url_needs_expansion"
    | "cid_url_unsupported"
    | "unrecognized";
};

/** Bare ChIJ-style place_id. The leading char is always `C`, then a 26+ char base64-ish blob. */
const RE_BARE_CHIJ = /^[A-Za-z0-9_-]{20,}$/;

/** `place_id:ChIJ...` segment, anchored or inside a URL query. */
const RE_PLACE_ID_PARAM = /place_id:([A-Za-z0-9_-]{20,})/;

/**
 * The data-segment hex pair. Maps URLs encode the place reference as
 * `!1s<hex>:<hex>` inside `data=!...`. Both halves are 0x-prefixed in raw
 * form but the URL strips the prefix on the second half sometimes; we
 * normalise to lowercase 0x-prefixed.
 */
const RE_DATA_HEX_PAIR = /!1s(0x[0-9a-fA-F]+):(0x[0-9a-fA-F]+|[0-9a-fA-F]+)/;

const RE_SHORT_URL = /(?:^|\/\/)(?:maps\.app\.goo\.gl|goo\.gl\/maps)\//i;
const RE_CID_URL = /[?&]cid=\d+/i;

export function extractPlaceId(input: unknown): PlaceIdExtraction {
  if (typeof input !== "string") return { placeId: null, reason: "empty" };

  // Trim whitespace and strip surrounding quotes (admins often copy with
  // a wrapping " or ' from spreadsheets).
  const trimmed = input.trim().replace(/^["'\s]+|["'\s]+$/g, "");
  if (!trimmed) return { placeId: null, reason: "empty" };

  // 1. Already a clean ChIJ-style id.
  if (RE_BARE_CHIJ.test(trimmed) && !trimmed.includes("/") && !trimmed.includes("?")) {
    return { placeId: trimmed, reason: "already_clean" };
  }

  // 2. URL with `place_id:ChIJ...` (Maps' canonical share format).
  const paramMatch = trimmed.match(RE_PLACE_ID_PARAM);
  if (paramMatch) {
    return { placeId: paramMatch[1], reason: "extracted_from_query_param" };
  }

  // 3. Maps URL with data-segment hex pair.
  const dataMatch = trimmed.match(RE_DATA_HEX_PAIR);
  if (dataMatch) {
    const left = dataMatch[1].toLowerCase();
    const right = dataMatch[2].toLowerCase().startsWith("0x")
      ? dataMatch[2].toLowerCase()
      : `0x${dataMatch[2].toLowerCase()}`;
    return { placeId: `${left}:${right}`, reason: "extracted_from_data_segment" };
  }

  // 4. Forms that need a server-side HTTP follow (we don't fetch from a
  // pure helper). Surface the reason so the calling code can fail loudly.
  if (RE_SHORT_URL.test(trimmed)) {
    return { placeId: null, reason: "short_url_needs_expansion" };
  }
  if (RE_CID_URL.test(trimmed)) {
    return { placeId: null, reason: "cid_url_unsupported" };
  }

  return { placeId: null, reason: "unrecognized" };
}

/**
 * Convenience wrapper for ingestion paths (storage layer, route handlers):
 * returns the cleaned id or the original string if extraction failed,
 * never throws. Use {@link extractPlaceId} when you need the reason.
 */
export function normalizePlaceIdOrPassthrough(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const { placeId } = extractPlaceId(input);
  if (placeId) return placeId;
  // Preserve unrecognised non-empty input so existing data isn't silently
  // dropped. Callers that want strict validation should call
  // extractPlaceId directly and inspect `reason`.
  const trimmed = input.trim();
  return trimmed || null;
}
