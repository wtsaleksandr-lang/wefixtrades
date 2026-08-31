#!/usr/bin/env node
/**
 * Guard: the founder's home address must never appear in this repository.
 *
 * `wtsaleksandr-lang/wefixtrades` is a PUBLIC repo. The address, its postal
 * code and its exact lat/lng were hardcoded as the default test fixture right
 * across the roof-quote spike harnesses — including a VISIBLE `<input value>`
 * default in `spikes/roof-quote/map3d.html` and a `SITE={lat,lng}` constant in
 * the PRODUCTION `server/roofQuote/assets/roof3d.html`. A home address in a
 * public repo cannot be un-published, so this is a privacy defect, not a style
 * one. Alex's instruction was unambiguous: it can not be used or shown
 * anywhere.
 *
 * The replacement is `1842 Glencoe St, Denver, CO` — a public test address
 * already used as a fixture throughout these same harnesses.
 *
 * Matching is on the DISTINCTIVE parts only — street name, postal code, and
 * the specific coordinate prefix — so the city on its own ("Hamilton, ON" as a
 * customer's location, a service-area placeholder, a testimonial) stays legal.
 * We are redacting one specific residence, not banning a city. The town of
 * Angus, ON is likewise legal: the street pattern requires a Rd/Road/St
 * suffix, so `.keyword-cache.json`'s "8941 5th Line, Angus, ON" does not trip.
 *
 * NOTE: this guard protects HEAD only. The address remains in ~35 historical
 * commits; purging that needs a history rewrite + force-push, which is Alex's
 * call and has not been authorised.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();

/** Distinctive tokens of the redacted residence. City alone is NOT a match. */
const PATTERNS = [
  { re: /\bangus\s*(road|rd|st)\b/i, what: 'street name' },
  { re: /\bL8K\s*-?\s*6L1\b/i, what: 'postal code' },
  // The exact geocode, and the truncated forms that were also committed
  // (43.219 / -79.782 resolve to the same block).
  { re: /\b43\.2(18|19|20|21|22)\d*\s*,\s*-?\s*79\.78\d*/, what: 'lat,lng pair' },
  { re: /lat\s*:\s*43\.2(18|19|2[0-2])/i, what: 'latitude' },
  { re: /lng\s*:\s*-\s*79\.78/i, what: 'longitude' },
  { re: /\b43\.218978\b/, what: 'exact latitude' },
  { re: /\b-79\.7824607\b/, what: 'exact longitude' },
];

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo',
  'playwright-report', 'test-results', '.vite', 'drizzle-meta', 'audits',
]);

/** Text-ish files worth scanning. Binary/media are skipped. */
const EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.html',
  '.css', '.sql', '.yaml', '.yml', '.txt', '.geojson',
]);

/** This guard necessarily contains the patterns it searches for. */
const SELF = ['scripts', 'check-no-home-address.mjs'].join('/');

const hits = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    const rel = relative(ROOT, full).split(sep).join('/');
    if (rel === SELF) continue;
    const dot = name.lastIndexOf('.');
    if (dot < 0 || !EXT.has(name.slice(dot))) continue;
    if (st.size > 4 * 1024 * 1024) continue;

    let text;
    try {
      text = readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const { re, what } of PATTERNS) {
        if (re.test(lines[i])) {
          hits.push({ file: rel, line: i + 1, what, text: lines[i].trim().slice(0, 120) });
        }
      }
    }
  }
}

walk(ROOT);

if (hits.length) {
  console.error(
    `\n✗ check:no-home-address — the founder's home address appears in ${hits.length} place(s).\n`,
  );
  for (const h of hits) {
    console.error(`  ${h.file}:${h.line}  (${h.what})`);
    console.error(`    ${h.text}`);
  }
  console.error(
    '\n  This repository is PUBLIC. The founder\'s home address, its postal code\n' +
      '  and its coordinates must not appear anywhere in it — not as a test\n' +
      '  fixture, not as a default form value, not in a comment.\n' +
      '  Use the public test address instead: 1842 Glencoe St, Denver, CO\n' +
      '  (lat 39.7447, lng -104.9322), already used across the roof-quote\n' +
      '  spike harnesses.\n',
  );
  process.exit(1);
}

console.log('✓ check:no-home-address — clean');
