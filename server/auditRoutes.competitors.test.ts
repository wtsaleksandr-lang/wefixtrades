/**
 * Verified same-niche local competitor tests (fix/audit-competitor-verify).
 *
 * The free-audit's E1 competitor block used to trust Places/Outscraper results
 * blindly — the only filter was exact-name dedup. That surfaced wrong-niche
 * businesses, let the subject business appear in its own competitor list (when
 * the name differed slightly, e.g. "Bob's Plumbing" vs "Bob's Plumbing Ltd."),
 * never bounded distance, and picked the marketLeader by composite score while
 * the report's rank + review-gap narrative are reviewsCount-based — so the named
 * "leader" could be someone the user already out-reviews.
 *
 * This guards the reconciliation:
 *   (a) competitors are filtered to the genuine same niche (wrong-type dropped);
 *   (b) the subject business is excluded by exact placeId (not just name);
 *   (c) every competitor carries a `category` + `distanceKm`, out-of-radius dropped;
 *   (d) marketLeader is the HIGHEST-reviewsCount competitor (agrees with rank);
 *   (e) detectTrade prefers Places primaryType and is word-bounded (Electrolux
 *       Appliance Repair is NOT electrical; Pipeline Logistics is NOT plumbing).
 *
 * Runnable standalone:  npx tsx server/auditRoutes.competitors.test.ts
 * Wired into CI as `npm run check:audit-competitors`.
 *
 * DB-free: auditRoutes.ts transitively imports server/db, which throws at
 * module-eval when DATABASE_URL is unset. We set a dummy URL FIRST, THEN
 * dynamically import. globalThis.fetch is stubbed so no real network call runs.
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 */
import assert from "node:assert/strict";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://audit:audit@127.0.0.1:1/audit_no_connect";
}
process.env.GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "test-key-not-used";

