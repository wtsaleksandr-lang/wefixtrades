/**
 * Boot schema sentinel — self-heals ledger-vs-schema drift (publish-trap class).
 *
 * The incident this guards against (2026-06-10, ~04:50Z): Replit's publish
 * flow dropped 7 production columns (client_payments.currency + the 6
 * rankflow_rankings provenance columns) while `__bootstrap_migrations` still
 * said their migration files were applied. Because the ledger ALREADY had the
 * rows, bootstrapMigrations treated the files as done on every subsequent
 * boot — so no reboot would ever re-apply them, and checkout died silently.
 *
 * The sentinel runs right AFTER bootstrapMigrations() in the boot path and
 * verifies a declared list of SENTINELS — `{ledgerFile, table, column}`
 * triples ("column: null" = table-existence probe) checked against
 * information_schema. On a missing object:
 *
 *   1. Ledger says the file IS applied (the publish-trap signature):
 *      a. log a CRITICAL structured error — `sentry: "force"` bypasses the
 *         logger bridge's sampling so the event always reaches Sentry;
 *      b. self-heal by re-running that ONE migration file. Safe because
 *         every sentinel file is additive + idempotent (ADD COLUMN
 *         IF NOT EXISTS / CREATE TABLE IF NOT EXISTS / CREATE INDEX
 *         IF NOT EXISTS — statically asserted in schemaSentinel.test.ts).
 *         The ledger row is NOT re-inserted (it already exists — that is
 *         the definition of this failure class);
 *      c. re-probe. Still missing → the `schema_sentinel` healthz check
 *         reports `degraded` with the missing list. The boot is NEVER
 *         crashed — a degraded server beats a dead one.
 *   2. Ledger does NOT have the file (bootstrapMigrations owns first
 *      apply and runs before us, so this is a different, weirder failure):
 *      no heal attempt — report it (CRITICAL log + healthz degraded).
 *
 * Healthz wiring: server/routes/healthz.ts calls schemaSentinelHealthz()
 * (pure in-memory read of the boot-time result — no extra DB load per
 * healthz tick). `degraded`, never `down`, so the post-deploy watchdog
 * does not roll back on drift it may have just healed.
 *
 * Testability: verifySchemaSentinels() takes an injected query client +
 * migration-file reader, and this module never imports ../db at top level
 * (db.ts throws without DATABASE_URL). Only runSchemaSentinel() — the boot
 * wrapper — lazily imports the real pool. Zero new dependencies.
 */

import fs from "fs/promises";
import path from "path";
import { createLogger } from "./logger";

const log = createLogger("SchemaSentinel");

export interface SentinelProbe {
  /** Migration file in migrations/ whose ledger entry guards this object. */
  ledgerFile: string;
  /** public-schema table the object lives in (or IS, for table probes). */
  table: string;
  /** Column that must exist; null = table-existence probe. */
  column: string | null;
}

/**
 * Everything recent enough to be in the blast radius of the 2026-06-10
 * dev/prod publish diff. When adding a new entry, the migration file MUST be
 * additive + idempotent (IF NOT EXISTS on every object) — the test suite
 * statically asserts this for every file listed here.
 */
