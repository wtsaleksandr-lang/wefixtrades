/**
 * Guard: a public, anonymous surface can never bill a paid SERP provider.
 *
 * Wired as `npm run check:public-serp-spend` in CI.
 *
 * THE REGRESSION THIS EXISTS FOR
 * ------------------------------
 * `/api/tools/local-rank-grid` is public and un-authenticated. It fanned out
 * `5×5 × 2 = 50` orchestrator calls per submit at 20 req/hour/IP — ~1,000 SERP
 * calls/hour/IP — and passed no cost flag, so it fell through to DataForSEO,
 * which bills per call. The quota gate could not stop it: DataForSEO's
 * `MONTHLY_LIMIT = 0` made `quotaRemaining()` return Infinity, so
 * `remaining <= 0` was never true for the one provider that costs money. Every
 * free provider was capped; the paid one was not.
 *
 * Two properties are now asserted, behaviourally (the real exported decision
 * functions, run on fixtures) and structurally (a comment-stripped scan of the
 * public surfaces — the technique used by mapSnapshotRoutes.rankHonesty.test.ts):
 *
 *   1. `MONTHLY_LIMIT <= 0` means "no free allowance", never "unlimited".
 *   2. Paid providers are DEFAULT-DENY: reachable only from a caller that
 *      explicitly passed `allowPaidProviders: true`. Forgetting to think about
 *      cost fails closed.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// serpQuotaTracker imports ../db, which throws at module-eval when
// DATABASE_URL is unset. Set a dummy FIRST, then dynamic-import — same pattern
// as mapSnapshotRoutes.rankHonesty.test.ts. No connection is opened: every
// function under test is pure.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:1/test_no_connect";
}

const { isPayAsYouGo, freeQuotaRemaining, __resetQuotaTrackerState } =
  await import("./serpQuotaTracker");
const { providerIsPayAsYouGo, paidProvidersAllowed } = await import("./serpOrchestrator");
const { reserveDailyCalls, remainingDailyCalls, __resetPublicSerpBudget } =
  await import("./publicSerpBudget");
const dataforseo = await import("./serpProviders/dataforseo");
const googleCse = await import("./serpProviders/googleCse");
const serper = await import("./serpProviders/serper");
const brave = await import("./serpProviders/brave");
const scaleserp = await import("./serpProviders/scaleserp");
const serpstack = await import("./serpProviders/serpstack");

const FREE_PROVIDERS = { googleCse, serper, brave, scaleserp, serpstack };

/**
 * Surfaces an anonymous visitor can reach. None of these may opt in to a paid
 * provider. Adding a public route that calls searchSerp() means adding it here.
 */
const PUBLIC_SERP_SURFACES = [
  "server/routes/freeToolsRoutes.ts",
  "server/routes/mapSnapshotRoutes.ts",
  "server/lib/localRankMeasurement.ts",
  "server/routes/auditSiteSpeedComparisonRoutes.ts",
  "server/routes/auditNapConsistencyRoutes.ts",
  "server/auditRoutes.ts",
];

/**
 * The ONLY files allowed to opt in to paid providers. Each is an
 * authenticated / already-paid surface, or the gate itself. A new entry here
 * is a deliberate decision to let a code path spend money, and shows up as a
 * diff on this list rather than as a silent extra line in a route file.
 */
const PAID_OPT_IN_ALLOWLIST = new Set([
  // The gate itself + this guard's own fixtures.
  "server/lib/serpOrchestrator.ts",
  "server/lib/serpOrchestrator.spendCap.test.ts",
  // Authenticated ContentFlow (paid portal product).
  "server/services/contentflow/serpAwareGenerator/topicalMap.ts",
  "server/services/contentflow/serpAwareGenerator/briefBuilder.ts",
  // Scheduled monitoring for provisioned MapGuard clients.
  "server/services/mapguardMonitor.ts",
]);

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

/** Read a source file with comments stripped, so prose describing the removed
 *  behaviour never reads as the behaviour being back. */
function codeOf(relPath: string): string {
  return readFileSync(relPath, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function walkTs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkTs(full, out);
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full.replace(/\\/g, "/"));
  }
  return out;
}

