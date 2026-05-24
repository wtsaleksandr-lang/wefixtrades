#!/usr/bin/env node
/**
 * Deploy Safety Wave 4 — post-deploy watchdog / rollback monitor.
 *
 * Runs inside the post-deploy-watchdog GitHub workflow AFTER a commit lands on
 * main and Replit auto-deploys it to prod. Polls /api/healthz on a fixed
 * cadence and emits a verdict the workflow uses to decide whether to file a
 * rollback PR.
 *
 * Pass / fail criteria (defaults match the Wave 4 spec):
 *   PASS  — status=ok stays "ok" for 5 consecutive polls.
 *   FAIL  — any sub-check goes status="down", OR top-level status="degraded"
 *           persists for 5 or more consecutive polls.
 *   Time  — initial 60 s settle window, then up to 20 polls × 30 s = 10 min.
 *
 * Operates purely on the existing /api/healthz contract from PR #624:
 *   { status: "ok" | "degraded" | "down", checks: { <name>: { status, ... } }, version, boot_time }
 *
 * Exit codes:
 *   0 — healthy (PASS)
 *   1 — degraded or down (FAIL — workflow should file a rollback PR)
 *   2 — script misconfiguration (FAIL but no rollback PR — fix the workflow)
 *
 * Side effects:
 *   - When GITHUB_OUTPUT is set (running in Actions), writes a verdict block:
 *       verdict=pass|fail
 *       reason=<one-line summary>
 *       failed_check=<name|>
 *       failed_status=<down|degraded|>
 *       last_body_path=<path>
 *   - Always writes the most recent healthz JSON to LAST_BODY_PATH so the
 *     workflow can attach it to the rollback issue and PR.
 *
 * Env:
 *   DEPLOY_URL              base URL to probe (default https://wefixtrades.com)
 *   WATCHDOG_SETTLE_S       initial wait before first poll (default 60)
 *   WATCHDOG_POLL_INTERVAL_S gap between polls (default 30)
 *   WATCHDOG_MAX_POLLS      max polls after settle (default 20 = 10 min)
 *   WATCHDOG_CONSEC_OK      consecutive ok polls needed for PASS (default 5)
 *   WATCHDOG_CONSEC_DEG     consecutive degraded polls that trigger FAIL (default 5)
 *   WATCHDOG_REQ_TIMEOUT_MS per-request timeout (default 8000)
 *   LAST_BODY_PATH          where to write the most recent healthz JSON
 *                           (default ./watchdog-last-body.json)
 *   GITHUB_OUTPUT           Actions step outputs file (set automatically in CI)
 */

import { appendFileSync, writeFileSync } from "node:fs";

const BASE = (process.env.DEPLOY_URL || "https://wefixtrades.com").replace(/\/$/, "");
const HEALTH_URL = `${BASE}/api/healthz`;

const SETTLE_S = Number(process.env.WATCHDOG_SETTLE_S ?? 60);
const POLL_INTERVAL_S = Number(process.env.WATCHDOG_POLL_INTERVAL_S ?? 30);
const MAX_POLLS = Number(process.env.WATCHDOG_MAX_POLLS ?? 20);
const CONSEC_OK = Number(process.env.WATCHDOG_CONSEC_OK ?? 5);
const CONSEC_DEG = Number(process.env.WATCHDOG_CONSEC_DEG ?? 5);
const REQ_TIMEOUT_MS = Number(process.env.WATCHDOG_REQ_TIMEOUT_MS ?? 8000);
const LAST_BODY_PATH = process.env.LAST_BODY_PATH || "./watchdog-last-body.json";

