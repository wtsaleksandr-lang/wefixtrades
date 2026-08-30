/**
 * Regression guard: the FREE, PUBLIC Citation Checker must never report a
 * directory status it did not genuinely verify — and must never cost money.
 *
 * WHAT THIS GUARDS AGAINST
 * ------------------------
 * The tool used to advertise checks against ten directories (Yelp, Angi,
 * Thumbtack, YellowPages.com, Houzz, HomeAdvisor, MapQuest, Foursquare,
 * Manta, BBB) and contact none of them. It ran one SERP query per directory
 * and reported `status: "missing"` — rendered as a red "Missing" row beside
 * a paid upsell — whenever that directory's domain did not appear in the
 * top ten organic results. That is not an absence; a business listed on
 * Yelp gets reported missing whenever its listing doesn't rank for that
 * phrasing. Worse than the paid-product version of the same bug (#2061),
 * because a lead magnet is shown to people who don't know us yet.
 *
 * It now runs the shared CiteTrack registry against real directories. Four
 * invariants keep it honest and cheap, and each is asserted below:
 *
 *   1. A failed check is never an absence.
 *   2. One registry — the free tool cannot check what the paid product
 *      declines, because both read getMonitoredDirectories().
 *   3. No SERP, so no path to a billable provider.
 *   4. Public traffic is bounded: per-IP cap, a process-wide daily ledger
 *      on the only billable call, and a response cache.
 *
 * Plus: the page's customer-facing copy must match the registry.
 *
 * Source-level + pure-function assertions (no DB, no network) so this runs
 * in the DB-less CI `gate` job. Run standalone:
 *
 *   npx tsx server/routes/freeToolsCitationHonesty.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CITATION_TRACKER_DIRECTORIES,
  CITATION_TRACKER_IMPLEMENTED_DIRECTORIES,
  getMonitoredDirectories,
  isDirectoryCheckable,
} from "../services/citationTracker/directories";

// freeToolsRoutes.ts imports ../db, which throws at import if DATABASE_URL
// is unset. Set a dummy so the lazy Pool can construct (no real connection).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/test_unused";
}

const { citationRowStatus, citationMarketFor, classifyCitationHit } = await import("./freeToolsRoutes");

const here = dirname(fileURLToPath(import.meta.url));
const routes = readFileSync(join(here, "freeToolsRoutes.ts"), "utf8");

/** Comments stripped, so assertions about what the CODE does are not
 * satisfied — or broken — by a docblock that merely describes the old
 * behaviour. This file documents the removed bug at length, quoting the
 * status strings it used to emit. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const routesCode = stripComments(routes);
const page = readFileSync(
  join(here, "..", "..", "client", "src", "pages", "marketing", "tools", "CitationChecker.tsx"),
  "utf8",
);
/** Only the copy a visitor can actually read. The page's own docblock
 * documents the removed bug and necessarily names the directories that bug
 * fabricated results for — a claims guard must not trip over that. */
const pageCopy = stripComments(page);

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
  } catch (err: any) {
    failures.push(`${name}: ${err?.message || String(err)}`);
  }
}

/** The handler body, isolated so assertions about it can't be satisfied by
 * unrelated code elsewhere in this large file. */
const handlerStart = routes.indexOf("async function citationCheckerHandler");
assert.ok(handlerStart > -1, "citationCheckerHandler not found — this guard is looking at the wrong file");
const handlerEnd = routes.indexOf("\n}", routes.indexOf("citationCacheSet(cacheKey, payload)"));
assert.ok(handlerEnd > handlerStart, "could not delimit citationCheckerHandler");
const handler = routes.slice(handlerStart, handlerEnd);

/* ─── 1. A failed check is NEVER an absence ──────────────────────────── */

test("a scraper error surfaces as could-not-check, never confirmed-absent", () => {
  // Every failure mode the shared httpClient can produce. Each of these is a
  // page we could not read; none of them is evidence the listing is gone.
  for (const reason of [
    "rate_limited", // 403 / 429 / Cloudflare / Imperva / PerimeterX / DataDome challenge
    "timeout",
    "network",
    "bad_status",
    "parse_error",
    "not_configured",
  ]) {
    const r = citationRowStatus({ found: false, error: reason });
    assert.equal(
      r.status,
      "could-not-check",
      `a "${reason}" failure must be could-not-check — reporting it as an absence is the bug this tool shipped for months`,
    );
    assert.ok(r.reason && r.reason.length > 0, `"${reason}" must carry a plain-English explanation for the customer`);
  }
});

