/**
 * Verification harness for the AdFlow strict-gated monthly cron.
 *
 * Exercises:
 *   1. Pure gate helper: current / stale / missing / future / malformed
 *   2. End-to-end batch sender against a stubbed db layer:
 *      - current-period metrics → would-send path (gated by SMTP)
 *      - stale period → skipped_missing_current_report
 *      - missing metrics → skipped_missing_current_report
 *      - already-sent same period → skipped_already_sent (via inner idempotency check)
 *
 * No SMTP env vars are set, so even the "would-send" client never
 * actually sends — getEmailTransporter() returns null and the inner
 * compileAndSendAdFlowReport() short-circuits with smtp_not_configured.
 *
 * Run: tsx scripts/verify-adflow-cron.ts
 */

// Set FAKE SMTP env vars so getEmailTransporter() returns a real
// transporter object. We then monkey-patch transporter.sendMail to a
// no-op below — guaranteeing zero actual SMTP traffic. This lets the
// idempotency check inside compileAndSendAdFlowReport() execute (it
// only runs after a non-null transporter is acquired).
process.env.SMTP_HOST = "smtp.example.invalid";
process.env.SMTP_PORT = "587";
process.env.SMTP_USER = "verify-harness@example.invalid";
process.env.SMTP_PASS = "fake-password-not-real";
process.env.SMTP_FROM = "verify@example.invalid";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/dummy_no_connect";
// Disable Anthropic calls — writeSummary will fall to its catch-block fallback.
delete process.env.ANTHROPIC_API_KEY;

import { isPeriodStartInPreviousMonth } from "../server/services/adflowReports";

let pass = 0;
let fail = 0;

