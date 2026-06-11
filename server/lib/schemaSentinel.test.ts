/**
 * Boot schema sentinel tests — publish-trap class (ledger-vs-schema drift).
 *
 * Excluded from `tsc --noEmit` (tsconfig **\/*.test.ts). Runnable
 * standalone via:
 *
 *   npx tsx server/lib/schemaSentinel.test.ts
 *
 * Uses node's built-in `assert/strict` + an injected fake query client.
 * No test runner dep, no database, no network.
 *
 * Coverage (regression contract for the 2026-06-10 publish trap, where
 * Replit's publish flow dropped 7 prod columns the migration ledger said
 * were applied — so no reboot would ever re-apply them):
 *
 *   1. DELIBERATE-FAILURE FIXTURE: the exact 04:50Z drop — ledger has
 *      0082_client_payments_currency.sql, client_payments.currency absent,
 *      and the REAL migration file's SQL is what gets re-applied. The
 *      sentinel must detect, CRITICAL-log, re-apply inside BEGIN/COMMIT,
 *      re-probe, and report healed. If someone removes the heal branch
 *      (or starts re-inserting the ledger row), this goes red.
 *   2. probe-pass path — ledger and schema agree → ok, zero writes.
 *   3. probe-fail → re-apply throws → ROLLBACK + missing(heal_failed) +
 *      healthz degraded + CRITICAL log.
 *   4. probe-fail → re-apply commits but object still absent →
 *      missing(still_missing_after_heal).
 *   5. object missing + ledger missing → reported, NO heal attempt
 *      (first-apply belongs to bootstrapMigrations).
 *   6. several missing columns of ONE file → exactly one re-apply.
 *   7. healthz mapping — skipped / ok / ok+healed / degraded shapes.
 *   8. static idempotency guard — every SENTINELS file is additive +
 *      IF-NOT-EXISTS for every probed object and contains no destructive
 *      statements, so the self-heal re-apply is safe by construction.
 *   9. wiring contracts — server/index.ts awaits runSchemaSentinel AFTER
 *      bootstrapMigrations without exiting on failure; healthz.ts registers
 *      the schema_sentinel check via schemaSentinelHealthz.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  SENTINELS,
  verifySchemaSentinels,
  schemaSentinelHealthz,
  _setSchemaSentinelStateForTests,
  _resetSchemaSentinelStateForTests,
  type SentinelProbe,
  type SentinelQueryClient,
} from "./schemaSentinel";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

let passed = 0;
let failed = 0;

function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      // eslint-disable-next-line no-console
      console.log(`  ok  ${label}`);
    })
    .catch((err: any) => {
      failed++;
      // eslint-disable-next-line no-console
      console.error(`  FAIL ${label}: ${err?.message ?? err}`);
    });
}

/* ─── fake query client ───
 *
 * Implements the SentinelQueryClient surface over in-memory sets. Any query
 * that is not the ledger SELECT, an information_schema probe, or a
 * transaction keyword is treated as a migration-file re-apply and routed to
 * onApplySql (which can mutate the schema sets to simulate a successful
 * heal, or throw to simulate a failed one). Every call is recorded for
 * ordering / no-ledger-insert assertions. */
interface FakeDb {
  client: SentinelQueryClient;
  executed: Array<{ text: string; params?: unknown[] }>;
}

function makeFakeDb(opts: {
  ledger: string[];
  columns: Set<string>; // "table.column"
  tables: Set<string>;
  onApplySql?: (sql: string) => void;
}): FakeDb {
  const executed: Array<{ text: string; params?: unknown[] }> = [];
  const client: SentinelQueryClient = {
    async query(text: string, params?: unknown[]) {
      executed.push({ text, params });
      const t = text.trim();
      if (t === "BEGIN" || t === "COMMIT" || t === "ROLLBACK") return { rows: [] };
      if (t.includes("FROM __bootstrap_migrations")) {
        return { rows: opts.ledger.map((f) => ({ filename: f })) };
      }
      if (t.includes("information_schema.columns")) {
        const [table, column] = params as [string, string];
        return { rows: opts.columns.has(`${table}.${column}`) ? [{ present: 1 }] : [] };
      }
      if (t.includes("information_schema.tables")) {
        const [table] = params as [string];
        return { rows: opts.tables.has(table) ? [{ present: 1 }] : [] };
      }
      // Anything else = a migration file being re-applied.
      if (opts.onApplySql) opts.onApplySql(text);
      return { rows: [] };
    },
  };
  return { client, executed };
}

