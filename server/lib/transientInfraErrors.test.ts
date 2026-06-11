/**
 * Unit tests for the transient-infra error classifier + retry helper
 * (Sentry triage 2026-06-11 — scheduler job-log family root fix).
 *
 * Excluded from `tsc --noEmit` (tsconfig `**\/*.test.ts`). Runnable standalone:
 *
 *   npx tsx server/lib/transientInfraErrors.test.ts
 *
 * `assert/strict` only — no test runner dep.
 *
 * Includes the deliberate-failure fixtures required by the fix brief:
 *   - a job-log write failing twice with a Neon connection drop then
 *     succeeding → retried to success (the exact production failure mode);
 *   - a constraint violation → NOT retried (real bugs must stay loud);
 *   - retries exhausted → the original error propagates.
 */
import assert from "node:assert/strict";
import {
  isTransientInfraError,
  describeError,
  withTransientRetry,
} from "./transientInfraErrors";

let failures = 0;
function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(
      () => console.log(`  ok  ${name}`),
      (err) => {
        failures++;
        console.error(`  FAIL ${name}\n      ${err?.message ?? err}`);
      },
    );
}

/** Drizzle-style wrapper: "Failed query: …" with the pg error as `cause`. */
function drizzleWrapped(causeMessage: string, code?: string): Error {
  const cause = new Error(causeMessage) as Error & { code?: string };
  if (code) cause.code = code;
  const wrapper = new Error(
    'Failed query: insert into "job_logs" ("id", "job_name", "status") values (default, $1, $2)',
  ) as Error & { cause?: unknown };
  wrapper.cause = cause;
  return wrapper;
}

async function main() {
  // ── classification: transient ──
  await test("connection terminated (drizzle-wrapped cause) → transient", () => {
    assert.equal(isTransientInfraError(drizzleWrapped("Connection terminated unexpectedly")), true);
  });
  await test("connection not available → transient", () => {
    assert.equal(isTransientInfraError(new Error("Connection not available")), true);
  });
  await test("Neon control plane request failed → transient", () => {
    assert.equal(isTransientInfraError(new Error("Control plane request failed")), true);
  });
  await test("socket timeout → transient", () => {
    assert.equal(isTransientInfraError(new Error("Socket timeout")), true);
  });
  await test("ECONNRESET code-only in cause chain → transient", () => {
    assert.equal(isTransientInfraError(drizzleWrapped("read ECONNRESET")), true);
  });
  await test("pg SQLSTATE 57P01 admin_shutdown → transient", () => {
    assert.equal(isTransientInfraError(drizzleWrapped("terminating connection", "57P01")), true);
  });
  await test("pg SQLSTATE 53300 too_many_connections → transient", () => {
    const e = new Error("whatever") as Error & { code?: string };
    e.code = "53300";
    assert.equal(isTransientInfraError(e), true);
  });
  await test("Anthropic 'Request timed out.' → transient", () => {
    assert.equal(isTransientInfraError(new Error("Request timed out.")), true);
  });
  await test("plain string payloads classify too", () => {
    assert.equal(isTransientInfraError("Connection terminated unexpectedly"), true);
  });

  // ── classification: NOT transient (real bugs stay loud) ──
  await test("unique-constraint violation → NOT transient", () => {
    assert.equal(
      isTransientInfraError(drizzleWrapped('duplicate key value violates unique constraint "job_logs_pkey"')),
      false,
    );
  });
  await test("missing relation (schema drift) → NOT transient", () => {
    assert.equal(isTransientInfraError(new Error('relation "admin_notices" does not exist')), false);
  });
  await test("zod validation error → NOT transient", () => {
    assert.equal(isTransientInfraError(new Error("Invalid enum value. Expected 'not_built' | 'building'")), false);
  });
  await test("null/undefined/objects without messages → NOT transient", () => {
    assert.equal(isTransientInfraError(null), false);
    assert.equal(isTransientInfraError(undefined), false);
    assert.equal(isTransientInfraError({}), false);
  });
  await test("self-referencing cause chain terminates", () => {
    const e = new Error("boring") as Error & { cause?: unknown };
    e.cause = e;
    assert.equal(isTransientInfraError(e), false);
  });

  // ── describeError ──
  await test("describeError surfaces the cause + code that drizzle hides", () => {
    const d = describeError(drizzleWrapped("Connection terminated unexpectedly", "57P01"));
    assert.match(d.error, /^Failed query: insert into "job_logs"/);
    assert.equal(d.cause, "Connection terminated unexpectedly");
    assert.equal(d.code, "57P01");
  });

  // ── withTransientRetry: deliberate-failure fixtures ──
  await test("FIXTURE job-log create fails 2x transient then succeeds → retried to success", async () => {
    let calls = 0;
    const result = await withTransientRetry(
      async () => {
        calls++;
        if (calls < 3) throw drizzleWrapped("Connection terminated unexpectedly");
        return { id: 42 };
      },
      { attempts: 3, baseDelayMs: 1 },
    );
    assert.equal(calls, 3);
    assert.deepEqual(result, { id: 42 });
  });

  await test("FIXTURE constraint violation → thrown immediately, NO retry", async () => {
    let calls = 0;
    await assert.rejects(
      withTransientRetry(
        async () => {
          calls++;
          throw drizzleWrapped("duplicate key value violates unique constraint");
        },
        { attempts: 3, baseDelayMs: 1 },
      ),
      /duplicate key|Failed query/,
    );
    assert.equal(calls, 1);
  });

  await test("FIXTURE persistent transient failure → original error after N attempts", async () => {
    let calls = 0;
    await assert.rejects(
      withTransientRetry(
        async () => {
          calls++;
          throw new Error("Control plane request failed");
        },
        { attempts: 3, baseDelayMs: 1 },
      ),
      /Control plane request failed/,
    );
    assert.equal(calls, 3);
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log("\nall transientInfraErrors tests passed");
}

main();
