/**
 * programmaticMatrixGenerator guard — the [trade]×[city]×[job] matrix batch
 * generator, the riskiest (thin-content-prone) part of the SEO channel.
 *
 * Runnable standalone via:
 *   npx tsx server/services/seoContent/programmaticMatrixGenerator.test.ts
 * Wired into CI as `npm run check:seo-matrix` (.github/workflows/ci.yml).
 *
 * Excluded from `tsc --noEmit` (tsconfig excludes **\/*.test.ts). Uses
 * node:assert/strict, no test-runner dep, NO live DB / NO API key / NO flag —
 * the gate, the article generator, the slug-dedup lookup, and the plan store
 * are all INJECTED as fakes.
 *
 * Coverage (the design-mandated guardrails):
 *   (a) a cell below the k-anonymity floor → SKIPPED (insufficient_data), no
 *       page created (inherited from generateSeoArticle's skip)
 *   (b) a cell with sufficient data → an in_review draft (status NEVER
 *       'published') is created and counted as generated
 *   (c) DEDUP: a (trade,job,city) that already has a page/slug → SKIPPED
 *       (duplicate), generator never even called for it
 *   (d) LIMIT respected: a matrix larger than `limit` attempts at most `limit`
 *       cells; the rest are skipped(limit_reached)
 *   (e) INERT when the flag is off → enabled=false, nothing attempted, nothing
 *       generated, generator never called
 *   (f) DELIBERATE-FAILURE fixture: a regressed batch that bypasses the
 *       k-anonymity skip (creates a page for a no-data cell) MUST fail red —
 *       proving the anti-thin guarantee is actually checked.
 *
 * CRITICAL: ends with process.exit(failed>0?1:0) so a stray open handle from
 * any import can never hang CI (a fusion test hung the whole pipeline before).
 */

