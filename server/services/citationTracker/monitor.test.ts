/**
 * Regression guard: Citation Tracker must never turn a failed scrape — or an
 * unimplemented one — into a "your listing was removed" alert.
 *
 * The monitor treated `{ found: false }` as proof of removal. It flipped the
 * listing to status='missing' and fired a HIGH-severity `removed_listing`
 * alert, and alerts.ts emails EVERY alert with no severity gating, subject
 * "Citation Tracker alert — Citation removed". But:
 *
 *   - the 5 real scrapers return `{ found: false, error }` on timeouts,
 *     HTTP 403/429 rate limits, Cloudflare challenges and parse errors; and
 *   - 49 of the 54 registry entries had a `noopScrape` returning
 *     `{ found: false }` with no network call at all.
 *
 * So a transient BBB rate-limit emailed a paying customer that their BBB
 * listing had been removed.
 *
 * Source-level assertions (no DB) so this runs in the DB-less CI `gate` job.
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CITATION_TRACKER_DIRECTORIES,
  CITATION_TRACKER_MONITORED_DIRECTORIES,
  CITATION_TRACKER_MONITORED_COUNT,
} from "./directories";

const here = dirname(fileURLToPath(import.meta.url));
const monitor = readFileSync(join(here, "monitor.ts"), "utf8");
const directoriesSrc = readFileSync(join(here, "directories.ts"), "utf8");

/* ─── 1. No stub scraper may exist ───────────────────────────────────── */

// Match the identifier in code position, not the word in the explanatory
// comment that documents why it was removed.
assert.ok(
  !/function\s+noopScrape/.test(directoriesSrc) && !/scrape:\s*noopScrape/.test(directoriesSrc),
  "REGRESSION: noopScrape is back. A stub returning { found: false } is indistinguishable downstream from a confirmed removal. Unimplemented directories must be `scrape: null`.",
);

/* ─── 2. Unimplemented directories are skipped before any DB work ────── */

assert.ok(
  /if \(!dir\.scrape\) \{[\s\S]{0,200}?continue;/.test(monitor),
  "REGRESSION: monitor no longer skips directories without a scraper. A directory we never check must produce no row, no status and no alert.",
);

const skipIdx = monitor.indexOf("if (!dir.scrape)");
const checkedIdx = monitor.indexOf("stats.listings_checked += 1");
assert.ok(skipIdx !== -1 && checkedIdx !== -1, "expected both the skip guard and the checked counter");
assert.ok(
  skipIdx < checkedIdx,
  "unimplemented directories must be skipped BEFORE listings_checked is incremented — otherwise the customer is told we checked 54 directories when we checked 5",
);

/* ─── 3. A failed scrape is not evidence of anything ─────────────────── */

assert.ok(
  /if \(scrape\.error\) \{/.test(monitor),
  "REGRESSION: monitor no longer branches on scrape.error. A timeout / 403 / 429 / parse failure tells us nothing about the listing and must never reach the removal path.",
);
const errorIdx = monitor.indexOf("if (scrape.error) {");
const removalIdx = monitor.indexOf("alert_type: \"removed_listing\"");
assert.ok(
  errorIdx !== -1 && removalIdx !== -1 && errorIdx < removalIdx,
  "the scrape-error early-return must come before the removed_listing path",
);

/* ─── 4. Removal requires consecutive CONFIRMED negatives ────────────── */

assert.ok(
  monitor.includes("CONSECUTIVE_MISSES_BEFORE_ALERT"),
  "removal must require a confirmation threshold, not a single miss",
);
assert.ok(
  /const misses = \(row\.consecutive_missing_count \?\? 0\) \+ 1/.test(monitor),
  "the miss streak must be read from and incremented on the persisted counter",
);
assert.ok(
  /if \(confirmed && row\.status !== "missing"\) \{/.test(monitor),
  "the removed_listing alert must be gated on `confirmed`",
);
assert.ok(
  !/if \(row && !scrape\.found && row\.status !== "missing"\) \{[\s\S]{0,120}status: "missing"[\s\S]{0,400}removed_listing/.test(monitor),
  "REGRESSION: single-miss removal path is back — one failed or unlucky scrape must not email the customer",
);

/* ─── 5. Seeing the listing clears the streak ────────────────────────── */

assert.ok(
  /consecutive_missing_count: 0/.test(monitor),
  "a successful find must reset consecutive_missing_count, or a listing that flickers once every few weeks eventually crosses the threshold",
);

/* ─── 6. The monitored count is what customer copy may quote ─────────── */

assert.strictEqual(
  CITATION_TRACKER_MONITORED_COUNT,
  CITATION_TRACKER_MONITORED_DIRECTORIES.length,
  "monitored count must equal the monitored list length",
);
assert.ok(
  CITATION_TRACKER_MONITORED_DIRECTORIES.every((d) => d.scrape !== null),
  "every 'monitored' directory must have a real scraper",
);
assert.ok(
  CITATION_TRACKER_MONITORED_COUNT < CITATION_TRACKER_DIRECTORIES.length,
  "sanity: the registry still contains roadmap entries we do not check",
);
assert.ok(
  CITATION_TRACKER_MONITORED_COUNT > 0,
  "at least one directory must actually be checked",
);

/* ─── 7. Customer-facing copy must not claim the roadmap number ──────── */

const marketing = readFileSync(
  join(here, "..", "..", "..", "client", "src", "pages", "marketing", "CitationTrackerPage.tsx"),
  "utf8",
);
assert.ok(
  !/50\+\s*directories/i.test(marketing),
  `REGRESSION: CiteTrack marketing claims "50+ directories" but only ${CITATION_TRACKER_MONITORED_COUNT} have real scrapers. Quote the monitored count.`,
);

console.log(
  `citation-evidence guard: OK (no stub scrapers; unchecked skipped; errors != removals; ${CITATION_TRACKER_MONITORED_COUNT}/${CITATION_TRACKER_DIRECTORIES.length} directories monitored and copy matches)`,
);