/** Capture console.error output (the dev-mode sink of log.error) while fn runs. */
async function captureConsoleError(fn: () => Promise<void>): Promise<string> {
  const original = console.error;
  const captured: string[] = [];
  console.error = (...args: unknown[]) => {
    captured.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return captured.join("\n");
}

const CURRENCY_PROBE: SentinelProbe = {
  ledgerFile: "0082_client_payments_currency.sql",
  table: "client_payments",
  column: "currency",
};

function stripSqlComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

async function main() {
  // 1 — THE regression test: the exact 2026-06-10 ~04:50Z publish trap.
  await check(
    "DELIBERATE-FAILURE FIXTURE: ledger has 0082, client_payments.currency absent → sentinel re-applies the REAL file and heals",
    async () => {
      const realSql = readFileSync(
        join(REPO_ROOT, "migrations", "0082_client_payments_currency.sql"),
        "utf-8",
      );
      const columns = new Set<string>(); // the drop: column gone from prod
      const db = makeFakeDb({
        ledger: ["0082_client_payments_currency.sql"], // ...but ledger says applied
        columns,
        tables: new Set(),
        onApplySql: (sql) => {
          // The heal effect of actually running the file's ADD COLUMN.
          if (/ADD COLUMN IF NOT EXISTS currency/i.test(sql)) {
            columns.add("client_payments.currency");
          }
        },
      });

      let result!: Awaited<ReturnType<typeof verifySchemaSentinels>>;
      const errLog = await captureConsoleError(async () => {
        result = await verifySchemaSentinels({
          client: db.client,
          readMigrationSql: async (file) => {
            assert.equal(file, "0082_client_payments_currency.sql");
            return realSql;
          },
          sentinels: [CURRENCY_PROBE],
        });
      });

      assert.equal(result.ok, true, "sentinel must end healthy after self-heal");
      assert.deepEqual(result.healed, ["0082_client_payments_currency.sql"]);
      assert.deepEqual(result.missing, []);
      assert.match(errLog, /CRITICAL/, "drift must be logged as CRITICAL (Sentry bridge)");
      assert.match(errLog, /client_payments\.currency/, "log must name the missing object");

      // The re-apply must be the real file, inside a transaction.
      const texts = db.executed.map((e) => e.text);
      const beginIdx = texts.indexOf("BEGIN");
      const sqlIdx = texts.findIndex((t) => t.includes("ADD COLUMN IF NOT EXISTS currency"));
      const commitIdx = texts.indexOf("COMMIT");
      assert.ok(beginIdx !== -1 && sqlIdx !== -1 && commitIdx !== -1, "BEGIN + file SQL + COMMIT must all run");
      assert.ok(beginIdx < sqlIdx && sqlIdx < commitIdx, "file SQL must run inside BEGIN/COMMIT");

      // The ledger row already exists — re-inserting it would violate the
      // filename PK and is exactly the wrong fix for this failure class.
      assert.ok(
        !texts.some((t) => /INSERT\s+INTO\s+__bootstrap_migrations/i.test(t)),
        "self-heal must NOT re-insert the ledger row",
      );
    },
  );

  // 2 — probe-pass path: ledger and schema agree.
  await check("probe-pass: all objects present → ok, no transaction, no heal", async () => {
    const db = makeFakeDb({
      ledger: ["0082_client_payments_currency.sql", "0083_outreach_sending_domains.sql"],
      columns: new Set(["client_payments.currency"]),
      tables: new Set(["outreach_sending_domains"]),
    });
    const result = await verifySchemaSentinels({
      client: db.client,
      readMigrationSql: async () => {
        throw new Error("must not read any migration file on the pass path");
      },
      sentinels: [
        CURRENCY_PROBE,
        { ledgerFile: "0083_outreach_sending_domains.sql", table: "outreach_sending_domains", column: null },
      ],
    });
    assert.equal(result.ok, true);
    assert.equal(result.checked, 2);
    assert.deepEqual(result.healed, []);
    assert.deepEqual(result.missing, []);
    assert.ok(
      !db.executed.some((e) => e.text.trim() === "BEGIN"),
      "no transaction may be opened when nothing is missing",
    );
  });

  // 3 — re-apply throws → ROLLBACK + heal_failed + healthz degraded.
  await check("probe-fail → re-apply throws → ROLLBACK, missing(heal_failed), healthz degraded", async () => {
    const db = makeFakeDb({
      ledger: ["0082_client_payments_currency.sql"],
      columns: new Set(),
      tables: new Set(),
      onApplySql: () => {
        throw new Error("relation client_payments does not exist");
      },
    });
    let result!: Awaited<ReturnType<typeof verifySchemaSentinels>>;
    const errLog = await captureConsoleError(async () => {
      result = await verifySchemaSentinels({
        client: db.client,
        readMigrationSql: async () => "ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS currency varchar(3);",
        sentinels: [CURRENCY_PROBE],
      });
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.healed, []);
    assert.equal(result.missing.length, 1);
    assert.equal(result.missing[0]!.reason, "heal_failed");
    assert.equal(result.missing[0]!.table, "client_payments");
    assert.match(errLog, /CRITICAL/);
    assert.ok(
      db.executed.some((e) => e.text.trim() === "ROLLBACK"),
      "failed re-apply must roll back",
    );

    // healthz mapping for this exact state → degraded + the missing list.
    _setSchemaSentinelStateForTests(result);
    const hz = schemaSentinelHealthz();
    assert.equal(hz.ok, false);
    assert.equal(hz.status, "degraded");
    assert.ok(hz.missing && hz.missing.length === 1);
    assert.match(hz.missing![0]!, /client_payments\.currency/);
    assert.match(hz.missing![0]!, /0082_client_payments_currency\.sql/);
    _resetSchemaSentinelStateForTests();
  });

  // 4 — re-apply commits but the object is still absent.
  await check("probe-fail → re-apply no-ops → missing(still_missing_after_heal)", async () => {
    const db = makeFakeDb({
      ledger: ["0082_client_payments_currency.sql"],
      columns: new Set(),
      tables: new Set(),
      onApplySql: () => {
        /* commits fine but adds nothing — e.g. wrong search_path */
      },
    });
    const errLog = await captureConsoleError(async () => {
      const result = await verifySchemaSentinels({
        client: db.client,
        readMigrationSql: async () => "ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS currency varchar(3);",
        sentinels: [CURRENCY_PROBE],
      });
      assert.equal(result.ok, false);
      assert.deepEqual(result.healed, []);
      assert.equal(result.missing.length, 1);
      assert.equal(result.missing[0]!.reason, "still_missing_after_heal");
    });
    assert.match(errLog, /STILL missing after re-apply/i);
  });

  // 5 — missing object whose file is NOT in the ledger → report, never heal.
  await check("object missing + ledger missing → ledger_missing, no heal attempt", async () => {
    const db = makeFakeDb({
      ledger: [], // bootstrap never recorded the file
      columns: new Set(),
      tables: new Set(),
      onApplySql: () => {
        throw new Error("re-apply must not run for ledger_missing");
      },
    });
    let readCalled = false;
    const errLog = await captureConsoleError(async () => {
      const result = await verifySchemaSentinels({
        client: db.client,
        readMigrationSql: async () => {
          readCalled = true;
          return "";
        },
        sentinels: [CURRENCY_PROBE],
      });
      assert.equal(result.ok, false);
      assert.equal(result.missing.length, 1);
      assert.equal(result.missing[0]!.reason, "ledger_missing");
    });
    assert.equal(readCalled, false, "must not read the migration file");
    assert.ok(
      !db.executed.some((e) => e.text.trim() === "BEGIN"),
      "must not open a heal transaction",
    );
    assert.match(errLog, /NOT in ledger/i);
  });

  // 6 — several missing columns of one file → exactly one re-apply.
  await check("multiple missing columns of one file → single re-apply heals all", async () => {
    const rankflowProbes: SentinelProbe[] = ["source", "clicks", "ctr"].map((column) => ({
      ledgerFile: "0080_rankflow_ranking_provenance.sql",
      table: "rankflow_rankings",
      column,
    }));
    const columns = new Set<string>();
    let applies = 0;
    const db = makeFakeDb({
      ledger: ["0080_rankflow_ranking_provenance.sql"],
      columns,
      tables: new Set(),
      onApplySql: () => {
        applies++;
        for (const p of rankflowProbes) columns.add(`${p.table}.${p.column}`);
      },
    });
    await captureConsoleError(async () => {
      const result = await verifySchemaSentinels({
        client: db.client,
        readMigrationSql: async () => "ALTER TABLE rankflow_rankings ADD COLUMN IF NOT EXISTS source VARCHAR(20);",
        sentinels: rankflowProbes,
      });
      assert.equal(result.ok, true);
      assert.deepEqual(result.healed, ["0080_rankflow_ranking_provenance.sql"]);
      assert.deepEqual(result.missing, []);
    });
    assert.equal(applies, 1, "one drifted file = exactly one re-apply");
  });

  // 7 — healthz mapping shapes.
  await check("healthz: never-ran → skipped (does not degrade the aggregate)", () => {
    _resetSchemaSentinelStateForTests();
    const hz = schemaSentinelHealthz();
    assert.equal(hz.ok, true);
    assert.equal(hz.status, "skipped");
  });

  await check("healthz: clean boot → ok with checked count", () => {
    _setSchemaSentinelStateForTests({ ok: true, checked: 14, healed: [], missing: [] });
    const hz = schemaSentinelHealthz();
    assert.equal(hz.ok, true);
    assert.equal(hz.status, "ok");
    assert.equal(hz.checked, 14);
    assert.equal(hz.healed, undefined);
    _resetSchemaSentinelStateForTests();
  });

  await check("healthz: drift healed at boot → ok but healed list surfaced", () => {
    _setSchemaSentinelStateForTests({
      ok: true,
      checked: 14,
      healed: ["0082_client_payments_currency.sql"],
      missing: [],
    });
    const hz = schemaSentinelHealthz();
    assert.equal(hz.ok, true);
    assert.equal(hz.status, "ok");
    assert.deepEqual(hz.healed, ["0082_client_payments_currency.sql"]);
    assert.match(hz.detail ?? "", /self-healed/);
    _resetSchemaSentinelStateForTests();
  });

  await check("healthz: sentinel infra error → degraded with detail", () => {
    _setSchemaSentinelStateForTests({
      ok: false,
      checked: 0,
      healed: [],
      missing: [],
      error: "connection terminated unexpectedly",
    });
    const hz = schemaSentinelHealthz();
    assert.equal(hz.ok, false);
    assert.equal(hz.status, "degraded");
    assert.match(hz.detail ?? "", /did not complete/);
    _resetSchemaSentinelStateForTests();
  });

  // 8 — static idempotency guard over the REAL migration files. The self-heal
  // re-apply is only safe because every sentinel file is additive +
  // IF NOT EXISTS; this pins that property for every current AND future
  // SENTINELS entry.
  await check("every SENTINELS file is additive + IF NOT EXISTS for every probed object", () => {
    const files = [...new Set(SENTINELS.map((s) => s.ledgerFile))];
    assert.ok(files.length >= 5, "expected sentinels across at least 5 migration files");
    for (const file of files) {
      const raw = readFileSync(join(REPO_ROOT, "migrations", file), "utf-8");
      const sql = stripSqlComments(raw);
      assert.ok(
        !/\b(DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE|DELETE\s+FROM)\b/i.test(sql),
        `${file} must contain no destructive statements`,
      );
      for (const probe of SENTINELS.filter((s) => s.ledgerFile === file)) {
        if (probe.column === null) {
          assert.match(
            sql,
            new RegExp(String.raw`CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+${probe.table}\b`, "i"),
            `${file} must CREATE TABLE IF NOT EXISTS ${probe.table}`,
          );
        } else {
          assert.match(
            sql,
            new RegExp(String.raw`ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+${probe.column}\b`, "i"),
            `${file} must ADD COLUMN IF NOT EXISTS ${probe.column}`,
          );
        }
      }
    }
  });

  // 8b — the declared blast radius: all 7 publish-trap columns + the 2FA
  // columns + the 0083 table + the 0084 consent objects stay covered.
  await check("SENTINELS pins the full 2026-06-10 blast radius", () => {
    const keys = new Set(SENTINELS.map((s) => `${s.table}.${s.column ?? "<table>"}`));
    for (const expected of [
      "client_payments.currency",
      "rankflow_rankings.source",
      "rankflow_rankings.url_found",
      "rankflow_rankings.local_pack_position",
      "rankflow_rankings.impressions",
      "rankflow_rankings.clicks",
      "rankflow_rankings.ctr",
      "users.totp_recovery_codes",
      "users.admin_2fa_grace_used_at",
      "outreach_sending_domains.<table>",
      "prospects.consent_basis",
      "prospects.consent_evidence",
      "prospects.consent_expires_at",
      "outbound_send_state.<table>",
    ]) {
      assert.ok(keys.has(expected), `SENTINELS must cover ${expected}`);
    }
  });

  // 9 — wiring contracts (source assertions, same pattern as
  // checkoutPaymentGate.test.ts).
  const indexSource = readFileSync(join(REPO_ROOT, "server", "index.ts"), "utf-8");
  const healthzSource = readFileSync(join(REPO_ROOT, "server", "routes", "healthz.ts"), "utf-8");
  const loggerSource = readFileSync(join(REPO_ROOT, "server", "lib", "logger.ts"), "utf-8");

  await check("wiring: boot awaits runSchemaSentinel AFTER bootstrapMigrations, without exiting on failure", () => {
    const bootIdx = indexSource.indexOf("await bootstrapMigrations()");
    const sentinelImportIdx = indexSource.indexOf('await import("./lib/schemaSentinel")');
    const sentinelRunIdx = indexSource.indexOf("await runSchemaSentinel()");
    assert.ok(bootIdx !== -1, "boot must call bootstrapMigrations");
    assert.ok(sentinelImportIdx !== -1, "boot must import the schema sentinel");
    assert.ok(sentinelRunIdx !== -1, "boot must await runSchemaSentinel");
    assert.ok(bootIdx < sentinelImportIdx, "sentinel must run AFTER bootstrapMigrations");
    // The sentinel's failure handling must NOT kill the boot — a degraded
    // server beats a dead one.
    const sentinelBlock = indexSource.slice(sentinelImportIdx, sentinelImportIdx + 400);
    assert.ok(!sentinelBlock.includes("process.exit"), "sentinel failure must not exit the process");
  });

  await check("wiring: healthz registers a schema_sentinel check backed by schemaSentinelHealthz", () => {
    assert.ok(healthzSource.includes("schemaSentinelHealthz"), "healthz must read the sentinel state");
    assert.match(
      healthzSource,
      /probe\(\s*"schema_sentinel"/,
      "healthz must run a schema_sentinel probe",
    );
    assert.match(
      healthzSource,
      /schema_sentinel:\s*sentinelR/,
      "schema_sentinel must be in the checks record",
    );
  });

  await check("wiring: logger bridge supports sentry:'force' (CRITICAL events bypass sampling)", () => {
    assert.ok(
      loggerSource.includes('data.sentry === "force"'),
      "logger.ts must honor the sentry:'force' opt-in",
    );
  });

  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
