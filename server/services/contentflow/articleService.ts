/**
 * ContentFlow — article service.
 *
 * Mirrors draftService.ts but for the RankFlow surface:
 *  - createDraftFromRankflowTask: idempotently inserts a content_drafts
 *    row for a page_create task and back-fills rankflow_tasks.content_draft_id.
 *  - generateArticleBody: runs the AI generation step through the provider
 *    rotator (Claude Haiku 4.5 → OpenAI fallback) and updates the draft body
 *    / title / excerpt. Never throws — returns a result object so callers in
 *    fire-and-forget paths cannot surface unhandled rejections.
 *
 * The two functions are split deliberately: the route hook calls
 * createDraftFromRankflowTask synchronously (cheap DB insert, must succeed
 * before plan generation completes) and fires generateArticleBody as a
 * non-blocking background task. An admin-triggered regenerate endpoint
 * calls generateArticleBody synchronously when an admin wants a re-run.
 */

import { db } from "../../db";
import { rankflowTasks } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../../storage";
import type { ContentDraft, RankflowTask, RankflowProfile } from "@shared/schema";
import { generateContentflowText } from "./aiText";
import { readBrandProfile, buildBrandLayerText } from "./brandProfile";
import { buildPerformanceFeedback } from "./performanceTracker";
import { createLogger } from "../../lib/logger";
import { writeAudit } from "../../lib/auditLog";
import {
  evaluateArticleQuality,
  loadPriorArticles,
  AI_REVIEW_CLEAN_THRESHOLD,
  AI_REVIEW_REGEN_THRESHOLD,
  type ArticleQualityResult,
} from "./qualityGate/articleQualityGate";
import {
  humanizeArticle,
  type HumanizeProvider,
} from "./qualityGate/humanizeRewrite";

const log = createLogger("ArticleService");

/** Max generation attempts before we accept the last attempt with a warning. */
const MAX_GENERATION_ATTEMPTS = 3;

/** Classify a Layer-3 score into the canonical band label used by
 *  admin dashboards. Mirrors the thresholds in articleQualityGate.ts. */
function scoreBand(score: number): "clean" | "with_warning" | "regenerate" {
  if (score >= AI_REVIEW_CLEAN_THRESHOLD) return "clean";
  if (score >= AI_REVIEW_REGEN_THRESHOLD) return "with_warning";
  return "regenerate";
}

/* ─── Draft creation ─────────────────────────────────────────────────── */

export interface CreateArticleDraftInput {
  task: RankflowTask;
  profile: RankflowProfile;
}

/**
 * Insert a content_drafts row for a RankFlow page_create task and back-fill
 * rankflow_tasks.content_draft_id. Idempotent: if a draft already exists
 * for this task (unique index on linked_task_id), the existing draft is
 * returned and no duplicate is written.
 */
export async function createDraftFromRankflowTask(
  input: CreateArticleDraftInput,
): Promise<ContentDraft> {
  const { task, profile } = input;

  if (task.type !== "page_create") {
    throw new Error(`createDraftFromRankflowTask called with non-page_create task type: ${task.type}`);
  }

  const existing = await storage.getContentDraftByTaskId(task.id);
  if (existing) return existing;

  const meta = (task.metadata || {}) as Record<string, any>;
  const primaryKw: string | null = meta.primary_keyword ?? null;
  const targetKws: string[] = Array.isArray(meta.target_keywords) ? meta.target_keywords : [];
  const pageType: string | null = meta.page_type ?? null;
  const cluster: string | null = meta.keyword_cluster ?? null;

  const draft = await storage.createContentDraft({
    client_id: task.client_id,
    client_service_id: null,
    kind: "article",
    surface: "rankflow",
    title: task.title,
    body: null,
    excerpt: null,
    target_platform: "website",
    target_url: null,
    metadata: {
      primary_keyword: primaryKw,
      target_keywords: targetKws,
      page_type: pageType,
      keyword_cluster: cluster,
      niche: profile.niche,
      location: profile.location,
      generation_status: "pending",
    },
    quality_score: null,
    quality_notes: null,
    status: "draft",
    auto_approved: false,
    requires_admin_review: true,
    requires_client_review: false,
    admin_approved_at: null,
    admin_approved_by: null,
    client_approved_at: null,
    rejected_at: null,
    rejection_reason: null,
    linked_social_post_id: null,
    linked_task_id: task.id,
    generation_cost_micro_usd: null,
    created_by: "system",
  });

  // Back-fill the rankflow task's content_draft_id pointer.
  await db.update(rankflowTasks)
    .set({ content_draft_id: draft.id } as any)
    .where(eq(rankflowTasks.id, task.id));

  return draft;
}

