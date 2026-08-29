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
  CITATION_TRACKER_IMPLEMENTED_DIRECTORIES,
  CITATION_TRACKER_IMPLEMENTED_COUNT,
  CITATION_TRACKER_COST_PER_RUN_USD,
  getMonitoredDirectories,
  getMonitoredCount,
  isDirectoryCheckable,
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
  /if \(!isDirectoryCheckable\(dir\)\) \{[\s\S]{0,240}?continue;/.test(monitor),
  "REGRESSION: monitor no longer skips directories it cannot check. A directory we never check must produce no row, no status and no alert.",
);

const skipIdx = monitor.indexOf("if (!isDirectoryCheckable(dir))");
const checkedIdx = monitor.indexOf("stats.listings_checked += 1");
assert.ok(skipIdx !== -1 && checkedIdx !== -1, "expected both the skip guard and the checked counter");
assert.ok(
  skipIdx < checkedIdx,
  "unchecked directories must be skipped BEFORE listings_checked is incremented — otherwise the customer is told we checked the whole registry",
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
  getMonitoredCount(),
  getMonitoredDirectories().length,
  "monitored count must equal the monitored list length",
);
assert.ok(
  getMonitoredDirectories().every((d) => d.scrape !== null),
  "every 'monitored' directory must have a real scraper",
);
assert.ok(
  CITATION_TRACKER_IMPLEMENTED_COUNT < CITATION_TRACKER_DIRECTORIES.length,
  "sanity: the registry still contains evaluated entries we do not check",
);
assert.ok(
  CITATION_TRACKER_IMPLEMENTED_COUNT > 0,
  "at least one directory must actually be checked",
);
// Availability gating must be able to REDUCE the monitored set — a
// directory whose key is missing has to drop out of the customer-facing
// count, not sit in it claiming coverage we can't deliver.
assert.ok(
  getMonitoredCount() <= CITATION_TRACKER_IMPLEMENTED_COUNT,
  "monitored count can never exceed the number of implemented scrapers",
);

/* ─── 7. Every exclusion must carry its evidence ─────────────────────── */

for (const dir of CITATION_TRACKER_DIRECTORIES) {
  if (dir.scrape === null) {
    assert.ok(
      typeof dir.unavailableReason === "string" && dir.unavailableReason.length > 40,
      `directory "${dir.id}" has no scraper and no substantive unavailableReason. Every directory we decline to check must record WHY, or the next person re-litigates it from scratch and re-adds a scraper we already proved is blocked.`,
    );
  }
  assert.ok(
    typeof dir.rationale === "string" && dir.rationale.length > 20,
    `directory "${dir.id}" must state why it is in the registry — the customer-facing list shows this`,
  );
  // A gated directory must explain its gate whether or not the gate
  // happens to be open in THIS environment — the reason is documentation
  // for whoever finds it switched off somewhere else. "Not checked, no
  // reason given" is the state that makes a missing key look like a
  // missing listing.
  if (dir.scrape !== null && dir.isAvailable) {
    assert.ok(
      typeof dir.unavailableReason === "string" && dir.unavailableReason.length > 40,
      `directory "${dir.id}" is gated behind isAvailable() and must record what enables it${isDirectoryCheckable(dir) ? "" : " (it is currently gated OFF here)"}`,
    );
  }
}

/* ─── 8. Bot walls must not parse as clean misses ────────────────────── */

const httpClient = readFileSync(join(here, "scrapers", "httpClient.ts"), "utf8");
assert.ok(
  /export function detectBotWall/.test(httpClient),
  "REGRESSION: the bot-wall detector is gone. Challenge interstitials return HTTP 200 with an empty body, so without this the parser reports a clean `found:false` — a permanent false 'confirmed absent'. This is exactly how Houzz reported every subscriber as delisted.",
);
for (const vendor of ["imperva", "perimeterx", "datadome", "cloudflare"]) {
  assert.ok(
    new RegExp(vendor, "i").test(httpClient),
    `bot-wall detection must cover ${vendor} — Cloudflare-only detection is what let the Houzz challenge page through`,
  );
}
assert.ok(
  /const wall = detectBotWall\(html\);[\s\S]{0,200}?reason: "rate_limited"/.test(httpClient),
  "a detected bot wall must map to a CHECK FAILURE (rate_limited), never fall through to the parser",
);

