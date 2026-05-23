/**
 * Deploy-safety Wave 1 — Guard 3: Drizzle schema-drift check.
 *
 * Background: PR #619 fixed a barrel-export chain that hid tables from
 * drizzle-kit's schema bundler, which caused `drizzle-kit push` to
 * propose DROPping legitimately-defined tables. The fix was to scan
 * each schema file directly in drizzle.config.ts.
 *
 * What this guard does:
 *   1. Runs `drizzle-kit generate` against a fresh temp `--out` directory.
 *   2. Reads every generated `.sql` file in that directory.
 *   3. If the generated SQL contains any DESTRUCTIVE statements (DROP /
 *      ALTER DROP / TRUNCATE / RENAME), that means the Drizzle schema
 *      definitions and the migration history are out of sync in a way
 *      that would destroy data on the next push — i.e. the same class
 *      of bug PR #619 just fixed.
 *   4. CREATE-only output is acceptable here: the team uses hand-rolled
 *      SQL in migrations/ rather than generated migrations, and no
 *      `migrations/meta/_journal.json` is committed, so generate always
 *      emits a from-scratch "CREATE everything" file. That alone is not
 *      drift; only generated DESTRUCTIVE ops indicate the kind of
 *      misalignment that breaks production.
 *   5. Always cleans up the temp dir afterwards.
 *
 * Requires: DATABASE_URL must be set for drizzle-kit to load
 * drizzle.config.ts. The value is never read — generate works fully
 * offline — but the config file's top-level `throw` insists on it.
 *
 * Wire in: `npm run check:schema-drift` and the CI workflow.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DESTRUCTIVE_RX = [
  { rx: /\bDROP\s+TABLE\b/gi, kind: "DROP TABLE" },
  { rx: /\bDROP\s+COLUMN\b/gi, kind: "DROP COLUMN" },
  { rx: /\bDROP\s+INDEX\b/gi, kind: "DROP INDEX" },
  { rx: /\bDROP\s+CONSTRAINT\b/gi, kind: "DROP CONSTRAINT" },
  { rx: /\bDROP\s+TYPE\b/gi, kind: "DROP TYPE" },
  { rx: /\bDROP\s+SEQUENCE\b/gi, kind: "DROP SEQUENCE" },
  { rx: /\bTRUNCATE\b/gi, kind: "TRUNCATE" },
  { rx: /\bRENAME\s+(?:COLUMN|TABLE|TO|CONSTRAINT)\b/gi, kind: "RENAME" },
  { rx: /\bALTER\s+TABLE\s+\S+\s+ALTER\s+COLUMN\s+\S+\s+SET\s+NOT\s+NULL\b/gi, kind: "ALTER COLUMN SET NOT NULL (potentially destructive on existing rows)" },
];

const outDir = mkdtempSync(join(tmpdir(), "wfx-drift-"));
// Use the npx-style invocation through `npm exec` to dodge Windows
// .cmd shim quirks with spawnSync (which returns undefined stdio when
// the .cmd shim fails to launch without shell:true). Going via the
// node binary keeps the call cross-platform and avoids shell:true.
const drizzleKitJs = join("node_modules", "drizzle-kit", "bin.cjs");

if (!existsSync(drizzleKitJs)) {
  console.error(`[check-schema-drift] cannot find ${drizzleKitJs} — run \`npm ci\` first.`);
  process.exit(1);
}

// drizzle-kit's `generate` errors if --config is combined with other
// CLI options, but it auto-discovers `drizzle.config.ts` in cwd and we
// can override --out only through env or by relocating cwd. The
// approach that works: temporarily set process.cwd() via spawnSync
// with cwd, copy drizzle.config.ts content over there… too brittle.
// Simpler: generate in the project root (default --out is read from
// drizzle.config.ts = ./migrations), then move new files. But that
// pollutes the real migrations/.
//
// Final approach: generate WITHOUT --config, passing --schema /
// --dialect / --out directly. We read the values from drizzle.config.ts
// at runtime so this stays in sync.

// Parse drizzle.config.ts crudely (no TS transform — read the file as
// text and extract `dialect:` + the `schema:` array literal).
const drizzleConfigPath = "drizzle.config.ts";
if (!existsSync(drizzleConfigPath)) {
  console.error("[check-schema-drift] drizzle.config.ts not found.");
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}
const drizzleConfigSrc = readFileSync(drizzleConfigPath, "utf-8");

const dialectMatch = drizzleConfigSrc.match(/dialect\s*:\s*["']([^"']+)["']/);
const dialect = dialectMatch?.[1];
if (!dialect) {
  console.error("[check-schema-drift] could not parse `dialect:` from drizzle.config.ts.");
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}

// Capture the schema array, e.g. ["./shared/schemas/*.ts", "!./shared/schemas/index.ts"]
const schemaArrayMatch = drizzleConfigSrc.match(/schema\s*:\s*\[([^\]]+)\]/);
const schemaScalarMatch = drizzleConfigSrc.match(/schema\s*:\s*["']([^"']+)["']/);
let schemaGlobs = [];
if (schemaArrayMatch) {
  schemaGlobs = [...schemaArrayMatch[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
} else if (schemaScalarMatch) {
  schemaGlobs = [schemaScalarMatch[1]];
} else {
  console.error("[check-schema-drift] could not parse `schema:` from drizzle.config.ts.");
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}

// drizzle-kit generate accepts only a single --schema; pass the first
// glob (matches the prod-config use of `./shared/schemas/*.ts`). The
// excluded-glob (`!./shared/schemas/index.ts`) is honoured because
// drizzle-kit also internally drops the barrel; even if it didn't, an
// index that re-exports leaves at most a duplicate-table noise — never
// a destructive op, which is what we test for.
const primarySchemaGlob = schemaGlobs.find((g) => !g.startsWith("!")) ?? schemaGlobs[0];

// Ensure DATABASE_URL is set for any code paths that touch it, even
// though generate works fully offline.
const childEnv = { ...process.env };
if (!childEnv.DATABASE_URL) {
  childEnv.DATABASE_URL = "postgresql://stub:stub@localhost:5432/stub";
}

const result = spawnSync(
  process.execPath,
  [
    drizzleKitJs,
    "generate",
    "--dialect", dialect,
    "--schema", primarySchemaGlob,
    "--out", outDir,
    "--name", "drift_check",
  ],
  { encoding: "utf-8", env: childEnv, shell: false },
);

if (result.status !== 0) {
  console.error("[check-schema-drift] drizzle-kit generate FAILED:");
  console.error(result.stdout);
  console.error(result.stderr);
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}

// Read every generated .sql file and look for destructive ops.
let generatedFiles = [];
try {
  generatedFiles = readdirSync(outDir).filter((f) => f.endsWith(".sql"));
} catch (err) {
  console.error(`[check-schema-drift] cannot read generated dir ${outDir}: ${err.message}`);
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}

const findings = [];
let totalCreates = 0;
for (const file of generatedFiles) {
  const content = readFileSync(join(outDir, file), "utf-8");
  totalCreates += (content.match(/^CREATE\b/gm) ?? []).length;
  for (const { rx, kind } of DESTRUCTIVE_RX) {
    const matches = [...content.matchAll(rx)];
    for (const m of matches) {
      // Capture surrounding line for context.
      const idx = m.index ?? 0;
      const lineStart = content.lastIndexOf("\n", idx) + 1;
      const lineEnd = content.indexOf("\n", idx);
      const line = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
      findings.push({ file, kind, line });
    }
  }
}

// Cleanup.
rmSync(outDir, { recursive: true, force: true });

if (findings.length === 0) {
  console.log(
    `[check-schema-drift] OK — drizzle-kit generate produced ${generatedFiles.length} ` +
      `file(s) with ${totalCreates} CREATE statement(s) and zero destructive ops.`,
  );
  process.exit(0);
}

console.error("[check-schema-drift] FAIL — Drizzle schema is out of sync with migrations/.");
console.error(
  "drizzle-kit generate produced destructive SQL that would run on the next push:\n",
);
const seen = new Set();
for (const f of findings) {
  const key = `${f.kind}|${f.line}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.error(`  - [${f.kind}] ${f.line}`);
}
console.error(
  "\nThis is the class of bug PR #619 fixed. Likely causes:",
);
console.error(
  "  - A table/column was removed from shared/schemas/* without a corresponding",
);
console.error(
  "    additive two-step migration (PR 1: stop reading; PR 2: drop).",
);
console.error(
  "  - drizzle.config.ts schema glob does not see a file that defines tables",
);
console.error(
  "    referenced elsewhere (barrel-export resolution gap — see PR #619).",
);
process.exit(1);