/* ─── Body generation ────────────────────────────────────────────────── */

export interface GenerateArticleResult {
  ok: boolean;
  draft?: ContentDraft;
  error?: string;
}

interface ArticleJson {
  title: string;
  excerpt: string;
  body_md: string;
}

const SYSTEM_PROMPT = `You are an SEO writer for a local trade-services business (plumbers, electricians, roofers, HVAC, etc.).

Write ONE article that helps the business rank for a target keyword in a specific service area. Write plainly and factually.

Hard rules — do not violate:
- Do NOT fabricate testimonials, customer names, project stories, ratings, awards, certifications, license numbers, years-in-business, or guarantees.
- Do NOT keyword-stuff. Use the target keyword naturally; do not repeat it more than ~5 times.
- Do NOT invent specific prices, response times, warranties, insurance amounts, or service areas not provided.
- Do NOT include calls-to-action that promise specific outcomes ("guaranteed same-day", "100% satisfaction").
- No fake urgency, no all-caps shouting, no exclamation marks beyond a normal level.
- It is fine to describe what a service involves, what to look for in a provider, common problems and signs, and how the local geography or climate affects the work — these are factual.
- If you are unsure of a fact, omit it rather than invent it.

Output format: a single JSON object with exactly these keys:
  "title": string, 50-65 characters, includes the primary keyword once
  "excerpt": string, 140-160 characters, plain prose summary
  "body_md": string, 500-700 words of markdown, with two or three ## section headings, no images, no external links, no testimonials

Output ONLY the JSON object. No preamble. No markdown code fence.`;

function buildUserPrompt(input: {
  briefTitle?: string | null;
  primaryKeyword: string | null;
  targetKeywords: string[];
  pageType: string | null;
  niche: string | null;
  location: string | null;
  brandLayer?: string;
  performanceFeedback?: string;
}): string {
  const lines: string[] = [];

  // Topic line — keep this at the TOP so the model anchors on the
  // customer's exact angle instead of drifting to a generic industry
  // piece. Falls back to primaryKeyword or the first targetKeyword
  // when no explicit title was supplied (preserves existing brief shapes).
  const topic =
    (input.briefTitle && input.briefTitle.trim()) ||
    (input.primaryKeyword && input.primaryKeyword.trim()) ||
    (input.targetKeywords[0] && input.targetKeywords[0].trim()) ||
    "";
  if (topic) {
    lines.push(`TOPIC: ${topic}`);
    lines.push("");
    lines.push("The article MUST be specifically about this topic. Do not write a generic piece about the industry. Stay focused on the exact question/angle in the topic line above.");
    lines.push("");
  }

  lines.push(`Business niche: ${input.niche || "local trade service"}`);
  lines.push(`Service area: ${input.location || "(not specified)"}`);
  lines.push(`Page type: ${input.pageType || "informational"}`);
  if (input.primaryKeyword) {
    lines.push(`Primary keyword: ${input.primaryKeyword}`);
  }
  if (input.targetKeywords.length > 0) {
    lines.push(`Supporting keywords: ${input.targetKeywords.slice(0, 6).join(", ")}`);
  }
  if (input.brandLayer) {
    lines.push("");
    lines.push(`Brand profile (use to shape tone/style; do NOT invent claims not listed): ${input.brandLayer}`);
  }
  if (input.performanceFeedback) {
    lines.push("");
    lines.push(`Previous articles with similar topics performed well. Maintain this style: ${input.performanceFeedback}`);
  }
  lines.push("");
  lines.push("Write the article. Output JSON only.");
  return lines.join("\n");
}

