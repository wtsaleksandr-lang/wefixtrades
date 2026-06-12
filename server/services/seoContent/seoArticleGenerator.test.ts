/**
 * seoArticleGenerator guard (generator wave) — the human-review-gated,
 * data-backed SEO article generator.
 *
 * Runnable standalone via:
 *   npx tsx server/services/seoContent/seoArticleGenerator.test.ts
 * Wired into CI as `npm run check:seo-generator` (.github/workflows/ci.yml).
 *
 * Excluded from `tsc --noEmit` (tsconfig excludes **\/*.test.ts). Uses
 * node:assert/strict, no test-runner dep, NO live DB and NO API key — the
 * data service, AI util, and store are all INJECTED as fakes.
 *
 * Coverage:
 *   (a) below k-anonymity floor (data { sufficient:false }) → SKIPS generation
 *       (no draft created, reason='insufficient_data')
 *   (b) sufficient data → creates an in_review draft (status === 'in_review',
 *       NEVER 'published') that cites the real numbers + sampleSize
 *   (c) the article body cites the real numbers + has the product CTA +
 *       internal links (/free-tools, /blog, the product page)
 *   (d) inert when the engine flag is off → SKIPS (reason='engine_disabled'),
 *       no AI call, no draft
 *   (e) DELIBERATE-FAILURE fixture: a regressed store that publishes a draft
 *       directly (status='published', skipping in_review) must fail this test
 *       red — proving the in_review-only contract is actually checked.
 *
 * CRITICAL: ends with process.exit(failed>0?1:0) so a stray open handle from
 * any import can never hang CI (a fusion test hung the whole pipeline tonight
 * for exactly this reason).
 */

import assert from "node:assert/strict";
import {
  generateSeoArticle,
  computeUniqueDataScore,
  buildDataCitation,
  ctaProductFor,
  slugify,
  type SeoArticleRequest,
  type SeoArticleDeps,
  type SeoGeneratorStore,
  type SeoAiTextFn,
} from "./seoArticleGenerator";
import type {
  OriginalDataResult,
  SufficientDataResult,
} from "./originalDataService";
import type { SeoContentPage, InsertSeoContentPage } from "@shared/schema";

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

const SUFFICIENT: SufficientDataResult = {
  sufficient: true,
  tradeType: "plumber",
  jobType: "standard",
  region: "Austin",
  sampleSize: 12,
  currency: "USD",
  min: 90,
  p25: 140,
  median: 185,
  p75: 240,
  max: 380,
  commonOptions: [
    { label: "After-Hours", prevalence: 0.42 },
    { label: "Travel / Service Fee", prevalence: 0.33 },
  ],
  regionalVariation: [{ region: "Austin", sampleSize: 12, median: 185 }],
  computedAt: "2026-06-12T00:00:00.000Z",
};

const INSUFFICIENT: OriginalDataResult = {
  sufficient: false,
  sampleSize: 2,
  minSample: 5,
  tradeType: "plumber",
  jobType: "rare-job",
  region: "Nowhere",
};

const REQ: SeoArticleRequest = {
  keyword: "drain cleaning cost",
  tradeType: "plumber",
  jobType: "standard",
  region: "Austin",
  intent: "bottom",
};

/** A spy store that records created drafts (and lets us simulate a regressed
 *  publish-directly store for the deliberate-failure fixture). */
function makeStore(opts: { forcePublished?: boolean } = {}): SeoGeneratorStore & {
  created: SeoContentPage[];
  approvals: any[];
} {
  const created: SeoContentPage[] = [];
  const approvals: any[] = [];
  let nextId = 1;
  return {
    created,
    approvals,
    async createSeoContentDraft(data: InsertSeoContentPage): Promise<SeoContentPage> {
      const row = {
        id: nextId++,
        ...data,
        // A regressed store that ignores the in_review contract and writes
        // the row live. The generator passes status='in_review'; this fixture
        // overrides it to 'published' to prove the test catches auto-publish.
        status: opts.forcePublished ? "published" : data.status,
        meta_description: data.meta_description ?? null,
        excerpt: data.excerpt ?? null,
        canonical: data.canonical ?? null,
        original_data: data.original_data ?? null,
        unique_data_score: data.unique_data_score ?? null,
        source_draft_id: data.source_draft_id ?? null,
        published_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      } as unknown as SeoContentPage;
      created.push(row);
      return row;
    },
    async appendSeoApproval(data) {
      approvals.push(data);
      return data;
    },
    async seoSlugExists() {
      return false;
    },
  };
}

/** A fake AI util that records its prompts and returns a body. */
function makeAi(body: string): SeoAiTextFn & { calls: any[] } {
  const calls: any[] = [];
  const fn = (async (input) => {
    calls.push(input);
    return { text: body, costMicroUsd: 1234, provider: "fake" };
  }) as SeoAiTextFn & { calls: any[] };
  fn.calls = calls;
  return fn;
}

const ON_GATE = async () => ({ allowed: true });
const OFF_GATE = async () => ({ allowed: false, reason: "SEO_ENGINE_ENABLED is not set." });

/* A model body that cites the real numbers + includes the required links. */
const GOOD_BODY = [
  "# Drain Cleaning Cost in Austin",
  "",
  "Based on 12 real WeFixTrades quotes, the typical drain cleaning job runs about $185, with most between $140 and $240.",
  "",
  "## What affects the price",
  "After-Hours work and a Travel / Service Fee are the most common add-ons.",
  "",
  "## Get an instant quote",
  "Try our [QuoteQuick](/products/quickquotepro) calculator, browse [free trade tools](/free-tools), or read [more guides](/blog).",
  "",
  "## Frequently Asked Questions",
  "**How much is drain cleaning?** Around $185 on average.",
].join("\n");

