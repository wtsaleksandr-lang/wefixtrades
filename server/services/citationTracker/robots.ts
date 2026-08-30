/**
 * Citation Tracker — robots.txt rules for every host we request, and a
 * matcher that evaluates a URL against them.
 *
 * WHY THIS EXISTS
 * ---------------
 * The registry declines ~22 directories, and the stated reason for several
 * of them is that their robots.txt says `Disallow: /`. That reason is only
 * usable if we hold ourselves to it. We cannot cite robots.txt against Yelp
 * and Nextdoor while fetching a path BBB asks crawlers not to fetch — and
 * the checks are now shared by a PAID product, which raises the stakes from
 * embarrassing to indefensible.
 *
 * So every implemented scraper's request URL is checked, at build time, in
 * `robotsCompliance.test.ts`, against the directives recorded below.
 *
 * WHY THE DIRECTIVES ARE CHECKED IN RATHER THAN FETCHED
 * -----------------------------------------------------
 * A guard that fetches five robots.txt files on every CI run is a guard that
 * fails when a directory has an outage, and a guard that fails for reasons
 * unrelated to the diff gets disabled. Worse, it would make our own CI a
 * recurring crawler of sites we are trying to be polite to.
 *
 * Instead the directives are transcribed VERBATIM from a dated live fetch,
 * and the guard evaluates our real URL builders against them offline. That
 * makes the guard deterministic and turns "which paths may we request" into
 * reviewable source. Re-verify with `npm run check:citation-robots -- --live`,
 * which re-fetches and diffs against what is recorded here.
 *
 * Every block below was fetched and read in full on 2026-08-29.
 */

/** A single robots.txt rule from a `User-agent: *` group. */
export interface RobotsRule {
  type: "allow" | "disallow";
  /** The path pattern exactly as written in robots.txt. */
  pattern: string;
}

export interface RobotsRecord {
  /** Host the rules govern. robots.txt is per-scheme+host+port. */
  host: string;
  /** ISO date the file was fetched and transcribed. */
  fetchedAt: string;
  /**
   * The rules from the group that applies to us. We send a plain desktop
   * browser User-Agent, which matches no named product token, so the
   * `User-agent: *` group governs every request we make.
   */
  rules: RobotsRule[];
  /** Anything about this file a reader needs in order to trust the above. */
  note?: string;
}

const D = (pattern: string): RobotsRule => ({ type: "disallow", pattern });
const A = (pattern: string): RobotsRule => ({ type: "allow", pattern });

