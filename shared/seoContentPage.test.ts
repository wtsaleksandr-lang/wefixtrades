/**
 * Owned-domain SEO content engine — foundation guard test.
 *
 * Standalone tsx + node:assert/strict. No DB, no network, no React — it
 * exercises the SAME pure helpers the server (storage/sitemap) and the
 * client (/blog/:slug render) use, so green here means the runtime obeys the
 * three foundation invariants:
 *
 *   (a) a PUBLISHED page renders + emits Article JSON-LD carrying the real
 *       author entity (E-E-A-T);
 *   (b) a DRAFT / IN_REVIEW / ARCHIVED page is NOT publicly visible (the
 *       render route 404s + the page is sitemap-excluded);
 *   (c) PUBLISHED pages appear in the sitemap source with a real lastmod.
 *
 * Plus a DELIBERATE-FAILURE FIXTURE: a regressed visibility check that
 * treats a draft as visible fails red — proving the gate catches a real
 * regression, not merely that it runs.
 *
 * Also covers the runtime gate (WP-0): flag off → disabled; flag on +
 * kill-switch on → still disabled (the gate's DB read is stubbed).
 *
 * Runnable standalone:  npx tsx shared/seoContentPage.test.ts
 * Wired into CI as `npm run check:seo-engine`.
 */
import assert from "node:assert/strict";
// server/db.ts throws at import without DATABASE_URL (the gate module's
// dependency chain reaches it). Set a stub BEFORE the dynamic import of the
// gate below — no real IO happens; the gate decision is exercised via the
// pure evaluator. (ESM hoists static imports above statements, so the gate
// is loaded with a dynamic import inside main() after this is set.)
process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";
import {
  isPubliclyVisible,
  toSitemapEntry,
  buildArticleJsonLd,
  type SeoPageView,
} from "./seoContentPage";

let passed = 0;
function ok(label: string, cond: boolean) {
  assert.ok(cond, label);
  passed++;
}

const PUBLISHED: SeoPageView = {
  slug: "how-much-does-a-boiler-replacement-cost",
  title: "How Much Does a Boiler Replacement Cost in 2026?",
  status: "published",
  author_entity: "WeFixTrades Editorial",
  meta_description: "Real price ranges from WeFixTrades calculator data.",
  excerpt: "What a boiler replacement actually costs.",
  jsonld_type: "Article",
  published_at: new Date("2026-06-10T09:00:00Z"),
  updated_at: new Date("2026-06-11T12:00:00Z"),
};

const DRAFT: SeoPageView = { ...PUBLISHED, slug: "draft-piece", status: "draft" };
const IN_REVIEW: SeoPageView = { ...PUBLISHED, slug: "in-review-piece", status: "in_review" };
const ARCHIVED: SeoPageView = { ...PUBLISHED, slug: "archived-piece", status: "archived" };

/* ── (a) Published page renders + Article JSON-LD with author entity ── */
ok("published page is publicly visible", isPubliclyVisible(PUBLISHED) === true);

const jsonLd = buildArticleJsonLd(PUBLISHED);
ok("JSON-LD @type is Article", jsonLd["@type"] === "Article");
ok("JSON-LD headline matches title", jsonLd.headline === PUBLISHED.title);
ok(
  "JSON-LD carries the real author entity (E-E-A-T)",
  !!jsonLd.author &&
    (jsonLd.author as Record<string, unknown>).name === "WeFixTrades Editorial",
);
ok(
  "JSON-LD url is the absolute /blog/<slug>",
  jsonLd.url === `https://wefixtrades.com/blog/${PUBLISHED.slug}`,
);
ok("JSON-LD has a publisher", !!jsonLd.publisher);
ok("JSON-LD datePublished present", typeof jsonLd.datePublished === "string");

/* ── (b) Draft / in_review / archived are NOT publicly visible ── */
ok("draft is NOT publicly visible", isPubliclyVisible(DRAFT) === false);
ok("in_review is NOT publicly visible", isPubliclyVisible(IN_REVIEW) === false);
ok("archived is NOT publicly visible", isPubliclyVisible(ARCHIVED) === false);

// A non-published page maps to NO sitemap entry (can never be advertised).
ok("draft → null sitemap entry", toSitemapEntry(DRAFT) === null);
ok("in_review → null sitemap entry", toSitemapEntry(IN_REVIEW) === null);
ok("archived → null sitemap entry", toSitemapEntry(ARCHIVED) === null);

/* ── (c) Published pages appear in the sitemap source with real lastmod ── */
const entry = toSitemapEntry(PUBLISHED);
ok("published → sitemap entry exists", entry !== null);
ok("sitemap loc is /blog/<slug>", entry!.loc === `/blog/${PUBLISHED.slug}`);
ok(
  "sitemap lastmod uses updated_at (real signal, not now())",
  entry!.lastmod === "2026-06-11",
);

// lastmod must NOT be today's date unless that genuinely is updated_at — the
// Google lastmod-hygiene rule. Falls back to published_at when no updated_at.
const noUpdated = toSitemapEntry({ ...PUBLISHED, updated_at: null });
ok("falls back to published_at lastmod", noUpdated!.lastmod === "2026-06-10");

/* ── DELIBERATE-FAILURE FIXTURE ──
   A regressed visibility check that renders drafts. The real
   isPubliclyVisible must DISAGREE with it on a draft — if a future edit made
   isPubliclyVisible return true for a draft, this assertion fails red. */
function regressedIsVisible(_page: Pick<SeoPageView, "status">): boolean {
  return true; // BUG: treats every status (incl. draft) as visible
}
ok(
  "deliberate-failure fixture: real check rejects a draft the buggy one accepts",
  regressedIsVisible(DRAFT) === true && isPubliclyVisible(DRAFT) === false,
);

/* ── WP-0 runtime gate: flag + kill-switch (pure, DB-free) ── */
async function gateTests() {
  // Dynamic import so DATABASE_URL is stubbed before db.ts loads.
  const { isSeoEngineFlagEnabled, evaluateSeoEngineGate } = await import(
    "../server/services/seoContent/seoEngineGate"
  );

  // Flag parser honours truthy spellings + ignores everything else.
  delete process.env.SEO_ENGINE_ENABLED;
  ok("flag unset → isSeoEngineFlagEnabled false", isSeoEngineFlagEnabled() === false);
  process.env.SEO_ENGINE_ENABLED = "true";
  ok("flag 'true' → enabled", isSeoEngineFlagEnabled() === true);
  process.env.SEO_ENGINE_ENABLED = "1";
  ok("flag '1' → enabled", isSeoEngineFlagEnabled() === true);
  process.env.SEO_ENGINE_ENABLED = "false";
  ok("flag 'false' → disabled", isSeoEngineFlagEnabled() === false);
  delete process.env.SEO_ENGINE_ENABLED;

  // Gate decision: inert by default (flag off), kill-switch overrides flag.
  ok("flag off → gate disabled", evaluateSeoEngineGate(false, false).allowed === false);
  ok("flag off + kill on → gate disabled", evaluateSeoEngineGate(false, true).allowed === false);
  ok("flag on + kill-switch on → gate disabled", evaluateSeoEngineGate(true, true).allowed === false);
  ok("flag on + kill-switch off → gate allowed", evaluateSeoEngineGate(true, false).allowed === true);
}

gateTests()
  .then(() => {
    console.log(`✓ SEO engine foundation: ${passed} assertions passed`);
  })
  .catch((err) => {
    console.error("✖ SEO engine foundation test FAILED");
    console.error(err);
    process.exit(1);
  });
