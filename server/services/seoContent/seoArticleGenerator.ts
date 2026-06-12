/**
 * seoArticleGenerator — owned-domain SEO article generator (generator wave).
 *
 * Turns one keyword (+ trade/job/region/intent) into a single, data-backed,
 * E-E-A-T article and files it into the human-review queue as an in_review
 * draft. It NEVER publishes — the only path to 'published' is an admin
 * approving the draft via the review queue (server/storage/seoContent.ts
 * approveSeoPage). See plans/seo-content-channel-design.md §4.1.
 *
 * ─── WHAT THIS IS / IS NOT ────────────────────────────────────────────────
 * This is the OPPOSITE of the customer-facing ContentFlow/RankFlow article
 * engine. We publish on wefixtrades.com under a real author entity and WANT
 * Google to attribute the content to us. So this path:
 *   • cites the ORIGINAL price-data moat (OriginalDataService aggregates) as
 *     a visible trust signal — "based on N real WeFixTrades quotes…";
 *   • does a NORMAL quality generation via the project AI util;
 *   • does NOT import any detection-evasion machinery
 *     (humanizationOrchestrator / detectorGate / cadenceVerifier /
 *     algorithmicHumanizer) — those are for the client product only.
 *
 * ─── THE TWO HARD GUARANTEES ──────────────────────────────────────────────
 *   1. ANTI-THIN: generation only happens when real data backs the page. If
 *      OriginalDataService returns { sufficient:false } (below the
 *      k-anonymity / MIN_SAMPLE floor) the article is NOT generated — we
 *      return { skipped:true, reason:'insufficient_data' } and write nothing.
 *   2. NEVER AUTO-PUBLISH: the draft is written with status='in_review'. The
 *      store's createSeoContentDraft additionally refuses status='published'.
 *      Publication is a separate, explicit human action.
 *
 * ─── INERT BY DEFAULT ─────────────────────────────────────────────────────
 * Gated behind checkSeoEngineGate() (SEO_ENGINE_ENABLED env flag AND the DB
 * kill-switch). Flag off / kill-switch on → { skipped:true,
 * reason:'engine_disabled' }, no generation, no AI spend. Ships dark.
 */

import type { SeoGateResult } from "./seoEngineGate";
import {
  getPriceDataForJob,
  type PriceQuery,
  type OriginalDataResult,
  type SufficientDataResult,
  type CalculatorRecord,
  type CalculatorLoader,
} from "./originalDataService";
import type { SeoContentPage, InsertSeoContentPage } from "@shared/schema";
import { createLogger } from "../../lib/logger";

const log = createLogger("SeoEngine:Generator");

/* ─── Public request / result types ───────────────────────────────────────── */

export type SeoSearchIntent = "bottom" | "mid" | "top";

export interface SeoArticleRequest {
  /** The primary keyword the page targets (drives slug, title, H1). */
  keyword: string;
  /** Calculator trade_type the price moat is cut on (e.g. "plumber"). */
  tradeType: string;
  /** Optional named job (selects the representative price basket). */
  jobType?: string;
  /** Optional region signal (e.g. a metro), passed to the data cut. */
  region?: string;
  /** Search intent — picks the CTA product + framing. */
  intent: SeoSearchIntent;
  /** Optional author entity override (defaults to "WeFixTrades Editorial"). */
  authorEntity?: string;
}

export interface SeoArticleSkipped {
  ok: false;
  skipped: true;
  /** Why no draft was created. */
  reason:
    | "engine_disabled"
    | "insufficient_data"
    | "duplicate_slug"
    | "generation_failed";
  detail?: string;
  /** Echoed for the planner to mark the keyword-plan row. */
  sampleSize?: number;
}

export interface SeoArticleGenerated {
  ok: true;
  skipped: false;
  /** The in_review draft row that was created (status='in_review'). */
  draft: SeoContentPage;
  uniqueDataScore: number;
  /** Estimated AI cost in micro-USD (when the AI util reports it). */
  costMicroUsd: number;
}