/** Build a Places API response from a list of place stubs. */
function placesResponse(places: any[]): Response {
  return new Response(JSON.stringify({ places }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function main() {
  const { detectTrade } = await import("./auditRoutes");
  const {
    fetchPlacesCompetitors,
    isSameNiche,
    haversineKm,
    matchesNationalBrand,
    isOutOfLeague,
  } = await import("./services/competitorSearch");

  /* ─── isSameNiche: trade type-intersection + token fallback ─── */
  {
    // Known trade → require Places-type intersection.
    assert.equal(isSameNiche("plumbing", ["plumber"], "plumber"), true, "plumber type matches plumbing");
    assert.equal(
      isSameNiche("plumbing", ["hardware_store"], "hardware_store"),
      false,
      "a hardware store is NOT a plumbing competitor",
    );
    assert.equal(
      isSameNiche("electrical", ["home_goods_store", "store"], "home_goods_store"),
      false,
      "an appliance/home-goods store is NOT an electrical competitor",
    );
    assert.equal(isSameNiche("electrical", ["electrician"], "electrician"), true, "electrician matches electrical");
    // No type signal at all → fall back to name token overlap (don't drop blindly).
    assert.equal(
      isSameNiche("plumbing", [], null, "Joe's Plumbing & Drain"),
      true,
      "no type signal but the name says plumbing → kept via token fallback",
    );
    // Derived/general category → token overlap on type strings.
    assert.equal(
      isSameNiche("freight forwarding service", ["freight_forwarding_service"], "freight_forwarding_service"),
      true,
      "general category matches via token overlap",
    );
    assert.equal(
      isSameNiche("freight forwarding service", ["restaurant"], "restaurant"),
      false,
      "a restaurant is not a freight forwarder",
    );
  }

  /* ─── haversineKm: sanity ─── */
  {
    // Toronto to Mississauga ~26 km.
    const d = haversineKm({ lat: 43.6532, lng: -79.3832 }, { lat: 43.589, lng: -79.6441 });
    assert.ok(d > 20 && d < 35, `Toronto→Mississauga ≈ 26km, got ${d}`);
    assert.equal(+haversineKm({ lat: 1, lng: 1 }, { lat: 1, lng: 1 }).toFixed(2), 0, "same point = 0km");
  }

  /* ─── fetchPlacesCompetitors: niche filter + placeId self-exclude + distance +
         reconciled marketLeader ─── */
  {
    const subjectCoords = { lat: 43.6532, lng: -79.3832 }; // downtown Toronto
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return placesResponse([
        // The SUBJECT itself, slightly different name — must be excluded by placeId.
        {
          id: "SUBJECT_ID",
          displayName: { text: "Bob's Plumbing Ltd." },
          rating: 4.6,
          userRatingCount: 999, // would corrupt areaAverage + be a false leader
          primaryType: "plumber",
          types: ["plumber"],
          formattedAddress: "1 Self St",
          location: { latitude: 43.6532, longitude: -79.3832 },
        },
        // Wrong niche — a hardware store that merely ranks for "plumbing supplies".
        {
          id: "HW_ID",
          displayName: { text: "Megastore Hardware" },
          rating: 4.2,
          userRatingCount: 500,
          primaryType: "hardware_store",
          types: ["hardware_store", "store"],
          location: { latitude: 43.66, longitude: -79.39 },
        },
        // Out of radius (~140km away) — dropped by distance.
        {
          id: "FAR_ID",
          displayName: { text: "Faraway Plumbing" },
          rating: 4.9,
          userRatingCount: 800,
          primaryType: "plumber",
          types: ["plumber"],
          location: { latitude: 44.9, longitude: -79.38 },
        },
        // Genuine local competitor — fewer reviews.
        {
          id: "LOCAL_A",
          displayName: { text: "Acme Plumbing" },
          rating: 4.4,
          userRatingCount: 120,
          primaryType: "plumber",
          types: ["plumber"],
          websiteUri: "https://acme.example",
          location: { latitude: 43.66, longitude: -79.40 },
        },
        // Genuine local competitor — MOST reviews → must be marketLeader.
        {
          id: "LOCAL_B",
          displayName: { text: "Best Plumbing Co" },
          rating: 4.3, // lower rating, but more reviews
          userRatingCount: 300,
          primaryType: "plumber",
          types: ["plumber"],
          location: { latitude: 43.65, longitude: -79.37 },
        },
      ]);
    }) as any;

    try {
      const res = await fetchPlacesCompetitors(
        "plumbing",
        "Toronto",
        "Bob's Plumbing", // subject name differs from the Places displayName
        "ON",
        subjectCoords,
        "SUBJECT_ID",
      );

      const names = res.competitors.map((c) => c.name);
      assert.ok(!names.includes("Bob's Plumbing Ltd."), "subject excluded by placeId despite name mismatch");
      assert.ok(!names.includes("Megastore Hardware"), "wrong-niche hardware store dropped");
      assert.ok(!names.includes("Faraway Plumbing"), "out-of-radius competitor dropped by distance");
      assert.deepEqual(
        names.sort(),
        ["Acme Plumbing", "Best Plumbing Co"].sort(),
        "only genuine same-niche local competitors remain",
      );

      // Every competitor exposes the new UI fields.
      for (const c of res.competitors) {
        assert.equal(typeof c.category, "string", "category is exposed");
        assert.ok(c.category.length > 0, "category is non-empty");
        assert.ok(typeof c.distanceKm === "number" && c.distanceKm >= 0, "distanceKm computed");
        assert.ok(c.distanceKm! <= 30, "kept competitors are within the 30km radius");
      }

      // marketLeader is the highest-reviewsCount competitor (NOT highest score) —
      // reconciles with the report's reviewsCount-based rank + gap narrative.
      assert.ok(res.marketLeader, "marketLeader present");
      assert.equal(res.marketLeader!.name, "Best Plumbing Co", "leader is the most-reviewed competitor");
      assert.equal(res.marketLeader!.reviewsCount, 300, "leader has the max reviewsCount");
      const maxReviews = Math.max(...res.competitors.map((c) => c.reviewsCount));
      assert.equal(res.marketLeader!.reviewsCount, maxReviews, "leader == argmax(reviewsCount)");

      // areaAverageReviews is computed over the KEPT competitors only (not the
      // 999-review subject) → (120 + 300) / 2 = 210.
      assert.equal(res.areaAverageReviews, 210, "area average excludes the self-listed subject");
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  /* ─── Empty-after-filter: all results wrong-niche → empty (suppress, not junk) ─── */
  {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      placesResponse([
        { id: "X1", displayName: { text: "Tasty Tacos" }, rating: 4.8, userRatingCount: 90, primaryType: "restaurant", types: ["restaurant"], location: { latitude: 43.65, longitude: -79.38 } },
        { id: "X2", displayName: { text: "City Bank" }, rating: 3.1, userRatingCount: 40, primaryType: "bank", types: ["bank"], location: { latitude: 43.66, longitude: -79.39 } },
      ])) as any;
    try {
      const res = await fetchPlacesCompetitors("plumbing", "Toronto", "Bob's Plumbing", "ON", { lat: 43.65, lng: -79.38 }, "S");
      assert.equal(res.competitors.length, 0, "all wrong-niche → empty competitor set (suppressed, not junk)");
      assert.equal(res.marketLeader, null, "no leader when no genuine competitors");
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  /* ─── detectTrade: prefers Places primaryType + word-bounded names ─── */
  {
    // primaryType wins over a misleading name substring.
    assert.equal(
      detectTrade("Electrolux Appliance Repair", ["home_goods_store", "store"], "appliance_store" as any),
      "general",
      "appliance store is NOT classed electrical from the 'electr' substring",
    );
    // A real electrician (Places type) is detected.
    assert.equal(detectTrade("Spark Co", ["electrician"], "electrician"), "electrical", "electrician primaryType → electrical");
    // Word-bounded: "Pipeline Logistics" must NOT be plumbing ('pipe' inside 'pipeline').
    assert.equal(
      detectTrade("Pipeline Logistics Inc", [], null),
      "general",
      "'Pipeline' is not a plumbing trade (word-bounded pipe)",
    );
    // But a genuine "Pro Pipe Plumbing" IS plumbing.
    assert.equal(detectTrade("Pro Pipe Plumbing", [], null), "plumbing", "real plumbing name still detected");
    // Word-bounded short keys: "Turnkey Builders" must NOT be a locksmith ('key').
    assert.equal(detectTrade("Turnkey Builders", [], null), "general", "'Turnkey' is not a locksmith");
    // Real electrician name still detected (electrician/electrical roots).
    assert.equal(detectTrade("Bright Electric", [], null), "electrical", "'Electric' name → electrical");
    // "Remove It Junk" must NOT be a moving company ('mov' inside 'remove').
    assert.equal(detectTrade("Remove It Junk", [], null), "general", "'Remove' is not a moving company");
  }

  /* ─── Peer-relevance: national-brand name matching (word-bounded) ─── */
  {
    assert.equal(matchesNationalBrand("FedEx Freight"), true, "FedEx is a national brand");
    assert.equal(matchesNationalBrand("DHL Express Mississauga"), true, "DHL is a national brand");
    assert.equal(matchesNationalBrand("UPS Store #1234"), true, "UPS is a national brand");
    assert.equal(matchesNationalBrand("Purolator Inc"), true, "Purolator is a national brand");
    assert.equal(matchesNationalBrand("Roto-Rooter Plumbing"), true, "Roto-Rooter franchise");
    assert.equal(matchesNationalBrand("The Home Depot"), true, "Home Depot big-box");
    // Word-bounded: must NOT false-positive on substrings.
    assert.equal(matchesNationalBrand("Upstate Plumbing"), false, "'Upstate' must not match 'ups'");
    assert.equal(matchesNationalBrand("Upscale Movers"), false, "'Upscale' must not match a brand");
    assert.equal(matchesNationalBrand("Access Air Mississauga"), false, "a small local forwarder is not a brand");
    assert.equal(matchesNationalBrand("Joe's Local Plumbing"), false, "a normal local name is not a brand");
  }

  /* ─── Peer-relevance: size-tier (absolute + extreme-ratio), biased to KEEP ─── */
  {
    // Absolute ceiling: a 12000-review competitor is out-of-league regardless of subject.
    assert.equal(isOutOfLeague({ name: "Big Co", reviewsCount: 12000 }, 50).out, true, "12k reviews → out of league");
    // A busy LOCAL leader (450 reviews) vs a brand-new subject (3) must be KEPT —
    // 450 ≥ 40× but below the 1000 ratio floor → not a giant.
    assert.equal(isOutOfLeague({ name: "Busy Local Plumber", reviewsCount: 450 }, 3).out, false, "450-review local leader KEPT vs new subject");
    // Even a 900-review local independent stays (below absolute ceiling + ratio floor).
    assert.equal(isOutOfLeague({ name: "Established Local", reviewsCount: 900 }, 10).out, false, "900-review local KEPT");
    // Extreme ratio + high floor: 2000 reviews vs a 5-review subject (400×) and ≥1000 → giant.
    assert.equal(isOutOfLeague({ name: "Regional Giant", reviewsCount: 2000 }, 5).out, true, "2000 reviews, 400x ratio, ≥1000 floor → out");
    // Brand always wins even with modest reviews.
    assert.equal(isOutOfLeague({ name: "FedEx Office", reviewsCount: 60 }, 40).out, true, "national brand out regardless of reviews");
  }

  /* ─── Peer-relevance end-to-end: Access Air case (drop FedEx/DHL/UPS/Purolator,
         keep peer-sized local forwarders, marketLeader is a peer) ─── */
  {
    const subjectCoords = { lat: 43.589, lng: -79.6441 }; // Mississauga
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      placesResponse([
        // National giants — same niche, nearby, but OUT of league.
        { id: "FEDEX", displayName: { text: "FedEx Ship Centre" }, rating: 3.8, userRatingCount: 14000, primaryType: "freight_forwarding_service", types: ["freight_forwarding_service"], location: { latitude: 43.6, longitude: -79.65 } },
        { id: "DHL", displayName: { text: "DHL Express" }, rating: 3.5, userRatingCount: 9000, primaryType: "freight_forwarding_service", types: ["freight_forwarding_service"], location: { latitude: 43.61, longitude: -79.64 } },
        { id: "UPS", displayName: { text: "UPS Customer Center" }, rating: 3.2, userRatingCount: 6500, primaryType: "freight_forwarding_service", types: ["freight_forwarding_service"], location: { latitude: 43.62, longitude: -79.63 } },
        { id: "PURO", displayName: { text: "Purolator" }, rating: 3.0, userRatingCount: 4200, primaryType: "freight_forwarding_service", types: ["freight_forwarding_service"], location: { latitude: 43.59, longitude: -79.66 } },
        // Peer-sized local forwarders — IN league.
        { id: "PEER_A", displayName: { text: "Maple Freight Forwarders" }, rating: 4.5, userRatingCount: 80, primaryType: "freight_forwarding_service", types: ["freight_forwarding_service"], location: { latitude: 43.6, longitude: -79.62 } },
        { id: "PEER_B", displayName: { text: "GTA Cargo Logistics" }, rating: 4.6, userRatingCount: 140, primaryType: "freight_forwarding_service", types: ["freight_forwarding_service"], location: { latitude: 43.58, longitude: -79.63 } },
      ])) as any;
    try {
      const res = await fetchPlacesCompetitors(
        "freight forwarding service",
        "Mississauga",
        "Access Air",
        "ON",
        subjectCoords,
        "ACCESS_AIR_ID",
        30, // subject's review count
      );
      const names = res.competitors.map((c) => c.name);
      assert.ok(!names.includes("FedEx Ship Centre"), "FedEx dropped from head-to-head");
      assert.ok(!names.includes("DHL Express"), "DHL dropped");
      assert.ok(!names.includes("UPS Customer Center"), "UPS dropped");
      assert.ok(!names.includes("Purolator"), "Purolator dropped");
      assert.deepEqual(names.sort(), ["GTA Cargo Logistics", "Maple Freight Forwarders"].sort(), "only peer forwarders remain");
      assert.ok(res.marketLeader, "marketLeader present");
      assert.equal(res.marketLeader!.name, "GTA Cargo Logistics", "leader is a PEER (most-reviewed peer), not a giant");
      assert.ok((res.marketLeader!.reviewsCount || 0) < 3000, "leader is peer-sized, not a giant");
      // Excluded giants are surfaced as nationalPlayers context, NOT in comparison.
      assert.ok(Array.isArray(res.nationalPlayers), "nationalPlayers list present");
      assert.equal(res.nationalPlayers!.length, 4, "all four giants captured as national players");
      assert.ok(res.nationalPlayers!.every((c) => c.nationalPlayer === true), "giants tagged nationalPlayer");
      // areaAverageReviews is over peers only → (80 + 140) / 2 = 110, not skewed by 14k giant.
      assert.equal(res.areaAverageReviews, 110, "area average over peers only");
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  /* ─── Peer-relevance regression guard: a strong LOCAL leader is NOT dropped ─── */
  {
    const subjectCoords = { lat: 43.6532, lng: -79.3832 };
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      placesResponse([
        // 420-review local plumbing leader — MUST stay (a real competitor).
        { id: "LOCALLEAD", displayName: { text: "Downtown Drain Pros" }, rating: 4.7, userRatingCount: 420, primaryType: "plumber", types: ["plumber"], location: { latitude: 43.66, longitude: -79.39 } },
        { id: "LOCAL_C", displayName: { text: "Riverside Plumbing" }, rating: 4.3, userRatingCount: 95, primaryType: "plumber", types: ["plumber"], location: { latitude: 43.65, longitude: -79.37 } },
      ])) as any;
    try {
      // Subject has only 8 reviews — the 420-review leader is ~52× but below the
      // 1000 floor, so it must NOT be classed a giant.
      const res = await fetchPlacesCompetitors("plumbing", "Toronto", "New Plumber", "ON", subjectCoords, "NEW_ID", 8);
      const names = res.competitors.map((c) => c.name);
      assert.ok(names.includes("Downtown Drain Pros"), "420-review local leader NOT dropped (no regression)");
      assert.equal(res.marketLeader!.name, "Downtown Drain Pros", "local leader is the marketLeader");
      assert.equal((res.nationalPlayers || []).length, 0, "no national players in a normal local market");
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  /* ─── Peer-relevance never over-filters to zero: all-giants → fall back ─── */
  {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      placesResponse([
        { id: "G1", displayName: { text: "FedEx Freight" }, rating: 3.5, userRatingCount: 5000, primaryType: "freight_forwarding_service", types: ["freight_forwarding_service"], location: { latitude: 43.6, longitude: -79.65 } },
        { id: "G2", displayName: { text: "DHL Supply Chain" }, rating: 3.4, userRatingCount: 8000, primaryType: "freight_forwarding_service", types: ["freight_forwarding_service"], location: { latitude: 43.61, longitude: -79.64 } },
      ])) as any;
    try {
      const res = await fetchPlacesCompetitors("freight forwarding service", "Mississauga", "Access Air", "ON", { lat: 43.589, lng: -79.6441 }, "AA", 30);
      // No peers exist → fall back to closest-in-size rather than an empty head-to-head.
      assert.ok(res.competitors.length > 0, "never over-filter to zero — fallback keeps closest-in-size");
      assert.equal(res.competitors[0].name, "FedEx Freight", "fallback surfaces the smallest-by-reviews giant first");
      assert.ok(res.marketLeader, "marketLeader present in fallback");
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  console.log("✓ audit-competitors: all assertions passed");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ audit-competitors test FAILED:", err?.message || err);
    if (err?.stack) console.error(err.stack);
    process.exit(1);
  });
