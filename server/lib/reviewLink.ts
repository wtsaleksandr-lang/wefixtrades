/**
 * Generates a Google review URL from a Google place_id.
 * Returns null if place_id is missing or empty.
 */
export function generateGoogleReviewLink(placeId: string | null | undefined): string | null {
  if (!placeId || !placeId.trim()) return null;
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId.trim())}`;
}