export type SeoArticleResult = SeoArticleGenerated | SeoArticleSkipped;

/* ─── Injectable dependencies (so the unit test drives this with no DB / no
   API key). Production defaults wire the real DB loader + AI util + store. ── */

/** Minimal AI util shape — matches generateContentflowText's contract. */
export interface SeoAiTextResult {
  text: string;
  costMicroUsd: number;
  provider: string;
}
export type SeoAiTextFn = (input: {
  system: string;
  user: string;
  maxTokens?: number;
  tier?: "premium" | "standard" | "fast";
}) => Promise<SeoAiTextResult>;

/** Store surface the generator needs (subset of storage/seoContent). */
export interface SeoGeneratorStore {
  createSeoContentDraft: (data: InsertSeoContentPage) => Promise<SeoContentPage>;
  appendSeoApproval: (data: {
    page_id: number;
    actor_type: string;
    actor_id?: number | null;
    action: string;
    notes?: string | null;
    metadata?: unknown;
  }) => Promise<unknown>;
  seoSlugExists: (slug: string) => Promise<boolean>;
}

export interface SeoArticleDeps {
  /** Gate decision (default: live checkSeoEngineGate). */
  checkGate?: () => Promise<SeoGateResult>;
  /** Price-data lookup (default: getPriceDataForJob + the DB calculator loader). */
  getPriceData?: (query: PriceQuery) => Promise<OriginalDataResult>;
  /** AI text generation (default: generateContentflowText). */
  generateText?: SeoAiTextFn;
  /** Persistence (default: the real storage helpers). */
  store?: SeoGeneratorStore;
}

/* ─── Default DB-backed calculator loader for the price moat ───────────────
   Projects calculator rows down to the privacy-safe CalculatorRecord shape
   (trade_type + pricing_config only — no id/name/email survives). Imported
   lazily so this module has no hard DB dependency at import time (keeps the
   unit test import-light). */
const defaultCalculatorLoader: CalculatorLoader = async (tradeType: string) => {
  const { db } = await import("../../db");
  const { calculators } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await db
    .select({ trade_type: calculators.trade_type, pricing_config: calculators.pricing_config })
    .from(calculators)
    .where(eq(calculators.trade_type, tradeType));
  return rows.map((r): CalculatorRecord => ({
    trade_type: r.trade_type,
    pricing_config: r.pricing_config,
  }));
};

async function defaultGetPriceData(query: PriceQuery): Promise<OriginalDataResult> {
  return getPriceDataForJob(query, defaultCalculatorLoader);
}

async function defaultGenerateText(input: Parameters<SeoAiTextFn>[0]): Promise<SeoAiTextResult> {
  // Reuse the project AI util (provider rotator + cost tracking). Imported
  // lazily so the unit test never touches it.
  const { generateContentflowText } = await import("../contentflow/aiText");
  const out = await generateContentflowText(input);
  return { text: out.text, costMicroUsd: out.costMicroUsd, provider: out.provider };
}

/* The default store lazily imports the storage helpers (which pull in the DB)
   so this module — and the unit test that injects its own store — never
   triggers the DB connection at import time. */
const defaultStore: SeoGeneratorStore = {
  async createSeoContentDraft(data) {
    const { createSeoContentDraft } = await import("../../storage/seoContent");
    return createSeoContentDraft(data);
  },
  async appendSeoApproval(data) {
    const { appendSeoApproval } = await import("../../storage/seoContent");
    return appendSeoApproval({
      page_id: data.page_id,
      actor_type: data.actor_type,
      actor_id: data.actor_id ?? null,
      action: data.action,
      notes: data.notes ?? null,
      metadata: (data.metadata as Record<string, unknown> | null) ?? null,
    });
  },
  async seoSlugExists(slug) {
    const { seoSlugExists } = await import("../../storage/seoContent");
    return seoSlugExists(slug);
  },
};

