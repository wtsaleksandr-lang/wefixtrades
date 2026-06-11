/**
 * T-sweep 2026-06-11 P1 — location→country derivation tests for the Local
 * SERP Checker geo default.
 *
 * The bug: country defaulted to "us" blindly, so "Toronto, Ontario, Canada"
 * returned Baltimore results. The contract under test: the typed location
 * resolves the country when the evidence is unambiguous (Toronto → ca,
 * Denver → us), and AMBIGUOUS input returns null so the caller keeps the
 * current default (us). A wrong confident answer is worse than no answer.
 *
 * Runnable standalone via:
 *   npx tsx shared/locationCountry.test.ts
 * Wired into CI as `npm run check:serp-country` (.github/workflows/ci.yml).
 *
 * Excluded from `tsc --noEmit` via the project tsconfig's **\/*.test.ts
 * pattern. Uses node:assert/strict, no test runner dependency.
 */
import assert from "node:assert/strict";
import {
  deriveCountryFromLocation,
  SERP_SUPPORTED_COUNTRIES,
} from "./locationCountry";

function expectCountry(input: string, want: string | null) {
  const got = deriveCountryFromLocation(input);
  assert.equal(
    got,
    want,
    `deriveCountryFromLocation(${JSON.stringify(input)}) = ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
  );
}

/* ─── 1. The launch cases from the T-sweep finding ─── */
// A Canadian city must produce Canadian results without the user touching
// the country select.
expectCountry("Toronto", "ca");
expectCountry("Toronto, Ontario, Canada", "ca");
expectCountry("toronto, on", "ca");
// A US city stays US.
expectCountry("Denver", "us");
expectCountry("Denver, CO", "us");
// Ambiguous input resolves to null → caller keeps the current default (us).
expectCountry("Springfield", null);
expectCountry("asdfgh", null);
expectCountry("", null);
expectCountry("   ", null);

/* ─── 2. Explicit country mentions win ─── */
expectCountry("Berlin, Germany", "de");
expectCountry("Paris, France", "fr");
expectCountry("Manchester, United Kingdom", "gb");
expectCountry("Manchester, UK", "gb");
expectCountry("Auckland, New Zealand", "nz");
expectCountry("Dublin, Ireland", "ie");
expectCountry("Belfast, Northern Ireland", "gb"); // not ie — false-friend handling
expectCountry("Mexico City", "mx");

/* ─── 3. Postal-code evidence ─── */
expectCountry("M5V 2T6", "ca"); // full Canadian postal
expectCountry("Toronto M5V2T6", "ca"); // compact form
expectCountry("M5V", "ca"); // FSA alone
expectCountry("90210", "us"); // ZIP
expectCountry("Chicago, IL 60614", "us");
expectCountry("90219-1234", "us"); // ZIP+4

/* ─── 4. Province/state evidence — last (most general) token wins ─── */
expectCountry("Calgary, Alberta", "ca");
expectCountry("Whistler, British Columbia", "ca");
expectCountry("Montréal, QC", "ca"); // diacritics normalized
expectCountry("Phoenix, Arizona", "us");
expectCountry("Ontario, California", "us"); // the Ontario-the-city trap
expectCountry("Vancouver, WA", "us"); // Vancouver, Washington — not BC
expectCountry("Albuquerque, New Mexico", "us"); // not mx — false-friend handling

/* ─── 5. Unambiguous city names ─── */
expectCountry("Vancouver", "ca");
expectCountry("Mississauga", "ca");
expectCountry("Halifax", "ca");
expectCountry("Saskatoon", "ca");
expectCountry("downtown Toronto", "ca");
expectCountry("Seattle", "us");
expectCountry("Baltimore", "us");

/* ─── 6. Genuinely ambiguous city names stay null (caller default) ─── */
expectCountry("London", null); // London ON vs London UK
expectCountry("Sydney", null); // Sydney NS vs Sydney AU
expectCountry("Hamilton", null); // Hamilton ON vs Hamilton NZ
expectCountry("Victoria", null); // Victoria BC vs Victoria AU
expectCountry("Windsor", null); // Windsor ON vs Windsor UK

/* ─── 7. "City, CA" — ambiguous code resolved by the city, never guessed ─── */
expectCountry("Toronto, CA", "ca"); // Canadian city → Canada
expectCountry("Los Angeles, CA", "us"); // US city → California
expectCountry("Modesto, CA", null); // unknown city + bare "ca" → caller default

/* ─── 8. Derivation only ever returns supported codes ─── */
const supported = new Set<string>(SERP_SUPPORTED_COUNTRIES);
for (const probe of [
  "Toronto", "Denver", "Paris, France", "Tokyo, Japan", "Mumbai, India",
  "São Paulo, Brazil", "Cape Town, South Africa", "Dubai",
]) {
  const got = deriveCountryFromLocation(probe);
  assert.ok(
    got === null || supported.has(got),
    `derivation returned unsupported code ${got} for ${probe}`,
  );
}

console.log("locationCountry.test.ts — all assertions passed");
