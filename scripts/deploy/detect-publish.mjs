#!/usr/bin/env node
/**
 * CI-QUIET — detect whether prod actually picked up a publish.
 *
 * Replit prod publishes are MANUAL (Alex clicks Publish/Redeploy). A push to
 * `main` therefore does NOT mean prod is running the pushed commit — most of
 * the time it is not, and the old watchdog cried wolf on every merge.
 *
 * This script polls /api/healthz for up to TIMEOUT_S and reports whether a
 * publish was picked up, via three signals (strongest first):
 *
 *   1. `version` matches EXPECTED_SHA  → pickup=version   (provably our commit)
 *      Requires the healthz version stamp (GIT_SHA) to be wired; until then
 *      prod reports version:"unknown".
 *   2. `boot_time` (or a non-SHA `version` string) CHANGES vs the baseline
 *      captured at the start of the window → pickup=movement (a publish or
 *      restart happened; build identity unprovable without the stamp).
 *   3. Neither within the window → pickup=none (prod publish is manual —
 *      the pushed commit simply isn't deployed yet; NOT a failure).
 *
 * Outputs (GITHUB_OUTPUT when set, stdout otherwise):
 *   pickup=version|movement|none
 *   detail=<one-line human summary>
 *
 * Exit code is ALWAYS 0 (even on internal errors → pickup=none) so that the
 * workflow's verdict logic, not an exception, decides what is email-worthy.
 *
 * Env:
 *   DEPLOY_URL       base URL (default https://wefixtrades.com)
 *   EXPECTED_SHA     full SHA of the commit just pushed to main
 *   TIMEOUT_S        polling window (default 600 = 10 min)
 *   POLL_INTERVAL_S  gap between polls (default 20)
 *   ASSUME_PUBLISHED "true" = the operator asserts a publish just happened
 *                    (workflow_dispatch after clicking Publish in Replit).
 *                    One poll is still made to try for a provable version
 *                    match; otherwise pickup=movement is reported immediately
 *                    so the health/content verification runs in full.
 */

import { appendFileSync } from "node:fs";

const BASE = (process.env.DEPLOY_URL || "https://wefixtrades.com").replace(/\/$/, "");
const HEALTH_URL = `${BASE}/api/healthz`;
const EXPECTED = String(process.env.EXPECTED_SHA ?? "").toLowerCase();
const TIMEOUT_S = Number(process.env.TIMEOUT_S ?? 600);
const POLL_INTERVAL_S = Number(process.env.POLL_INTERVAL_S ?? 20);
const REQ_TIMEOUT_MS = 8_000;

