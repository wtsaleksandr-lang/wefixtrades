#!/usr/bin/env node
/**
 * check-not-prod.mjs
 *
 * Gate for dev-only commands (specifically `drizzle-kit push`).
 *
 * Refuses to run if ANY of the following indicate a production context:
 *   1. NODE_ENV === 'production'
 *   2. DOPPLER_CONFIG === 'prd'
 *   3. DATABASE_URL host matches a known production pattern
 *      (project IDs visible on Replit's hosted Neon URLs for the prd database)
 *
 * Used as a prefix guard in the npm scripts:
 *   "db:push:dev":     "node scripts/check-not-prod.mjs && drizzle-kit push --config=drizzle.config.dev.ts",
 *   "db:generate:dev": "node scripts/check-not-prod.mjs && drizzle-kit generate --config=drizzle.config.dev.ts"
 *
 * Exit codes:
 *   0 — non-production environment (safe to proceed)
 *   1 — production environment detected (abort)
 *
 * Background: PR `fix(deploy): nuke drizzle-kit from production deps`.
 * Even with drizzle-kit moved to devDependencies + the config file renamed,
 * a developer with a prd DATABASE_URL exported in their shell could still
 * accidentally invoke `npm run db:push:dev` against production. This guard
 * is the last line of defense.
 */

const reasons = [];

if (process.env.NODE_ENV === "production") {
  reasons.push(`NODE_ENV is "production"`);
}

if (process.env.DOPPLER_CONFIG === "prd") {
  reasons.push(`DOPPLER_CONFIG is "prd"`);
}

// Production DATABASE_URL heuristics. Conservative — we want false negatives
// (allow dev) over false positives (block dev). The patterns below match the
// Replit-hosted Neon prd database URLs and the supabase prd host shape.
const dbUrl = process.env.DATABASE_URL ?? "";
const PROD_DB_PATTERNS = [
  /\bprd\b/i,
  /\bprod\b/i,
  /\bproduction\b/i,
];
for (const rx of PROD_DB_PATTERNS) {
  if (rx.test(dbUrl)) {
    // Don't echo the URL itself — never log secret values to chat / terminal.
    reasons.push(`DATABASE_URL matches production pattern /${rx.source}/${rx.flags}`);
    break;
  }
}

if (reasons.length > 0) {
  console.error("[check-not-prod] FAIL — refusing to run dev-only command:");
  for (const r of reasons) console.error(`  - ${r}`);
  console.error("");
  console.error("This guard protects against accidentally pushing drizzle schema");
  console.error("changes against the production database. Production applies SQL");
  console.error("via server/lib/bootstrapMigrations.ts at boot, NEVER via");
  console.error("drizzle-kit push.");
  console.error("");
  console.error("If you really need to run this against a non-prd database, unset");
  console.error("NODE_ENV / DOPPLER_CONFIG and use a dev DATABASE_URL.");
  process.exit(1);
}

console.log("[check-not-prod] OK — non-production environment.");
process.exit(0);
