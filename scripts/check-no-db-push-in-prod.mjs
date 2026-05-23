/**
 * Deploy-safety Wave 1 — Guard 2: forbid `drizzle-kit push` in any prod path.
 *
 * Background: tonight (PR #619) Drizzle-Kit emitted a destructive-migration
 * warning. Root-cause audit:
 *   - `.replit [deployment].run` calls `bash ./scripts/start-prod.sh`
 *   - `start-prod.sh` execs `node ./dist/index.cjs`
 *   - `package.json` `start` is `node ./dist/index.cjs`
 *   - NO production path invokes `drizzle-kit push`
 * The bug surfaced via `drizzle-kit generate`/`push` during DEV when the
 * schema barrel-export chain hid tables from drizzle-kit's bundler. The
 * fix landed in PR #619 (drizzle.config.ts now scans schema files directly).
 *
 * This guard locks the audit result in: it walks the files that define the
 * production entrypoint and fails CI if any of them references `db:push`
 * or `drizzle-kit push`. Combined with `bootstrapMigrations()` (the only
 * sanctioned prod schema-application path), this makes it structurally
 * impossible for a future PR to wire `drizzle-kit push` into a deploy.
 *
 * Dev convenience: the `db:push:dev` npm script is allowed everywhere.
 * It is NEVER invoked by the build/deploy/start chain.
 *
 * Wire in: `npm run check:no-db-push-in-prod` and the CI workflow.
 */

import { readFileSync, existsSync } from "node:fs";

// Files that MUST NOT reference db:push / drizzle-kit push. Each is part
// of the production build/deploy/start chain.
const PROD_PATH_FILES = [
  ".replit",
  "scripts/start-prod.sh",
  "script/build.ts",
  ".github/workflows/ci.yml",
  ".github/workflows/audit.yml",
];

// package.json gets a structural check (script-keys + lifecycle hooks), NOT
// a substring check, because the developer-only `db:push:dev` script value
// legitimately contains the literal string "drizzle-kit push".
const PACKAGE_JSON = "package.json";

// Lifecycle hooks that run automatically during build/install/start — any of
// these referencing db:push would silently invoke it on deploy.
const FORBIDDEN_LIFECYCLE_HOOKS = [
  "prebuild",
  "postbuild",
  "preinstall",
  "postinstall",
  "prestart",
  "poststart",
  "build",
  "start",
];

const FORBIDDEN_PATTERNS = [
  /\bdrizzle-kit\s+push\b/i,
  /\bnpm\s+run\s+db:push\b/i,
  /\byarn\s+db:push\b/i,
  /\bpnpm\s+db:push\b/i,
];

const offenders = [];

for (const file of PROD_PATH_FILES) {
  if (!existsSync(file)) continue;
  const content = readFileSync(file, "utf-8");
  for (const rx of FORBIDDEN_PATTERNS) {
    const m = content.match(rx);
    if (m) {
      offenders.push({ file, match: m[0] });
    }
  }
}

// Structural package.json check: scan only the lifecycle/deploy script
// values, not every script (which would catch the dev-only db:push:dev).
if (existsSync(PACKAGE_JSON)) {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf-8"));
  const scripts = pkg.scripts ?? {};
  for (const hook of FORBIDDEN_LIFECYCLE_HOOKS) {
    const value = scripts[hook];
    if (typeof value !== "string") continue;
    for (const rx of FORBIDDEN_PATTERNS) {
      const m = value.match(rx);
      if (m) {
        offenders.push({
          file: `${PACKAGE_JSON} (scripts.${hook})`,
          match: m[0],
        });
      }
    }
  }
}

if (offenders.length === 0) {
  console.log(
    "[check-no-db-push-in-prod] OK — no `drizzle-kit push` references in deploy paths.",
  );
  process.exit(0);
}

console.error("[check-no-db-push-in-prod] FAIL");
console.error("`drizzle-kit push` MUST NEVER run in production. Found references in:\n");
for (const o of offenders) {
  console.error(`  - ${o.file}: "${o.match}"`);
}
console.error(
  "\nProduction schema changes apply via the file-based runner only:",
);
console.error(
  "  server/lib/bootstrapMigrations.ts -> migrations/*.sql (transactional, ledger-tracked)",
);
console.error(
  "\nIf you need to push a schema change in dev, use `npm run db:push:dev`.",
);
process.exit(1);
