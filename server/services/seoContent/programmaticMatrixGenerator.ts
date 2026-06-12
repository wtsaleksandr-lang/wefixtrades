/**
 * programmaticMatrixGenerator — the [trade]×[city](×[jobType]) page generator
 * for the owned-domain SEO channel (the programmatic matrix, design §5).
 *
 * THIS IS THE RISKIEST PART OF THE CHANNEL. Programmatic = thin-content /
 * doorway-page risk, which is exactly what Google penalizes. So this module is
 * almost entirely GUARDRAILS, and its job is to be a *validation vehicle*, not
 * a firehose: it ships a tiny curated SEED_MATRIX (≤10 cells) so the guardrails
 * can be proven on live SERPs before the matrix is ever widened. See
 * plans/seo-content-channel-design.md §5 (anti-thin guardrails) + §7 WP "ship
 * the matrix SECOND, scoped tiny (1 trade × few metros)".
 *
 * ─── WHAT IT DOES ─────────────────────────────────────────────────────────
 * For each [trade × city (× jobType)] cell it calls the EXISTING, already-
 * merged seoArticleGenerator.generateSeoArticle. That generator already:
 *   • SKIPS below the k-anonymity / MIN_SAMPLE floor (a no-data cell NEVER
 *     becomes a page — the primary anti-thin guarantee);
 *   • files the result as status='in_review' (NEVER auto-publishes);
 *   • cites genuinely unique real price aggregates per city (the moat);
 *   • computes a unique_data_score and freezes it onto the draft.
 * This module adds the MATRIX-level guardrails on top: a hard per-batch limit,
 * pre-flight dedup against existing pages + already-planned cells, an optional
 * unique_data_score floor, and per-cell skip logging (never a silent skip).
 *
 * ─── THE GUARANTEES (all enforced, all tested) ────────────────────────────
 *   1. INERT WHEN OFF. Behind checkSeoEngineGate() (SEO_ENGINE_ENABLED env +
 *      DB kill-switch). Flag off → generates NOTHING, returns immediately.
 *   2. NEVER AUTO-PUBLISHES. Every cell that becomes a page is an in_review
 *      draft — inherited from generateSeoArticle, which only ever writes
 *      status='in_review'. The human review queue is the only path to live.
 *   3. K-ANONYMITY (anti-thin primary). Inherited: a cell whose price cut is
 *      below MIN_SAMPLE is skipped (reason 'insufficient_data') — no page.
 *   4. DEDUP. Never create two pages for the same (trade,job,city) slug —
 *      checked here (plan + published-page lookup) AND in the generator
 *      (seoSlugExists). Double-defended.
 *   5. UNIQUE-DATA-SCORE FLOOR. A cell whose generated page scores below
 *      MIN_UNIQUE_DATA_SCORE is skipped (reason 'below_unique_data_floor') —
 *      its data isn't meaningfully distinct from siblings.
 *   6. HARD LIMIT. At most `limit` cells are attempted per batch (default 10).
 *
 * NO detection-evasion imports — this is the WFX-owned, attributed path.
 * NO cron firing hundreds of pages: a batch is triggered explicitly via the
 * admin route POST /api/admin/seo/matrix/generate-batch (registered in
 * server/routes/adminSeoMatrixRoutes.ts).
 */

import type { SeoGateResult } from "./seoEngineGate";
import {
  generateSeoArticle,
  slugify,
  type SeoArticleRequest,
  type SeoArticleResult,
  type SeoArticleDeps,
  type SeoSearchIntent,
} from "./seoArticleGenerator";
import { createLogger } from "../../lib/logger";

const log = createLogger("SeoEngine:Matrix");

/* ─── Config ──────────────────────────────────────────────────────────────── */

/** Hard ceiling on cells attempted per batch. Validation scope — kept tiny so
 *  a single run can never fire the firehose. Caller may pass a smaller limit;
 *  a larger one is clamped to MAX_BATCH_CELLS. */
export const DEFAULT_BATCH_LIMIT = 10;
export const MAX_BATCH_CELLS = 25;

/** A generated page must clear this unique_data_score to survive. Below it the
 *  page's data is not meaningfully distinct from a sibling — skip it (the
 *  generator already filed an in_review draft we then discard from the batch,
 *  but it never auto-publishes, so a human still gates it). Default mirrors the
 *  generator's own scoring floor: 5 percentile-anchors + provenance is the
 *  realistic minimum for a genuine cell. */
