/**
 * ContentFlow Sprint 19 — orchestrator.
 *
 * Runs the env audit and each per-channel smoke script in sequence,
 * reading + writing the same data/contentflow-smoke-report.json.
 *
 * The orchestrator does NOT bypass any per-channel gate — each script
 * still respects CONTENTFLOW_REAL_API_SMOKE / ALLOW_REAL_POSTS / DRY_RUN
 * the same way it does when run alone.
 *
 * Usage:
 *   CONTENTFLOW_REAL_API_SMOKE=1 DRY_RUN=1 npx tsx scripts/contentflow-smoke-all.ts
 *   CONTENTFLOW_REAL_API_SMOKE=1 ALLOW_REAL_POSTS=1 npx tsx scripts/contentflow-smoke-all.ts
 */

import { spawn } from "child_process";
import { log, readReport, REPORT_PATH } from "./lib/smokeReport";

const SCRIPT = "smoke-all";

interface Step {
  name: string;
  file: string;
  /** When true, runs even if upstream blocked. Used by the env audit. */
  alwaysRun?: boolean;
}

const STEPS: Step[] = [
  { name: "env_audit",         file: "scripts/contentflow-env-audit.ts",              alwaysRun: true },
  { name: "image",             file: "scripts/contentflow-smoke-image.ts" },
  { name: "email",             file: "scripts/contentflow-smoke-email.ts" },
  { name: "wordpress",         file: "scripts/contentflow-smoke-wordpress.ts" },
  { name: "facebook",          file: "scripts/contentflow-smoke-facebook.ts" },
  { name: "instagram",         file: "scripts/contentflow-smoke-instagram.ts" },
  { name: "gbp_post",          file: "scripts/contentflow-smoke-gbp-post.ts" },
  { name: "gbp_review_reply",  file: "scripts/contentflow-smoke-gbp-review-reply.ts" },
];

function runOne(step: Step): Promise<number> {
  return new Promise((resolve) => {
    log(SCRIPT, `--- ${step.name} ---`);
    /* tsx is the same runner the project uses elsewhere. */
    const child = spawn("npx", ["tsx", step.file], {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    });
    child.on("close", (code) => resolve(code ?? 0));
  });
}

async function main(): Promise<void> {
  log(SCRIPT, `report path: ${REPORT_PATH}`);
  log(SCRIPT, `flags: REAL_API_SMOKE=${process.env.CONTENTFLOW_REAL_API_SMOKE ?? "0"} ALLOW_REAL_POSTS=${process.env.ALLOW_REAL_POSTS ?? "0"} DRY_RUN=${process.env.DRY_RUN ?? "0"}`);

  for (const step of STEPS) {
    await runOne(step);
  }

  /* Summary read-back. */
  const report = readReport();
  const channels = Object.keys(report.channels);
  console.log("\n═══ SMOKE SUMMARY ═══");
  for (const ch of channels) {
    const r = report.channels[ch];
    console.log(`  ${ch.padEnd(22)} ${r.status.padEnd(8)} ${r.message}`);
  }
  console.log(`\nReport: ${REPORT_PATH}`);
  const failed = channels.filter((c) => report.channels[c].status === "failed");
  const blocked = channels.filter((c) => report.channels[c].status === "blocked");
  console.log(`OK: ${channels.length - failed.length - blocked.length} | BLOCKED: ${blocked.length} | FAILED: ${failed.length}`);
}

main().catch((e) => {
  console.error(`[smoke][${SCRIPT}] fatal:`, e?.message || e);
  process.exit(0);
});