test("the Imperva/Houzz trap: a challenge page can never read as absent", () => {
  // The exact shape that broke the paid product: HTTP 200, a tiny body, no
  // anchors. httpClient's bot-wall detector converts it to rate_limited, and
  // this mapper must keep it out of the absence bucket.
  const r = citationRowStatus({ found: false, error: "rate_limited" });
  assert.notEqual(r.status as string, "confirmed-absent");
});

test("error outranks found — a partial read asserts nothing", () => {
  const r = citationRowStatus({ found: true, listing_url: "https://x/y", error: "parse_error" });
  assert.equal(r.status, "could-not-check");
});

test("a clean no-result IS a confirmed absence (the tool must still be useful)", () => {
  const r = citationRowStatus({ found: false });
  assert.equal(r.status, "confirmed-absent");
  assert.equal(r.reason, undefined, "a confirmed absence is not a failure and carries no failure reason");
});

test("a clean hit is found, and carries the listing url", () => {
  const r = citationRowStatus({ found: true, listing_url: "https://www.bbb.org/us/tx/austin/profile/x" });
  assert.equal(r.status, "found");
  assert.equal(r.listingUrl, "https://www.bbb.org/us/tx/austin/profile/x");
});

test("the SERP classifier can no longer return a fabricated absence", () => {
  // Used only by the NAP checker now, but the same rule binds it: ten
  // organic results for one phrasing cannot prove a business is unlisted.
  const r = classifyCitationHit(
    [{ link: "https://example.com/x", title: "Some Business", snippet: "" }],
    { domain: "yelp.com" },
    "Some Business",
    "Austin",
    "",
  );
  assert.equal(r.status, "unable-to-check");
  assert.ok(
    !routesCode.includes('status: "missing"'),
    "no code path may emit a SERP-inferred `missing` status",
  );
});

/* ─── 2. One registry — free tool and paid product cannot disagree ───── */

test("the handler checks the shared registry, not a private directory list", () => {
  assert.ok(
    handler.includes("getMonitoredDirectories()"),
    "the free tool must read the same registry the paid product reads; a second hardcoded list is how the two drift apart",
  );
  assert.ok(
    !handler.includes("CITATION_SOURCES"),
    "CITATION_SOURCES is the old hardcoded ten-directory list — the citation checker must not use it",
  );
});

test("no directory without a working scraper can be reported on", () => {
  for (const dir of getMonitoredDirectories()) {
    assert.ok(
      isDirectoryCheckable(dir),
      `${dir.name} is monitored but not checkable — getMonitoredDirectories() must never return one`,
    );
    assert.ok(dir.scrape !== null, `${dir.name} has no scraper and must not be reachable from the free tool`);
  }
});

test("every directory the tool declines carries its evidence", () => {
  // The page renders `declined` verbatim to the customer, so a blank reason
  // would ship an unexplained gap.
  for (const dir of CITATION_TRACKER_DIRECTORIES.filter((d) => !isDirectoryCheckable(d))) {
    assert.ok(
      dir.unavailableReason && dir.unavailableReason.length > 20,
      `${dir.name} is declined but has no substantive reason, and the free tool shows these to the public`,
    );
  }
});

test("a market-specific directory is never run against the wrong market", () => {
  assert.equal(citationMarketFor("Austin, TX"), "US");
  assert.equal(citationMarketFor("Barrie, Ontario"), "CA");
  assert.equal(citationMarketFor("Toronto, ON"), "CA");
  // Ambiguous input must NOT resolve — a wrong confident answer would run
  // YellowPages.ca against a Texan plumber and call the clean miss a gap.
  assert.equal(citationMarketFor("London"), null);
  assert.equal(citationMarketFor(""), null);
  assert.ok(
    handler.includes('d.markets.includes("US") && d.markets.includes("CA")'),
    "with an unknown market the handler must fall back to directories serving BOTH markets",
  );
});

