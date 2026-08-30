/**
 * GUARD — every path we request must be one its host permits.
 *
 * The registry declines Yelp, Facebook, Nextdoor and others partly because
 * their robots.txt says `Disallow: /`. Citing that rule obliges us to keep
 * it. This guard makes that obligation mechanical rather than cultural: it
 * takes each implemented scraper's REAL URL builder, runs it against a
 * representative business, and evaluates the result under the directives
 * recorded in robots.ts.
 *
 * It is deliberately offline. Fetching five robots.txt files per CI run
 * would make the guard flaky for reasons unrelated to the diff — and a
 * flaky guard gets deleted — while also turning our own CI into a recurring
 * crawler of sites we are trying to be polite to. The directives are
 * transcribed verbatim from a dated live fetch; `--live` re-verifies them.
 *
 * WHAT THIS WOULD HAVE CAUGHT
 * ---------------------------
 * scrapeBbb requested `/search?find_text=…` against a host whose robots.txt
 * disallows every query-string URL. It shipped, and it shipped into a PAID
 * product, because it WORKED — the response was a real 189KB results page,
 * so no test failed, no error surfaced, and nothing about the runtime
 * behaviour looked wrong. Only reading robots.txt reveals it. That is the
 * exact shape of defect a build-time guard exists for.
 *
 * Run: npm run check:citation-robots        (offline, CI)
 *      npm run check:citation-robots -- --live   (re-fetch + diff)
 */
import assert from "node:assert/strict";
import {
  CITATION_TRACKER_DIRECTORIES,
  CITATION_TRACKER_IMPLEMENTED_DIRECTORIES,
  type ScrapeContext,
} from "./directories";
import {
  ROBOTS_RECORDS,
  evaluateRobots,
  getRobotsRecord,
  isUrlAllowed,
  robotsPathOf,
} from "./robots";
import { buildzoomSearchUrl } from "./scrapers/buildzoom";
import { n49SearchUrl } from "./scrapers/n49";
import { yellowPagesCaSearchUrl } from "./scrapers/yellowPagesCa";
import { nominatimBaseUrl, nominatimSearchUrl, PUBLIC_NOMINATIM_URL } from "./scrapers/openStreetMap";

const failures: string[] = [];
let passed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failures.push(`${name}: ${(err as Error).message}`);
  }
}

/* ─── 1. The matcher itself ──────────────────────────────────────────────
 * A guard is only as good as its matcher. If `patternToRegExp` treated `?`
 * as a regex quantifier, BBB's `Disallow: /*?` would silently match almost
 * nothing and this whole file would pass while permitting the violation it
 * exists to stop. So the matcher is tested before it is trusted. */

test("wildcards, anchors and literal metacharacters", () => {
  // `?` is a regex quantifier but a LITERAL in robots.txt. This is the
  // assertion that makes the BBB verdict meaningful.
  assert.equal(
    evaluateRobots("www.bbb.org", "https://www.bbb.org/search?find_text=x").allowed,
    false,
    "`Disallow: /*?` must treat `?` literally and match a query-string URL",
  );
  // Same path WITHOUT a query string is not matched by `/*?`.
  assert.equal(
    evaluateRobots("www.bbb.org", "https://www.bbb.org/search").allowed,
    true,
    "`/*?` must not match a path that carries no query string",
  );
  // A `.` in a pattern must not match an arbitrary character.
  assert.equal(
    evaluateRobots("www.yellowpages.ca", "https://www.yellowpages.ca/searchBusinessXdo").allowed,
    true,
    "`/searchBusiness.do*` must treat `.` literally",
  );
  assert.equal(
    evaluateRobots("www.yellowpages.ca", "https://www.yellowpages.ca/searchBusiness.do?q=1").allowed,
    false,
    "`/searchBusiness.do*` must still match its literal form",
  );
});

test("longest-match precedence, with Allow winning ties", () => {
  // BBB profile URL with a query string is matched by BOTH `Disallow: /*?`
  // (7 chars) and `Allow: /us/*​/*​/profile/*​/*?` (24 chars). Longest wins,
  // so it is ALLOWED. This is the rule that says "profiles yes, search no",
  // and getting it backwards would justify exactly the wrong conclusion.
  const v = evaluateRobots(
    "www.bbb.org",
    "https://www.bbb.org/us/tx/austin/profile/plumber/acme-0825-1000?tab=reviews",
  );
  assert.equal(v.allowed, true, `expected profile+query allowed, got: ${v.reason}`);
  assert.equal(v.rule?.type, "allow");
  assert.ok(
    (v.rule?.pattern.length ?? 0) > "/*?".length,
    "the deciding rule must be the longer, more specific Allow",
  );
});

test("an unrecorded host is refused rather than assumed open", () => {
  const v = evaluateRobots("example.invalid", "https://example.invalid/anything");
  assert.equal(v.allowed, false, "an unknown host must fail closed — silence is not permission");
});