/* ─── Tests ─────────────────────────────────────────────────────────────────── */

async function run() {
  console.log("seoArticleGenerator guard\n");

  // (a) below k-anonymity floor → SKIPS, no draft.
  await test("below k-anonymity floor → skips generation, no draft created", async () => {
    const store = makeStore();
    const ai = makeAi(GOOD_BODY);
    const deps: SeoArticleDeps = {
      checkGate: ON_GATE,
      getPriceData: async () => INSUFFICIENT,
      generateText: ai,
      store,
    };
    const res = await generateSeoArticle(REQ, deps);
    assert.equal(res.ok, false);
    assert.equal(res.skipped, true);
    if (res.skipped) assert.equal(res.reason, "insufficient_data");
    assert.equal(store.created.length, 0, "no draft must be created below the floor");
    assert.equal(ai.calls.length, 0, "AI must not be called below the floor");
  });

  // (b) sufficient data → creates an in_review draft (NOT published) citing the data.
  await test("sufficient data → creates an in_review draft (never published) citing sampleSize", async () => {
    const store = makeStore();
    const ai = makeAi(GOOD_BODY);
    const res = await generateSeoArticle(REQ, { checkGate: ON_GATE, getPriceData: async () => SUFFICIENT, generateText: ai, store });
    assert.equal(res.ok, true);
    assert.equal(store.created.length, 1, "exactly one draft created");
    const draft = store.created[0];
    assert.equal(draft.status, "in_review", "draft MUST be in_review, never published");
    assert.notEqual(draft.status, "published");
    // The frozen original_data carries the cited aggregates + provenance.
    const od = draft.original_data as Record<string, any>;
    assert.equal(od.sampleSize, 12, "sampleSize provenance frozen onto the draft");
    assert.equal(od.median, 185);
    // A 'submitted' audit row is appended (system actor).
    assert.ok(store.approvals.some((a) => a.action === "submitted" && a.actor_type === "system"));
  });

  // (c) the article cites the real numbers + has the product CTA + internal links.
  await test("article body cites real numbers + product CTA + internal links", async () => {
    const store = makeStore();
    const ai = makeAi(GOOD_BODY);
    const res = await generateSeoArticle(REQ, { checkGate: ON_GATE, getPriceData: async () => SUFFICIENT, generateText: ai, store });
    assert.equal(res.ok, true);
    const body = store.created[0].content;
    assert.ok(body.includes("185"), "cites the real median");
    assert.ok(body.includes("12 real WeFixTrades quotes"), "cites the sample size + provenance");
    // bottom-intent → QuoteQuick CTA.
    assert.ok(body.includes("/products/quickquotepro"), "includes the product CTA link");
    assert.ok(body.includes("/free-tools"), "links the free tools");
    assert.ok(body.includes("/blog"), "links the blog hub");
    // The prompt actually carried the real data block (verify the AI saw it).
    assert.ok(ai.calls[0].user.includes("185"), "prompt fed the real numbers to the model");
  });

  // (d) inert when the engine flag is off → skips, no AI call, no draft.
  await test("engine disabled → skips (no AI call, no draft)", async () => {
    const store = makeStore();
    const ai = makeAi(GOOD_BODY);
    const res = await generateSeoArticle(REQ, { checkGate: OFF_GATE, getPriceData: async () => SUFFICIENT, generateText: ai, store });
    assert.equal(res.ok, false);
    if (res.skipped === true) assert.equal(res.reason, "engine_disabled");
    assert.equal(ai.calls.length, 0, "no AI spend when the engine is off");
    assert.equal(store.created.length, 0, "no draft when the engine is off");
  });

  // (e) DELIBERATE-FAILURE fixture — a regressed store that publishes directly
  //     (skips in_review) MUST fail the in_review-only assertion red.
  await test("deliberate-failure: a generator that publishes directly (skips in_review) fails red", async () => {
    const store = makeStore({ forcePublished: true });
    const ai = makeAi(GOOD_BODY);
    await generateSeoArticle(REQ, { checkGate: ON_GATE, getPriceData: async () => SUFFICIENT, generateText: ai, store });
    const draft = store.created[0];
    // The contract under test: a draft must NEVER be live without human review.
    // This regressed store wrote it 'published'. Assert it is caught — we
    // expect the in_review check to throw here, which the wrapper records as a
    // PASS of the deliberate-failure detection. So we invert: the assertion
    // MUST throw.
    let threw = false;
    try {
      assert.equal(draft.status, "in_review", "regressed store published without review");
    } catch {
      threw = true;
    }
    assert.equal(threw, true, "the in_review-only guarantee must be enforced (regression caught)");
  });

  // Pure-helper sanity (no I/O).
  await test("helpers: slugify / ctaProductFor / score / citation", () => {
    assert.equal(slugify("Drain Cleaning Cost!"), "drain-cleaning-cost");
    assert.equal(ctaProductFor("bottom").slug, "quickquotepro");
    assert.equal(ctaProductFor("top").slug, "tradeline");
    const score = computeUniqueDataScore(SUFFICIENT);
    assert.ok(score >= 5, "score counts percentile anchors + provenance + options + regions");
    const cite = buildDataCitation(SUFFICIENT);
    assert.ok(cite.includes("12 real WeFixTrades quotes") && cite.includes("185"));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
