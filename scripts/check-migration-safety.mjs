/**
 * Deploy-safety Wave 1 — Guard 1: migration SQL destructive-op scanner.
 *
 * Scans every `migrations/*.sql` file for destructive operations and fails
 * CI if any are found without an explicit override comment. Complements
 * `check-migrations-safe.mjs` (BF-1) which only guards the four auth
 * tables; this guard is broader and table-agnostic.
 *
 * The class of bug this prevents: tonight's Drizzle-Kit destructive
 * migration warning (PR #619). If a migration file is generated or
 * authored that contains DROP TABLE / DROP COLUMN / RENAME / TRUNCATE /
 * unguarded DELETE, this guard refuses to merge it.
 *
 * Override mechanism: a migration may opt out with an explicit comment:
 *
 *   -- @migration-safety-override: <free-text reason>
 *
 * The reason is REQUIRED (the comment with no trailing reason still passes
 * the regex but is intentionally awkward to write — code review catches it).
 *
 * Wire in: `npm run check:migration-safety` and the CI workflow.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = "migrations";

const DESTRUCTIVE_PATTERNS = [
  { rx: /\bDROP\s+TABLE\s+(?!IF\s+EXISTS)/gi, kind: "DROP TABLE without IF EXISTS" },
  { rx: /\bDROP\s+COLUMN\s+(?!IF\s+EXISTS)/gi, kind: "DROP COLUMN without IF EXISTS" },
  { rx: /\bDROP\s+INDEX\s+(?!IF\s+EXISTS)/gi, kind: "DROP INDEX without IF EXISTS" },
  { rx: /\bDROP\s+CONSTRAINT\s+(?!IF\s+EXISTS)/gi, kind: "DROP CONSTRAINT without IF EXISTS" },
  { rx: /\bDROP\s+TYPE\s+(?!IF\s+EXISTS)/gi, kind: "DROP TYPE without IF EXISTS" },
  { rx: /\bDROP\s+SEQUENCE\s+(?!IF\s+EXISTS)/gi, kind: "DROP SEQUENCE without IF EXISTS" },
  { rx: /\bTRUNCATE\b/gi, kind: "TRUNCATE" },
  { rx: /\bRENAME\s+(?:COLUMN|TABLE|TO|CONSTRAINT)\b/gi, kind: "RENAME (use additive two-step migration instead)" },
  // DELETE FROM <table>; or DELETE FROM <table> WHERE 1=1; — both wipe data.
  { rx: /\bDELETE\s+FROM\s+\w+\s*(?:WHERE\s+1\s*=\s*1\s*)?;/gi, kind: "DELETE FROM without restrictive WHERE (or DELETE WHERE 1=1)" },
];

const OPT_OUT_COMMENT = "-- @migration-safety-override:";

function stripLineComments(sql) {
  // Strip `-- ...` line comments so the override comment itself does not
  // trip the destructive regex (e.g. `-- @migration-safety-override: drop x`).
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

function checkFile(file) {
  const content = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
  const hasOptOut = content.includes(OPT_OUT_COMMENT);
  const sqlOnly = stripLineComments(content);

  const findings = [];
  for (const { rx, kind } of DESTRUCTIVE_PATTERNS) {
    const matches = [...sqlOnly.matchAll(rx)];
    for (const m of matches) {
      findings.push({ file, kind, snippet: m[0].trim() });
    }
  }
  return { file, findings, hasOptOut };
}

let allSqlFiles;
try {
  allSqlFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
} catch (err) {
  console.error(`[check-migration-safety] cannot read migrations/: ${err.message}`);
  process.exit(1);
}

let hasBlocking = false;
const flagged = [];

for (const file of allSqlFiles) {
  const result = checkFile(file);
  if (result.findings.length === 0) continue;
  if (result.hasOptOut) {
    flagged.push({ file, count: result.findings.length });
    continue;
  }
  hasBlocking = true;
  for (const finding of result.findings) {
    console.error(`✖ ${finding.file}: ${finding.kind}`);
    console.error(`   "${finding.snippet}"`);
  }
}

if (hasBlocking) {
  console.error("\n[check-migration-safety] FAIL");
  console.error("Destructive operations are not allowed in migrations without one of:");
  console.error("  - IF EXISTS / IF NOT EXISTS guards where applicable");
  console.error("  - A two-step additive migration for column/table removals");
  console.error("    (PR 1: stop reading, deploy; PR 2: drop the now-unread column)");
  console.error("  - An explicit override comment if intentional:");
  console.error("      -- @migration-safety-override: <reason>");
  console.error("\nBackground: deploy-safety Wave 1. The bootstrap migrator");
  console.error("(server/lib/bootstrapMigrations.ts) applies every SQL file in");
  console.error("migrations/ on every cold boot in production.");
  process.exit(1);
}

if (flagged.length > 0) {
  console.log(
    `[check-migration-safety] OK with ${flagged.length} explicitly-justified opt-out file(s):`,
  );
  for (const f of flagged) {
    console.log(`  - ${f.file} (${f.count} flagged op(s), justified by @migration-safety-override)`);
  }
} else {
  console.log(
    `[check-migration-safety] OK — ${allSqlFiles.length} migration files scanned, no destructive ops.`,
  );
}
