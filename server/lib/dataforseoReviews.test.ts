/**
 * dataforseoReviews.test.ts — guard for the DataForSEO-primary review chain.
 *
 * Proves three contracts (DB-free, network-STUBBED):
 *   1. A REAL-shaped DataForSEO review item maps to the Outscraper raw shape
 *      and survives normalizeReview() with correct fields (text, rating,
 *      author, time, externalId, owner response).
 *   2. A REAL-shaped Places Details review maps correctly too.
 *   3. DELIBERATE FAILURE: a malformed/empty DataForSEO response makes the
 *      chain FALL THROUGH to Places (and then Outscraper) instead of
 *      throwing — the graceful-degrade contract the worker depends on.
 *
 * The fixtures below are the actual response shapes verified LIVE against the
 * production DataForSEO + Google Places creds on 2026-06-14 (McDonald's Times
 * Square), trimmed to the fields the adapter reads.
 *
 * Runnable standalone via:  npx tsx server/lib/dataforseoReviews.test.ts
 * Wired into CI as `npm run check:reviews-providers` (.github/workflows/ci.yml).
 *
 * Excluded from `tsc --noEmit` via the project tsconfig's **\/*.test.ts pattern.
 */
import assert from "node:assert/strict";
import {
  mapDataForSeoReview,
  mapPlacesReview,
  fetchGoogleReviewsChained,
} from "./dataforseoReviews";
import { normalizeReview } from "./outscraper";
import type { OutscraperReview } from "./outscraper";

/* ─── Fixtures (verified-live shapes) ─── */

// One real DataForSEO Business-Data Google-reviews item.
const DFS_ITEM = {
  type: "google_reviews_search",
  rank_absolute: 1,
  review_text: "Rubber chicken, barely cooked. Horrible service.",
  timestamp: "2025-11-17 13:48:47 +00:00",
  rating: { rating_type: "Max5", value: 1, votes_count: null, rating_max: 5 },
  profile_name: "Breanna Blackwell",
  owner_answer: "Sorry to hear that — please contact us.",
  owner_timestamp: "2025-11-20 09:00:00 +00:00",
  review_id: "Ci9DQUlRQUNvZENodHljRjlvT2poS2VubGpkVTgwWWxZdFUwWTRTMGRsVEdObk5XYxAB",
  review_url: "https://www.google.com/maps/reviews/data=xyz",
  images: [{ image_url: "https://lh3.googleusercontent.com/img1" }],
};

// One real Places (New) Details review.
const PLACES_REVIEW = {
  name: "places/ChIJabc/reviews/Ci9rev123",
  rating: 5,
  text: { text: "Great spot, fast service.", languageCode: "en" },
  authorAttribution: { displayName: "Jane Q" },
  publishTime: "2026-01-02T10:00:00Z",
  googleMapsUri: "https://www.google.com/maps/reviews/data=abc",
};

/* ─── Tests ─── */

function testDataForSeoMapping() {
  const raw = mapDataForSeoReview(DFS_ITEM);
  const n = normalizeReview(raw);
  assert.equal(n.reviewText, "Rubber chicken, barely cooked. Horrible service.", "DFS reviewText");
  assert.equal(n.rating, 1, "DFS rating from rating.value");
  assert.equal(n.reviewerName, "Breanna Blackwell", "DFS author from profile_name");
  assert.equal(
    n.externalId,
    "Ci9DQUlRQUNvZENodHljRjlvT2poS2VubGpkVTgwWWxZdFUwWTRTMGRsVEdObk5XYxAB",
    "DFS externalId from review_id",
  );
  assert.ok(n.publishedAt instanceof Date && !isNaN(n.publishedAt.getTime()), "DFS publishedAt parsed");
  assert.equal(n.responseText, "Sorry to hear that — please contact us.", "DFS owner_answer → responseText");
  assert.ok(n.responseDate instanceof Date && !isNaN(n.responseDate.getTime()), "DFS owner_timestamp → responseDate");
  console.log("  ok: DataForSEO item maps to normalized shape");
}