export const SENTINELS: SentinelProbe[] = [
  // 0080 — the 6 rankflow_rankings provenance columns dropped by the publish trap.
  { ledgerFile: "0080_rankflow_ranking_provenance.sql", table: "rankflow_rankings", column: "source" },
  { ledgerFile: "0080_rankflow_ranking_provenance.sql", table: "rankflow_rankings", column: "url_found" },
  { ledgerFile: "0080_rankflow_ranking_provenance.sql", table: "rankflow_rankings", column: "local_pack_position" },
  { ledgerFile: "0080_rankflow_ranking_provenance.sql", table: "rankflow_rankings", column: "impressions" },
  { ledgerFile: "0080_rankflow_ranking_provenance.sql", table: "rankflow_rankings", column: "clicks" },
  { ledgerFile: "0080_rankflow_ranking_provenance.sql", table: "rankflow_rankings", column: "ctr" },
  // 0081 — admin 2FA recovery-code columns on users.
  { ledgerFile: "0081_admin_2fa_recovery_codes.sql", table: "users", column: "totp_recovery_codes" },
  { ledgerFile: "0081_admin_2fa_recovery_codes.sql", table: "users", column: "admin_2fa_grace_used_at" },
  // 0082 — the 7th dropped column; its absence killed checkout.
  { ledgerFile: "0082_client_payments_currency.sql", table: "client_payments", column: "currency" },
  // 0083 — cold-outreach sending-domain pool table.
  { ledgerFile: "0083_outreach_sending_domains.sql", table: "outreach_sending_domains", column: null },
  // 0084 — CASL consent columns + global send-ramp state table.
  { ledgerFile: "0084_outbound_casl_consent.sql", table: "prospects", column: "consent_basis" },
  { ledgerFile: "0084_outbound_casl_consent.sql", table: "prospects", column: "consent_evidence" },
  { ledgerFile: "0084_outbound_casl_consent.sql", table: "prospects", column: "consent_expires_at" },
  { ledgerFile: "0084_outbound_casl_consent.sql", table: "outbound_send_state", column: null },
  // 0098 — quote-recompute audit trail. Deploy-critical: leadRoutes writes both
  // columns on EVERY capture, so a publish-trap drop would 500 lead submission.
  { ledgerFile: "0098_lead_quote_recompute.sql", table: "leads", column: "quote_amount_client" },
  { ledgerFile: "0098_lead_quote_recompute.sql", table: "leads", column: "quote_recompute_status" },
  // 0099 — Citation Builder fulfilment. Deploy-critical: the directory-task
  // table is the ONLY record of work performed on a paid order, and the two
  // email stamps are what stop a progress/completion mail firing twice. A
  // publish-trap drop would 500 the admin queue and un-stamp every order.
  { ledgerFile: "0099_citation_builder_fulfilment.sql", table: "citation_builder_directory_tasks", column: null },
  { ledgerFile: "0099_citation_builder_fulfilment.sql", table: "citation_builder_submissions", column: "progress_email_sent_at" },
  { ledgerFile: "0099_citation_builder_fulfilment.sql", table: "citation_builder_submissions", column: "completion_email_sent_at" },
  // 0101 — the column that makes an inbound HELP text attributable to the
  // tenant it arrived for. Deploy-critical in the quiet direction: the inbound
  // webhook writes it on every keyword text, and a publish-trap drop would both
  // 500 the handler and silently return the table to holding phone numbers no
  // account deletion can reach.
  { ledgerFile: "0101_sms_messages_client_attribution.sql", table: "sms_messages", column: "scope_client_id" },
];

