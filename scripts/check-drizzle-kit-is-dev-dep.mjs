#!/usr/bin/env node
/**
 * check-drizzle-kit-is-dev-dep.mjs
 *
 * Guard rail: refuses to merge if `drizzle-kit` ever lands in
 * `package.json` "dependencies" (it MUST live in "devDependencies" only).
 *
 * Why: drizzle-kit in `dependencies` means Replit's deploy `npm install`
 * pulls it into the production node_modules. Even though we never invoke
 * `drizzle-kit push` from any prod path, having the binary present on the
 * deploy machine lets Replit's database integration discover it and run
 * schema-sync prompts. Keeping drizzle-kit strictly out of production
 * dependencies removes the binary entirely, defeating any external
 * auto-discovery.
 *
 * The companion runtime guard lives in scripts/start-prod.sh, which
 * refuses to boot if `node_modules/drizzle-kit` exists at startup time.
 *
 * Exit codes:
 *   0 — drizzle-kit is in devDependencies (or absent everywhere)
 *   1 — drizzle-kit found in dependencies / optionalDependencies / peerDependencies
 */

import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

const offenders = [];
for (const bucket of ["dependencies", "optionalDependencies", "peerDependencies"]) {
  if (pkg[bucket] && Object.prototype.hasOwnProperty.call(pkg[bucket], "drizzle-kit")) {
    offenders.push(bucket);
  }
}

if (offenders.length > 0) {
  console.error("[check-drizzle-kit-is-dev-dep] FAIL");
  console.error(
    `\`drizzle-kit\` found in: ${offenders.join(", ")}. It must live ONLY in "devDependencies".`,
  );
  console.error("");
  console.error("Background: drizzle-kit in production dependencies makes the binary");
  console.error("available to Replit's deploy runtime. Replit's database integration");
  console.error("then auto-discovers it and runs schema-sync prompts on every Publish.");
  console.error("Keeping drizzle-kit strictly devDependencies removes the binary from");
  console.error("the production node_modules, defeating that auto-discovery.");
  console.error("");
  console.error("Move it to \"devDependencies\" and re-run.");
  process.exit(1);
}

if (!pkg.devDependencies || !pkg.devDependencies["drizzle-kit"]) {
  console.warn(
    "[check-drizzle-kit-is-dev-dep] WARN — drizzle-kit not found in any deps bucket.",
  );
  console.warn("This is fine if you do not use drizzle-kit at all, but unexpected.");
  process.exit(0);
}

console.log(
  `[check-drizzle-kit-is-dev-dep] OK — drizzle-kit@${pkg.devDependencies["drizzle-kit"]} is in devDependencies only.`,
);
process.exit(0);