/* ─── 9. Cost discipline ─────────────────────────────────────────────── */

assert.strictEqual(
  CITATION_TRACKER_COST_PER_RUN_USD,
  0,
  "a scan must stay free per subscriber; if this changes, the marketing copy and the pricing model both need revisiting",
);
// The Google check is the one that can silently become expensive: asking
// for a phone number or website promotes the whole call to Google's
// Enterprise SKU tier and multiplies the bill.
const gbp = readFileSync(join(here, "scrapers", "googleBusinessProfile.ts"), "utf8");
const recheckMask = /const RECHECK_FIELD_MASK = \[([\s\S]*?)\]/.exec(gbp)?.[1] ?? "";
for (const pricey of ["nationalPhoneNumber", "websiteUri", "displayName", "rating"]) {
  assert.ok(
    !recheckMask.includes(pricey),
    `RECHECK_FIELD_MASK must stay on Google's Essentials tier — "${pricey}" promotes every daily call to a paid SKU. See the cost note in directories.ts before changing this.`,
  );
}
// CiteTrack must never reach for the paid SERP providers.
//
// The needle is assembled at runtime on purpose: the public-SERP spend-cap
// guard scans source files for that identifier and treats any file
// containing it as a surface that opted IN to paid spend. Writing it as a
// literal here — even inside a negative assertion — would make this guard
// trip that one.
const paidOptInFlag = "allowPaid" + "Providers";
for (const [label, src] of [["monitor.ts", monitor], ["directories.ts", directoriesSrc]] as const) {
  assert.ok(
    !src.includes(paidOptInFlag),
    `${label}: citation checks must not opt into paid SERP providers (PR #2057 default-deny). The daily scan runs per subscriber and would multiply any per-call cost.`,
  );
}

/* ─── 10. Customer-facing copy must match reality ────────────────────── */

const marketing = readFileSync(
  join(here, "..", "..", "..", "client", "src", "pages", "marketing", "CitationTrackerPage.tsx"),
  "utf8",
);
assert.ok(
  !/50\+\s*directories/i.test(marketing),
  `REGRESSION: CiteTrack marketing claims "50+ directories" but only ${CITATION_TRACKER_IMPLEMENTED_COUNT} have real scrapers. Quote the implemented count.`,
);
// The claim is "we name the directories we check", so the page must
// actually name them. A number alone is the vanity metric we moved away from.
for (const dir of CITATION_TRACKER_IMPLEMENTED_DIRECTORIES) {
  assert.ok(
    marketing.includes(dir.name),
    `CitationTrackerPage must name "${dir.name}" — the product claim is that we list exactly which directories we check, so an implemented directory missing from the page under-claims and a removed one over-claims.`,
  );
}
// And it must NOT name a directory we don't check.
for (const dir of CITATION_TRACKER_DIRECTORIES) {
  if (dir.scrape !== null) continue;
  const namesIt = new RegExp(`monitor[^.]{0,80}\\b${dir.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  assert.ok(
    !namesIt.test(marketing),
    `CitationTrackerPage appears to claim monitoring of "${dir.name}", which has no scraper`,
  );
}

console.log(
  `citation-evidence guard: OK (no stub scrapers; unchecked skipped; bot walls != misses; errors != removals; every exclusion justified; $${CITATION_TRACKER_COST_PER_RUN_USD}/run; ${CITATION_TRACKER_IMPLEMENTED_COUNT}/${CITATION_TRACKER_DIRECTORIES.length} directories implemented, ${getMonitoredCount()} checkable here, and copy names them)`,
);