function log(line) {
  console.log(`[rollback-monitor] ${line}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Pretty one-line summary of which sub-checks are down/degraded. */
function summarizeChecks(checks) {
  if (!checks || typeof checks !== "object") return "";
  const issues = [];
  for (const [name, c] of Object.entries(checks)) {
    if (c?.status === "down" || c?.status === "degraded") {
      issues.push(`${name}=${c.status}${c.detail ? ` (${c.detail})` : ""}`);
    }
  }
  return issues.join(", ");
}

function firstDownCheck(checks) {
  if (!checks || typeof checks !== "object") return null;
  for (const [name, c] of Object.entries(checks)) {
    if (c?.status === "down") return name;
  }
  return null;
}

/**
 * One poll. Returns:
 *   { kind: "ok",      body, http }
 *   { kind: "degraded", body, http, summary }
 *   { kind: "down",     body, http, failedCheck, summary }
 *   { kind: "transient", reason }   — network / non-JSON; count as a non-ok
 *                                     tick but don't trigger immediate rollback
 */
async function pollOnce() {
  try {
    const res = await fetch(HEALTH_URL, {
      signal: AbortSignal.timeout(REQ_TIMEOUT_MS),
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return { kind: "transient", reason: `HTTP ${res.status} non-JSON (${text.slice(0, 120)})` };
    }
    // Persist the most recent body so failure paths can attach it.
    try {
      writeFileSync(LAST_BODY_PATH, JSON.stringify(body, null, 2));
    } catch (err) {
      log(`warn: could not write ${LAST_BODY_PATH}: ${err?.message ?? err}`);
    }

    const topStatus = body?.status;
    const downName = firstDownCheck(body?.checks);
    const summary = summarizeChecks(body?.checks);

    if (downName) {
      return { kind: "down", body, http: res.status, failedCheck: downName, summary };
    }
    if (topStatus === "ok" && res.status === 200) {
      return { kind: "ok", body, http: res.status };
    }
    if (topStatus === "degraded") {
      return { kind: "degraded", body, http: res.status, summary };
    }
    // Top-level "down" without a named sub-check (handler crash fallback).
    if (topStatus === "down") {
      return {
        kind: "down",
        body,
        http: res.status,
        failedCheck: "(top-level)",
        summary: body?.detail || summary || "healthz reported status=down",
      };
    }
    // Unknown shape — treat as transient so a single weird response doesn't
    // trigger a rollback by itself.
    return { kind: "transient", reason: `HTTP ${res.status} status="${topStatus ?? "?"}"` };
  } catch (err) {
    return { kind: "transient", reason: err?.message ?? String(err) };
  }
}

function writeOutput(kv) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(kv)
    .map(([k, v]) => `${k}=${String(v ?? "").replace(/\r?\n/g, " ")}`)
    .join("\n");
  appendFileSync(process.env.GITHUB_OUTPUT, lines + "\n");
}

async function main() {
  log(`watching ${HEALTH_URL}`);
  log(
    `settle=${SETTLE_S}s, poll_interval=${POLL_INTERVAL_S}s, max_polls=${MAX_POLLS}, ` +
      `consec_ok=${CONSEC_OK}, consec_deg_to_fail=${CONSEC_DEG}`,
  );

  if (SETTLE_S > 0) {
    log(`waiting ${SETTLE_S}s for prod to swap to the new version`);
    await sleep(SETTLE_S * 1000);
  }

  let consecutiveOk = 0;
  let consecutiveDegraded = 0;
  let lastReason = "no polls completed";

  for (let attempt = 1; attempt <= MAX_POLLS; attempt++) {
    const r = await pollOnce();

    if (r.kind === "ok") {
      consecutiveOk += 1;
      consecutiveDegraded = 0;
      lastReason = `attempt ${attempt}: ok (${consecutiveOk}/${CONSEC_OK})`;
      log(lastReason);
      if (consecutiveOk >= CONSEC_OK) {
        log(`PASS — ${CONSEC_OK} consecutive ok polls`);
        writeOutput({
          verdict: "pass",
          reason: `healthz stayed ok for ${CONSEC_OK} consecutive polls`,
          failed_check: "",
          failed_status: "",
          last_body_path: LAST_BODY_PATH,
        });
        process.exit(0);
      }
    } else if (r.kind === "down") {
      consecutiveOk = 0;
      lastReason = `attempt ${attempt}: DOWN — ${r.failedCheck}: ${r.summary || "(no detail)"}`;
      log(lastReason);
      log(`FAIL — sub-check went down, triggering rollback`);
      writeOutput({
        verdict: "fail",
        reason: `sub-check "${r.failedCheck}" reported status=down`,
        failed_check: r.failedCheck,
        failed_status: "down",
        last_body_path: LAST_BODY_PATH,
      });
      process.exit(1);
    } else if (r.kind === "degraded") {
      consecutiveOk = 0;
      consecutiveDegraded += 1;
      lastReason = `attempt ${attempt}: degraded (${consecutiveDegraded}/${CONSEC_DEG}) — ${r.summary || "(no detail)"}`;
      log(lastReason);
      if (consecutiveDegraded >= CONSEC_DEG) {
        log(`FAIL — ${CONSEC_DEG} consecutive degraded polls, triggering rollback`);
        writeOutput({
          verdict: "fail",
          reason: `healthz stayed degraded for ${CONSEC_DEG} consecutive polls`,
          failed_check: "(aggregate)",
          failed_status: "degraded",
          last_body_path: LAST_BODY_PATH,
        });
        process.exit(1);
      }
    } else {
      // transient
      consecutiveOk = 0;
      // Deliberately do NOT increment consecutiveDegraded — a network blip
      // shouldn't count toward a rollback verdict.
      lastReason = `attempt ${attempt}: transient — ${r.reason}`;
      log(lastReason);
    }

    if (attempt < MAX_POLLS) {
      await sleep(POLL_INTERVAL_S * 1000);
    }
  }

  // Ran out of polls without ever achieving CONSEC_OK in a row. This is a
  // soft FAIL: never saw a sub-check go fully down, but never proved healthy
  // either. We open a rollback PR — the operator can close it if the
  // evidence in the issue body is benign.
  log(`FAIL — exhausted ${MAX_POLLS} polls without ${CONSEC_OK} consecutive ok`);
  writeOutput({
    verdict: "fail",
    reason: `did not reach ${CONSEC_OK} consecutive ok polls within ${MAX_POLLS} attempts`,
    failed_check: "(timeout)",
    failed_status: "unstable",
    last_body_path: LAST_BODY_PATH,
  });
  process.exit(1);
}

main().catch((err) => {
  console.error(`[rollback-monitor] uncaught: ${err?.stack ?? err}`);
  writeOutput({
    verdict: "fail",
    reason: `monitor crashed: ${err?.message ?? err}`,
    failed_check: "(monitor)",
    failed_status: "error",
    last_body_path: LAST_BODY_PATH,
  });
  process.exit(2);
});
