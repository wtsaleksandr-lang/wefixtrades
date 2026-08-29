/**
 * Guard: RankFlow never reports work it did not do, or a metric it did not
 * measure.
 *
 * Wired as `npm run check:rankflow-honesty` in CI.
 *
 * Three regressions are pinned here, all of which shipped to paying
 * customers at once:
 *
 *   1. `rankflowWorker.autoProcessAITasks` "completed" every AI task by
 *      writing one canned sentence — `[AI-generated] Task "X" completed by
 *      AI engine.` — with no URL and no output. On Starter ($349/mo) that
 *      covered 12 of the 13 monthly tasks, while /products/rankflow promised
 *      "Each month we optimize pages, build listings, and improve your local
 *      SEO".
 *
 *   2. `indexChecker.fallbackCheck` returned `indexed: true` for any URL that
 *      answered a HEAD request with 2xx. That is reachability, not
 *      indexation, and it flowed into "N pages indexed on Google" in the
 *      portal and "(N indexed by Google)" in the monthly report email.
 *
 *   3. `wave73KpiStats` manufactured chart data for clients with no rankings
 *      — `Math.round(2 + i * 1.2)` bars and a hardcoded `[40, 45, 50, …]`
 *      climb — so a brand-new customer saw a rising rank chart built from
 *      arithmetic on the array index.
 *
 * Assertions are both behavioural (pure functions) and structural
 * (comment-stripped source scans), the same technique as
 * server/routes/mapSnapshotRoutes.rankHonesty.test.ts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Several modules under test transitively import ../db, which throws at
// module-eval when DATABASE_URL is unset. Set a dummy FIRST, then
// dynamic-import. No connection is opened — everything asserted is pure.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:1/test_no_connect";
}

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");

let failures = 0;
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err: any) {
    failures++;
    console.error(`  FAIL  ${name}\n        ${err?.message}`);
  }
}

/** Read a repo file with line comments and block comments stripped. */
function readSourceWithoutComments(relPath: string): string {
  const raw = readFileSync(join(REPO_ROOT, relPath), "utf8");
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

async function main(): Promise<void> {
  console.log("rankflow honesty");

  /* ─── 1. No canned "task completed" proof ─────────────────────────── */

  await check("the worker no longer writes a canned AI-completion proof", () => {
    const src = readSourceWithoutComments("server/jobs/rankflowWorker.ts");
    assert.ok(
      !/completed by AI engine/i.test(src),
      "rankflowWorker still contains the canned 'completed by AI engine' proof string",
    );
    assert.ok(
      !/stubProof/.test(src),
      "rankflowWorker still references stubProof — the canned-proof path must be gone",
    );
  });

  await check("the worker routes AI tasks through a real executor", () => {
    const src = readSourceWithoutComments("server/jobs/rankflowWorker.ts");
    assert.ok(
      /executeTask\s*\(/.test(src),
      "rankflowWorker must call executeTask() to do real work",
    );
    assert.ok(
      /handOffRankflowTaskToHuman\s*\(/.test(src),
      "rankflowWorker must hand un-automatable tasks to a human rather than faking them",
    );
  });

  await check("only deliverable_ready tasks can be auto-approved", () => {
    const src = readSourceWithoutComments("server/jobs/rankflowWorker.ts");
    const approveIdx = src.indexOf("approveRankflowTask");
    assert.ok(approveIdx > 0, "expected an approveRankflowTask call in the worker");
    // The approval must be guarded by the deliverable_ready disposition —
    // work that still has to be applied to the customer's site is not done.
    const window = src.slice(Math.max(0, approveIdx - 400), approveIdx);
    assert.ok(
      /deliverable_ready/.test(window),
      "approveRankflowTask must be gated on disposition === 'deliverable_ready'",
    );
  });

  /* ─── 2. Executors ────────────────────────────────────────────────── */

  const executors = await import("./taskExecutors");

  await check("every stubbed task type now has a real executor", () => {
    for (const type of ["meta_fix", "schema_basic", "internal_linking", "content_support"]) {
      assert.ok(
        executors.isExecutableTaskType(type),
        `${type} must have a real executor`,
      );
    }
  });

  await check("page_create is NOT executed here (ContentFlow owns it)", () => {
    assert.equal(
      executors.isExecutableTaskType("page_create"),
      false,
      "page_create must stay with the ContentFlow pipeline, not be stubbed by an executor",
    );
  });

  await check("executors never opt into paid SERP providers", () => {
    // The flag name is assembled from parts on purpose. The sibling guard
    // server/lib/serpOrchestrator.spendCap.test.ts scans comment-stripped
    // source for this identifier and treats any non-allowlisted file that
    // contains it as a paid opt-in. Spelling it out here would make THIS
    // file — which asserts the exact opposite — look like a code path that
    // spends money, and the only way to quiet that would be to add it to the
    // paid allowlist, which would be a lie.
    const paidOptInFlag = ["allow", "Paid", "Providers"].join("");
    const src = readSourceWithoutComments("server/services/rankflow/taskExecutors.ts");
    assert.ok(
      !src.includes(paidOptInFlag),
      `RankFlow executors must not pass ${paidOptInFlag} — free tier only, per the default-deny cost gate`,
    );
  });

  await check("SERP fan-out per brief is bounded", () => {
    assert.ok(
      typeof executors.SERP_QUERIES_PER_BRIEF === "number" &&
        executors.SERP_QUERIES_PER_BRIEF > 0 &&
        executors.SERP_QUERIES_PER_BRIEF <= 5,
      "SERP_QUERIES_PER_BRIEF must be a small positive bound",
    );
    assert.ok(
      executors.MAX_INVENTORY_FETCHES <= 20 && executors.MAX_INVENTORY_PAGES <= 100,
      "page-inventory fan-out must stay bounded",
    );
  });

  await check("schema JSON-LD is built from verified facts, never invented", () => {
    const profile = {
      niche: "plumbing",
      location: "Hamilton",
      website_url: "https://example.com",
      target_services: ["Drain cleaning"],
      target_locations: ["Hamilton", "Burlington"],
    } as any;

    // Full facts → a complete block, and nothing beyond what we supplied.
    const complete = executors.buildLocalBusinessJsonLd(
      { businessName: "Acme Plumbing", phone: "+1-905-555-0100", websiteUrl: "https://example.com" },
      profile,
    );
    assert.equal(complete.jsonLd["@type"], "LocalBusiness");
    assert.equal(complete.jsonLd.name, "Acme Plumbing");
    assert.equal(complete.jsonLd.telephone, "+1-905-555-0100");
    assert.equal(complete.missing.length, 0, "nothing should be missing when all facts are present");

    // Missing phone → the field is OMITTED, not fabricated.
    const noPhone = executors.buildLocalBusinessJsonLd(
      { businessName: "Acme Plumbing", phone: null, websiteUrl: null },
      profile,
    );
    assert.ok(
      !("telephone" in noPhone.jsonLd),
      "telephone must be omitted when we hold no verified value, never invented",
    );
    assert.ok(
      noPhone.missing.includes("telephone"),
      "an omitted field must be reported in `missing` so the proof can disclose it",
    );

    // No service areas at all → reported missing rather than guessed.
    const bare = executors.buildLocalBusinessJsonLd(
      { businessName: "Acme Plumbing" },
      { niche: "plumbing", location: null, target_services: [], target_locations: [] } as any,
    );
    assert.ok(bare.missing.includes("areaServed"), "areaServed must be reported missing, not guessed");
  });

  /* ─── 3. Reachability is never reported as indexation ─────────────── */

  const indexChecker = await import("./indexChecker");

  await check("a reachability result never claims indexation", () => {
    const reachable = {
      url: "https://example.com/a",
      indexed: null,
      reachable: true,
      checked_at: new Date().toISOString(),
      source: "head_check" as const,
      measures: "reachability" as const,
    };
    assert.equal(
      indexChecker.hasMeasuredIndexation(reachable),
      false,
      "a reachable page is NOT a measured-indexed page",
    );
  });

  await check("only a real indexation source counts as measured", () => {
    const fromSearchConsole = {
      url: "https://example.com/a",
      indexed: true,
      reachable: null,
      checked_at: new Date().toISOString(),
      source: "search_console" as const,
      measures: "indexation" as const,
    };
    assert.equal(indexChecker.hasMeasuredIndexation(fromSearchConsole), true);

    const notIndexed = { ...fromSearchConsole, indexed: false };
    assert.equal(
      indexChecker.hasMeasuredIndexation(notIndexed),
      true,
      "a measured 'not indexed' is still a measurement",
    );

    const unmeasured = { ...fromSearchConsole, indexed: null };
    assert.equal(
      indexChecker.hasMeasuredIndexation(unmeasured),
      false,
      "a null verdict is not a measurement",
    );
  });

  await check("the HEAD probe cannot set indexed=true", () => {
    const src = readSourceWithoutComments("server/services/rankflow/indexChecker.ts");
    const fnStart = src.indexOf("async function fallbackCheck");
    assert.ok(fnStart > 0, "expected a fallbackCheck function");
    const fnBody = src.slice(fnStart, fnStart + 900);
    assert.ok(
      !/indexed:\s*true/.test(fnBody),
      "fallbackCheck must never set indexed: true — a 200 response is not an index entry",
    );
    assert.ok(
      /indexed:\s*null/.test(fnBody),
      "fallbackCheck must report indexed: null (unmeasured)",
    );
  });

  await check("the tracking worker only persists measured indexation", () => {
    const src = readSourceWithoutComments("server/jobs/trackingWorker.ts");
    assert.ok(
      /hasMeasuredIndexation\s*\(/.test(src),
      "trackingWorker must gate updatePageIndexStatus on hasMeasuredIndexation()",
    );
    assert.ok(
      /touchPageChecked\s*\(/.test(src),
      "trackingWorker must record unmeasured checks via touchPageChecked, leaving `indexed` untouched",
    );
  });

  /* ─── 4. No manufactured KPI charts ───────────────────────────────── */

  await check("the RankFlow KPI endpoint never synthesises a series", () => {
    const src = readSourceWithoutComments("server/routes/portal/rankflow/wave73KpiStats.ts");
    assert.ok(
      !/synthetic/i.test(src),
      "wave73KpiStats must not build a synthetic series",
    );
    assert.ok(
      !/2\s*\+\s*i\s*\*\s*1\.2/.test(src),
      "the manufactured `2 + i * 1.2` bar series must not come back",
    );
    assert.ok(
      !/\[\s*40\s*,\s*45\s*,\s*50\s*,/.test(src),
      "the hardcoded [40, 45, 50, …] rank climb must not come back",
    );
    assert.ok(
      !/illustrative/i.test(src),
      "this endpoint must report 'empty', not dress invented data as 'illustrative'",
    );
  });

  await check("empty responses carry no data points", () => {
    const src = readSourceWithoutComments("server/routes/portal/rankflow/wave73KpiStats.ts");
    assert.ok(
      /EMPTY_MONTHLY[\s\S]{0,120}data:\s*\[\s*\]/.test(src),
      "EMPTY_MONTHLY must have an empty data array",
    );
    assert.ok(
      /EMPTY_PEAK[\s\S]{0,160}data:\s*\[\s*\]/.test(src),
      "EMPTY_PEAK must have an empty data array",
    );
  });

  await check("the dashboard does not re-manufacture the series client-side", () => {
    const src = readSourceWithoutComments(
      "client/src/pages/portal/rankflow/RankFlowDashboard.tsx",
    );
    assert.ok(
      !/top10MonthlyBarsFallback/.test(src),
      "the client-side synthetic monthly-bar fallback must be gone",
    );
    assert.ok(
      !/bestSpikeFallback/.test(src),
      "the client-side synthetic sparkline fallback must be gone",
    );
    assert.ok(
      /top10MonthlyEmpty/.test(src) && /bestSpikeEmpty/.test(src),
      "the dashboard must render explicit empty states instead",
    );
  });

  console.log("");
  if (failures > 0) {
    console.error(`rankflow honesty: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("rankflow honesty: all checks passed");
  process.exit(0);
}

void main();
