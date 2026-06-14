/**
 * Tests for the Citation Checker business-match logic (accuracy fix
 * 2026-06-13). Proves the matcher no longer counts a directory "found"
 * just because a page on that directory's domain appeared — a wrong-city
 * listing or a category/index page must be demoted to "unverified", not
 * "found".
 *
 * Excluded from `tsc --noEmit` (tsconfig excludes **\/*.test.ts).
 * Runnable standalone via:
 *
 *   npx tsx server/routes/citationMatch.test.ts
 *
 * Same dependency-free pattern as serpRankProvider.test.ts: node's
 * `assert/strict`, no test runner. No network — classifyCitationHit is a
 * pure function over an in-memory organic-results array.
 */

import assert from "node:assert/strict";

// freeToolsRoutes.ts imports ../db, which throws at import if DATABASE_URL
// is unset. Set a dummy so the lazy Pool can construct (no real connection).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/test_unused";
}

const { classifyCitationHit } = await import("./freeToolsRoutes");

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    failed++;
  }
}

const HOUZZ = { domain: "houzz.com" };

console.log("classifyCitationHit");

// 1. Genuine match: name + city both present on a houzz.com page → found.
test("name + city present on directory page → found", () => {
  const organic = [
    {
      link: "https://www.houzz.com/professionals/plumbers/roto-rooter-austin",
      title: "Roto-Rooter Plumbing & Water Cleanup - Austin, TX",
      snippet: "Roto-Rooter in Austin, TX. Reviews, photos, hours.",
    },
  ];
  const r = classifyCitationHit(organic, HOUZZ, "Roto-Rooter", "Austin", "");
  assert.equal(r.status, "found");
  assert.equal(r.url, organic[0].link);
});

// 2. THE BUG: host matches but it's a WRONG-CITY page (Boerne, not Austin)
//    → must NOT be "found"; demote to "unverified".
test("wrong-city directory page is NOT found (unverified)", () => {
  const organic = [
    {
      link: "https://www.houzz.com/professionals/plumbers/roto-rooter-boerne",
      title: "Roto-Rooter Plumbing - Boerne, TX",
      snippet: "Roto-Rooter serving Boerne, TX and surrounding areas.",
    },
  ];
  const r = classifyCitationHit(organic, HOUZZ, "Roto-Rooter", "Austin", "");
  assert.equal(r.status, "unverified", "wrong-city host hit must be unverified, not found");
});

// 3. THE BUG: host matches but it's a category / index page (no business
//    name) → must NOT be "found"; demote to "unverified".
test("category/index page is NOT found (unverified)", () => {
  const organic = [
    {
      link: "https://www.thumbtack.com/tx/austin/plumbing/",
      title: "The 10 Best Plumbers in Austin, TX 2026",
      snippet: "Compare top-rated plumbers in Austin. Get free quotes.",
    },
  ];
  const r = classifyCitationHit(organic, { domain: "thumbtack.com" }, "Roto-Rooter", "Austin", "");
  assert.equal(r.status, "unverified", "category index page must be unverified, not found");
});

// 4. No page on the directory domain at all → missing.
test("no host hit at all → missing", () => {
  const organic = [
    { link: "https://example.com/x", title: "Roto-Rooter Austin", snippet: "" },
  ];
  const r = classifyCitationHit(organic, HOUZZ, "Roto-Rooter", "Austin", "");
  assert.equal(r.status, "missing");
});

// 5. Phone digits present on the host page → strong corroboration → found,
//    even though the city wasn't in the snippet.
test("phone-digits match lifts a host hit to found", () => {
  const organic = [
    {
      link: "https://www.houzz.com/pro/roto-rooter",
      title: "Roto-Rooter Plumbing",
      snippet: "Call us at (512) 555-0182 for service.",
    },
  ];
  const r = classifyCitationHit(organic, HOUZZ, "Roto-Rooter", "Austin", "512-555-0182");
  assert.equal(r.status, "found", "phone NAP match should confirm the listing");
});

// 6. No city supplied + name present → found (city is optional, only
//    constrains when provided).
test("name present, no city supplied → found", () => {
  const organic = [
    {
      link: "https://www.houzz.com/pro/roto-rooter-austin",
      title: "Roto-Rooter Austin",
      snippet: "Roto-Rooter Austin profile.",
    },
  ];
  const r = classifyCitationHit(organic, HOUZZ, "Roto-Rooter", "", "");
  assert.equal(r.status, "found");
});

// 7. Name on page but WRONG city → unverified (city mismatch dominates).
test("name present but city mismatches → unverified", () => {
  const organic = [
    {
      link: "https://www.houzz.com/pro/roto-rooter-dallas",
      title: "Roto-Rooter - Dallas, TX",
      snippet: "Roto-Rooter serving Dallas.",
    },
  ];
  const r = classifyCitationHit(organic, HOUZZ, "Roto-Rooter", "Austin", "");
  assert.equal(r.status, "unverified");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
