/**
 * Regression guard: WebCare dashboard KPIs must never score absent data.
 *
 * The security grade was computed from seven `webcare_security_state` flags
 * that NOTHING in the codebase ever wrote. Missing flags read as `false`, so
 * the weighted total was always 0 and every paying WebCare customer saw a
 * security grade of "F" (0/100) — on the dashboard AND in the subject line of
 * their monthly digest email ("Your WebCare report — May 2026: F grade, 0.0%
 * uptime"). The same class of bug zeroed performance and pending updates, and
 * reported "100% uptime" for sites that had never once been polled.
 *
 * This guard fails if any of that is reintroduced. Source-level assertions
 * (no DB) so it runs in the DB-less CI `gate` job.
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "dashboardKpis.ts"), "utf8");
const wave73 = readFileSync(join(here, "wave73KpiStats.ts"), "utf8");
const digest = readFileSync(
  join(here, "..", "..", "..", "lib", "webcareMonthlyDigestEmail.ts"),
  "utf8",
);

/* ─── 1. The phantom metadata keys must be gone ──────────────────────── */

for (const deadKey of [
  "webcare_security_state",
  "webcare_perf_state",
  "webcare_pending_updates",
]) {
  assert.ok(
    !src.includes(`csMeta.${deadKey}`),
    `REGRESSION: dashboardKpis reads csMeta.${deadKey} — nothing writes that key, so every customer gets a score derived from absent data. Read a real signal or report null.`,
  );
  assert.ok(
    !wave73.includes(`csMeta.${deadKey}`),
    `REGRESSION: wave73KpiStats reads csMeta.${deadKey} — same phantom-key bug.`,
  );
}

/* ─── 2. Unmeasured checks must not be listed as failing factors ─────── */

for (const unmeasured of ["malware_clean", "admin_2fa", "passwords_clean", "themes_current"]) {
  assert.ok(
    !src.includes(unmeasured),
    `REGRESSION: dashboardKpis lists "${unmeasured}" as a security factor. WebCare does not measure it, so it would render as a FAILED check for a test we never ran. Only factors derived from last_health_report may appear.`,
  );
}

/* ─── 3. Nullable KPI contract ───────────────────────────────────────── */

assert.ok(
  /securityGrade:\s*\{\s*score:\s*number;\s*letter:\s*string\s*\}\s*\|\s*null/.test(src),
  "securityGrade must be nullable — null means 'not measured', never a 0/F score",
);
assert.ok(
  /uptimePct:\s*number\s*\|\s*null/.test(src),
  "uptimePct must be nullable — a site we never polled has unknown uptime, not 0",
);
assert.ok(
  /pendingUpdates:\s*number\s*\|\s*null/.test(src),
  "pendingUpdates must be nullable — 0 renders a green 'all clear' we haven't earned",
);

assert.ok(
  src.includes("grade: null, factors: []"),
  "computeSecurity must return a null grade when no health report exists",
);

/* ─── 4. Empty uptime history is unknown, not perfect ────────────────── */

assert.ok(
  !/history\.length === 0\) return \{ pct: 100/.test(src),
  "REGRESSION: empty uptime history returns 100% — that claims perfect availability for a site we have never checked. Return null.",
);
assert.ok(
  /history\.length === 0\) return \{ pct: null/.test(src),
  "computeUptime must return pct:null for an empty history",
);
assert.ok(
  /history\.length === 0\) return null/.test(wave73),
  "wave73 computeUptimePct must return null for an empty history, not 100",
);

/* ─── 5. Pending updates must read the REAL maintenance snapshot ─────── */

assert.ok(
  src.includes("last_plugin_update"),
  "pendingUpdates must be derived from last_plugin_update.updates_available — the key webcareMaintenanceWorker actually writes",
);

/* ─── 6. Backups: empty must mean 'not tracked', not 'zero taken' ────── */

assert.ok(
  src.includes("backupsTracked"),
  "response must expose backupsTracked so the UI can say 'not tracked' rather than accusing the customer of 0 successful backups",
);
assert.ok(
  !/out\.push\(\{ date: key, status: "pending" \}\)/.test(src),
  "REGRESSION: backup timeline pads un-recorded days with 'pending' dots, implying 30 scheduled-but-unfinished backup jobs that were never scheduled",
);

/* ─── 7. No placeholder score may be returned as real ────────────────── */

assert.ok(
  !/value: 75/.test(wave73),
  "REGRESSION: wave73 site-health score returns a hardcoded 75 — invent nothing; return value:null with data_status 'unavailable'",
);
assert.ok(
  wave73.includes('data_status: "unavailable"'),
  "wave73 must have an 'unavailable' data_status for the nothing-measured case",
);
assert.ok(
  wave73.includes("computeSecurity"),
  "wave73 must reuse computeSecurity from dashboardKpis rather than re-deriving a second security score",
);

/* ─── 8. The monthly digest must not email an unmeasured grade ───────── */

// The old one-liner interpolated the letter and uptime straight into the
// subject with no measured-ness check. The replacement must build the subject
// from parts, each guarded by its own null check.
assert.ok(
  !/const subject = `Your WebCare report — \$\{data\.periodLabel\}: \$\{data\.stats\.securityLetter\}/.test(digest),
  "REGRESSION: digest subject interpolates securityLetter unconditionally — that is how every customer got 'F grade' in their monthly email subject",
);
assert.ok(
  /if \(data\.stats\.securityLetter\) subjectParts\.push/.test(digest),
  "the security letter may only enter the subject when it is non-null",
);
assert.ok(
  /if \(data\.stats\.uptimePct !== null\) subjectParts\.push/.test(digest),
  "uptime may only enter the subject when it was actually measured",
);
assert.ok(
  digest.includes("subjectParts"),
  "digest subject must be assembled from only the stats that were actually measured",
);
assert.ok(
  /securityLetter:\s*string\s*\|\s*null/.test(digest),
  "MonthlyDigestStats.securityLetter must be nullable",
);

console.log(
  "webcare-honest-kpis guard: OK (no phantom keys; unmeasured KPIs null; uptime unknown != 100%; digest omits unmeasured grade)",
);