export const MIN_UNIQUE_DATA_SCORE = 6;

/* ─── TINY VALIDATION SCOPE — the curated seed matrix ─────────────────────────
 * Design §5.5 ("city whitelist, not city explosion") + §7 ("v1 = 1 trade × a
 * handful of well-covered metros to validate guardrails on live SERPs").
 *
 * Deliberately small: 1 trade × 4 real metros × 2 common job types = 8 cells.
 * This is the validation vehicle, NOT a production matrix. The whole point is
 * to prove the guardrails on a handful of pages before widening coverage.
 * Widening = add rows here (data-coverage-led), never an algorithmic explosion.
 */
export interface MatrixTrade {
  /** calculators.trade_type the price moat is cut on. */
  tradeType: string;
  /** Human label used in the keyword (e.g. "plumber"). */
  label: string;
}
export interface MatrixJob {
  /** Named job → selects the representative price basket in the data service. */
  jobType: string;
  /** Human phrase used in the keyword (e.g. "drain cleaning"). */
  phrase: string;
  /** Search intent → picks the CTA product + framing. */
  intent: SeoSearchIntent;
}

export const SEED_TRADES: MatrixTrade[] = [
  { tradeType: "plumber", label: "plumber" },
];

/** Curated top metros where we actually expect calculator coverage. */
export const SEED_CITIES: string[] = ["Austin", "Dallas", "Houston", "Phoenix"];

export const SEED_JOBS: MatrixJob[] = [
  { jobType: "drain-cleaning", phrase: "drain cleaning", intent: "bottom" },
  { jobType: "water-heater-install", phrase: "water heater installation", intent: "bottom" },
];

/** The expanded seed cell list (trade × city × job). Computed once, exported
 *  so the test + the route can introspect the exact validation scope. */
export interface MatrixCell {
  tradeType: string;
  tradeLabel: string;
  city: string;
  jobType: string;
  jobPhrase: string;
  intent: SeoSearchIntent;
  /** The primary keyword the page targets, e.g. "drain cleaning cost in Austin". */
  keyword: string;
  /** Stable slug — the dedup key shared with the generator. */
  slug: string;
}

/** Build the keyword for a cell. Programmatic cost-page pattern:
 *  "<job phrase> cost in <city>". */
export function buildMatrixKeyword(jobPhrase: string, city: string): string {
  return `${jobPhrase} cost in ${city}`;
}

/** Expand a (trades, cities, jobs) spec into the ordered cell list. */
export function expandMatrix(
  trades: MatrixTrade[],
  cities: string[],
  jobs: MatrixJob[],
): MatrixCell[] {
  const cells: MatrixCell[] = [];
  for (const trade of trades) {
    for (const city of cities) {
      for (const job of jobs) {
        const keyword = buildMatrixKeyword(job.phrase, city);
        cells.push({
          tradeType: trade.tradeType,
          tradeLabel: trade.label,
          city,
          jobType: job.jobType,
          jobPhrase: job.phrase,
          intent: job.intent,
          keyword,
          slug: slugify(keyword),
        });
      }
    }
  }
  return cells;
}

/** The default seed matrix — the full validation scope (8 cells). */
export const SEED_MATRIX: MatrixCell[] = expandMatrix(SEED_TRADES, SEED_CITIES, SEED_JOBS);

/* ─── Public request / result types ───────────────────────────────────────── */

export interface MatrixBatchRequest {
  /** Override the trades (defaults to SEED_TRADES). */
  trades?: MatrixTrade[];
  /** Override the cities (defaults to SEED_CITIES). */
  cities?: string[];
  /** Override the jobs (defaults to SEED_JOBS). */
  jobTypes?: MatrixJob[];
  /** Max cells attempted this batch (default DEFAULT_BATCH_LIMIT, clamped to
   *  MAX_BATCH_CELLS). */
  limit?: number;
  /** Override the unique_data_score floor (default MIN_UNIQUE_DATA_SCORE). */
  minUniqueDataScore?: number;
}

export type MatrixSkipReason =
  | "engine_disabled"
  | "limit_reached"
  | "duplicate"
  | "insufficient_data"
  | "below_unique_data_floor"
  | "generation_failed";