function parseArticleJson(raw: string): ArticleJson | null {
  // Strip code fences if model added them despite the instruction.
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  // Find first '{' and last '}' to be tolerant of trailing prose.
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  const slice = s.slice(first, last + 1);
  try {
    const parsed = JSON.parse(slice);
    if (typeof parsed?.title !== "string") return null;
    if (typeof parsed?.excerpt !== "string") return null;
    if (typeof parsed?.body_md !== "string") return null;
    return { title: parsed.title, excerpt: parsed.excerpt, body_md: parsed.body_md };
  } catch {
    return null;
  }
}

/**
 * One attempt at AI generation — returns the raw model text and parsed
 * JSON, or an error string. Cost is recorded on the draft regardless of
 * whether the gate later accepts the output.
 */
async function generateOneArticleAttempt(
  draftId: number,
  userPrompt: string,
): Promise<
  | { ok: true; parsed: ArticleJson; provider: string }
  | { ok: false; error: string }
> {
  let raw: string;
  let provider: string;
  try {
    const gen = await generateContentflowText({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      maxTokens: 2000,
    });
    raw = gen.text;
    provider = gen.provider;
    storage.addDraftGenerationCost(draftId, gen.costMicroUsd).catch(() => {});
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }

  const parsed = parseArticleJson(raw);
  if (!parsed) {
    return { ok: false, error: `unparseable model output (len=${raw.length})` };
  }
  return { ok: true, parsed, provider };
}

/**
 * Run the AI generation step for an existing article draft. Always returns a
 * result object — never throws. On failure the draft is left with status='failed'
 * and metadata.generation_status='failed' so admins can re-trigger.
 *
 * Idempotency note: re-running on a draft with body already populated will
 * REGENERATE — that is intentional; admins use this to retry low-quality output.
 *
 * Quality gate (P0-3, mirrors SocialSync): after each attempt the parsed
 * article body is run through `evaluateArticleQuality()` — 3 layers of
 * banned-phrase rule checks, Jaccard similarity dedup against the last
 * 20 prior articles for the same client, and an AI self-review score.
 * On verdict="regenerate" we re-run generation up to MAX_GENERATION_ATTEMPTS
 * times total. After the cap we accept the LAST attempt with a warning
 * logged (so a stubborn topic never blocks customer content forever).
 * Every attempt — pass or fail — writes an `audit_log` row with action
 * `contentflow.article.quality_check`.
 */