/* ─── Pure helpers (exported for the unit test) ───────────────────────────── */

const PRODUCTS = {
  quotequick: { slug: "quickquotepro", name: "QuoteQuick", url: "/products/quickquotepro" },
  tradeline: { slug: "tradeline", name: "24/7 TradeLine", url: "/products/tradeline" },
} as const;

/** Pick the CTA product from intent: bottom/transactional → QuoteQuick
 *  (instant quote); top/informational hire/how-to → TradeLine. */
export function ctaProductFor(intent: SeoSearchIntent): (typeof PRODUCTS)[keyof typeof PRODUCTS] {
  return intent === "top" ? PRODUCTS.tradeline : PRODUCTS.quotequick;
}

/** URL-safe slug from a keyword. */
export function slugify(keyword: string): string {
  return keyword
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

/**
 * unique_data_score = a count of page-specific REAL data points the page
 * cites. Floors page existence to genuine information gain (anti-thin). We
 * count the distinct percentile anchors (min/p25/median/p75/max), the
 * sample size as provenance, each common option, and each region cut.
 */
export function computeUniqueDataScore(data: SufficientDataResult): number {
  let score = 0;
  // Distinct percentile anchors actually present (dedupe equal values so a
  // flat distribution doesn't inflate the score).
  const anchors = new Set([data.min, data.p25, data.median, data.p75, data.max]);
  score += anchors.size;
  score += 1; // sample-size provenance
  score += data.commonOptions.length;
  score += data.regionalVariation.length;
  return score;
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

/** The data-citation block, in markdown, woven into the article body and also
 *  surfaced standalone so the test can assert the real numbers appear. */
export function buildDataCitation(data: SufficientDataResult): string {
  const date = data.computedAt.slice(0, 10);
  const lines = [
    `Based on **${data.sampleSize} real WeFixTrades quotes** (updated ${date}), the typical price is around **${money(data.median)}**, with most jobs falling between **${money(data.p25)}** and **${money(data.p75)}**. The full observed range runs from ${money(data.min)} to ${money(data.max)}.`,
  ];
  if (data.commonOptions.length > 0) {
    const opts = data.commonOptions
      .slice(0, 4)
      .map((o) => `${o.label} (${Math.round(o.prevalence * 100)}% of quotes)`)
      .join(", ");
    lines.push(`Common add-ons that move the price: ${opts}.`);
  }
  if (data.regionalVariation.length > 0) {
    const regs = data.regionalVariation
      .map((r) => `${r.region}: ${money(r.median)} median`)
      .join("; ");
    lines.push(`Regional medians: ${regs}.`);
  }
  return lines.join("\n\n");
}

/* ─── System + user prompt (E-E-A-T, cite-the-data, no invented numbers) ──── */

function buildSystemPrompt(authorEntity: string): string {
  return [
    `You are a senior editor writing a data-backed pricing/buying guide for WeFixTrades, published on wefixtrades.com under the real author entity "${authorEntity}".`,
    "Write genuinely useful, accurate, E-E-A-T-rich content for trade-service buyers.",
    "HARD RULES:",
    "- Use ONLY the real price numbers given in the data block. NEVER invent, round, or estimate prices not provided.",
    "- Cite the data provenance naturally (e.g. 'based on N real WeFixTrades quotes').",
    "- Match search intent with a clear H-structure: a single H1, intent-matched H2s, and an FAQ section.",
    "- Be specific and helpful; no filler, no fluff, no hype.",
    "Return ONLY the article body as Markdown (start with the H1). No preamble, no code fences.",
  ].join("\n");
}

function buildUserPrompt(req: SeoArticleRequest, data: SufficientDataResult): string {
  const cta = ctaProductFor(req.intent);
  const where = req.region ? ` in ${req.region}` : "";
  const job = req.jobType ? ` (${req.jobType})` : "";
  return [
    `Primary keyword: "${req.keyword}"`,
    `Trade: ${req.tradeType}${job}${where}. Search intent: ${req.intent}.`,
    "",
    "REAL DATA BLOCK (use these numbers verbatim; do not alter them):",
    buildDataCitation(data),
    "",
    "STRUCTURE:",
    "- H1 = the primary keyword.",
    "- An intro that answers the query in the first 2 sentences with the median price.",
    "- A pricing breakdown H2 that cites the real range and what drives it.",
    "- An H2 on what affects the price (use the common add-ons above).",
    `- A short H2 that points the reader to the relevant free tools (/free-tools) and the product CTA.`,
    "- An FAQ section (H2 'Frequently Asked Questions') with 3-4 Q&As.",
    "",
    "INTERNAL LINKS + CTA (include these markdown links in the body):",
    `- Product CTA: [${cta.name}](${cta.url})`,
    `- Free tools: [free trade tools](/free-tools)`,
    `- Blog hub: [more guides](/blog)`,
  ].join("\n");
}

/* ─── Excerpt / meta helpers ───────────────────────────────────────────────── */

function buildMetaDescription(req: SeoArticleRequest, data: SufficientDataResult): string {
  const where = req.region ? ` in ${req.region}` : "";
  const base = `How much does ${req.keyword}${where} cost? Typically around ${money(data.median)}, based on ${data.sampleSize} real WeFixTrades quotes. See the full price range and what drives it.`;
  return base.slice(0, 158);
}

function buildExcerpt(req: SeoArticleRequest, data: SufficientDataResult): string {
  return `Real pricing for ${req.keyword}: median ${money(data.median)} from ${data.sampleSize} verified quotes, with the full range and cost drivers.`;
}

function buildTitle(req: SeoArticleRequest, data: SufficientDataResult): string {
  // Keep within ~60 chars where possible; always include the keyword.
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const where = req.region ? ` in ${req.region}` : "";
  let t = `${cap(req.keyword)}${where} — Real Prices (2026)`;
  if (t.length > 65) t = `${cap(req.keyword)}${where}`;
  return t;
}

function buildInternalLinks(req: SeoArticleRequest): { product: string; freeTools: string; blog: string } {
  return {
    product: ctaProductFor(req.intent).url,
    freeTools: "/free-tools",
    blog: "/blog",
  };
}

/* ─── Main entry point ─────────────────────────────────────────────────────── */

/**
 * Generate one SEO article and file it as an in_review draft. Returns
 * { skipped:true } (with a reason) when the engine is off, the data floor is
 * not met, the slug already exists, or generation fails. NEVER publishes.
 */
export async function generateSeoArticle(
  req: SeoArticleRequest,
  deps: SeoArticleDeps = {},
): Promise<SeoArticleResult> {
  const checkGate = deps.checkGate ?? (async () => {
    const { checkSeoEngineGate } = await import("./seoEngineGate");
    return checkSeoEngineGate();
  });
  const getPriceData = deps.getPriceData ?? defaultGetPriceData;
  const generateText = deps.generateText ?? defaultGenerateText;
  const store = deps.store ?? defaultStore;
  const authorEntity = req.authorEntity ?? "WeFixTrades Editorial";

  // ── 1. Inert-by-default gate. No generation when the engine is off. ──
  const gate = await checkGate();
  if (!gate.allowed) {
    log.info("generation skipped — engine disabled", { reason: gate.reason });
    return { ok: false, skipped: true, reason: "engine_disabled", detail: gate.reason };
  }

  // ── 2. Slug dedup — don't regenerate an already-existing page. ──
  const slug = slugify(req.keyword);
  if (await store.seoSlugExists(slug)) {
    return { ok: false, skipped: true, reason: "duplicate_slug", detail: slug };
  }

  // ── 3. The ANTI-THIN data gate. Generate ONLY when real data backs it. ──
  const priceData = await getPriceData({
    tradeType: req.tradeType,
    jobType: req.jobType,
    region: req.region,
  });
  if (!priceData.sufficient) {
    log.info("generation skipped — below data floor (anti-thin)", {
      keyword: req.keyword,
      sampleSize: priceData.sampleSize,
      minSample: priceData.minSample,
    });
    return {
      ok: false,
      skipped: true,
      reason: "insufficient_data",
      sampleSize: priceData.sampleSize,
    };
  }

  const uniqueDataScore = computeUniqueDataScore(priceData);

  // ── 4. Generate the body via the project AI util (normal quality gen). ──
  let body: string;
  let costMicroUsd = 0;
  try {
    const out = await generateText({
      system: buildSystemPrompt(authorEntity),
      user: buildUserPrompt(req, priceData),
      maxTokens: 2200,
      tier: "standard",
    });
    body = (out.text ?? "").trim();
    costMicroUsd = out.costMicroUsd ?? 0;
  } catch (err) {
    log.error("AI generation failed", { keyword: req.keyword, err: (err as Error).message });
    return { ok: false, skipped: true, reason: "generation_failed", detail: (err as Error).message };
  }

  if (!body || body.length < 200) {
    return { ok: false, skipped: true, reason: "generation_failed", detail: "empty or too-short body" };
  }

  // Safety net: if the model dropped the citation, prepend the real data block
  // so the published page ALWAYS carries the provenance (never an
  // un-attributed price). The numbers are ours, not the model's.
  const citation = buildDataCitation(priceData);
  if (!body.includes(String(priceData.median))) {
    body = `${body}\n\n## The data behind these numbers\n\n${citation}`;
  }

  const internalLinks = buildInternalLinks(req);
  const cta = ctaProductFor(req.intent);

  // ── 5. Persist as an in_review DRAFT (NEVER published). ──
  const draftInput: InsertSeoContentPage = {
    slug,
    title: buildTitle(req, priceData),
    meta_description: buildMetaDescription(req, priceData),
    excerpt: buildExcerpt(req, priceData),
    content: body,
    status: "in_review", // the human-review gate — NEVER 'published' here.
    jsonld_type: "Article",
    author_entity: authorEntity,
    canonical: null, // self-canonical resolved at publish.
    original_data: {
      // Cited aggregates + provenance frozen onto the draft.
      sampleSize: priceData.sampleSize,
      currency: priceData.currency,
      min: priceData.min,
      p25: priceData.p25,
      median: priceData.median,
      p75: priceData.p75,
      max: priceData.max,
      commonOptions: priceData.commonOptions,
      regionalVariation: priceData.regionalVariation,
      computedAt: priceData.computedAt,
      tradeType: req.tradeType,
      jobType: req.jobType ?? null,
      region: req.region ?? null,
      intent: req.intent,
      ctaProduct: cta.slug,
      internalLinks,
      generationCostMicroUsd: costMicroUsd,
    },
    unique_data_score: uniqueDataScore,
    surface: "wfx_seo",
    source_draft_id: null,
  };

  const draft = await store.createSeoContentDraft(draftInput);

  // Append the 'submitted' audit row — the generator hands the page to the
  // human-review queue. (actor = system.)
  await store.appendSeoApproval({
    page_id: draft.id,
    actor_type: "system",
    actor_id: null,
    action: "submitted",
    notes: `auto-generated for "${req.keyword}" (sampleSize=${priceData.sampleSize}, uniqueDataScore=${uniqueDataScore})`,
    metadata: { keyword: req.keyword, provider: "ai", costMicroUsd },
  });

  log.info("draft created for review", {
    id: draft.id,
    slug,
    status: draft.status,
    uniqueDataScore,
    sampleSize: priceData.sampleSize,
  });

  return { ok: true, skipped: false, draft, uniqueDataScore, costMicroUsd };
}