export const ROBOTS_RECORDS: RobotsRecord[] = [
  {
    host: "www.bbb.org",
    fetchedAt: "2026-08-29",
    note:
      "The decisive pair is `Disallow: /*?` (every query-string URL) plus the two profile Allow globs. " +
      "A search URL `/search?find_text=…` matches the Disallow and neither Allow, so it is forbidden. " +
      "A profile URL `/us/{state}/{city}/profile/{category}/{slug}` matches no Disallow at all, so it is " +
      "permitted — which is why the registry's BBB entry blames Cloudflare, not robots, for the profile path.",
    rules: [
      D("/cdn-cgi/"),
      D("/util/"),
      D("/authentication/*"),
      D("/business-reviews/*"),
      D("/get-listed/success"),
      D("/apply/thank-you"),
      D("/bbb-reports-on"),
      D("/contact-form"),
      D("/verify-sms"),
      D("/submit-review-expiration"),
      D("/submit-review-thank-you"),
      D("/dynamic-seal"),
      D("/leave-a-review/no-bid"),
      D("/leave-a-review/no-bid/thank-you"),
      D("/leave-a-review/no-bid/expiration"),
      D("/manage-location"),
      D("/file-a-complaint/*"),
      D("/accredited-business-directory/*?"),
      D("/test-all-page"),
      D("/*?"),
      A("/scamtracker/*?"),
      A("/us/*/*/profile/*/*?"),
      A("/ca/*/*/profile/*/*?"),
    ],
  },
  {
    host: "www.buildzoom.com",
    fetchedAt: "2026-08-29",
    note:
      "Two `User-agent: *` groups appear in the file; per RFC 9309 §2.2.1 groups with the same product " +
      "token are merged, so the trailing `Allow: /` and the four Disallows below apply together. The " +
      "long preamble of `Disallow: /` blocks targets named crawlers (AhrefsBot, SemrushBot, CCBot, …), " +
      "none of which is our token. Note the one named contractor path — a real, if odd, exclusion that " +
      "the scraper honours explicitly.",
    rules: [
      D("/user/sign_up"),
      D("/map/"),
      D("/contractor/rolleri-construction-inc"),
      D("/cdn-cgi/"),
      A("/"),
    ],
  },
  {
    host: "www.yellowpages.ca",
    fetchedAt: "2026-08-29",
    note:
      "104 rules in the `*` group, and no blanket disallow. The `/search/` entries all target suffixed " +
      "facet variants (`-vdo`, `-rr`, `-geo`, `si-booking`, …) or a handful of individually-named " +
      "businesses; the plain `/search/si/1/{what}/{where}` form we request matches none of them. Only " +
      "the rules that could plausibly bear on our path are transcribed — the omitted ones govern /deals, " +
      "/merchant, /map and print views we never request. The five named `/search/si/1/…` business " +
      "exclusions ARE included, because a subscriber with one of those names would otherwise slip " +
      "through. `/bus/...` appears here for completeness: we PARSE those anchors out of the results " +
      "page but never fetch them, so their province-level Disallows are not engaged.",
    rules: [
      D("/*;JSESSIONID"),
      D("/searchBusiness.do*"),
      D("/search/map.html*"),
      D("/search/*-vdo*"),
      D("/search/*-fto*"),
      D("/search/*-rr*"),
      D("/search/*-menu*"),
      D("/search/*-eco*"),
      D("/search/*-dym*"),
      D("/search/*-rel*"),
      D("/search/*-geo*"),
      D("/search/*-dist*"),
      D("/search/*-itm*"),
      D("/search/*-lpp*"),
      D("/search/*-dl*"),
      D("/search/pr*"),
      D("/search/pv*"),
      D("/search/*/rcu-*"),
      D("/search/*/rpy-*"),
      D("/search/print/*"),
      D("/search/nonAdvertiserSearch.html*"),
      D("/search/nonAdSearch*"),
      D("/search/si-booking*"),
      D("/search/si-editorChoice*"),
      D("/search/si-messaging*"),
      D("/search/si-mostWanted*"),
      D("/search/si-onlineOrdering*"),
      D("/search/si-open*"),
      D("/search?stype*"),
      D("/search/?stype*"),
      D("/search/*-pop*"),
      D("/search/*-rat*"),
      D("/search/*-rev*"),
      D("/search/*-prox*"),
      D("/search/*-bn*"),
      D("/search/*-ad*"),
      D("/search/*-editorChoice*"),
      D("/search?fmt=JSON*"),
      D("/search/*filter=dl*"),
      D("/search/widget/*"),
      D("/search/*/rla-lang25"),
      D("/search/si/1/Chris-Kampouris-Avocat*"),
      D("/search/si/1/Lyne-Riopel-Clinique*"),
      D("/search/si/1/Clinique-d-osteopathie-Aux-Quatre-Vents-Inc/*"),
      D("/search/si/1/Clinique-D-Osteopathie-Aux-Quatre-Vents-Inc/*"),
      D("/search/si/1/Vernide-Dieujuste-Junius-Soins-a-Domicile/*"),
      D("/search/si/1/Bb-Chou-Chou/*"),
      D("/search/si/1/Vanco-Home-Care-Services/*"),
      D("/bus/print/*"),
      D("/bus/widget/*"),
    ],
  },
  {
    host: "www.n49.com",
    fetchedAt: "2026-08-29",
    note:
      "The entire file is four lines: WordPress admin is excluded and nothing else is. Our " +
      "`/search/{slug}/1/{city}-{province}/` path is unambiguously permitted.",
    rules: [D("/wp-admin/"), A("/wp-admin/admin-ajax.php")],
  },
  {
    host: "nominatim.openstreetmap.org",
    fetchedAt: "2026-08-29",
    note:
      "The public Nominatim instance disallows every query endpoint it has — /search, /lookup, /reverse " +
      "and /details, in both bare and .php forms. There is no permitted way to ask it a question, which " +
      "is why the OSM check now REFUSES to run against this host at all rather than offering an opt-in. " +
      "This record exists so that refusal is enforced by a guard instead of a comment. A self-hosted or " +
      "commercially-licensed Nominatim is a different host with its own robots.txt and is unaffected.",
    rules: [
      D("/search.php"),
      D("/search"),
      D("/details.php"),
      D("/details"),
      D("/reverse.php"),
      D("/reverse"),
      D("/lookup"),
      D("/lookup.php"),
      D("/status"),
      D("/status.php"),
    ],
  },
];