test("robotsPathOf includes the query string", () => {
  assert.equal(robotsPathOf("https://h.test/a/b?c=d&e=f"), "/a/b?c=d&e=f");
  assert.equal(robotsPathOf("https://h.test/a/b"), "/a/b");
});

/* ─── 2. Every implemented scraper requests a permitted path ─────────── */

/** A representative subscriber. Ordinary on purpose — this is the shape of
 * request the scrapers make on a normal daily scan. */
const CTX_US: ScrapeContext = {
  business_name: "Mr. Rooter Plumbing",
  phone: "(254) 555-0188",
  address: "100 Main St, Waco, TX 76701",
};
const CTX_CA: ScrapeContext = {
  business_name: "Mr. Rooter Plumbing of Toronto",
  phone: "(416) 555-0188",
  address: "12 Queen St W, Toronto, ON M5H 2M9",
};

/**
 * The real URL builders, one per implemented directory that makes an HTTP
 * request to a host with a robots.txt. Keyed by registry id so the coverage
 * assertion below can prove nothing is silently missing.
 *
 * `google_business_profile` is absent deliberately: it calls the Google
 * Places API under a commercial licence and API keys, which robots.txt does
 * not govern — robots.txt binds crawlers of a web site, not clients of an
 * API the vendor sells for this purpose. That exemption is asserted rather
 * than assumed, so it cannot be quietly widened to cover a scraper.
 */
const API_EXEMPT = new Set(["google_business_profile"]);

const URL_BUILDERS: Record<string, () => string[]> = {
  buildzoom: () => [buildzoomSearchUrl(CTX_US)],
  n49: () => {
    const u = n49SearchUrl(CTX_CA);
    assert.ok(u, "n49SearchUrl returned null for a normal business name");
    return [u];
  },
  yellowpages_ca: () => [yellowPagesCaSearchUrl(CTX_CA)],
  // OSM is checked against the PUBLIC host on purpose: the point is to prove
  // that the URL we would build is the one that host forbids, which is why
  // nominatimBaseUrl() refuses it. A licensed host is a different origin
  // with its own robots.txt and is not this guard's business.
  openstreetmap: () => [nominatimSearchUrl(PUBLIC_NOMINATIM_URL, CTX_US)],
};

test("every implemented directory has a URL builder or a declared API exemption", () => {
  for (const dir of CITATION_TRACKER_IMPLEMENTED_DIRECTORIES) {
    assert.ok(
      URL_BUILDERS[dir.id] || API_EXEMPT.has(dir.id),
      `Directory "${dir.id}" has a scraper but no entry in URL_BUILDERS. Every new scraper must declare the URL it requests here so its robots compliance is checked — or be listed in API_EXEMPT with a licensed API as the reason.`,
    );
  }
});

test("HTML scrapers only request paths their host's robots.txt permits", () => {
  for (const [id, build] of Object.entries(URL_BUILDERS)) {
    // OSM is the declared exception — asserted separately below.
    if (id === "openstreetmap") continue;
    for (const url of build()) {
      const host = new URL(url).host;
      assert.ok(
        getRobotsRecord(host),
        `${id} requests ${host}, which has no record in robots.ts. Add the directives (with the fetch date) before shipping the scraper.`,
      );
      const v = evaluateRobots(host, url);
      assert.ok(v.allowed, `${id} requests a DISALLOWED path. ${v.reason}`);
    }
  }
});

/* ─── 3. The two decisions this pass made, locked in ─────────────────── */

test("BBB is not checked, and its reason is recorded", () => {
  const bbb = CITATION_TRACKER_DIRECTORIES.find((d) => d.id === "bbb");
  assert.ok(bbb, "the BBB entry must remain in the registry — removing it loses the evidence");
  assert.equal(
    bbb!.scrape,
    null,
    "BBB must not have a scraper: its discovery path is disallowed and its permitted path is Cloudflare-walled",
  );
  assert.ok(
    /robots/i.test(bbb!.unavailableReason ?? ""),
    "BBB's unavailableReason must state the robots.txt conflict, so the decision is legible to whoever touches it next",
  );
});

test("the BBB search URL that used to ship is provably disallowed", () => {
  // The literal URL shape scrapeBbb built, kept as a regression fixture so
  // re-adding search-based discovery cannot pass this guard.
  const v = evaluateRobots(
    "www.bbb.org",
    "https://www.bbb.org/search?find_text=Mr.%20Rooter&find_loc=Waco%2C%20TX",
  );
  assert.equal(v.allowed, false, "the removed BBB discovery URL must evaluate as disallowed");
  assert.equal(
    v.rule?.pattern,
    "/*?",
    `expected the query-string Disallow to be the deciding rule, got ${v.rule?.pattern}`,
  );
});

