#!/usr/bin/env node
/**
 * check-no-prod-drizzle-config.mjs
 *
 * Guard rail for the Replit deploy fix shipped in PR
 * `fix(deploy): permanently disable Replit's drizzle-kit push destructive-migration prompt`.
 *
 * Background: Replit's deploy pipeline auto-detects Drizzle projects by
 * scanning the repo root for the exact filename `drizzle.config.ts`. When
 * found, Replit's Publish flow runs `drizzle-kit push` against production,
 * which surfaces a destructive-migration approval prompt on every redeploy.
 * To permanently silence that prompt, the config has been renamed to
 * `drizzle.config.dev.ts` and production never runs drizzle-kit push (we use
 * `server/lib/bootstrapMigrations.ts` to apply file-based SQL at boot).
 *
 * This script fails fast if anything (a bot, a Replit assistant, a manual
 * edit) re-introduces `drizzle.config.ts` at the project root. It is wired
 * into `scripts/start-prod.sh` so the production process refuses to boot if
 * the file reappears.
 *
 * Exit codes:
 *   0 — repo root has NO `drizzle.config.ts` (safe to deploy)
 *   1 — repo root HAS `drizzle.config.ts` (deploy would re-trigger Replit's
 *       destructive-migration prompt; abort)
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FORBIDDEN = path.join(ROOT, "drizzle.config.ts");

if (fs.existsSync(FORBIDDEN)) {
  console.error(
    "[check-no-prod-drizzle-config] FAIL: " +
      "`drizzle.config.ts` exists at the repo root.",
  );
  console.error(
    "[check-no-prod-drizzle-config] Replit's deploy pipeline auto-detects " +
      "this filename and runs `drizzle-kit push` against production, which " +
      "triggers the destructive-migration approval prompt on every Publish.",
  );
  console.error(
    "[check-no-prod-drizzle-config] Fix: rename to `drizzle.config.dev.ts` " +
      "and use `npm run db:push` (already wired to --config=drizzle.config.dev.ts).",
  );
  process.exit(1);
}

console.log(
  "[check-no-prod-drizzle-config] OK — no `drizzle.config.ts` at repo root; " +
    "Replit auto-push detector will not trigger.",
);
process.exit(0);