/* ─── 3. A public tool can never bill ────────────────────────────────── */

test("the citation checker never calls the SERP orchestrator", () => {
  assert.ok(
    !handler.includes("searchSerp"),
    "the citation checker must not touch the SERP stack at all — #2057's default-deny is a backstop, not the design",
  );
  // The paid-provider opt-in rule is owned by the spend-cap guard, which
  // scans every server file for the flag. Rather than repeat the token here
  // (which would itself register as an opt-in in that scan), assert that
  // this file's route module is inside that guard's public-surface list, so
  // the rule provably still covers us.
  const spendCap = readFileSync(join(here, "..", "lib", "serpOrchestrator.spendCap.test.ts"), "utf8");
  assert.ok(
    /PUBLIC_SERP_SURFACES = \[[^\]]*"server\/routes\/freeToolsRoutes\.ts"/.test(spendCap),
    "freeToolsRoutes.ts must stay in the spend-cap guard's PUBLIC_SERP_SURFACES list — that is what forbids a paid opt-in on this anonymous route",
  );
});

test("the Google field mask stays on the free SKU tier", () => {
  const gbp = readFileSync(
    join(here, "..", "services", "citationTracker", "scrapers", "googleBusinessProfile.ts"),
    "utf8",
  );
  // websiteUri / nationalPhoneNumber / reviews / rating promote a Places call
  // to the Enterprise SKU. On a public tool with unbounded traffic that is
  // the fastest way to an unexpected bill. Assert on the mask LITERALS, not
  // the file — the scraper's docblock names these fields precisely to warn
  // against them, and a guard that can't tell a warning from a use is a
  // guard nobody can satisfy.
  const masks = [...gbp.matchAll(/_FIELD_MASK = (\[[\s\S]*?\])\s*\.join/g)].map((m) => m[1]);
  assert.equal(masks.length, 2, "expected exactly the discovery + recheck field masks");
  for (const mask of masks) {
    for (const expensive of ["websiteUri", "nationalPhoneNumber", "reviews", "rating", "priceLevel"]) {
      assert.ok(
        !mask.includes(expensive),
        `${expensive} is in a Places field mask; it promotes the call above the free tier and the public Citation Checker fires it anonymously`,
      );
    }
  }
  // The daily-running mask must stay Essentials — displayName alone would
  // promote every recheck to Pro.
  assert.ok(!masks[1].includes("displayName"), "the recheck mask must stay on the Essentials tier");
});

/* ─── 4. Public traffic is bounded ───────────────────────────────────── */

test("per-IP scans are capped below the shared free-tool default", () => {
  const m = /const CITATION_HOURLY_MAX = (\d+)/.exec(routes);
  assert.ok(m, "CITATION_HOURLY_MAX must exist — an unbounded public fan-out is the #2057 failure mode");
  const perIp = Number(m![1]);
  assert.ok(perIp > 0 && perIp <= 10, `per-IP hourly cap is ${perIp}; keep it tight, each scan fans out to several hosts`);
  assert.ok(
    handler.includes("rateOk(\"citation\", req, res, CITATION_HOURLY_MAX)"),
    "the handler must apply the tightened per-IP cap, not the 20/hr default",
  );
});

test("the one billable call is reserved from a process-wide daily ledger", () => {
  const m = /const CITATION_PLACES_DAILY_BUDGET = (\d+)/.exec(routes);
  assert.ok(m, "CITATION_PLACES_DAILY_BUDGET must exist");
  const daily = Number(m![1]);
  // Places Text Search Pro is free to 5,000 calls/month. 31 days at this
  // budget must stay inside that with room for CiteTrack's own discovery
  // calls, which share the SKU.
  assert.ok(daily * 31 < 5000, `${daily}/day is ${daily * 31}/month, which can exceed the 5,000/mo free Places allowance`);
  assert.ok(
    handler.includes("reserveDailyCalls(") && handler.includes("CITATION_PLACES_DAILY_BUDGET"),
    "the Places call must be reserved from the shared daily ledger BEFORE it is spent",
  );
  // And an exhausted budget degrades to "we didn't check", never to a status.
  assert.ok(
    /placesGranted < 1[\s\S]{0,160}could-not-check/.test(handler),
    "when the daily budget is gone the Google row must report could-not-check, never an absence",
  );
});