export function getRobotsRecord(host: string): RobotsRecord | undefined {
  return ROBOTS_RECORDS.find((r) => r.host === host.toLowerCase());
}

/**
 * Translate a robots.txt path pattern into a RegExp.
 *
 * Per RFC 9309 §2.2.2 only two operators exist: `*` matches any run of
 * characters (including none) and a trailing `$` anchors the end of the
 * path. Everything else is literal and must be regex-escaped — which
 * matters here, because real directives in this file contain `?`, `.` and
 * `;`, all of which are regex metacharacters that would silently widen the
 * pattern if left unescaped. `/*?` is the case that decides BBB: as a
 * literal it means "any path, then a question mark".
 */
function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp("^" + source + (anchored ? "$" : ""));
}

/**
 * The URL's path plus query string, which is what robots patterns match
 * against. The query is included with its `?` because patterns like
 * `/*?` and `/search?fmt=JSON*` are written to match it.
 */
export function robotsPathOf(url: string): string {
  const u = new URL(url);
  return u.pathname + u.search;
}

export interface RobotsVerdict {
  allowed: boolean;
  /** The rule that decided it, or null when no rule matched. */
  rule: RobotsRule | null;
  /** Human-readable justification, used in guard failure messages. */
  reason: string;
}

/**
 * Evaluate a URL against a host's recorded rules.
 *
 * Precedence follows RFC 9309 §2.2.2: the rule with the longest pattern
 * wins, and Allow beats Disallow on a tie. A URL matched by no rule is
 * allowed — robots.txt is a deny-list, not an allow-list.
 *
 * The tie-break is not academic. `/us/tx/austin/profile/plumber/acme?x=1`
 * is matched by BBB's `Disallow: /*?` (7 chars) AND its
 * `Allow: /us/*​/*​/profile/*​/*?` (24 chars); the longer Allow wins, which
 * is precisely how BBB signals "profiles yes, search no".
 */
export function evaluateRobots(host: string, url: string): RobotsVerdict {
  const record = getRobotsRecord(host);
  if (!record) {
    return {
      allowed: false,
      rule: null,
      reason: `No robots.txt record for ${host}. Every host we request must be recorded in robots.ts before a scraper may call it.`,
    };
  }

  const path = robotsPathOf(url);
  let best: RobotsRule | null = null;
  for (const rule of record.rules) {
    if (!patternToRegExp(rule.pattern).test(path)) continue;
    if (best === null) {
      best = rule;
      continue;
    }
    if (rule.pattern.length > best.pattern.length) {
      best = rule;
    } else if (rule.pattern.length === best.pattern.length && rule.type === "allow") {
      best = rule;
    }
  }

  if (!best) {
    return { allowed: true, rule: null, reason: `No rule in ${host}/robots.txt matches ${path}.` };
  }
  return {
    allowed: best.type === "allow",
    rule: best,
    reason: `${host}/robots.txt — ${best.type === "allow" ? "Allow" : "Disallow"}: ${best.pattern} matches ${path}.`,
  };
}

/** Convenience wrapper: is this absolute URL one we are permitted to fetch? */
export function isUrlAllowed(url: string): boolean {
  return evaluateRobots(new URL(url).host, url).allowed;
}