function assert(label: string, cond: boolean) {
  if (cond) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}`);
    fail++;
  }
}

/* ─── Test 1: pure gate helper ─── */

console.log("\n[1] Strict gate — isPeriodStartInPreviousMonth(now, periodStart)");

// Pretend "now" is May 2 2026 13:00 UTC (cron firing time)
const now = new Date(Date.UTC(2026, 4, 2, 13, 0, 0)); // months are 0-indexed → 4 = May

// April 2026 = previous calendar month
assert("April 1 (start of prev month) → in window",         isPeriodStartInPreviousMonth(now, "2026-04-01"));
assert("April 15 (mid prev month) → in window",             isPeriodStartInPreviousMonth(now, "2026-04-15"));
assert("April 30 (last day of prev month) → in window",     isPeriodStartInPreviousMonth(now, "2026-04-30"));
assert("April 30 with time component → in window",          isPeriodStartInPreviousMonth(now, "2026-04-30T23:59:59Z"));

// Edge cases — outside window
assert("May 1 (current month) → NOT in window",             !isPeriodStartInPreviousMonth(now, "2026-05-01"));
assert("March 31 (two months ago) → NOT in window",         !isPeriodStartInPreviousMonth(now, "2026-03-31"));
assert("May 5 (future) → NOT in window",                    !isPeriodStartInPreviousMonth(now, "2026-05-05"));
assert("undefined → NOT in window",                         !isPeriodStartInPreviousMonth(now, undefined));
assert("null → NOT in window",                              !isPeriodStartInPreviousMonth(now, null));
assert("empty string → NOT in window",                      !isPeriodStartInPreviousMonth(now, ""));
assert("garbage string → NOT in window",                    !isPeriodStartInPreviousMonth(now, "not-a-date"));

// Year-boundary regression — when "now" is January, prev month must be December of prior year
const nowJan = new Date(Date.UTC(2026, 0, 2, 13, 0, 0)); // Jan 2 2026
assert("Jan-firing → Dec 15 of prior year → in window",     isPeriodStartInPreviousMonth(nowJan, "2025-12-15"));
assert("Jan-firing → Jan 1 of same year → NOT in window",  !isPeriodStartInPreviousMonth(nowJan, "2026-01-01"));
assert("Jan-firing → Nov 15 of prior year → NOT in window",!isPeriodStartInPreviousMonth(nowJan, "2025-11-15"));

/* ─── Test 2: end-to-end batch with stubbed db ─── */

console.log("\n[2] End-to-end batch — sendAllAdflowReports() with stubbed db");

// Build fixture: 4 active adflow services in distinct gate states
const fixtureServices = [
  // [a] current-period — should pass the gate, then hit smtp_not_configured → skipped_other
  { cs_id: 101, business_name: "Acme Plumbing", contact_email: "ops@acme.test",
    metadata: { latest_report: { period_start: "2026-04-15", impressions: 10000, leads_generated: 12 } } },
  // [b] stale — period_start in March → skipped_missing_current_report
  { cs_id: 102, business_name: "Stale Roofing", contact_email: "ops@stale.test",
    metadata: { latest_report: { period_start: "2026-03-15", impressions: 8000, leads_generated: 5 } } },
  // [c] missing — no latest_report at all → skipped_missing_current_report
  { cs_id: 103, business_name: "Empty Electric", contact_email: "ops@empty.test",
    metadata: {} },
  // [d] already-sent same period — passes gate, but inner idempotency blocks (last_report_period set)
  { cs_id: 104, business_name: "Done Drywall", contact_email: "ops@done.test",
    metadata: {
      latest_report: { period_start: "2026-04-01", period_end: "2026-04-30", impressions: 5000, leads_generated: 3 },
      last_report_period: "Apr 1, 2026 – Apr 30, 2026",
    } },
];

// Patch the db object — replace .select() to return a chainable mock.
// The batch iterates fixtureServices in order; each iteration that passes
// the gate triggers exactly 3 inner queries (cs / client / serviceCatalog).
// We sequence through using a per-pass-cs cursor.
import { db } from "../server/db";

const origSelect = (db as any).select;
const origUpdate = (db as any).update;

let outerCalled = false;
let innerStage: "cs" | "client" | "svc" = "cs";
let innerCursor = 0; // index into fixtureServices for the inner queries

(db as any).select = function (..._cols: any[]) {
  return {
    from(_t: any) { return this; },
    innerJoin(_t: any, _on: any) { return this; },
    where(_cond: any) {
      // Outer query (only fires once, has innerJoin chain, no .limit())
      if (!outerCalled) {
        outerCalled = true;
        return Promise.resolve(fixtureServices);
      }
      // Inner query — has .limit(1)
      return {
        limit: (_n: number) => {
          const fix = fixtureServices[innerCursor];
          if (innerStage === "cs") {
            innerStage = "client";
            return Promise.resolve(fix ? [{
              id: fix.cs_id,
              client_id: 1000 + fix.cs_id,
              service_id: "adflow-growth",
              metadata: fix.metadata,
            }] : []);
          }
          if (innerStage === "client") {
            innerStage = "svc";
            return Promise.resolve(fix ? [{
              id: 1000 + fix.cs_id,
              business_name: fix.business_name,
              contact_email: fix.contact_email,
              contact_name: "Test Contact",
            }] : []);
          }
          // svc lookup — last inner query for this cs, advance cursor
          innerStage = "cs";
          innerCursor++;
          return Promise.resolve([{ id: "adflow-growth", name: "AdFlow Growth" }]);
        },
      };
    },
  };
};

(db as any).update = function (_t: any) {
  return {
    set(_v: any) { return this; },
    where(_c: any) { return Promise.resolve(); },
  };
};

// Now run the batch — note: the env-var-based date will be REAL "now".
// For deterministic gate testing, we'd need to inject a clock, which is
// already covered by Test 1. Here we trust the wiring + count buckets.
//
// To make the e2e batch deterministic regardless of when the script runs,
// we set fixture period_start values RELATIVE to the current month:
const realNow = new Date();
const prevMonth = new Date(Date.UTC(realNow.getUTCFullYear(), realNow.getUTCMonth() - 1, 15));
const twoMonthsAgo = new Date(Date.UTC(realNow.getUTCFullYear(), realNow.getUTCMonth() - 2, 15));
fixtureServices[0].metadata.latest_report!.period_start = prevMonth.toISOString().slice(0, 10);
fixtureServices[1].metadata.latest_report!.period_start = twoMonthsAgo.toISOString().slice(0, 10);
fixtureServices[3].metadata.latest_report!.period_start = new Date(Date.UTC(realNow.getUTCFullYear(), realNow.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
// formatPeriod() returns just "Month YYYY" (e.g. "March 2026"). Set
// last_report_period to match what compileAndSendAdFlowReport will derive
// from latest_report.period_start, so idempotency trips for fixture d.
const psD = new Date(fixtureServices[3].metadata.latest_report!.period_start!);
fixtureServices[3].metadata.last_report_period = psD.toLocaleDateString("en-US", { month: "long", year: "numeric" });

// Account for the cursor advancement: gate-skipped services don't consume
// inner queries, so we need to advance cursor manually for those. Easier:
// reorder the where() handler so the outer query also sets up the cursor
// based on iteration. But the batch's iteration order matches fixture order,
// so as long as gate-skipped clients DON'T trigger inner queries (they
// continue early), the cursor stays aligned. Let's verify: fixtureServices
// order is [a current, b stale, c missing, d already-sent].
//   - a passes gate → 3 inner queries → cursor goes 0 → 1 (after svc)
//   - b fails gate → 0 inner queries → no cursor advance, but we expected cursor=1, so we need to manually skip
//   - c fails gate → 0 inner queries → manual skip
//   - d passes gate → 3 inner queries
//
// Fix: the cursor needs to track which inner-query-emitting iteration we're on.
// Easiest is to rebuild the cursor scheme: the inner queries arrive ONLY for
// gated-through services. Build a parallel "gated through" list and pull from it.
// Rather than do that, simpler: since gate-skipped services never reach
// compileAndSendAdFlowReport (and thus never emit inner queries), the cursor
// stays naturally aligned IF we increment by 1 per service that emits inner
// queries — which is exactly what we already do (++ on the svc stage).
// HOWEVER: cursor 0 should map to fixture[0] (a), then increment to fixture[3] (d).
// We need a cursor that skips fixtures [1] and [2]. Track passing-fixtures explicitly:
import { isPeriodStartInPreviousMonth as gateFn } from "../server/services/adflowReports";
const passingFixtures = fixtureServices.filter(f =>
  gateFn(realNow, f.metadata.latest_report?.period_start));
console.log(`  (${passingFixtures.length} fixtures pass the gate, ${fixtureServices.length - passingFixtures.length} fail)`);

// Identify the unsubscribe table so the stub can return "not unsubscribed"
// for that path instead of accidentally returning a fake row.
const { emailUnsubscribes } = await import("../server/lib/unsubscribeStorage").then(async () => {
  // emailUnsubscribes is module-internal; recreate a sentinel match on table object
  // by inspecting the drizzle Symbol name.
  return { emailUnsubscribes: null as any };
});

// Detect which drizzle table a query is against. Tables expose their name
// via a Symbol-keyed metadata object.
function tableNameOf(t: any): string {
  if (!t) return "";
  for (const sym of Object.getOwnPropertySymbols(t)) {
    const desc = sym.description || "";
    if (desc.includes("Name")) {
      const v = t[sym];
      if (typeof v === "string") return v;
    }
  }
  return t.tableName || t._?.name || "";
}

// Each "passing" fixture triggers one cs lookup → one new iteration. We
// advance the cursor on each cs lookup, so the cursor always points at
// the fixture currently being processed.
let passingCursor = -1;

(db as any).select = function (..._cols: any[]) {
  let fromTable: any = null;
  return {
    from(t: any) { fromTable = t; return this; },
    innerJoin(_t: any, _on: any) { return this; },
    where(_cond: any) {
      const tn = tableNameOf(fromTable);

      // Outer batch query — has innerJoin chain + no .limit()
      if (!outerCalled && tn === "client_services") {
        outerCalled = true;
        return Promise.resolve(fixtureServices);
      }

      return {
        limit: (_n: number) => {
          // Unsubscribe lookup → always "not unsubscribed"
          if (tn.includes("unsubscribe")) return Promise.resolve([]);

          // Inner cs lookup → advance cursor, return cs row
          if (tn === "client_services") {
            passingCursor++;
            const fix = passingFixtures[passingCursor];
            return Promise.resolve(fix ? [{
              id: fix.cs_id,
              client_id: 1000 + fix.cs_id,
              service_id: "adflow-growth",
              metadata: fix.metadata,
            }] : []);
          }

          // Inner client lookup
          if (tn === "clients") {
            const fix = passingFixtures[passingCursor];
            return Promise.resolve(fix ? [{
              id: 1000 + fix.cs_id,
              business_name: fix.business_name,
              contact_email: fix.contact_email,
              contact_name: "Test Contact",
            }] : []);
          }

          // Inner serviceCatalog lookup
          if (tn === "service_catalog") {
            return Promise.resolve([{ id: "adflow-growth", name: "AdFlow Growth" }]);
          }

          return Promise.resolve([]);
        },
      };
    },
  };
};

// Monkey-patch the cached transporter.sendMail → noop success
const transportMod2 = await import("../server/lib/emailTransport");
const transporter = transportMod2.getEmailTransporter();
let sendMailCalls = 0;
let sendMailRecipients: string[] = [];
if (transporter) {
  (transporter as any).sendMail = async (opts: any) => {
    sendMailCalls++;
    sendMailRecipients.push(opts.to);
    return { messageId: "<verify-harness-fake-id>" };
  };
}

const { sendAllAdflowReports } = await import("../server/services/adflowReports");
const result = await sendAllAdflowReports();

console.log("\n  Batch result:", JSON.stringify(result, null, 2));

// Assertions:
// [a] current-period (Acme Plumbing): passes gate → idempotency miss → sendMail (stubbed) → sent: 1
// [b] stale (Stale Roofing): blocked at gate → skipped_missing_current_report
// [c] missing (Empty Electric): blocked at gate → skipped_missing_current_report
// [d] already-sent (Done Drywall): passes gate, inner idempotency blocks → skipped_already_sent
assert("4 services processed",                                              result.sent + result.skipped === 4);
assert("1 sent (fixture a, current-period, transporter stubbed)",            result.sent === 1);
assert("2 skipped_missing_current_report (stale + missing)",                 result.skipped_missing_current_report === 2);
assert("1 skipped_already_sent (idempotent gate fired for fixture d)",       result.skipped_already_sent === 1);
assert("0 skipped_other (no smtp / no send_failed)",                         result.skipped_other === 0);
assert("0 unsubscribed",                                                     result.skipped_unsubscribed === 0);
assert("sendMail invoked exactly once (only fixture a)",                     sendMailCalls === 1);
assert("sendMail sent only to ops@acme.test",                                sendMailRecipients.length === 1 && sendMailRecipients[0] === "ops@acme.test");
assert("0 errors",                                                           result.errors.length === 0);

// Restore
(db as any).select = origSelect;
(db as any).update = origUpdate;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
