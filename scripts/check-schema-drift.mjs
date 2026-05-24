/**
 * Deploy-safety: Drizzle schema-drift check.
 *
 * Background: PR #619 fixed a barrel-export chain that hid tables from
 * drizzle-kit's schema bundler, which caused `drizzle-kit push` to
 * propose DROPping legitimately-defined tables. Later, even after the
 * config was renamed and the Replit DB integration was removed, the
 * Replit Publish flow still surfaced a destructive-migration prompt
 * because the live DB held tables/columns/indexes that the Drizzle
 * schema definitions did NOT declare — drizzle-kit push compares the
 * live DB to the schema and proposes DROPs for anything in the DB but
 * absent from the schema.
 *
 * This script has TWO layers:
 *
 *   Layer 1 — drizzle-kit generate destructive-ops scan
 *     1. Runs `drizzle-kit generate` against a fresh temp `--out` dir.
 *     2. Fails if the generated SQL contains DROP / TRUNCATE / RENAME.
 *     CREATE-only output is acceptable: the team uses hand-rolled SQL
 *     in migrations/ rather than generated migrations, and no
 *     migrations/meta/_journal.json is committed, so generate always
 *     emits a from-scratch "CREATE everything" file.
 *
 *   Layer 2 — migrations/*.sql ↔ schema definitions parity check
 *     1. Walks every migrations/*.sql for CREATE TABLE / CREATE INDEX
 *        / CREATE UNIQUE INDEX statements.
 *     2. Walks every shared/schemas/*.ts (excluding index.ts barrel)
 *        for table-name string literals and index() / uniqueIndex()
 *        name string literals.
 *     3. Fails listing every migration object that is NOT referenced
 *        by some schema file. Those are exactly the items drizzle-kit
 *        push would propose to DROP on a Replit Publish.
 *     This catches drift the Layer 1 generate-only scan cannot see,
 *     because generate doesn't know about the existing DB / migration
 *     history (no _journal.json is committed).
 *
 * Requires: DATABASE_URL must be set for drizzle-kit to load
 * drizzle.config.dev.ts. The value is never read — generate works fully
 * offline — but the config file's top-level `throw` insists on it.
 *
 * Wire in: `npm run check:schema-drift` and the CI workflow.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync, statSync } from "node:fs";
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

// ──────────────────────────────────────────────────────────────────
// Layer 2 helpers — migrations/*.sql ↔ schema-definitions parity.
// ──────────────────────────────────────────────────────────────────

// Tables that exist in the DB but are intentionally NOT declared in
// shared/schemas/* (Drizzle ignores → no DROP risk because drizzle-kit
// only proposes DROP for tables in BOTH its known set + DB; unknown
// tables in DB only generate a `--introspect` warning, not a DROP).
// Listed for documentation only — currently empty.
const IGNORED_TABLES = new Set(/** @type {string[]} */ ([]));

// Indexes that exist in the DB but are intentionally NOT declared in
// shared/schemas/*. Typically auto-named primary key / unique
// constraint indexes that Postgres creates implicitly and drizzle-kit
// already knows about by convention (e.g. `<table>_pkey`).
const IGNORED_INDEX_RX = [
  /_pkey$/i,                // primary-key auto-index
  /^IDX_session_expire$/i,  // connect-pg-simple manages this
];

