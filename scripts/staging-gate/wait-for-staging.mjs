#!/usr/bin/env node
/**
 * Deploy Safety Wave 3 — wait for staging /api/healthz to go green on the
 * PR's commit SHA.
 *
 * Two layers of pass-criteria:
 *   1. HTTP 200 with `{ status: "ok" }` (the contract from server/routes/healthz.ts).
 *   2. `body.version` equals EXPECTED_SHA — proof that staging is running
 *      the code we just pushed, not the previous occupant. start-prod.sh
 *      sets GIT_SHA from process.env, which Replit can populate via build
 *      env (one-time setup task documented in PR body). If GIT_SHA isn't
 *      surfaced yet, we accept status=ok alone and log a WARN so the
 *      missing wiring is visible in workflow logs.
 *
 * Env:
 *   STAGING_URL   — base URL of the staging Replit (no trailing slash)
 *   EXPECTED_SHA  — full SHA of the PR head
 *   TIMEOUT_S     — seconds to wait (default 90)
 *
 * Exit codes:
 *   0  — staging healthz=ok and (version=EXPECTED_SHA OR version unknown)
 *   1  — timed out / persistently down / version mismatch past timeout
 */

const BASE = (process.env.STAGING_URL ?? "").replace(/\/$/, "");
const EXPECTED = String(process.env.EXPECTED_SHA ?? "").toLowerCase();
const TIMEOUT_S = Number(process.env.TIMEOUT_S ?? 90);

const POLL_INTERVAL_MS = 5_000;
const PER_REQ_TIMEOUT_MS = 4_000;

function log(line) {
  console.log(`[wait-for-staging] ${line}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollOnce() {
  const url = `${BASE}/api/healthz`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(PER_REQ_TIMEOUT_MS) });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return { kind: "non-json", http: res.status, sample: text.slice(0, 120) };
    }
    return { kind: "json", http: res.status, body };
  } catch (err) {
    return { kind: "error", error: err?.message ?? String(err) };
  }
}

function versionMatches(version) {
  if (!version || typeof version !== "string") return null; // unknown
  const v = version.toLowerCase();
  // Replit may surface a short or long SHA. Accept either as a prefix match.
  if (v === EXPECTED) return true;
  if (EXPECTED.startsWith(v) && v.length >= 7) return true;
  if (v.startsWith(EXPECTED.slice(0, 7))) return true;
  return false;
}

async function main() {
  if (!BASE) {
    console.error("[wait-for-staging] STAGING_URL not set");
    process.exit(2);
  }
  if (!EXPECTED || EXPECTED.length < 7) {
    console.error("[wait-for-staging] EXPECTED_SHA missing or too short");
    process.exit(2);
  }
  log(`waiting up to ${TIMEOUT_S}s for ${BASE}/api/healthz to report status=ok on ${EXPECTED.substring(0, 7)}`);

  const deadline = Date.now() + TIMEOUT_S * 1000;
  let lastDetail = "no responses yet";
  let attempts = 0;
  let lastVersionKnown = null;

  while (Date.now() < deadline) {
    attempts += 1;
    const r = await pollOnce();
    if (r.kind === "error") {
      lastDetail = `error: ${r.error}`;
    } else if (r.kind === "non-json") {
      lastDetail = `HTTP ${r.http} non-JSON (${r.sample})`;
    } else {
      const { http, body } = r;
      const status = body?.status;
      const version = body?.version;
      const match = versionMatches(version);
      lastVersionKnown = match;
      if (http === 200 && status === "ok") {
        if (match === true) {
          log(`PASS attempt ${attempts}: status=ok version=${version} matches ${EXPECTED.substring(0, 7)}`);
          process.exit(0);
        }
        if (match === null) {
          // Version not surfaced. Accept after one full success but log loudly
          // — the one-time setup task to set GIT_SHA in Replit is incomplete.
          log(`WARN attempt ${attempts}: status=ok but version="${version ?? "(missing)"}" — cannot prove SHA match; accepting because GIT_SHA wiring may be pending`);
          process.exit(0);
        }
        lastDetail = `status=ok but version="${version}" != expected ${EXPECTED.substring(0, 7)} (stale deploy?)`;
      } else {
        lastDetail = `HTTP ${http} status=${status ?? "?"}`;
        if (body?.checks) {
          const downChecks = Object.entries(body.checks)
            .filter(([, c]) => c?.status === "down")
            .map(([n, c]) => `${n}=${c?.detail ?? "(no detail)"}`);
          if (downChecks.length) lastDetail += ` down=[${downChecks.join(", ")}]`;
        }
      }
    }
    log(`attempt ${attempts}: ${lastDetail}`);
    await sleep(POLL_INTERVAL_MS);
  }

  console.error(`[wait-for-staging] FAIL — staging did not report status=ok on ${EXPECTED.substring(0, 7)} within ${TIMEOUT_S}s`);
  console.error(`[wait-for-staging]   last detail: ${lastDetail}`);
  if (lastVersionKnown === false) {
    console.error(`[wait-for-staging]   hint: version-mismatch persisted — Replit may not have picked up the staging branch push`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(`[wait-for-staging] uncaught: ${err?.stack ?? err}`);
  process.exit(1);
});