function log(line) {
  console.log(`[detect-publish] ${line}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function writeOutput(kv) {
  const lines = Object.entries(kv)
    .map(([k, v]) => `${k}=${String(v ?? "").replace(/\r?\n/g, " ")}`)
    .join("\n");
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, lines + "\n");
  } else {
    process.stdout.write(lines + "\n");
  }
}

/** A version string is "sha-like" when it's plausibly a git SHA (hex, >=7). */
function isShaLike(v) {
  return typeof v === "string" && /^[0-9a-f]{7,40}$/i.test(v.trim());
}

function shaMatches(version) {
  if (!isShaLike(version) || !EXPECTED) return false;
  const v = version.toLowerCase().trim();
  return EXPECTED === v || EXPECTED.startsWith(v) || v.startsWith(EXPECTED.slice(0, 7));
}

async function pollOnce() {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(REQ_TIMEOUT_MS) });
    const text = await res.text();
    try {
      const body = JSON.parse(text);
      return { ok: true, version: body?.version, bootTime: body?.boot_time, http: res.status };
    } catch {
      return { ok: false, reason: `HTTP ${res.status} non-JSON` };
    }
  } catch (err) {
    return { ok: false, reason: err?.message ?? String(err) };
  }
}

async function main() {
  if (!EXPECTED || EXPECTED.length < 7) {
    log("EXPECTED_SHA missing/too short — cannot attribute a pickup; reporting none");
    writeOutput({ pickup: "none", detail: "EXPECTED_SHA not provided to detector" });
    return;
  }

  if (process.env.ASSUME_PUBLISHED === "true") {
    // Operator-asserted publish: try once for a provable version match,
    // otherwise report movement straight away so verification runs in full
    // (an unreachable prod right after a publish is exactly what the
    // downstream monitor should fail loudly on).
    const r = await pollOnce();
    if (r.ok && shaMatches(r.version)) {
      writeOutput({ pickup: "version", detail: `healthz version ${r.version} matches ${EXPECTED.slice(0, 7)}` });
    } else {
      writeOutput({ pickup: "movement", detail: "operator-asserted publish (workflow_dispatch input assume_published=true)" });
    }
    return;
  }

  log(`watching ${HEALTH_URL} for pickup of ${EXPECTED.slice(0, 7)} (window ${TIMEOUT_S}s, every ${POLL_INTERVAL_S}s)`);

  const deadline = Date.now() + TIMEOUT_S * 1000;
  let baseline = null; // { version, bootTime } from the first successful read
  let lastDetail = "no successful healthz reads";
  let attempts = 0;
  let unreachable = 0;

  while (Date.now() < deadline) {
    attempts += 1;
    const r = await pollOnce();

    if (!r.ok) {
      unreachable += 1;
      lastDetail = `unreachable/non-JSON: ${r.reason}`;
      log(`attempt ${attempts}: ${lastDetail}`);
    } else {
      const { version, bootTime } = r;

      // Signal 1 — provable: the version stamp matches the pushed SHA.
      if (shaMatches(version)) {
        log(`attempt ${attempts}: version=${version} matches ${EXPECTED.slice(0, 7)} — PICKUP (version)`);
        writeOutput({
          pickup: "version",
          detail: `healthz version ${version} matches pushed ${EXPECTED.slice(0, 7)}`,
        });
        return;
      }

      if (!baseline) {
        baseline = { version: version ?? "", bootTime: bootTime ?? "" };
        lastDetail = `baseline captured: version="${baseline.version}" boot_time="${baseline.bootTime}"`;
        log(`attempt ${attempts}: ${lastDetail}`);
      } else {
        // Signal 2 — movement: boot_time or version string changed mid-window.
        const bootMoved = bootTime && baseline.bootTime && bootTime !== baseline.bootTime;
        const versionMoved = version && baseline.version && version !== baseline.version;
        if (bootMoved || versionMoved) {
          const what = bootMoved
            ? `boot_time ${baseline.bootTime} → ${bootTime}`
            : `version ${baseline.version} → ${version}`;
          log(`attempt ${attempts}: ${what} — PICKUP (movement; build identity unproven, version stamp not live)`);
          writeOutput({ pickup: "movement", detail: what });
          return;
        }
        lastDetail = `no movement (version="${version ?? ""}" boot_time="${bootTime ?? ""}")`;
        log(`attempt ${attempts}: ${lastDetail}`);
      }
    }

    if (Date.now() + POLL_INTERVAL_S * 1000 < deadline) {
      await sleep(POLL_INTERVAL_S * 1000);
    } else {
      break;
    }
  }

  if (!baseline) {
    // Never reached prod at all. A genuine outage is the scheduled
    // Post-Deploy Verify workflow's job to alarm on (15-min cadence, deduped
    // issue) — the watchdog only judges publishes. Surface a warning, not a fail.
    console.log(`::warning::detect-publish: prod healthz unreachable for the entire ${TIMEOUT_S}s window (${lastDetail})`);
    writeOutput({ pickup: "none", detail: `prod unreachable all window: ${lastDetail}` });
    return;
  }

  log(`window closed after ${attempts} polls without pickup — prod publish is manual; not yet deployed`);
  writeOutput({
    pickup: "none",
    detail: `no pickup of ${EXPECTED.slice(0, 7)} within ${TIMEOUT_S}s (${lastDetail}; unreachable polls: ${unreachable})`,
  });
}

main().catch((err) => {
  // Detector bugs must not generate failure emails — report none + warning.
  console.log(`::warning::detect-publish crashed: ${err?.message ?? err}`);
  writeOutput({ pickup: "none", detail: `detector crashed: ${err?.message ?? err}` });
  process.exit(0);
});