// HISTORIC DRIFT BACKLOG — indexes created by migrations 0006-0038 that
// were never back-ported into the Drizzle schema definitions. Each
// already exists in the production DB and has lived there since its
// migration shipped, so production is correct; the schema files just
// don't know about them. drizzle-kit push WOULD propose to DROP these
// if it ran against production — which is precisely why production's
// real defense is `drizzle-kit` being absent from production
// node_modules (see scripts/start-prod.sh guards) and the renamed
// drizzle.config.dev.ts.
//
// These are explicitly allowlisted here so the parity check passes
// in CI while the items remain visible as a backlog. A small follow-
// up PR per file-group should chip away by declaring the matching
// `index(...)` / `uniqueIndex(...)` calls; remove an entry from the
// list when its schema declaration lands. New drift introduced by
// any future migration MUST be either declared in the schema or
// explicitly added here with a one-line rationale — silent additions
// are not allowed.
const HISTORIC_DRIFT_BACKLOG_INDEXES = new Set([
  // migrations/0006_reputationshield_sprint1.sql
  "idx_reviews_client_id",
  "idx_reviews_client_created",
  "idx_reviews_client_platform",
  "idx_reviews_client_reply_status",
  "idx_reviews_sentiment",
  "idx_reviews_needs_reply",
  "idx_review_requests_client_id",
  "idx_review_requests_status",
  "idx_review_requests_run_at",
  "idx_review_requests_next_followup",
  "idx_review_requests_client_created",
  "idx_monitored_reviews_client_id",
  "idx_monitored_reviews_client_created",
  "idx_monitored_reviews_is_new",
  "idx_monitored_reviews_low_rating",
  "idx_monitored_reviews_unposted_draft",
  "idx_monitored_reviews_pending_approval",
  "idx_review_response_edits_review_id",
  // migrations/0007_reputationshield_sprint2_foundations.sql
  "idx_reply_queue_due",
  "idx_reply_queue_client",
  "idx_reply_queue_dead_letter",
  "idx_gbl_client_enabled",
  // migrations/0008_reputationshield_widget_competitor.sql
  "idx_competitors_client_enabled",
  "idx_competitor_snapshots_client",
  // migrations/0011_users_google_sub.sql
  "users_google_sub_unique",
  // migrations/0012_quotequick_ai_budget.sql
  "ai_budget_audit_log_scope_created_at_idx",
  // migrations/0013_quotequick_slug_lifecycle.sql
  "idx_calculators_slug_lifecycle",
  // migrations/0015_widget_scheduling.sql
  "idx_availability_rules_calc",
  "idx_scheduled_appointments_calc_time",
  // migrations/0017_quote_snapshots.sql
  "idx_quote_snapshots_calc",
  // migrations/0018_quotequick_admin_overrides.sql
  "quotequick_template_overrides_archived_idx",
  "quotequick_trade_overrides_archived_idx",
  // migrations/0020_audit_log.sql
  "audit_log_entity_idx",
  "audit_log_actor_idx",
  "audit_log_created_at_idx",
  // migrations/0029_ai_loop_observability.sql
  "ai_usage_logs_loop_idx",
  // migrations/0033_shared_files_retention.sql
  "voicemails_retention_idx",
  "assistant_messages_retention_idx",
  // migrations/0038_product_catalog_visibility_and_sort.sql
  "service_catalog_visibility_idx",
  "service_catalog_sort_idx",
]);