/** Minimal query surface — satisfied by a pg PoolClient and by test fakes. */
export interface SentinelQueryClient {
  query(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export type MissingReason =
  /** Re-apply of the migration file threw (or the file could not be read). */
  | "heal_failed"
  /** Re-apply committed but the re-probe still does not see the object. */
  | "still_missing_after_heal"
  /** Object missing AND ledger has no row for the file — not the publish-trap
   *  class; bootstrapMigrations owns first-apply, so we only report. */
  | "ledger_missing";

export interface MissingObject {
  ledgerFile: string;
  table: string;
  column: string | null;
  reason: MissingReason;
}

export interface SchemaSentinelResult {
  /** True when every probe is present (possibly after self-heal). */
  ok: boolean;
  /** Number of sentinel probes evaluated. */
  checked: number;
  /** Ledger files that drifted and were fully self-healed by re-apply. */
  healed: string[];
  /** Objects still missing after the heal attempt (healthz → degraded). */
  missing: MissingObject[];
  /** Set when the sentinel itself failed to complete (infra error). */
  error?: string;
}

export interface SentinelDeps {
  client: SentinelQueryClient;
  /** Reads the raw SQL of migrations/<ledgerFile>; injectable for tests. */
  readMigrationSql: (ledgerFile: string) => Promise<string>;
  /** Probe list override for tests; defaults to SENTINELS. */
  sentinels?: SentinelProbe[];
}

function describeObject(p: { table: string; column: string | null }): string {
  return p.column === null ? p.table : `${p.table}.${p.column}`;
}

async function probeExists(
  client: SentinelQueryClient,
  p: SentinelProbe,
): Promise<boolean> {
  if (p.column === null) {
    const r = await client.query(
      `SELECT 1 AS present FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
      [p.table],
    );
    return r.rows.length > 0;
  }
  const r = await client.query(
    `SELECT 1 AS present FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
    [p.table, p.column],
  );
  return r.rows.length > 0;
}

/**
 * Core verification + self-heal pass. Pure with respect to module state —
 * returns the result; never throws for probe/heal failures (only for
 * infrastructure errors like the ledger table itself being unreadable,
 * which runSchemaSentinel converts into a non-fatal `error` result).
 */
export async function verifySchemaSentinels(
  deps: SentinelDeps,
): Promise<SchemaSentinelResult> {
  const sentinels = deps.sentinels ?? SENTINELS;
  const { client } = deps;

  const ledger = await client.query("SELECT filename FROM __bootstrap_migrations");
  const applied = new Set(ledger.rows.map((r) => String(r.filename)));

  // First probe pass.
  const failing: SentinelProbe[] = [];
  for (const s of sentinels) {
    if (!(await probeExists(client, s))) failing.push(s);
  }

  const healed: string[] = [];
  const missing: MissingObject[] = [];

  if (failing.length > 0) {
    // Group by ledger file — one file with several missing objects gets ONE
    // re-apply, then every probe of that file is re-checked.
    const byFile = new Map<string, SentinelProbe[]>();
    for (const s of failing) {
      const list = byFile.get(s.ledgerFile) ?? [];
      list.push(s);
      byFile.set(s.ledgerFile, list);
    }

    for (const [file, probes] of byFile) {
      const objects = probes.map(describeObject);

      if (!applied.has(file)) {
        // Missing object but the ledger never recorded the file. Bootstrap
        // runs before us and hard-fails on apply errors, so this is NOT the
        // publish-trap class. Report loudly; do not heal (first apply is
        // bootstrapMigrations' job — re-running here without a ledger insert
        // would leave the ledger permanently behind).
        log.error(
          "CRITICAL: schema object(s) missing and migration NOT in ledger — bootstrapMigrations did not apply it",
          { sentry: "force", ledgerFile: file, objects },
        );
        for (const p of probes) {
          missing.push({ ledgerFile: p.ledgerFile, table: p.table, column: p.column, reason: "ledger_missing" });
        }
        continue;
      }

      // THE publish-trap signature: ledger says applied, schema disagrees.
      log.error(
        "CRITICAL: ledger-vs-schema drift — ledger says migration applied but schema object(s) missing; attempting self-heal re-apply",
        { sentry: "force", ledgerFile: file, objects },
      );

      let sql: string;
      try {
        sql = await deps.readMigrationSql(file);
      } catch (err: any) {
        log.error("self-heal FAILED: could not read migration file", {
          sentry: "force",
          ledgerFile: file,
          error: err?.message ?? String(err),
        });
        for (const p of probes) {
          missing.push({ ledgerFile: p.ledgerFile, table: p.table, column: p.column, reason: "heal_failed" });
        }
        continue;
      }

      try {
        // Re-run the one file. NO ledger INSERT — the row already exists
        // (that is the definition of this failure class), and inserting
        // would violate the filename primary key.
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("COMMIT");
      } catch (err: any) {
        try {
          await client.query("ROLLBACK");
        } catch (rbErr: any) {
          log.warn("self-heal ROLLBACK failed", { ledgerFile: file, error: rbErr?.message });
        }
        log.error("self-heal FAILED: re-apply of migration file threw", {
          sentry: "force",
          ledgerFile: file,
          error: err?.message ?? String(err),
        });
        for (const p of probes) {
          missing.push({ ledgerFile: p.ledgerFile, table: p.table, column: p.column, reason: "heal_failed" });
        }
        continue;
      }

      // Re-probe everything that was missing for this file.
      const stillMissing: SentinelProbe[] = [];
      for (const p of probes) {
        if (!(await probeExists(client, p))) stillMissing.push(p);
      }

      if (stillMissing.length === 0) {
        healed.push(file);
        // warn (not error): the CRITICAL already fired above; this line is
        // the grep-able "the self-heal worked" marker for deploy logs.
        log.warn(`self-heal SUCCESS: re-applied ${file}; all ${probes.length} object(s) restored`, {
          ledgerFile: file,
          objects,
        });
      } else {
        log.error(
          "CRITICAL: schema object(s) STILL missing after re-apply — manual intervention required",
          { sentry: "force", ledgerFile: file, objects: stillMissing.map(describeObject) },
        );
        for (const p of stillMissing) {
          missing.push({ ledgerFile: p.ledgerFile, table: p.table, column: p.column, reason: "still_missing_after_heal" });
        }
      }
    }
  }

  return { ok: missing.length === 0, checked: sentinels.length, healed, missing };
}

/* ─── boot wiring + healthz surface ─── */

let lastResult: SchemaSentinelResult | null = null;

/** Boot-time result; null until runSchemaSentinel() completes (or when it
 *  was skipped because DATABASE_URL is unset — unit-test contexts). */
export function getSchemaSentinelState(): SchemaSentinelResult | null {
  return lastResult;
}

export function _resetSchemaSentinelStateForTests(): void {
  lastResult = null;
}

/** Exposed so tests can drive the healthz mapping without a real boot. */
export function _setSchemaSentinelStateForTests(r: SchemaSentinelResult): void {
  lastResult = r;
}

// Same resolution rule as bootstrapMigrations: migrations/ sits beside
// process.cwd() (tsx dev) or one level up (prod CJS bundle in dist/).
const MIGRATIONS_DIR_CANDIDATES = [
  path.resolve(process.cwd(), "migrations"),
  path.resolve(process.cwd(), "..", "migrations"),
];

async function resolveMigrationsDir(): Promise<string | null> {
  for (const candidate of MIGRATIONS_DIR_CANDIDATES) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch { /* try next */ }
  }
  return null;
}

/**
 * Boot entry point — call right AFTER bootstrapMigrations(). NEVER throws:
 * every failure mode is converted into a logged, healthz-visible result.
 * A degraded server beats a dead one.
 */
export async function runSchemaSentinel(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    log.warn("DATABASE_URL unset — skipping schema sentinel");
    return; // lastResult stays null → healthz reports `skipped`
  }

  try {
    const migrationsDir = await resolveMigrationsDir();
    if (!migrationsDir) {
      log.error("migrations/ directory not found — sentinel cannot self-heal", {
        sentry: "force",
        candidates: MIGRATIONS_DIR_CANDIDATES,
      });
      lastResult = {
        ok: false,
        checked: 0,
        healed: [],
        missing: [],
        error: "migrations directory not found",
      };
      return;
    }

    // Lazy import — db.ts throws at import time without DATABASE_URL, and
    // tests exercise this module's logic without a database.
    const { pool } = await import("../db");
    const client = await pool.connect();
    try {
      lastResult = await verifySchemaSentinels({
        client,
        readMigrationSql: (file) => fs.readFile(path.join(migrationsDir, file), "utf-8"),
      });
    } finally {
      client.release();
    }

    if (lastResult.ok && lastResult.healed.length === 0) {
      log.info(`all ${lastResult.checked} sentinel probes present — ledger and schema agree`);
    }
  } catch (err: any) {
    // Sentinel infrastructure failure (ledger unreadable, connection drop…).
    // Loud + healthz-visible, but the boot continues.
    log.error("schema sentinel crashed (non-fatal — boot continues)", {
      sentry: "force",
      error: err?.message ?? String(err),
      err,
    });
    lastResult = {
      ok: false,
      checked: 0,
      healed: [],
      missing: [],
      error: err?.message ?? String(err),
    };
  }
}

export interface SchemaSentinelHealthz {
  ok: boolean;
  status: "ok" | "degraded" | "skipped";
  detail?: string;
  checked?: number;
  healed?: string[];
  missing?: string[];
  /** Structural compatibility with healthz's ProbeOutcome index signature. */
  [extra: string]: unknown;
}

/**
 * Healthz surface for the `schema_sentinel` check — a pure in-memory read of
 * the boot-time result (no DB round-trip per healthz tick). Reports
 * `degraded` (never `down`) on unhealed drift so the post-deploy watchdog
 * does not auto-rollback a deploy whose drift the sentinel may have healed.
 */
export function schemaSentinelHealthz(): SchemaSentinelHealthz {
  const state = lastResult;
  if (!state) {
    return {
      ok: true,
      status: "skipped",
      detail: "sentinel has not run (DATABASE_URL unset or boot incomplete)",
    };
  }
  if (state.error) {
    return {
      ok: false,
      status: "degraded",
      detail: `sentinel did not complete: ${state.error}`,
      checked: state.checked,
    };
  }
  if (state.missing.length > 0) {
    return {
      ok: false,
      status: "degraded",
      detail: `schema drift: ${state.missing.length} object(s) missing after self-heal attempt`,
      checked: state.checked,
      missing: state.missing.map(
        (m) => `${describeObject(m)} (${m.ledgerFile}; ${m.reason})`,
      ),
      ...(state.healed.length > 0 ? { healed: state.healed } : {}),
    };
  }
  return {
    ok: true,
    status: "ok",
    checked: state.checked,
    ...(state.healed.length > 0
      ? { healed: state.healed, detail: "drift detected at boot and self-healed" }
      : {}),
  };
}
