/**
 * BF-1 — migration safety guard.
 *
 * Fails CI if any file in `migrations/` contains a destructive statement
 * (DROP TABLE / TRUNCATE / DELETE FROM) targeting an auth-critical table
 * (`users`, `admin_users`, `password_reset_tokens`, `session`) without an
 * explicit, human-written escape hatch comment of the form:
 *
 *   -- ALLOW_AUTH_TABLE_MUTATION: <free-text reason>
 *
 * Rationale: BF-1 investigated reports of login credentials being erased
 * on production deploys. The bootstrap migrator (`server/lib/bootstrapMigrations.ts`)
 * runs every SQL file in `migrations/` on every cold boot. A future
 * migration that DROPs/TRUNCATEs `users` would silently wipe production
 * credentials on the very next deploy. This guard makes that
 * impossible-to-merge by accident; the escape-hatch comment forces the
 * author to acknowledge the destructive intent in code review.
 *
 * Wire in: `npm run check:migrations` and the CI workflow.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "migrations");

const PROTECTED_TABLES = [
  "users",
  "admin_users",
  "password_reset_tokens",
  "session",
];

const ESCAPE_HATCH = /ALLOW_AUTH_TABLE_MUTATION\s*:/i;

// Build a regex that matches `DROP TABLE [IF EXISTS] "?<table>"?` /
// `TRUNCATE [TABLE] [ONLY] "?<table>"?` / `DELETE FROM [ONLY] "?<table>"?`.
const tableAlt = PROTECTED_TABLES.map((t) => `"?${t}"?`).join("|");
const DESTRUCTIVE = new RegExp(
  `\\b(?:DROP\\s+TABLE(?:\\s+IF\\s+EXISTS)?|TRUNCATE(?:\\s+TABLE)?(?:\\s+ONLY)?|DELETE\\s+FROM(?:\\s+ONLY)?)\\s+(?:${tableAlt})\\b`,
  "i",
);

const offenders = [];

let entries;
try {
  entries = readdirSync(MIGRATIONS_DIR);
} catch (err) {
  console.error(`[check-migrations-safe] cannot read migrations/: ${err.message}`);
  process.exit(1);
}

for (const file of entries.sort()) {
  if (!file.endsWith(".sql")) continue;
  const path = join(MIGRATIONS_DIR, file);
  const sql = readFileSync(path, "utf-8");

  // Strip line comments so the escape-hatch comment itself doesn't trip
  // the destructive regex on a future "-- ALLOW_AUTH_TABLE_MUTATION: drop users".
  // We only care about destructive SQL, not destructive prose.
  const sqlOnly = sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");

  if (!DESTRUCTIVE.test(sqlOnly)) continue;

  // Destructive statement present — require the escape-hatch comment
  // ANYWHERE in the original file (comments included).
  if (ESCAPE_HATCH.test(sql)) continue;

  offenders.push(file);
}

if (offenders.length === 0) {
  console.log(
    `[check-migrations-safe] OK — no unguarded destructive statements against ` +
      `${PROTECTED_TABLES.join("/")} in ${entries.filter((f) => f.endsWith(".sql")).length} migration(s).`,
  );
  process.exit(0);
}

console.error("[check-migrations-safe] FAIL");
console.error(
  `The following migration file(s) contain DROP/TRUNCATE/DELETE against one of\n` +
    `${PROTECTED_TABLES.join(", ")} without the required acknowledgement comment:\n`,
);
for (const f of offenders) console.error(`  - migrations/${f}`);
console.error(
  `\nIf the mutation is intentional, add a comment to the migration file:\n` +
    `  -- ALLOW_AUTH_TABLE_MUTATION: <why this is safe + what restores affected rows>\n` +
    `\nBackground: BF-1. The bootstrap migrator applies every SQL file in\n` +
    `migrations/ on every cold boot; a destructive statement here wipes prod data.\n`,
);
process.exit(1);