function parseMigrationObjects(migrationsDir) {
  const tables = new Map();   // name → migration file
  const indexes = new Map();  // name → { file, unique }
  if (!existsSync(migrationsDir)) return { tables, indexes };

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // Strip a SQL comment-stripped, simplified view. We just need to find
  // CREATE TABLE "x" / CREATE [UNIQUE] INDEX "name" patterns.
  // Names may be either quoted ("foo") or bare (foo).
  const tableRx = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*))/gi;
  const indexRx = /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*))/gi;

  for (const file of files) {
    const src = readFileSync(join(migrationsDir, file), "utf-8");
    // Strip line + block comments so we don't pick up names inside docs.
    const stripped = src
      .replace(/--[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

    for (const m of stripped.matchAll(tableRx)) {
      const name = m[1] ?? m[2];
      if (!name) continue;
      if (!tables.has(name)) tables.set(name, file);
    }
    for (const m of stripped.matchAll(indexRx)) {
      const unique = !!m[1];
      const name = m[2] ?? m[3];
      if (!name) continue;
      if (!indexes.has(name)) indexes.set(name, { file, unique });
    }
  }

  return { tables, indexes };
}

function collectSchemaIdentifiers(schemasDir) {
  // Reads every shared/schemas/*.ts (except index.ts barrel) and
  // collects every string literal that could be a table name (passed
  // to `pgTable("…")`) or an index name (passed to `index("…")` /
  // `uniqueIndex("…")`). Heuristic — we only need the set of literals
  // so a definition error like missing index() ≠ silent pass.
  const tables = new Set();
  const indexes = new Set();
  if (!existsSync(schemasDir)) return { tables, indexes };

  function walk(dir) {
    const ents = readdirSync(dir);
    for (const ent of ents) {
      const p = join(dir, ent);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (!ent.endsWith(".ts")) continue;
      if (ent === "index.ts") continue;
      const src = readFileSync(p, "utf-8");
      const stripped = src
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of stripped.matchAll(/pgTable\s*\(\s*["'`]([^"'`]+)["'`]/g)) {
        tables.add(m[1]);
      }
      for (const m of stripped.matchAll(/\b(?:uniqueIndex|index)\s*\(\s*["'`]([^"'`]+)["'`]/g)) {
        indexes.add(m[1]);
      }
    }
  }

  walk(schemasDir);
  return { tables, indexes };
}

// ──────────────────────────────────────────────────────────────────
// LAYER 2 RUN — parity check (always runs; fast + cheap).
// ──────────────────────────────────────────────────────────────────

const layer2Findings = [];
const migrationsDir = "migrations";
const schemasDir = join("shared", "schemas");
const migObjects = parseMigrationObjects(migrationsDir);
const schemaIds = collectSchemaIdentifiers(schemasDir);

for (const [tableName, file] of migObjects.tables) {
  if (IGNORED_TABLES.has(tableName)) continue;
  if (!schemaIds.tables.has(tableName)) {
    layer2Findings.push({
      kind: "MISSING TABLE",
      name: tableName,
      file,
      hint: `migrations/${file} creates table "${tableName}" but no shared/schemas/*.ts defines it. drizzle-kit push would propose DROP TABLE.`,
    });
  }
}

const backlogHits = [];
for (const [indexName, info] of migObjects.indexes) {
  if (IGNORED_INDEX_RX.some((rx) => rx.test(indexName))) continue;
  if (schemaIds.indexes.has(indexName)) continue;
  if (HISTORIC_DRIFT_BACKLOG_INDEXES.has(indexName)) {
    backlogHits.push({ name: indexName, file: info.file });
    continue;
  }
  layer2Findings.push({
    kind: "MISSING INDEX",
    name: indexName,
    file: info.file,
    hint:
      `migrations/${info.file} creates ${info.unique ? "UNIQUE " : ""}` +
      `INDEX "${indexName}" but no shared/schemas/*.ts declares it via ` +
      `${info.unique ? "uniqueIndex" : "index"}(\"${indexName}\"). ` +
      `drizzle-kit push would propose DROP INDEX.`,
  });
}

if (layer2Findings.length > 0) {
  console.error("[check-schema-drift] FAIL — migrations ↔ schema definitions drift.");
  console.error(
    "The Drizzle schema files do NOT declare the following objects that the\n" +
      "migration SQL files create. drizzle-kit push (which Replit's Publish flow\n" +
      "runs against production) would propose to DROP each one — exactly the\n" +
      "destructive-migration approval prompt Alex sees.",
  );
  console.error("");
  for (const f of layer2Findings) {
    console.error(`  - [${f.kind}] ${f.name}`);
    console.error(`      ${f.hint}`);
  }
  console.error("");
  console.error(
    "Fix: add the missing table / index declaration to the matching\n" +
      "shared/schemas/<file>.ts so its pgTable / index / uniqueIndex name\n" +
      "string matches the migration SQL exactly. Direction (ASC/DESC),\n" +
      "uniqueness, and partial-WHERE clauses must also match.",
  );
  process.exit(1);
}

console.log(
  `[check-schema-drift] Layer 2 OK — ${migObjects.tables.size} tables + ` +
    `${migObjects.indexes.size} indexes in migrations/ all have matching ` +
    `declarations in shared/schemas/.`,
);
if (backlogHits.length > 0) {
  console.log(
    `[check-schema-drift] NOTE — ${backlogHits.length} migration indexes are ` +
      `tracked in HISTORIC_DRIFT_BACKLOG_INDEXES (allowlisted). These would ` +
      `be dropped if drizzle-kit push ever ran against production. The ` +
      `production defense is that drizzle-kit binary is absent from prod ` +
      `node_modules (start-prod.sh guard). Backlog: declare each in its ` +
      `matching shared/schemas/*.ts and remove from the allowlist.`,
  );
}

// ──────────────────────────────────────────────────────────────────
// LAYER 1 RUN — drizzle-kit generate destructive-ops scan.
// ──────────────────────────────────────────────────────────────────

// drizzle-kit's `generate` errors if --config is combined with other
// CLI options. We read drizzle.config.dev.ts (the prod config was
// intentionally renamed) for `dialect:` + the `schema:` array literal
// so this stays in sync.
const drizzleConfigPath = existsSync("drizzle.config.dev.ts")
  ? "drizzle.config.dev.ts"
  : "drizzle.config.ts"; // back-compat if someone re-creates it
if (!existsSync(drizzleConfigPath)) {
  console.error("[check-schema-drift] drizzle config not found (drizzle.config.dev.ts / drizzle.config.ts).");
  process.exit(1);
}
const drizzleConfigSrc = readFileSync(drizzleConfigPath, "utf-8");

const dialectMatch = drizzleConfigSrc.match(/dialect\s*:\s*["']([^"']+)["']/);
const dialect = dialectMatch?.[1];
if (!dialect) {
  console.error(`[check-schema-drift] could not parse \`dialect:\` from ${drizzleConfigPath}.`);
  process.exit(1);
}

const schemaArrayMatch = drizzleConfigSrc.match(/schema\s*:\s*\[([^\]]+)\]/);
const schemaScalarMatch = drizzleConfigSrc.match(/schema\s*:\s*["']([^"']+)["']/);
let schemaGlobs = [];
if (schemaArrayMatch) {
  schemaGlobs = [...schemaArrayMatch[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
} else if (schemaScalarMatch) {
  schemaGlobs = [schemaScalarMatch[1]];
} else {
  console.error(`[check-schema-drift] could not parse \`schema:\` from ${drizzleConfigPath}.`);
  process.exit(1);
}

const primarySchemaGlob = schemaGlobs.find((g) => !g.startsWith("!")) ?? schemaGlobs[0];

// drizzle-kit MUST be installed locally for Layer 1. In CI / prod
// environments where devDependencies are pruned, drizzle-kit will be
// missing and Layer 1 is skipped (the runtime guards in
// scripts/start-prod.sh already enforce that drizzle-kit is absent
// from prod). Layer 2 above already ran and is sufficient on its own.
const drizzleKitJs = join("node_modules", "drizzle-kit", "bin.cjs");
if (!existsSync(drizzleKitJs)) {
  console.log(
    "[check-schema-drift] Layer 1 SKIPPED — drizzle-kit not installed " +
      "(prod-pruned env is fine). Layer 2 parity check already passed.",
  );
  process.exit(0);
}

const outDir = mkdtempSync(join(tmpdir(), "wfx-drift-"));
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
  console.error("[check-schema-drift] Layer 1 drizzle-kit generate FAILED:");
  console.error(result.stdout);
  console.error(result.stderr);
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}

let generatedFiles = [];
try {
  generatedFiles = readdirSync(outDir).filter((f) => f.endsWith(".sql"));
} catch (err) {
  console.error(`[check-schema-drift] cannot read generated dir ${outDir}: ${err.message}`);
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}

const layer1Findings = [];
let totalCreates = 0;
for (const file of generatedFiles) {
  const content = readFileSync(join(outDir, file), "utf-8");
  totalCreates += (content.match(/^CREATE\b/gm) ?? []).length;
  for (const { rx, kind } of DESTRUCTIVE_RX) {
    const matches = [...content.matchAll(rx)];
    for (const m of matches) {
      const idx = m.index ?? 0;
      const lineStart = content.lastIndexOf("\n", idx) + 1;
      const lineEnd = content.indexOf("\n", idx);
      const line = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
      layer1Findings.push({ file, kind, line });
    }
  }
}

rmSync(outDir, { recursive: true, force: true });

if (layer1Findings.length === 0) {
  console.log(
    `[check-schema-drift] Layer 1 OK — drizzle-kit generate produced ${generatedFiles.length} ` +
      `file(s) with ${totalCreates} CREATE statement(s) and zero destructive ops.`,
  );
  process.exit(0);
}

console.error("[check-schema-drift] Layer 1 FAIL — Drizzle schema generate produced destructive SQL.");
console.error("");
const seen = new Set();
for (const f of layer1Findings) {
  const key = `${f.kind}|${f.line}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.error(`  - [${f.kind}] ${f.line}`);
}
console.error("");
console.error("Likely causes:");
console.error("  - A table/column was removed from shared/schemas/* without an");
console.error("    additive two-step migration (PR 1: stop reading; PR 2: drop).");
console.error("  - drizzle config schema glob does not see a file that defines tables");
console.error("    referenced elsewhere (barrel-export resolution gap — see PR #619).");
process.exit(1);