export interface MatrixSkip {
  slug: string;
  keyword: string;
  city: string;
  jobType: string;
  reason: MatrixSkipReason;
  detail?: string;
}

export interface MatrixGenerated {
  slug: string;
  keyword: string;
  city: string;
  jobType: string;
  /** The in_review draft id created (NEVER published). */
  draftId: number;
  uniqueDataScore: number;
}

export interface MatrixBatchResult {
  /** Whether the engine was on at all (false → inert, nothing attempted). */
  enabled: boolean;
  /** Total cells in the requested matrix (before the limit). */
  totalCells: number;
  /** Cells actually attempted (<= limit). */
  attempted: number;
  /** Drafts created (all in_review). */
  generated: MatrixGenerated[];
  /** Every cell that did NOT become a page, with its reason (no silent skips). */
  skipped: MatrixSkip[];
}

/* ─── Injectable dependencies (so the unit test drives this with no DB / no AI
   / no flag). Production defaults wire the live gate, the real generator, and
   the real dedup lookups. ─────────────────────────────────────────────────── */

/** Records the queue/status of a matrix cell in seo_keyword_plan. Optional —
 *  when absent we still generate; the plan row is status bookkeeping only. */
export interface MatrixPlanStore {
  /** True when a plan row already exists for this (keyword, job, city). */
  planExists: (cell: MatrixCell) => Promise<boolean>;
  /** Upsert a plan row with the given status + optional skip reason. */
  upsertPlan: (cell: MatrixCell, status: string, skipReason?: string | null, assignedPageId?: number | null) => Promise<void>;
}

export interface MatrixDeps {
  /** Gate decision (default: live checkSeoEngineGate). */
  checkGate?: () => Promise<SeoGateResult>;
  /** The article generator (default: the real generateSeoArticle). Injected so
   *  the test never touches the DB / AI. */
  generate?: (req: SeoArticleRequest, deps?: SeoArticleDeps) => Promise<SeoArticleResult>;
  /** True when a published/in_review page already owns this slug. Default
   *  queries seoSlugExists. The generator ALSO checks this, but checking here
   *  first means we never even call generation for a known duplicate. */
  slugExists?: (slug: string) => Promise<boolean>;
  /** Optional plan-row bookkeeping (default: the DB-backed store). */
  planStore?: MatrixPlanStore;
  /** Deps forwarded to the generator (used by the test to inject the data
   *  service + AI + store there). Production leaves this undefined so the
   *  generator wires its own real defaults. */
  generatorDeps?: SeoArticleDeps;
}

/* ─── Default DB-backed plan store (lazy import — no DB at module load) ─────── */

const defaultPlanStore: MatrixPlanStore = {
  async planExists(cell) {
    const { db } = await import("../../db");
    const { seoKeywordPlan } = await import("@shared/schema");
    const { and, eq } = await import("drizzle-orm");
    const [row] = await db
      .select({ id: seoKeywordPlan.id })
      .from(seoKeywordPlan)
      .where(
        and(
          eq(seoKeywordPlan.target_keyword, cell.keyword),
          eq(seoKeywordPlan.job_type, cell.jobType),
          eq(seoKeywordPlan.city, cell.city),
        ),
      )
      .limit(1);
    return !!row;
  },
  async upsertPlan(cell, status, skipReason = null, assignedPageId = null) {
    const { db } = await import("../../db");
    const { seoKeywordPlan } = await import("@shared/schema");
    await db
      .insert(seoKeywordPlan)
      .values({
        target_keyword: cell.keyword,
        search_intent: cell.intent,
        job_type: cell.jobType,
        city: cell.city,
        status,
        skip_reason: skipReason,
        assigned_page_id: assignedPageId,
      })
      .onConflictDoUpdate({
        target: [seoKeywordPlan.target_keyword, seoKeywordPlan.job_type, seoKeywordPlan.city],
        set: { status, skip_reason: skipReason, assigned_page_id: assignedPageId, updated_at: new Date() },
      });
  },
};

async function defaultSlugExists(slug: string): Promise<boolean> {
  const { seoSlugExists } = await import("../../storage/seoContent");
  return seoSlugExists(slug);
}

/* ─── Main entry point ─────────────────────────────────────────────────────── */