test("the OSM check refuses the public Nominatim instance", () => {
  // The URL we would build against the public host is disallowed …
  const url = nominatimSearchUrl(PUBLIC_NOMINATIM_URL, CTX_US);
  const v = evaluateRobots(new URL(url).host, url);
  assert.equal(v.allowed, false, "the public Nominatim /search path must evaluate as disallowed");

  // … so the base-URL resolver must refuse that host, both by default and
  // when it is named explicitly. Otherwise removing the opt-in flag would
  // just have relocated it into an env var.
  const saved = process.env.CITETRACK_NOMINATIM_URL;
  const savedFlag = process.env.CITETRACK_OSM_USE_PUBLIC_INSTANCE;
  try {
    delete process.env.CITETRACK_NOMINATIM_URL;
    process.env.CITETRACK_OSM_USE_PUBLIC_INSTANCE = "true";
    assert.equal(
      nominatimBaseUrl(),
      null,
      "CITETRACK_OSM_USE_PUBLIC_INSTANCE must no longer enable anything — the flag is removed, not merely undocumented",
    );

    process.env.CITETRACK_NOMINATIM_URL = PUBLIC_NOMINATIM_URL;
    assert.equal(
      nominatimBaseUrl(),
      null,
      "naming the public instance in CITETRACK_NOMINATIM_URL must be refused, not honoured",
    );

    process.env.CITETRACK_NOMINATIM_URL = "https://us1.locationiq.com/v1";
    assert.equal(
      nominatimBaseUrl(),
      "https://us1.locationiq.com/v1",
      "a licensed Nominatim-compatible host must still be accepted",
    );
  } finally {
    if (saved === undefined) delete process.env.CITETRACK_NOMINATIM_URL;
    else process.env.CITETRACK_NOMINATIM_URL = saved;
    if (savedFlag === undefined) delete process.env.CITETRACK_OSM_USE_PUBLIC_INSTANCE;
    else process.env.CITETRACK_OSM_USE_PUBLIC_INSTANCE = savedFlag;
  }
});

test("BuildZoom's one named-contractor exclusion is honoured at runtime", () => {
  assert.equal(
    isUrlAllowed("https://www.buildzoom.com/contractor/rolleri-construction-inc"),
    false,
    "the individually-excluded contractor path must evaluate as disallowed",
  );
  assert.equal(
    isUrlAllowed("https://www.buildzoom.com/contractor/acme-plumbing-inc"),
    true,
    "ordinary contractor profiles must remain allowed",
  );
});

/* ─── 4. Records stay honest ─────────────────────────────────────────── */

test("every robots record is dated and non-empty", () => {
  for (const r of ROBOTS_RECORDS) {
    assert.match(r.fetchedAt, /^\d{4}-\d{2}-\d{2}$/, `${r.host} needs an ISO fetch date`);
    assert.ok(r.rules.length > 0, `${r.host} has no rules recorded`);
    assert.equal(r.host, r.host.toLowerCase(), `${r.host} must be recorded lowercase for lookup`);
    for (const rule of r.rules) {
      assert.ok(rule.pattern.startsWith("/"), `${r.host}: pattern "${rule.pattern}" must start with /`);
    }
  }
});

/* ─── Optional: re-verify the transcriptions against the live files ──── */

async function liveVerify(): Promise<void> {
  console.log("citation robots guard: --live — re-fetching robots.txt for each recorded host\n");
  let drift = 0;
  for (const rec of ROBOTS_RECORDS) {
    try {
      const res = await fetch(`https://${rec.host}/robots.txt`, {
        headers: { "User-Agent": "WeFixTrades-CiteTrack/1.0 (+https://wefixtrades.com)" },
      });
      if (!res.ok) {
        console.log(`  ? ${rec.host}: HTTP ${res.status} — could not re-verify`);
        continue;
      }
      const text = await res.text();
      const missing = rec.rules.filter(
        (r) => !new RegExp(`^\\s*(dis)?allow:\\s*${r.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im").test(text),
      );
      if (missing.length === 0) {
        console.log(`  OK ${rec.host}: all ${rec.rules.length} recorded rules still present`);
      } else {
        drift += missing.length;
        console.log(`  DRIFT ${rec.host}: ${missing.length} recorded rule(s) no longer in the live file:`);
        for (const m of missing) console.log(`        ${m.type}: ${m.pattern}`);
      }
    } catch (err) {
      console.log(`  ? ${rec.host}: ${(err as Error).message}`);
    }
  }
  console.log(
    drift === 0
      ? "\nNo drift. Recorded directives match the live files."
      : `\n${drift} recorded rule(s) drifted — re-read the live robots.txt and update robots.ts (bump fetchedAt).`,
  );
}

if (failures.length > 0) {
  console.error(`citation robots guard: ${failures.length} FAILED`);
  for (const f of failures) console.error(`  x ${f}`);
  process.exit(1);
}

const checkedHosts = ROBOTS_RECORDS.length;
console.log(
  `citation robots guard: OK (${passed} checks; ${Object.keys(URL_BUILDERS).length} scraper URL builders ` +
    `evaluated against ${checkedHosts} recorded robots.txt files; BBB declined, public Nominatim refused)`,
);

if (process.argv.includes("--live")) {
  await liveVerify();
}
