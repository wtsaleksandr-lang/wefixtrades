/**
 * Generates a Google review URL from a Google place_id.
 * Returns null if place_id is missing or empty.
 */
export function generateGoogleReviewLink(placeId: string | null | undefined): string | null {
  if (!placeId || !placeId.trim()) return null;
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId.trim())}`;
}

/**
 * Generates a Facebook review URL from a Facebook page URL.
 * Appends /reviews to the page URL. Returns null if not configured.
 */
export function generateFacebookReviewLink(pageUrl: string | null | undefined): string | null {
  if (!pageUrl || !pageUrl.trim()) return null;
  let url = pageUrl.trim().replace(/\/+$/, "");
  if (!url.includes("/reviews")) url += "/reviews";
  return url;
}
