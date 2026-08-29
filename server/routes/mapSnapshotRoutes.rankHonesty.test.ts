/**
 * Guard: the MapGuard snapshot never publishes a rank it did not measure.
 *
 * Wired as `npm run check:mapsnapshot-rank-honesty` in CI.
 *
 * This route used to generate its entire rank grid from a seeded RNG
 * (`baseRank = 1 + distanceKm * 2.5 + noise`), persist it, and render an audit
 * narrative around the invented numbers on a public page. These assertions
 * exist so that can never come back — both behaviourally (the pure functions)
 * and structurally (a comment-stripped scan of the source, the same technique
 * used by server/services/sitelaunch/engine.test.ts for the SSL simulation).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// mapSnapshotRoutes.ts imports ../db, which throws at module-eval when
// DATABASE_URL is unset. Set a dummy FIRST, then dynamic-import — same
// pattern as server/routes/citationMatch.test.ts. No connection is opened:
// every function under test is pure.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:1/test_no_connect";
}

const { buildAudit, honestHeatmap, summarise, NOT_ASSESSED, SOURCE_MEASURED } =
  await import("./mapSnapshotRoutes");
type HeatmapCell = import("./mapSnapshotRoutes").HeatmapCell;

const {
  findLocalPackPosition,
  reserveCalls,
  remainingDailyBudget,
  DAILY_CALL_BUDGET,
  __resetRankBudget,
} = await import("../lib/localRankMeasurement");

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

function cell(over: Partial<HeatmapCell> = {}): HeatmapCell {
  return {
    row: 0,
    col: 0,
    lat: 51.5,
    lng: -0.12,
    keyword: "plumber near me",
    distanceKm: 0,
    status: "ranked",
    rank: 4,
    ...over,
  };
}

async function main(): Promise<void> {
  console.log("map-snapshot rank honesty");

  /* ─── The narrative only speaks from measurements ─── */

  await check("no narrative at all when nothing could be measured", () => {
    const cells = [0, 1, 2, 3].map((i) =>
      cell({ col: i, status: "unavailable", rank: null }),
    );
    assert.deepEqual(buildAudit(cells), [], "unmeasured grid must produce zero cards");
  });

  await check("no narrative below the minimum evidence threshold", () => {
    const cells = [
      cell({ col: 0, status: "ranked", rank: 2 }),
      cell({ col: 1, status: "ranked", rank: 3 }),
      cell({ col: 2, status: "unavailable", rank: null }),
      cell({ col: 3, status: "unavailable", rank: null }),
    ];
    assert.deepEqual(buildAudit(cells), [], "2 measured cells is not enough to score");
  });

  await check("scores derive only from measured cells", () => {
    // 3 measured, all top-3, plus 6 unmeasured. Top-3 share must be 100%,
    // not 33% — unchecked points are not failures.
    const cells = [
      cell({ col: 0, status: "ranked", rank: 1 }),
      cell({ col: 1, status: "ranked", rank: 2 }),
      cell({ col: 2, status: "ranked", rank: 3 }),
      ...[3, 4, 5, 6, 7, 8].map((i) => cell({ col: i, status: "unavailable", rank: null })),
    ];
    const cards = buildAudit(cells);
    const top3 = cards.find((c) => c.id === "top3-share");
    assert.ok(top3, "top3-share card expected");
    assert.equal(top3!.score, 100, "unchecked cells must not dilute the share");
    assert.match(top3!.details, /3 of 9 points we could check/);
  });

  await check("a not-found cell counts as real evidence", () => {
    const cells = [
      cell({ col: 0, status: "ranked", rank: 1 }),
      cell({ col: 1, status: "not-found", rank: null }),
      cell({ col: 2, status: "not-found", rank: null }),
    ];
    const cards = buildAudit(cells);
    assert.equal(cards.length, 2, "3 measured cells is enough to score");
    const top3 = cards.find((c) => c.id === "top3-share")!;
    assert.equal(top3.score, 33, "1 of 3 measured cells in the top 3");
  });

  await check("no audit card asserts anything we never measure", () => {
    const cells = [1, 2, 3, 4, 5].map((i) => cell({ col: i, status: "ranked", rank: i }));
    const ids = buildAudit(cells).map((c) => c.id);
    // Only grid-derived cards may exist. These eight were RNG-scored.
    for (const invented of [
      "gbp-completeness",
      "review-velocity",
      "review-response",
      "post-cadence",
      "nap-consistency",
      "category-fit",
      "photo-freshness",
      "qna-coverage",
    ]) {
      assert.ok(!ids.includes(invented), `"${invented}" must not be a scored card`);
    }
    assert.deepEqual(ids, ["grid-coverage", "top3-share"]);
  });

  await check("not-assessed prompts carry no score or status", () => {
    assert.ok(NOT_ASSESSED.length > 0);
    for (const item of NOT_ASSESSED) {
      assert.ok(!("score" in item), `${item.id} must not carry a score`);
      assert.ok(!("status" in item), `${item.id} must not carry a status`);
      assert.match(
        item.details,
        /not checked/i,
        `${item.id} must say plainly that it was not checked`,
      );
    }
  });

  /* ─── Summary keeps the three outcomes apart ─── */

  await check("summarise never counts an unchecked cell as measured", () => {
    const s = summarise([
      cell({ col: 0, status: "ranked", rank: 1 }),
      cell({ col: 1, status: "not-found", rank: null }),
      cell({ col: 2, status: "unavailable", rank: null }),
    ]);
    assert.equal(s.totalCells, 3);
    assert.equal(s.measuredCells, 2);
    assert.equal(s.rankedCells, 1);
    assert.equal(s.notFoundCells, 1);
    assert.equal(s.unavailableCells, 1);
    assert.equal(s.complete, false);
  });

  /* ─── Legacy downgrade on read ─── */

  await check("legacy synthetic rows are downgraded, never re-published", () => {
    // Both historic `source` values described only whether Places geocoded the
    // centre — the ranks under them were always RNG output.
    // Default-deny: provenance is an allowlist, so unknown/absent values and
    // any future stray value must all read as unmeasured.
    for (const legacySource of ["mock", "real", "", null, undefined, "MEASURED", "measured-ish", "live"]) {
      const { cells, legacy } = honestHeatmap(legacySource as any, [
        { row: 0, col: 0, lat: 51.5, lng: -0.12, keyword: "k", distanceKm: 0, rank: 3 },
        { row: 0, col: 1, lat: 51.5, lng: -0.11, keyword: "k", distanceKm: 1, rank: 11 },
      ]);
      assert.equal(legacy, true, `source "${legacySource}" must be treated as legacy`);
      for (const c of cells) {
        assert.equal(c.status, "unavailable", "legacy cell must not claim a status");
        assert.equal(c.rank, null, "legacy invented rank must not survive a read");
      }
      // Geometry is preserved so the map still draws.
      assert.equal(cells[1].lng, -0.11);
      assert.deepEqual(buildAudit(cells), [], "legacy rows must produce no narrative");
    }
  });

  await check("measured rows pass through intact", () => {
    const { cells, legacy } = honestHeatmap(SOURCE_MEASURED, [
      { row: 0, col: 0, lat: 51.5, lng: -0.12, keyword: "k", distanceKm: 0, status: "ranked", rank: 3 },
      { row: 0, col: 1, lat: 51.5, lng: -0.11, keyword: "k", distanceKm: 1, status: "not-found", rank: null },
      { row: 0, col: 2, lat: 51.5, lng: -0.10, keyword: "k", distanceKm: 2, status: "unavailable", rank: null },
    ]);
    assert.equal(legacy, false);
    assert.equal(cells[0].rank, 3);
    assert.equal(cells[1].status, "not-found");
    assert.equal(cells[1].rank, null);
    assert.equal(cells[2].rank, null);
  });

  await check("a rank on a non-ranked cell is dropped, not trusted", () => {
    // Defence in depth: if anything ever writes rank alongside not-found /
    // unavailable, the read path must not surface the number.
    const { cells } = honestHeatmap(SOURCE_MEASURED, [
      { row: 0, col: 0, lat: 51.5, lng: -0.12, keyword: "k", distanceKm: 0, status: "not-found", rank: 7 },
      { row: 0, col: 1, lat: 51.5, lng: -0.11, keyword: "k", distanceKm: 1, status: "unavailable", rank: 9 },
    ]);
    assert.equal(cells[0].rank, null);
    assert.equal(cells[1].rank, null);
  });

  /* ─── Measurement primitives ─── */

  await check("local pack position is 1-based and name-normalised", () => {
    const pack = [
      { title: "Acme Drains Ltd" },
      { title: "Joe's Plumbing & Heating" },
      { title: "Other Co" },
    ];
    // Apostrophe-insensitive both ways — a mismatch here would be reported as
    // "not-found", i.e. we would tell a business it doesn't rank where it does.
    assert.equal(findLocalPackPosition(pack, "Joes Plumbing"), 2);
    assert.equal(findLocalPackPosition(pack, "Joe's Plumbing"), 2);
    assert.equal(findLocalPackPosition(pack, "Nowhere Plumbing"), null);
    assert.equal(findLocalPackPosition([], "Anything"), null);
    // A provider-supplied position wins over the array index.
    assert.equal(findLocalPackPosition([{ title: "Acme", position: 4 }], "Acme"), 4);
  });

  /* ─── Spend ceiling ─── */

  await check("the daily budget is finite and hard-stops", () => {
    __resetRankBudget();
    assert.equal(remainingDailyBudget(), DAILY_CALL_BUDGET);
    assert.ok(Number.isFinite(DAILY_CALL_BUDGET) && DAILY_CALL_BUDGET > 0);
    assert.equal(reserveCalls(9), 9);
    assert.equal(remainingDailyBudget(), DAILY_CALL_BUDGET - 9);
    // Over-request is clamped, never granted in full.
    assert.equal(reserveCalls(DAILY_CALL_BUDGET * 2), DAILY_CALL_BUDGET - 9);
    assert.equal(remainingDailyBudget(), 0);
    assert.equal(reserveCalls(1), 0, "budget must hard-stop at zero");
    __resetRankBudget();
  });

  /* ─── Source scans: the simulation is gone, not bypassed ─── */

  await check("no RNG remains in the snapshot route's code path", () => {
    const raw = readFileSync("server/routes/mapSnapshotRoutes.ts", "utf8");
    // Strip comments first: the file DOCUMENTS the removed RNG at length, and
    // that prose must not read as the code being back.
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.equal(/seededRand/.test(code), false, "the seeded RNG helper is back");
    assert.equal(/hashString/.test(code), false, "the hash-to-seed helper is back");
    assert.equal(
      /Math\.random\s*\(\s*\)/.test(code.replace(/generateSlug[\s\S]{0,200}?\n\}/, "")),
      false,
      "Math.random() outside slug generation is back",
    );
    assert.equal(/baseRank/.test(code), false, "the synthetic rank formula is back");
    // The hardcoded mid-UK fallback centre that made up a location.
    assert.equal(/52\.4862|-1\.8904/.test(code), false, "the invented fallback centre is back");
  });

  await check("the measurement path cannot reach a paid provider", () => {
    const raw = readFileSync("server/lib/localRankMeasurement.ts", "utf8");
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.match(
      code,
      /freeTierOnly:\s*true/,
      "measureLocalPackRank must set freeTierOnly so anonymous visitors cannot bill paid SERP calls",
    );
    const orch = readFileSync("server/lib/serpOrchestrator.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // The gate is now DEFAULT-DENY (strictly stronger than the original
    // freeTierOnly opt-out): a pay-as-you-go provider is skipped unless the
    // caller explicitly opted in. `freeTierOnly` remains a hard refusal that
    // out-ranks any opt-in. Full coverage lives in
    // server/lib/serpOrchestrator.spendCap.test.ts (check:public-serp-spend).
    assert.match(
      orch,
      /if\s*\(providerIsPayAsYouGo\(mod\)\)\s*\{\s*if\s*\(!paidProvidersAllowed\(req\)\)/,
      "the orchestrator must default-deny pay-as-you-go providers",
    );
    assert.match(
      orch,
      /req\.freeTierOnly === true\) return false/,
      "freeTierOnly must stay a hard 'never paid'",
    );
  });

  await check("the shared rank hero never claims 'not ranking' with zero measurements", () => {
    const hero = readFileSync(
      "client/src/components/marketing/map-snapshot/RankGridHero.tsx",
      "utf8",
    );
    const code = hero.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // Regression this guards: total === 0 (every cell unchecked) rendered
    // "Not ranking in the top 20 anywhere yet" — a finding we have no
    // evidence for. It must branch to a no-measurement verdict first.
    assert.match(code, /nothingMeasured/, "the zero-measurement branch is gone");
    assert.match(
      code,
      /nothingMeasured\s*\?\s*"No points measured/,
      "zero measurements must render a no-measurement verdict, not a ranking claim",
    );
    assert.equal(
      /metrics\.atrp == null \|\| metrics\.total === 0\s*\n?\s*\?\s*"Not ranking/.test(code),
      false,
      "the old unbacked 'Not ranking anywhere' verdict is back",
    );
    assert.match(
      code,
      /!nothingMeasured\s*&&/,
      "the High/Med/Low bar must be hidden when nothing was measured (0/0/0 reads as measured zeros)",
    );
  });

  await check("the client contract mirrors the three states", () => {
    const shell = readFileSync(
      "client/src/components/marketing/map-snapshot/MapSnapshotShell.tsx",
      "utf8",
    );
    const code = shell.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.match(code, /"ranked"\s*\|\s*"not-found"\s*\|\s*"unavailable"/);
    // The bug class this guards: silently defaulting an unmeasured rank to a
    // number so it renders as a real position.
    assert.equal(/rank\s*\?\?\s*0\b/.test(code), false, "rank must never default to 0");
    assert.match(
      code,
      /status !== "unavailable"/,
      "stats must exclude unchecked cells",
    );
  });

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall map-snapshot honesty checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
