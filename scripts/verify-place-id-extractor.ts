/**
 * Self-contained verification of shared/utils/googlePlaceId.ts.
 *
 * Run with: npx tsx scripts/verify-place-id-extractor.ts
 *
 * No DB / network required. Exit code 0 on all green, 1 on any failure.
 */

import { extractPlaceId, normalizePlaceIdOrPassthrough } from "../shared/utils/googlePlaceId";

let passed = 0;
let failed = 0;

function assert(label: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`  ✓ ${label}${detail ? ` (${detail})` : ""}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ` (${detail})` : ""}`); failed++; }
}

console.log("\n[1] Bare ChIJ ids");
{
  const r = extractPlaceId("ChIJN1t_tDeuEmsRUsoyG83frY4");
  assert("clean id passes through", r.placeId === "ChIJN1t_tDeuEmsRUsoyG83frY4" && r.reason === "already_clean", r.placeId || "");
}
{
  const r = extractPlaceId('  "ChIJN1t_tDeuEmsRUsoyG83frY4"  ');
  assert("trims whitespace + surrounding quotes", r.placeId === "ChIJN1t_tDeuEmsRUsoyG83frY4");
}

console.log("\n[2] place_id query-param URLs");
{
  const r = extractPlaceId("https://www.google.com/maps/place/?q=place_id:ChIJN1t_tDeuEmsRUsoyG83frY4");
  assert("extracts from /?q=place_id: form", r.placeId === "ChIJN1t_tDeuEmsRUsoyG83frY4" && r.reason === "extracted_from_query_param");
}
{
  const r = extractPlaceId("place_id:ChIJN1t_tDeuEmsRUsoyG83frY4");
  assert("extracts from bare place_id: prefix", r.placeId === "ChIJN1t_tDeuEmsRUsoyG83frY4");
}

console.log("\n[3] Maps URL with data-segment hex pair");
{
  const url = "https://www.google.com/maps/place/Acme+Plumbing/@-33.8688,151.2093,17z/data=!3m1!4b1!4m6!3m5!1s0x6b12ae401e8b50c9:0xabc123def456!8m2!3d-33.8688!4d151.2093";
  const r = extractPlaceId(url);
  assert("extracts hex:hex from /data=!1s...:... segment",
    r.placeId === "0x6b12ae401e8b50c9:0xabc123def456" && r.reason === "extracted_from_data_segment",
    r.placeId || "");
}
{
  // Mixed-case hex right half without 0x prefix (we've seen this in the wild)
  const url = "https://www.google.com/maps/place/Foo/@1,2,17z/data=!4m1!1s0xabcd:DEF0!8m2";
  const r = extractPlaceId(url);
  assert("normalises hex pair to lowercase + 0x prefix", r.placeId === "0xabcd:0xdef0", r.placeId || "");
}

console.log("\n[4] Short URLs (need server-side expansion)");
{
  const r = extractPlaceId("https://maps.app.goo.gl/abc123XYZ");
  assert("flags short URL as needing expansion", r.placeId === null && r.reason === "short_url_needs_expansion");
}
{
  const r = extractPlaceId("https://goo.gl/maps/abc123");
  assert("flags legacy short URL", r.placeId === null && r.reason === "short_url_needs_expansion");
}

console.log("\n[5] CID URLs");
{
  const r = extractPlaceId("https://maps.google.com/?cid=12345678901234567890");
  assert("flags cid= URL as unsupported", r.placeId === null && r.reason === "cid_url_unsupported");
}

console.log("\n[6] Empty / garbage inputs");
{
  assert("empty string", extractPlaceId("").placeId === null);
  assert("whitespace only", extractPlaceId("   \t\n").placeId === null);
  assert("null input", extractPlaceId(null).placeId === null);
  assert("undefined input", extractPlaceId(undefined).placeId === null);
  assert("number input", extractPlaceId(12345 as any).placeId === null);
}
{
  const r = extractPlaceId("not a maps url at all");
  assert("garbage URL → unrecognized", r.placeId === null && r.reason === "unrecognized");
}

console.log("\n[7] normalizePlaceIdOrPassthrough");
{
  assert("clean id passes through", normalizePlaceIdOrPassthrough("ChIJabc123def456ghi789") === "ChIJabc123def456ghi789");
  const url = "https://www.google.com/maps/place/?q=place_id:ChIJN1t_tDeuEmsRUsoyG83frY4";
  assert("URL → cleaned id", normalizePlaceIdOrPassthrough(url) === "ChIJN1t_tDeuEmsRUsoyG83frY4");
  assert("garbage preserved (not silently dropped)", normalizePlaceIdOrPassthrough("not a url") === "not a url");
  assert("empty → null", normalizePlaceIdOrPassthrough("") === null);
  assert("non-string → null", normalizePlaceIdOrPassthrough(42) === null);
}

console.log(`\n${"=".repeat(50)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