test("repeat runs are served from cache rather than re-spending", () => {
  assert.ok(
    handler.includes("citationCacheGet(cacheKey)") && handler.includes("citationCacheSet(cacheKey, payload)"),
    "re-running the same business is the common case and must not re-hit the directories or the budget",
  );
  const m = /const CITATION_CACHE_MAX = (\d+)/.exec(routes);
  assert.ok(m && Number(m![1]) > 0, "the cache must be bounded — an unbounded map on a public route is a memory leak");
});

/* ─── 5. Customer-facing copy must match the registry ────────────────── */

test("the page does not claim a coverage count it cannot deliver", () => {
  assert.ok(!/50\+\s*(citation|director)/i.test(page), 'the page must not claim "50+" sources');
  assert.ok(
    !/\b10 (of the )?(most |popular |important )*director/i.test(page),
    "the page must not claim a fixed 10-directory sweep — that was the fabricated claim",
  );
});

test("the page names every directory it actually checks", () => {
  for (const dir of CITATION_TRACKER_IMPLEMENTED_DIRECTORIES) {
    assert.ok(
      pageCopy.includes(dir.name),
      `CitationChecker.tsx must name "${dir.name}" — the pitch is a named, verifiable list, so an implemented directory missing from the page under-claims`,
    );
  }
});

test("the page never claims to check a directory we decline", () => {
  // Naming a declined directory is REQUIRED — the "here's what we can't
  // check, and why" section is the whole pitch. What must never happen is
  // naming one in a sentence that reads as coverage. So: every sentence
  // mentioning a declined directory must carry an inability/denial marker.
  //
  // This is stricter than a keyword ban and closer to the actual rule. A
  // sentence like "We check Yelp, BBB and Angi" fails; "Yelp blocks
  // automated checks outright" passes.
  const INABILITY =
    /\b(don't|doesn't|do not|does not|didn't|can't|cannot|couldn't|won't|never|no|not|without|instead|rather than|block\w*|disallow\w*|declin\w*|refus\w*|denied|deny|behind|paid|unavailable|unreadable|guess\w*|challenge\w*)\b/i;
  // Split on sentence terminators; JSX entities and quotes are left intact.
  const sentences = pageCopy.split(/(?<=[.!?])\s+|\n{2,}/);
  for (const dir of CITATION_TRACKER_DIRECTORIES) {
    if (dir.scrape !== null) continue;
    const nameRe = new RegExp(`\\b${dir.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    for (const s of sentences) {
      // Only inspect prose. Code identifiers and imports can legitimately
      // reference a directory id without making a claim.
      if (!nameRe.test(s)) continue;
      if (/\b(import|const |function |interface |=>|\.tsx?['"])/.test(s)) continue;
      assert.ok(
        INABILITY.test(s),
        `CitationChecker.tsx mentions "${dir.name}" in a sentence that reads as coverage, but it has no scraper. Sentence: ${s.trim().slice(0, 160)}`,
      );
    }
  }
});

test("the three states are all presented, and could-not-check is distinct", () => {
  for (const state of ["found", "confirmed-absent", "could-not-check"]) {
    assert.ok(page.includes(state), `the page must render the "${state}" state`);
  }
  assert.ok(
    /could-not-check[\s\S]{0,200}Couldn't check/.test(page),
    "could-not-check must carry its own label — folding it into 'not listed' is the conflation this whole change removes",
  );
  assert.ok(
    /gapCount = result \? result\.summary\.confirmedAbsent : 0/.test(page),
    "only a CONFIRMED absence may count as a gap; an unreadable directory must never drive the paid CTA",
  );
});

/* ─── Report ─────────────────────────────────────────────────────────── */

if (failures.length > 0) {
  console.error(`free-tool citation-honesty guard: ${failures.length} FAILED`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `free-tool citation-honesty guard: OK (${passed} checks; failures never read as absences; one shared registry; ` +
    `no SERP path; per-IP + daily-ledger + cache bounded; ${getMonitoredDirectories().length} checkable here, ` +
    `${CITATION_TRACKER_DIRECTORIES.filter((d) => !isDirectoryCheckable(d)).length} declined with reasons; copy matches)`,
);