export async function generateArticleBody(draftId: number): Promise<GenerateArticleResult> {
  const draft = await storage.getContentDraftById(draftId);
  if (!draft) return { ok: false, error: `draft ${draftId} not found` };
  if (draft.kind !== "article" || draft.surface !== "rankflow") {
    return { ok: false, error: `draft ${draftId} is not a RankFlow article` };
  }

  const meta = (draft.metadata || {}) as Record<string, any>;

  // Sprint 17: inject brand profile + performance feedback into article generation
  const client = await storage.getClientById(draft.client_id);
  const tradeType = (client?.trade_type as string | null) ?? null;
  const brand = readBrandProfile(client);
  const brandLayer = buildBrandLayerText(brand, tradeType) || undefined;
  const performanceFeedback = await buildPerformanceFeedback(draft.client_id, "wordpress") || undefined;

  // Draft.title is back-filled from the originating RankFlow task title
  // (see createDraftFromRankflowTask) — treat it as the brief's canonical
  // topic line. meta.brief_title can override when present.
  const briefTitle: string | null =
    (typeof meta.brief_title === "string" && meta.brief_title.trim()) ||
    draft.title ||
    null;

  const userPrompt = buildUserPrompt({
    briefTitle,
    primaryKeyword: meta.primary_keyword ?? null,
    targetKeywords: Array.isArray(meta.target_keywords) ? meta.target_keywords : [],
    pageType: meta.page_type ?? null,
    niche: meta.niche ?? null,
    location: meta.location ?? null,
    brandLayer,
    performanceFeedback,
  });

  // Pre-load prior articles ONCE — they're per-client and don't change
  // between attempts in this loop. Layer 2 uses them; if storage fails
  // here, layer 2 silently passes (handled inside loadPriorArticles).
  const priorArticles = await loadPriorArticles(storage as any, draft.client_id, 20);
  const gateContext = {
    niche: (meta.niche as string | null) ?? null,
    location: (meta.location as string | null) ?? null,
    primaryKeyword: (meta.primary_keyword as string | null) ?? null,
    brandLayer,
  };

  let lastAttempt: ArticleJson | null = null;
  let lastGateResult: ArticleQualityResult | null = null;
  let lastError: string | null = null;
  let attemptsUsed = 0;

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    attemptsUsed = attempt;
    const result = await generateOneArticleAttempt(draftId, userPrompt);

    if (!result.ok) {
      lastError = result.error;
      log.warn(
        `[contentflow] article generation attempt ${attempt}/${MAX_GENERATION_ATTEMPTS} failed for draft ${draftId}: ${result.error}`,
      );
      // Generation-call failure (rotator exhausted, JSON unparseable) —
      // retry if we have budget; otherwise fail out at the end.
      continue;
    }

    lastError = null;

    // P1-1: Cross-provider humanization pass. Rewrite the draft body
    // through the OPPOSITE provider (Claude draft → gpt-4o-mini rewrite,
    // or vice versa) to break self-similarity before the quality gate
    // sees it. On any failure (provider error, truncation, dropped
    // heading) the helper returns the ORIGINAL body unchanged so the
    // gate still runs — never double-fail the article.
    const sourceProvider: HumanizeProvider =
      result.provider === "openai" ? "openai" : "anthropic";
    const humanizeRes = await humanizeArticle(result.parsed.body_md, {
      clientId: draft.client_id,
      brandVoice: brandLayer,
      industry: (meta.niche as string | null) ?? tradeType ?? undefined,
      targetWordCount: 600,
      sourceProvider,
      briefTitle: briefTitle ?? undefined,
    });
    const humanizedBody = humanizeRes.humanized;

    writeAudit({
      actorType: "system",
      action: "contentflow.article.humanize_rewrite",
      entityType: "content_draft",
      entityId: String(draftId),
      metadata: {
        attempt,
        source_provider: sourceProvider,
        provider_used: humanizeRes.provider_used,
        original_length: humanizeRes.original_length,
        final_length: humanizeRes.final_length,
        fell_back_to_original: humanizeRes.fell_back_to_original,
        fallback_reason: humanizeRes.fallback_reason ?? null,
        client_id: draft.client_id,
      },
    });

    // Persist the (possibly humanized) body onto the attempt object so
    // a later "accept" verdict stores the right text. If humanization
    // fell back, this is identical to the original draft.
    lastAttempt = { ...result.parsed, body_md: humanizedBody };

    // Run the 3-layer quality gate on the humanized body.
    const gate = await evaluateArticleQuality({
      body: humanizedBody,
      priorArticles,
      context: gateContext,
    });
    lastGateResult = gate;

    // Audit log this attempt's gate result. Fire-and-forget — never
    // block the generation path on audit-write failure.
    writeAudit({
      actorType: "system",
      action: "contentflow.article.quality_check",
      entityType: "content_draft",
      entityId: String(draftId),
      metadata: {
        attempt,
        max_attempts: MAX_GENERATION_ATTEMPTS,
        verdict: gate.verdict,
        final_score: gate.finalScore,
        score_band: scoreBand(gate.finalScore),
        clean_threshold: AI_REVIEW_CLEAN_THRESHOLD,
        regen_threshold: AI_REVIEW_REGEN_THRESHOLD,
        passed_layer_1: gate.layer1.passed,
        passed_layer_2: gate.layer2.passed,
        passed_layer_3: gate.layer3.passed,
        attempts_used: attempt,
        banned_phrases_hit: gate.bannedPhrasesHit,
        reasons: gate.reasons.slice(0, 10),
        client_id: draft.client_id,
        primary_keyword: gateContext.primaryKeyword,
      },
    });

    if (gate.verdict === "accept") {
      log.info(
        `[contentflow] quality gate accepted draft ${draftId} on attempt ${attempt} (score=${gate.finalScore})`,
      );
      break;
    }

    log.warn(
      `[contentflow] quality gate rejected draft ${draftId} attempt ${attempt}/${MAX_GENERATION_ATTEMPTS}: ${gate.reasons.slice(0, 3).join("; ")}`,
    );
    // Loop continues for next attempt (if budget remains).
  }

  // If every attempt failed at the generation step (no parseable output
  // produced), fail the draft so an admin can retry.
  if (!lastAttempt) {
    const msg = lastError || "all generation attempts failed";
    log.error(`[contentflow] article generation exhausted for draft ${draftId}: ${msg}`);
    const fresh = await storage.getContentDraftById(draftId);
    const freshMeta = (fresh?.metadata || meta) as Record<string, any>;
    await storage.updateContentDraft(draftId, {
      status: "failed",
      metadata: {
        ...freshMeta,
        generation_status: "failed",
        generation_error: msg.slice(0, 500),
        quality_gate_attempts: attemptsUsed,
      },
    });
    return { ok: false, error: msg };
  }

  // If we exited the loop with a non-"accept" verdict, we hit the
  // attempt cap. Per the launch policy we still publish the LAST
  // attempt — never block customer content forever on a stubborn
  // topic — but stamp `quality_gate_warning` on the metadata so the
  // admin UI can surface it.
  const acceptedAfterCap =
    lastGateResult !== null && lastGateResult.verdict !== "accept";
  if (acceptedAfterCap) {
    log.warn(
      `[contentflow] draft ${draftId} accepted with warning after ${attemptsUsed} attempts (final_score=${lastGateResult?.finalScore})`,
    );
  }

  // Re-read metadata immediately before write to preserve any concurrent
  // updates (e.g. the wordpress publisher writing metadata.wordpress while
  // a background article generation was in flight). Without this, the
  // stale `meta` snapshot from above would clobber concurrent writes.
  const fresh = await storage.getContentDraftById(draftId);
  const freshMeta = (fresh?.metadata || meta) as Record<string, any>;
  /* Sprint 8: a stale background generateArticleBody (fired-and-forgotten
   * by generate-plan / rankflowWorker) finishing AFTER admin approval
   * was clobbering title/excerpt/body. Status was protected; content
   * wasn't. Now we also preserve content when the admin has already
   * approved / published / rejected — late-arriving generation can't
   * silently change what the admin already signed off on. */
  const adminTouched =
    !!fresh && (fresh.status === "approved" || fresh.status === "published" || fresh.status === "rejected");

  const qualityMeta = lastGateResult
    ? {
        quality_gate: {
          verdict: lastGateResult.verdict,
          final_score: lastGateResult.finalScore,
          score_band: scoreBand(lastGateResult.finalScore),
          clean_threshold: AI_REVIEW_CLEAN_THRESHOLD,
          regen_threshold: AI_REVIEW_REGEN_THRESHOLD,
          attempts_used: attemptsUsed,
          passed_layer_1: lastGateResult.layer1.passed,
          passed_layer_2: lastGateResult.layer2.passed,
          passed_layer_3: lastGateResult.layer3.passed,
          banned_phrases_hit: lastGateResult.bannedPhrasesHit,
          accepted_with_warning: acceptedAfterCap,
          reasons: lastGateResult.reasons.slice(0, 10),
        },
      }
    : {};

  const updated = await storage.updateContentDraft(draftId, {
    title: adminTouched ? fresh!.title : lastAttempt.title,
    excerpt: adminTouched ? fresh!.excerpt : lastAttempt.excerpt,
    body: adminTouched ? fresh!.body : lastAttempt.body_md,
    status: adminTouched ? fresh!.status : "draft",
    quality_score: lastGateResult ? lastGateResult.finalScore : null,
    quality_notes: lastGateResult
      ? lastGateResult.reasons.slice(0, 5).join("; ").slice(0, 500) || null
      : null,
    metadata: { ...freshMeta, generation_status: "completed", ...qualityMeta },
  });

  return { ok: true, draft: updated };
}