/**
 * Generate one matrix batch. Iterates the [trade × city × job] cells, applies
 * the matrix guardrails, and delegates each surviving cell to the existing
 * generateSeoArticle (which itself enforces k-anonymity + in_review-only).
 *
 * Returns a full accounting: { generated[], skipped[] } — EVERY cell that did
 * not become a page carries a reason (no silent skips). NOTHING is ever
 * published — all generated drafts are status='in_review'.
 *
 * Inert when the engine flag is off: returns immediately with enabled=false,
 * attempted=0, and nothing generated.
 */
export async function generateMatrixBatch(
  req: MatrixBatchRequest = {},
  deps: MatrixDeps = {},
): Promise<MatrixBatchResult> {
  const checkGate =
    deps.checkGate ??
    (async () => {
      const { checkSeoEngineGate } = await import("./seoEngineGate");
      return checkSeoEngineGate();
    });
  const generate = deps.generate ?? generateSeoArticle;
  const slugExists = deps.slugExists ?? defaultSlugExists;
  const planStore = deps.planStore ?? defaultPlanStore;
  const minUniqueDataScore = req.minUniqueDataScore ?? MIN_UNIQUE_DATA_SCORE;

  const trades = req.trades ?? SEED_TRADES;
  const cities = req.cities ?? SEED_CITIES;
  const jobs = req.jobTypes ?? SEED_JOBS;
  const cells = expandMatrix(trades, cities, jobs);

  const limit = Math.max(1, Math.min(req.limit ?? DEFAULT_BATCH_LIMIT, MAX_BATCH_CELLS));

  const result: MatrixBatchResult = {
    enabled: true,
    totalCells: cells.length,
    attempted: 0,
    generated: [],
    skipped: [],
  };

  // ── 1. Inert-by-default gate. Flag off → generate NOTHING. ──
  const gate = await checkGate();
  if (!gate.allowed) {
    log.info("matrix batch skipped — engine disabled", { reason: gate.reason });
    result.enabled = false;
    // Surface every cell as skipped(engine_disabled) so the caller sees the
    // batch was inert — no silent no-op.
    for (const cell of cells) {
      result.skipped.push({
        slug: cell.slug,
        keyword: cell.keyword,
        city: cell.city,
        jobType: cell.jobType,
        reason: "engine_disabled",
        detail: gate.reason,
      });
    }
    return result;
  }

  for (const cell of cells) {
    // ── 6. HARD LIMIT. Stop attempting once the batch ceiling is reached. ──
    if (result.attempted >= limit) {
      result.skipped.push({
        slug: cell.slug,
        keyword: cell.keyword,
        city: cell.city,
        jobType: cell.jobType,
        reason: "limit_reached",
        detail: `batch limit ${limit} reached`,
      });
      continue;
    }

    // ── 4. DEDUP (pre-flight). Never create two pages for the same cell. We
    //    check BOTH the published/in_review pages (by slug) AND the plan queue.
    //    The generator double-checks the slug, but skipping here avoids a
    //    wasted AI call for a known duplicate. ──
    let isDuplicate = false;
    let dupDetail = "";
    try {
      if (await slugExists(cell.slug)) {
        isDuplicate = true;
        dupDetail = "slug already exists";
      } else if (await planStore.planExists(cell)) {
        isDuplicate = true;
        dupDetail = "already planned";
      }
    } catch (err) {
      // A dedup-lookup failure must NOT silently let a possible duplicate
      // through — record it and skip the cell defensively.
      result.skipped.push({
        slug: cell.slug,
        keyword: cell.keyword,
        city: cell.city,
        jobType: cell.jobType,
        reason: "generation_failed",
        detail: `dedup lookup failed: ${(err as Error).message}`,
      });
      continue;
    }
    if (isDuplicate) {
      await safeUpsertPlan(planStore, cell, "skipped", "duplicate");
      result.skipped.push({
        slug: cell.slug,
        keyword: cell.keyword,
        city: cell.city,
        jobType: cell.jobType,
        reason: "duplicate",
        detail: dupDetail,
      });
      continue;
    }

    // This cell is being attempted (count it before generation).
    result.attempted += 1;
    await safeUpsertPlan(planStore, cell, "generating");

    // ── Delegate to the EXISTING generator. It enforces k-anonymity (skips
    //    below MIN_SAMPLE → reason 'insufficient_data') AND in_review-only. ──
    let articleResult: SeoArticleResult;
    try {
      articleResult = await generate(
        {
          keyword: cell.keyword,
          tradeType: cell.tradeType,
          jobType: cell.jobType,
          region: cell.city,
          intent: cell.intent,
        },
        deps.generatorDeps,
      );
    } catch (err) {
      log.error("matrix cell generation threw", { slug: cell.slug, err: (err as Error).message });
      await safeUpsertPlan(planStore, cell, "blocked", "generation_failed");
      result.skipped.push({
        slug: cell.slug,
        keyword: cell.keyword,
        city: cell.city,
        jobType: cell.jobType,
        reason: "generation_failed",
        detail: (err as Error).message,
      });
      continue;
    }

    // ── 3. K-ANONYMITY + other generator skips (no page was created). ──
    if (!articleResult.ok || articleResult.skipped) {
      const genReason = articleResult.skipped ? articleResult.reason : "generation_failed";
      // Map the generator's reasons onto the matrix's vocabulary.
      const reason: MatrixSkipReason =
        genReason === "insufficient_data"
          ? "insufficient_data"
          : genReason === "duplicate_slug"
            ? "duplicate"
            : genReason === "engine_disabled"
              ? "engine_disabled"
              : "generation_failed";
      const planStatus = reason === "insufficient_data" ? "skipped" : reason === "duplicate" ? "skipped" : "blocked";
      await safeUpsertPlan(planStore, cell, planStatus, genReason);
      log.info("matrix cell produced no page", { slug: cell.slug, reason: genReason });
      result.skipped.push({
        slug: cell.slug,
        keyword: cell.keyword,
        city: cell.city,
        jobType: cell.jobType,
        reason,
        detail: genReason,
      });
      continue;
    }

    // A draft WAS created (status='in_review' — verified by the generator).
    // ── 5. UNIQUE-DATA-SCORE FLOOR. A page whose data isn't meaningfully
    //    distinct from siblings is skipped from the batch's "generated" set.
    //    The draft already exists in_review (the generator never auto-
    //    publishes), so a human still gates it; we mark the plan 'blocked' so
    //    it surfaces for review rather than counting as a clean win. ──
    if (articleResult.uniqueDataScore < minUniqueDataScore) {
      await safeUpsertPlan(planStore, cell, "blocked", "below_unique_data_floor", articleResult.draft.id);
      log.info("matrix cell below unique-data floor — held for review", {
        slug: cell.slug,
        uniqueDataScore: articleResult.uniqueDataScore,
        floor: minUniqueDataScore,
      });
      result.skipped.push({
        slug: cell.slug,
        keyword: cell.keyword,
        city: cell.city,
        jobType: cell.jobType,
        reason: "below_unique_data_floor",
        detail: `score ${articleResult.uniqueDataScore} < floor ${minUniqueDataScore}`,
      });
      continue;
    }

    await safeUpsertPlan(planStore, cell, "drafted", null, articleResult.draft.id);
    result.generated.push({
      slug: cell.slug,
      keyword: cell.keyword,
      city: cell.city,
      jobType: cell.jobType,
      draftId: articleResult.draft.id,
      uniqueDataScore: articleResult.uniqueDataScore,
    });
  }

  log.info("matrix batch complete", {
    totalCells: result.totalCells,
    attempted: result.attempted,
    generated: result.generated.length,
    skipped: result.skipped.length,
  });
  return result;
}

/* Plan-row bookkeeping is best-effort: a status-tracking write failing must
 * never abort the batch or, worse, let a page slip past a guardrail. We log
 * and continue. The page-existence guarantees live in the generator + the
 * dedup lookup, not in this bookkeeping row. */
async function safeUpsertPlan(
  store: MatrixPlanStore,
  cell: MatrixCell,
  status: string,
  skipReason: string | null = null,
  assignedPageId: number | null = null,
): Promise<void> {
  try {
    await store.upsertPlan(cell, status, skipReason, assignedPageId);
  } catch (err) {
    log.error("plan upsert failed (non-fatal bookkeeping)", {
      slug: cell.slug,
      status,
      err: (err as Error).message,
    });
  }
}
