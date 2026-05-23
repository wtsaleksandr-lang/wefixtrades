#!/usr/bin/env node
/**
 * Deploy Safety Wave 2 — post-deploy verifier.
 *
 * Run AFTER a deploy completes. Polls /api/healthz for up to ~60s waiting
 * for status=ok, then runs the critical-paths Playwright smoke suite
 * against the deployed URL. Exits non-zero on any failure — wire into
 * deploy notifications so a broken prod surfaces immediately.
 *
 * Env:
 *   DEPLOY_URL          — base URL to verify (default: https://wefixtrades.com)
 *   HEALTHZ_RETRIES     — how many times to poll healthz (default 12)
 *   HEALTHZ_DELAY_MS    — gap between healthz polls (default 5000)
 *   SKIP_SMOKE          — set to "1" to skip the Playwright suite (healthz only)
 *
 * Usage:
 *   DEPLOY_URL=https://wefixtrades.com node scripts/post-deploy-verify.mjs
 */

import { spawn } from "node:child_process";

const BASE = process.env.DEPLOY_URL || "https://wefixtrades.com";
const HEALTH_URL = `${BASE.replace(/\/$/, "")}/api/healthz`;
const MAX_HEALTH_RETRIES = Number(process.env.HEALTHZ_RETRIES ?? 12);
const RETRY_DELAY_MS = Number(process.env.HEALTHZ_DELAY_MS ?? 5000);

function log(line) {
  console.log(`[post-deploy-verify] ${line}`);
}

async function checkHealth() {
  for (let i = 0; i < MAX_HEALTH_RETRIES; i++) {
    try {
      const res = await fetch(HEALTH_URL, {
        // 4s per individual healthz request; the server caches for 15s so
        // we shouldn't ever wait long.
        signal: AbortSignal.timeout(4000),
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        log(`attempt ${i + 1}: non-JSON response (HTTP ${res.status}), retrying…`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      if (res.ok && data.status === "ok") {
        log(`OK healthz (attempt ${i + 1}, version=${data.version ?? "?"})`);
        return true;
      }
      log(
        `attempt ${i + 1}: HTTP ${res.status} status=${data.status ?? "?"} — retrying in ${RETRY_DELAY_MS}ms`,
      );
      // Print which sub-check is down so the deploy log shows the cause.
      if (data.checks) {
        for (const [name, check] of Object.entries(data.checks)) {
          if (check?.status === "down") {
            log(`  ✗ ${name}: ${check.detail ?? "(no detail)"}`);
          }
        }
      }
    } catch (err) {
      log(`attempt ${i + 1}: error ${err?.message ?? err} — retrying`);
    }
    await sleep(RETRY_DELAY_MS);
  }
  log("FAIL healthz never returned ok within window");
  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function runSmoke() {
  return new Promise((resolve) => {
    const env = { ...process.env, SMOKE_BASE_URL: BASE };
    const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
    const proc = spawn(
      cmd,
      ["playwright", "test", "--config=smoke.config.ts"],
      { stdio: "inherit", env, shell: process.platform === "win32" },
    );
    proc.on("exit", (code) => resolve(code === 0));
    proc.on("error", (err) => {
      log(`smoke spawn error: ${err.message}`);
      resolve(false);
    });
  });
}

async function main() {
  log(`target: ${BASE}`);
  const healthy = await checkHealth();
  if (!healthy) {
    process.exit(1);
  }
  if (process.env.SKIP_SMOKE === "1") {
    log("SKIP_SMOKE=1 — skipping Playwright smoke suite");
    process.exit(0);
  }
  log("running critical-paths smoke suite…");
  const ok = await runSmoke();
  if (!ok) {
    log("FAIL smoke suite reported failures");
    process.exit(1);
  }
  log("PASS post-deploy verification complete");
  process.exit(0);
}

main().catch((err) => {
  log(`UNCAUGHT ${err?.stack ?? err}`);
  process.exit(1);
});