async function main(): Promise<void> {
  console.log("public SERP spend cap");

  /* ─── 1. Quota semantics: no free allowance ≠ unlimited ─── */

  await check("a zero/absent monthly limit reads as pay-as-you-go, not unlimited", () => {
    assert.equal(isPayAsYouGo(0), true, "0 must mean 'no free allowance'");
    assert.equal(isPayAsYouGo(-1), true);
    assert.equal(isPayAsYouGo(Number.NaN), true, "junk config must fail closed");
    assert.equal(isPayAsYouGo(undefined as unknown as number), true);
    assert.equal(isPayAsYouGo(Number.POSITIVE_INFINITY), true, "an unbounded limit is not a free tier");
    assert.equal(isPayAsYouGo(1), false);
    assert.equal(isPayAsYouGo(2_500), false);
  });

  await check("freeQuotaRemaining never reports Infinity for a paid provider", () => {
    __resetQuotaTrackerState();
    const remaining = freeQuotaRemaining("dataforseo", dataforseo.MONTHLY_LIMIT);
    assert.equal(
      Number.isFinite(remaining),
      true,
      "Infinity remaining is what made the quota gate inert for the only provider that bills",
    );
    assert.equal(remaining, 0, "a pay-as-you-go provider has zero FREE calls left, always");
    // Free providers still burn down normally.
    assert.equal(freeQuotaRemaining("serper", serper.MONTHLY_LIMIT), serper.MONTHLY_LIMIT);
    __resetQuotaTrackerState();
  });

  /* ─── 2. Provider classification ─── */

  await check("DataForSEO is classified as paid; every free-tier provider is not", () => {
    assert.equal(providerIsPayAsYouGo(dataforseo), true, "DataForSEO bills per call");
    assert.equal(
      (dataforseo as { PAY_AS_YOU_GO?: boolean }).PAY_AS_YOU_GO,
      true,
      "the paid provider must declare itself, not rely on a limit of 0 being read correctly",
    );
    for (const [name, mod] of Object.entries(FREE_PROVIDERS)) {
      assert.ok(mod.MONTHLY_LIMIT > 0, `${name} must carry a real free allowance`);
      assert.equal(providerIsPayAsYouGo(mod), false, `${name} must not be gated as paid`);
    }
  });

  await check("an unclassified provider defaults to PAID (fails closed)", () => {
    // A future provider added with a forgotten/zero limit must be gated, not
    // waved through — the direction the old Infinity behaviour got wrong.
    assert.equal(providerIsPayAsYouGo({ MONTHLY_LIMIT: 0 }), true);
    assert.equal(providerIsPayAsYouGo({ MONTHLY_LIMIT: Number.NaN }), true);
    assert.equal(providerIsPayAsYouGo({ MONTHLY_LIMIT: undefined as unknown as number }), true);
    assert.equal(providerIsPayAsYouGo({ MONTHLY_LIMIT: 100, PAY_AS_YOU_GO: true }), true);
  });

  /* ─── 3. Default-deny cost gate ─── */

  await check("paid providers are denied unless the caller explicitly opts in", () => {
    // The exposure: a caller that never thought about cost.
    assert.equal(paidProvidersAllowed({}), false, "default must be deny");
    assert.equal(paidProvidersAllowed({ allowPaidProviders: false }), false);
    assert.equal(paidProvidersAllowed({ allowPaidProviders: undefined }), false);
    // Truthy-but-not-true must not grant it either.
    assert.equal(paidProvidersAllowed({ allowPaidProviders: 1 as unknown as boolean }), false);
    // Explicit opt-in.
    assert.equal(paidProvidersAllowed({ allowPaidProviders: true }), true);
    // An explicit refusal out-ranks an inherited permission.
    assert.equal(
      paidProvidersAllowed({ allowPaidProviders: true, freeTierOnly: true }),
      false,
      "freeTierOnly must remain a hard 'never paid'",
    );
    assert.equal(paidProvidersAllowed({ freeTierOnly: true }), false);
  });

  await check("the orchestrator applies the gate before any paid call", () => {
    const code = codeOf("server/lib/serpOrchestrator.ts");
    assert.match(
      code,
      /providerIsPayAsYouGo\(mod\)/,
      "the provider loop must classify each provider by cost",
    );
    assert.match(
      code,
      /if\s*\(!paidProvidersAllowed\(req\)\)/,
      "the provider loop must default-deny paid providers",
    );
    // The old inert gate: an Infinity `remaining` could never trip `<= 0`.
    assert.equal(
      /Number\.POSITIVE_INFINITY/.test(codeOf("server/lib/serpQuotaTracker.ts")),
      false,
      "the Infinity-remaining behaviour is back — the quota gate is inert again",
    );
  });

  /* ─── 4. Public surfaces cannot opt in ─── */

  await check("no public/anonymous surface opts in to a paid provider", () => {
    for (const surface of PUBLIC_SERP_SURFACES) {
      const code = codeOf(surface);
      assert.equal(
        /allowPaidProviders/.test(code),
        false,
        `${surface} is reachable anonymously and must never opt in to a billing provider`,
      );
    }
  });

  await check("only the allowlisted authenticated surfaces opt in", () => {
    // Comment-stripped: a file is only an "opt-in" if it passes the flag in
    // real code, not if it documents the rule.
    const offenders = walkTs("server")
      .filter((f) => /allowPaidProviders/.test(codeOf(f)))
      .filter((f) => !PAID_OPT_IN_ALLOWLIST.has(f));
    assert.deepEqual(
      offenders,
      [],
      "a new code path opted in to paid SERP spend — add it to PAID_OPT_IN_ALLOWLIST in this guard only if the surface is authenticated and the spend is intended",
    );
  });

  await check("the public rank-grid keeps a sane worst case", () => {
    const raw = readFileSync("server/routes/freeToolsRoutes.ts", "utf8");
    const hourly = Number(/RANK_GRID_HOURLY_MAX\s*=\s*(\d+)/.exec(raw)?.[1]);
    const perPoint = Number(/RANK_GRID_CALLS_PER_POINT\s*=\s*(\d+)/.exec(raw)?.[1]);
    const daily = Number(/RANK_GRID_DAILY_CALL_BUDGET\s*=\s*(\d+)/.exec(raw)?.[1]);
    assert.ok(Number.isFinite(hourly) && hourly > 0, "RANK_GRID_HOURLY_MAX must be a finite cap");
    assert.ok(Number.isFinite(perPoint) && perPoint > 0);
    assert.ok(Number.isFinite(daily) && daily > 0, "the daily ledger must be finite");
    // Largest grid the free tool offers is 5×5 = 25 points.
    const worstCasePerIpPerHour = hourly * 25 * perPoint;
    assert.ok(
      worstCasePerIpPerHour <= 300,
      `worst case is ${worstCasePerIpPerHour} SERP calls/hour/IP — was 1,000, must stay <= 300`,
    );
    // 7×7 stays gated to the paid product; the free tool must not accept it.
    assert.match(
      codeOf("server/routes/freeToolsRoutes.ts"),
      /Number\(req\.body\?\.gridSize\)\s*===\s*3\s*\?\s*3\s*:\s*5/,
      "the free grid size must stay clamped to 3 or 5",
    );
    assert.match(
      codeOf("server/routes/freeToolsRoutes.ts"),
      /reserveDailyCalls\(/,
      "the rank-grid fan-out must draw from the daily ledger",
    );
  });

  /* ─── 5. The daily ledger actually hard-stops ─── */

  await check("the public daily ledger is finite and hard-stops", () => {
    __resetPublicSerpBudget();
    assert.equal(remainingDailyCalls("t", 100), 100);
    assert.equal(reserveDailyCalls("t", 100, 40), 40);
    assert.equal(remainingDailyCalls("t", 100), 60);
    // Over-request is clamped to what is left, never granted in full.
    assert.equal(reserveDailyCalls("t", 100, 500), 60);
    assert.equal(remainingDailyCalls("t", 100), 0);
    assert.equal(reserveDailyCalls("t", 100, 1), 0, "budget must hard-stop at zero");
    // Buckets are independent, and roll over on the UTC day.
    assert.equal(reserveDailyCalls("other", 100, 10), 10);
    const tomorrow = Date.now() + 36 * 60 * 60 * 1000;
    assert.equal(remainingDailyCalls("t", 100, tomorrow), 100, "ledger must roll over daily");
    __resetPublicSerpBudget();
  });

  await check("un-granted points degrade to 'unavailable', never to a guess", () => {
    const code = codeOf("server/routes/freeToolsRoutes.ts");
    assert.match(
      code,
      /index >= fundedPointCount\) return unfundedPoint\(pt\)/,
      "points past the budget must skip the provider call entirely",
    );
    assert.match(
      code,
      /const unfundedPoint[\s\S]{0,400}?status: "unavailable"/,
      "an unfunded point must report 'unavailable'",
    );
    // The bug class: filling an unmeasured cell with a number.
    assert.equal(
      /const unfundedPoint[\s\S]{0,400}?rank: \d/.test(code),
      false,
      "an unfunded point must never carry a rank number",
    );
    assert.match(
      code,
      /budgetLimited: fundedPointCount < grid\.length/,
      "the response must say plainly when the budget, not a provider, capped the scan",
    );
  });

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall public SERP spend-cap checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