function testPlacesMapping() {
  const raw = mapPlacesReview(PLACES_REVIEW);
  const n = normalizeReview(raw);
  assert.equal(n.reviewText, "Great spot, fast service.", "Places reviewText from text.text");
  assert.equal(n.rating, 5, "Places rating");
  assert.equal(n.reviewerName, "Jane Q", "Places author from authorAttribution.displayName");
  assert.equal(n.externalId, "places/ChIJabc/reviews/Ci9rev123", "Places externalId from name");
  assert.ok(n.publishedAt instanceof Date && !isNaN(n.publishedAt.getTime()), "Places publishedAt parsed");
  assert.equal(n.responseText, null, "Places has no owner response");
  console.log("  ok: Places item maps to normalized shape");
}

async function testChainPrimarySucceeds() {
  // DataForSEO returns reviews → chain serves dataforseo, never touches others.
  let placesCalled = false;
  let outscraperCalled = false;
  const res = await fetchGoogleReviewsChained(
    { placeId: "PID", businessName: "Joe's Plumbing", locationLabel: "Toronto,Ontario,Canada" },
    {
      dataforseo: async () => [mapDataForSeoReview(DFS_ITEM)],
      places: async () => {
        placesCalled = true;
        return [mapPlacesReview(PLACES_REVIEW)];
      },
      outscraper: async () => {
        outscraperCalled = true;
        return [];
      },
    },
  );
  assert.equal(res.provider, "dataforseo", "chain serves dataforseo when it returns data");
  assert.equal(res.reviews.length, 1, "chain returns the dataforseo reviews");
  assert.equal(placesCalled, false, "places NOT called when dataforseo succeeds");
  assert.equal(outscraperCalled, false, "outscraper NOT called when dataforseo succeeds");
  console.log("  ok: chain serves DataForSEO as primary");
}

async function testChainFallsThroughOnFailure() {
  // DELIBERATE FAILURE: DataForSEO returns null (malformed/empty/timeout).
  // Contract: fall through to Places, NOT throw.
  let outscraperCalled = false;
  const res = await fetchGoogleReviewsChained(
    { placeId: "PID", businessName: "Joe's Plumbing", locationLabel: "Toronto,Ontario,Canada" },
    {
      dataforseo: async () => null, // simulated failure
      places: async () => [mapPlacesReview(PLACES_REVIEW)],
      outscraper: async () => {
        outscraperCalled = true;
        return [];
      },
    },
  );
  assert.equal(res.provider, "places", "chain falls through to places when dataforseo fails");
  assert.equal(res.reviews.length, 1, "chain returns the places reviews");
  assert.equal(outscraperCalled, false, "outscraper NOT reached when places succeeds");
  console.log("  ok: chain falls through DataForSEO failure → Places");
}

async function testChainFallsThroughToOutscraper() {
  // DataForSEO null AND Places empty → last-resort Outscraper.
  const res = await fetchGoogleReviewsChained(
    { placeId: "PID", businessName: "Joe's Plumbing", locationLabel: "Toronto,Ontario,Canada" },
    {
      dataforseo: async () => null,
      places: async () => [], // empty → fall through
      outscraper: async () => [mapDataForSeoReview(DFS_ITEM)] as OutscraperReview[],
    },
  );
  assert.equal(res.provider, "outscraper", "chain reaches outscraper as last resort");
  assert.equal(res.reviews.length, 1, "chain returns outscraper reviews");
  console.log("  ok: chain falls through to Outscraper last");
}

async function testChainAllFailGracefully() {
  // Every provider empty/null → { reviews: [], provider: "none" }, no throw.
  const res = await fetchGoogleReviewsChained(
    { placeId: "PID", businessName: "Joe's Plumbing", locationLabel: "Toronto,Ontario,Canada" },
    {
      dataforseo: async () => null,
      places: async () => null,
      outscraper: async () => null,
    },
  );
  assert.equal(res.provider, "none", "all-fail → provider none");
  assert.equal(res.reviews.length, 0, "all-fail → no reviews");
  console.log("  ok: chain degrades gracefully when all providers fail");
}

async function main() {
  // Ensure the env gates in the chain are satisfied so the injected stubs run.
  process.env.DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN || "test-login";
  process.env.DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD || "test-pass";
  process.env.GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "test-key";
  process.env.OUTSCRAPER_API_KEY = process.env.OUTSCRAPER_API_KEY || "test-os";

  testDataForSeoMapping();
  testPlacesMapping();
  await testChainPrimarySucceeds();
  await testChainFallsThroughOnFailure();
  await testChainFallsThroughToOutscraper();
  await testChainAllFailGracefully();
  console.log("All dataforseoReviews provider-chain tests passed.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
