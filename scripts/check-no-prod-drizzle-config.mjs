#!/usr/bin/env node
/**
 * check-no-prod-drizzle-config.mjs
 *
 * Guard rail for the Replit deploy fix.
 *
 * Background: Replit's deploy pipeline auto-detects Drizzle projects by
 * scanning the repo root for the `drizzle.config*` glob. When it finds a
 * matching file, Replit's Publish flow runs `drizzle-kit push` against
 * production, which surfaces a destructive-migration approval prompt on
 * every redeploy.
 *
 * Mitigation history:
 *   1. The original config `drizzle.config.ts` tripped the detector.
 *   2. PR #620 renamed it to `drizzle.config.dev.ts` hoping the rename
 *      alone would dodge the detector — it did NOT. The detector matches
 *      the `drizzle.config*` glob, not the exact filename.
 *   3. The current fix moves the config out of the repo root entirely to
 *      `scripts/db/drizzle.config.dev.ts`. Replit's detector only scans
 *      the root, so the file is now invisible to it.
 *
 * This script fails fast if anything (a bot, a Replit assistant, a manual
 * edit) re-introduces ANY `drizzle.config*.ts` file at the project root,
 * including the old `drizzle.config.ts` AND the previous-iteration
 * `drizzle.config.dev.ts`. Both would re-trigger the Replit detector. The
 * canonical location is `scripts/db/drizzle.config.dev.ts`. The guard is
 * wired into `scripts/start-prod.sh` so the production process refuses to
 * boot if either filename reappears at the root.
 *
 * Exit codes:
 *   0 — repo root has NO forbidden drizzle config (safe to deploy)
 *   1 — repo root HAS a forbidden drizzle config (deploy would re-trigger
 *       Replit's destructive-migration prompt; abort)
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FORBIDDEN_NAMES = ["drizzle.config.ts", "drizzle.config.dev.ts"];

const found = FORBIDDEN_NAMES.filter((name) =>
  fs.existsSync(path.join(ROOT, name)),
);

if (found.length > 0) {
  for (const name of found) {
    console.error(
      `[check-no-prod-drizzle-config] FAIL: \`${name}\` exists at the repo root.`,
    );
  }
  console.error(
    "[check-no-prod-drizzle-config] Replit's deploy pipeline auto-detects " +
      "the `drizzle.config*` glob at the repo root and runs `drizzle-kit push` " +
      "against production, which triggers the destructive-migration approval " +
      "prompt on every Publish.",
  );
  console.error(
    "[check-no-prod-drizzle-config] Fix: move the config back to " +
      "`scripts/db/drizzle.config.dev.ts` and use `npm run db:push:dev` " +
      "(already wired to --config=scripts/db/drizzle.config.dev.ts).",
  );
  process.exit(1);
}

console.log(
  "[check-no-prod-drizzle-config] OK — no `drizzle.config*.ts` at repo root; " +
    "Replit auto-push detector will not trigger.",
);
process.exit(0);