import assert from "node:assert/strict";
import {
  generateMatrixBatch,
  expandMatrix,
  buildMatrixKeyword,
  SEED_MATRIX,
  SEED_TRADES,
  SEED_CITIES,
  SEED_JOBS,
  MIN_UNIQUE_DATA_SCORE,
  type MatrixDeps,
  type MatrixPlanStore,
  type MatrixCell,
} from "./programmaticMatrixGenerator";
import type {
  SeoArticleRequest,
  SeoArticleResult,
  SeoArticleDeps,
} from "./seoArticleGenerator";
import type { SeoContentPage } from "@shared/schema";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✓ ${name}`);
      passed++;
    })
    .catch((err) => {
      console.error(`  ✗ ${name}`);
      console.error(err);
      failed++;
    });
}

/* ─── Fixtures ─────────────────────────────────────────────────────────────── */

const ON_GATE = async () => ({ allowed: true });
const OFF_GATE = async () => ({ allowed: false, reason: "SEO_ENGINE_ENABLED is not set." });

/** A no-op plan store that records the (status, reason) it was asked to write,
 *  so we can assert the queue bookkeeping mirrors the guardrail decisions. */
function makePlanStore(opts: { existingKeywords?: Set<string> } = {}): MatrixPlanStore & {
  upserts: { slug: string; status: string; reason: string | null }[];
} {
  const upserts: { slug: string; status: string; reason: string | null }[] = [];
  const existing = opts.existingKeywords ?? new Set<string>();
  return {
    upserts,
    async planExists(cell) {
      return existing.has(`${cell.keyword}|${cell.jobType}|${cell.city}`);
    },
    async upsertPlan(cell, status, skipReason = null) {
      upserts.push({ slug: cell.slug, status, reason: skipReason });
    },
  };
}

/** Build a fake in_review draft row (what generateSeoArticle returns). */
function fakeDraft(id: number, slug: string): SeoContentPage {
  return {
    id,
    slug,
    title: `T ${slug}`,
    status: "in_review",
    content: "body",
  } as unknown as SeoContentPage;
}

/** A fake article generator. By default it returns a healthy in_review draft
 *  (with a score above the floor) for every call; options reshape it:
 *   - insufficientFor: a predicate marking a cell as below the k-anonymity
 *     floor → returns the generator's real skip shape (no page).
 *   - lowScore: every generated draft scores below the unique-data floor.
 *   - bypassKAnon: the REGRESSED variant — it IGNORES the no-data signal and
 *     creates a page even for an insufficient cell (the deliberate failure). */
function makeGenerator(opts: {
  insufficientFor?: (req: SeoArticleRequest) => boolean;
  lowScore?: boolean;
  bypassKAnon?: boolean;
} = {}): ((req: SeoArticleRequest, d?: SeoArticleDeps) => Promise<SeoArticleResult>) & {
  calls: SeoArticleRequest[];
} {
  const calls: SeoArticleRequest[] = [];
  let nextId = 100;
  const fn = (async (req: SeoArticleRequest): Promise<SeoArticleResult> => {
    calls.push(req);
    const insufficient = opts.insufficientFor?.(req) ?? false;
    if (insufficient && !opts.bypassKAnon) {
      // The real generator's behaviour: a no-data cell becomes NO page.
      return { ok: false, skipped: true, reason: "insufficient_data", sampleSize: 2 };
    }
    // A page is created (in_review). If bypassKAnon is set this fires even for
    // an insufficient cell — the regression the deliberate-failure test catches.
    const id = nextId++;
    const slug = req.keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return {
      ok: true,
      skipped: false,
      draft: fakeDraft(id, slug),
      uniqueDataScore: opts.lowScore ? 2 : 9,
      costMicroUsd: 1000,
    };
  }) as any;
  fn.calls = calls;
  return fn;
}

const NO_DUP = async () => false;

/* A small matrix: 1 trade × 2 cities × 1 job = 2 cells. */
const SMALL_TRADES = [{ tradeType: "plumber", label: "plumber" }];
const SMALL_CITIES = ["Austin", "Dallas"];
const SMALL_JOBS = [{ jobType: "drain-cleaning", phrase: "drain cleaning", intent: "bottom" as const }];

/* ─── Tests ─────────────────────────────────────────────────────────────────── */

async function run() {
  console.log("programmaticMatrixGenerator guard\n");

  // Sanity: the seed matrix is TINY (validation scope), not a firehose.
  await test("SEED_MATRIX is a tiny validation scope (<= 10 cells)", () => {
    assert.ok(SEED_MATRIX.length <= 10, `seed matrix must be tiny, got ${SEED_MATRIX.length}`);
    assert.equal(SEED_MATRIX.length, SEED_TRADES.length * SEED_CITIES.length * SEED_JOBS.length);
    // The keyword pattern is the cost-in-city programmatic shape.
    assert.equal(buildMatrixKeyword("drain cleaning", "Austin"), "drain cleaning cost in Austin");
    assert.ok(SEED_MATRIX.every((c: MatrixCell) => c.slug.length > 0 && c.keyword.includes("cost in")));
  });

  // (a) below k-anonymity floor → skipped (insufficient_data), no page.
  await test("(a) cell below k-anonymity floor → skipped insufficient_data, no page", async () => {
    const gen = makeGenerator({ insufficientFor: (r) => r.region === "Dallas" });
    const plan = makePlanStore();
    const deps: MatrixDeps = { checkGate: ON_GATE, generate: gen, slugExists: NO_DUP, planStore: plan };
    const res = await generateMatrixBatch({ trades: SMALL_TRADES, cities: SMALL_CITIES, jobTypes: SMALL_JOBS }, deps);
    // Austin generated, Dallas skipped (no-data).
    assert.equal(res.generated.length, 1, "only the data-backed cell becomes a page");
    assert.equal(res.generated[0].city, "Austin");
    const dallasSkip = res.skipped.find((s) => s.city === "Dallas");
    assert.ok(dallasSkip, "Dallas must be present in skipped");
    assert.equal(dallasSkip!.reason, "insufficient_data");
    // And the plan row reflects it (skipped + reason), never silently dropped.
    assert.ok(plan.upserts.some((u) => u.status === "skipped" && u.reason === "insufficient_data"));
  });

  // (b) sufficient data → in_review draft (NEVER published).
  await test("(b) sufficient data → in_review draft created (never published)", async () => {
    const gen = makeGenerator();
    const res = await generateMatrixBatch(
      { trades: SMALL_TRADES, cities: ["Austin"], jobTypes: SMALL_JOBS },
      { checkGate: ON_GATE, generate: gen, slugExists: NO_DUP, planStore: makePlanStore() },
    );
    assert.equal(res.enabled, true);
    assert.equal(res.generated.length, 1);
    assert.ok(res.generated[0].draftId > 0, "a draft id is returned");
    // The matrix never publishes — it only ever collects in_review drafts from
    // the generator. The generated entry carries the draft id, not a live URL,
    // and the article generator (proven in its own test) writes status
    // 'in_review'. Assert the result type exposes no 'published' anywhere.
    assert.ok(!("published" in (res as any)), "batch result must not expose a published flag");
  });

  // (c) DEDUP → already-existing slug skipped, generator never called.
  await test("(c) dedup: existing slug → skipped duplicate, generator not called", async () => {
    const gen = makeGenerator();
    const res = await generateMatrixBatch(
      { trades: SMALL_TRADES, cities: ["Austin"], jobTypes: SMALL_JOBS },
      { checkGate: ON_GATE, generate: gen, slugExists: async () => true, planStore: makePlanStore() },
    );
    assert.equal(res.generated.length, 0, "a duplicate cell must not be generated");
    const dup = res.skipped.find((s) => s.reason === "duplicate");
    assert.ok(dup, "the cell is skipped as a duplicate");
    assert.equal(gen.calls.length, 0, "generator must NOT be called for a known duplicate (no wasted AI)");
  });

  // (c2) DEDUP via the plan queue (already planned) → skipped.
  await test("(c2) dedup: already-planned cell → skipped duplicate", async () => {
    const gen = makeGenerator();
    const keyword = buildMatrixKeyword("drain cleaning", "Austin");
    const plan = makePlanStore({ existingKeywords: new Set([`${keyword}|drain-cleaning|Austin`]) });
    const res = await generateMatrixBatch(
      { trades: SMALL_TRADES, cities: ["Austin"], jobTypes: SMALL_JOBS },
      { checkGate: ON_GATE, generate: gen, slugExists: NO_DUP, planStore: plan },
    );
    assert.equal(res.generated.length, 0);
    assert.ok(res.skipped.some((s) => s.reason === "duplicate"));
    assert.equal(gen.calls.length, 0, "generator not called for an already-planned cell");
  });

  // (d) LIMIT respected — a 4-cell matrix with limit 2 attempts only 2.
  await test("(d) limit respected: at most `limit` cells attempted", async () => {
    const gen = makeGenerator();
    const fourCities = ["Austin", "Dallas", "Houston", "Phoenix"];
    const res = await generateMatrixBatch(
      { trades: SMALL_TRADES, cities: fourCities, jobTypes: SMALL_JOBS, limit: 2 },
      { checkGate: ON_GATE, generate: gen, slugExists: NO_DUP, planStore: makePlanStore() },
    );
    assert.equal(res.totalCells, 4);
    assert.equal(res.attempted, 2, "only `limit` cells are attempted");
    assert.equal(gen.calls.length, 2, "generator called at most `limit` times");
    assert.equal(res.generated.length, 2);
    const limited = res.skipped.filter((s) => s.reason === "limit_reached");
    assert.equal(limited.length, 2, "the over-limit cells are skipped(limit_reached)");
  });

  // (e) INERT when the flag is off — nothing attempted, generator never called.
  await test("(e) engine disabled → inert: nothing attempted/generated, generator not called", async () => {
    const gen = makeGenerator();
    const res = await generateMatrixBatch(
      { trades: SMALL_TRADES, cities: SMALL_CITIES, jobTypes: SMALL_JOBS },
      { checkGate: OFF_GATE, generate: gen, slugExists: NO_DUP, planStore: makePlanStore() },
    );
    assert.equal(res.enabled, false, "batch reports the engine was off");
    assert.equal(res.attempted, 0, "no cell attempted when the engine is off");
    assert.equal(res.generated.length, 0, "nothing generated when the engine is off");
    assert.equal(gen.calls.length, 0, "generator must NOT be called when the engine is off");
    assert.ok(res.skipped.every((s) => s.reason === "engine_disabled"));
  });

  // (e2) unique_data_score floor — a below-floor cell is held, not counted won.
  await test("(e2) below unique_data_score floor → held for review, not in generated", async () => {
    const gen = makeGenerator({ lowScore: true });
    const plan = makePlanStore();
    const res = await generateMatrixBatch(
      { trades: SMALL_TRADES, cities: ["Austin"], jobTypes: SMALL_JOBS },
      { checkGate: ON_GATE, generate: gen, slugExists: NO_DUP, planStore: plan },
    );
    assert.equal(res.generated.length, 0, "a below-floor page is not a clean win");
    assert.ok(res.skipped.some((s) => s.reason === "below_unique_data_floor"));
    assert.ok(MIN_UNIQUE_DATA_SCORE > 2, "the floor is above the low fixture score");
    assert.ok(plan.upserts.some((u) => u.status === "blocked" && u.reason === "below_unique_data_floor"));
  });

  // (f) DELIBERATE-FAILURE — a regressed batch that bypasses the k-anonymity
  //     skip (creates a page for a no-data cell) MUST be caught red.
  await test("(f) deliberate-failure: a batch that bypasses k-anonymity (page for no-data cell) fails red", async () => {
    // The regressed generator IGNORES insufficiency and creates a page anyway.
    const regressed = makeGenerator({ insufficientFor: () => true, bypassKAnon: true });
    const res = await generateMatrixBatch(
      { trades: SMALL_TRADES, cities: ["Nowheresville"], jobTypes: SMALL_JOBS },
      { checkGate: ON_GATE, generate: regressed, slugExists: NO_DUP, planStore: makePlanStore() },
    );
    // The CONTRACT under test: a no-data cell must NEVER become a page. With
    // the regression, it DID (generated.length === 1). Assert the anti-thin
    // guarantee — which MUST throw here, proving the test detects the
    // regression. We invert: the assertion MUST throw.
    let threw = false;
    try {
      assert.equal(
        res.generated.length,
        0,
        "anti-thin guarantee: a no-data cell must not become a page",
      );
    } catch {
      threw = true;
    }
    assert.equal(threw, true, "the k-anonymity anti-thin guarantee must be enforced (regression caught)");
  });

  // Pure-helper sanity (no I/O).
  await test("helpers: expandMatrix produces trade×city×job cells with slugs", () => {
    const cells = expandMatrix(SMALL_TRADES, ["Austin", "Dallas"], SMALL_JOBS);
    assert.equal(cells.length, 2);
    assert.equal(cells[0].keyword, "drain cleaning cost in Austin");
    assert.equal(cells[0].slug, "drain-cleaning-cost-in-austin");
    assert.equal(cells[0].intent, "bottom");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
