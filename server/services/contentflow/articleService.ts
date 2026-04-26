/**
 * ContentFlow — article service.
 *
 * Mirrors draftService.ts but for the RankFlow surface:
 *  - createDraftFromRankflowTask: idempotently inserts a content_drafts
 *    row for a page_create task and back-fills rankflow_tasks.content_draft_id.
 *  - generateArticleBody: runs the AI generation step against the existing
 *    aiService (Anthropic Claude Haiku 4.5) and updates the draft body /
 *    title / excerpt. Never throws — returns a result object so callers in
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
import { chat as aiChat } from "../aiService";

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
  primaryKeyword: string | null;
  targetKeywords: string[];
  pageType: string | null;
  niche: string | null;
  location: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`Business niche: ${input.niche || "local trade service"}`);
  lines.push(`Service area: ${input.location || "(not specified)"}`);
  lines.push(`Page type: ${input.pageType || "informational"}`);
  if (input.primaryKeyword) {
    lines.push(`Primary keyword: ${input.primaryKeyword}`);
  }
  if (input.targetKeywords.length > 0) {
    lines.push(`Supporting keywords: ${input.targetKeywords.slice(0, 6).join(", ")}`);
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
 * Run the AI generation step for an existing article draft. Always returns a
 * result object — never throws. On failure the draft is left with status='failed'
 * and metadata.generation_status='failed' so admins can re-trigger.
 *
 * Idempotency note: re-running on a draft with body already populated will
 * REGENERATE — that is intentional; admins use this to retry low-quality output.
 */
export async function generateArticleBody(draftId: number): Promise<GenerateArticleResult> {
  const draft = await storage.getContentDraftById(draftId);
  if (!draft) return { ok: false, error: `draft ${draftId} not found` };
  if (draft.kind !== "article" || draft.surface !== "rankflow") {
    return { ok: false, error: `draft ${draftId} is not a RankFlow article` };
  }

  const meta = (draft.metadata || {}) as Record<string, any>;
  const userPrompt = buildUserPrompt({
    primaryKeyword: meta.primary_keyword ?? null,
    targetKeywords: Array.isArray(meta.target_keywords) ? meta.target_keywords : [],
    pageType: meta.page_type ?? null,
    niche: meta.niche ?? null,
    location: meta.location ?? null,
  });

  let raw: string;
  try {
    raw = await aiChat({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 2000,
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error(`[contentflow] article generation AI call failed for draft ${draftId}: ${msg}`);
    await storage.updateContentDraft(draftId, {
      status: "failed",
      metadata: { ...meta, generation_status: "failed", generation_error: msg.slice(0, 500) },
    });
    return { ok: false, error: msg };
  }

  const parsed = parseArticleJson(raw);
  if (!parsed) {
    console.error(`[contentflow] article generation produced unparseable output for draft ${draftId}; raw len=${raw.length}`);
    await storage.updateContentDraft(draftId, {
      status: "failed",
      metadata: { ...meta, generation_status: "failed", generation_error: "unparseable model output" },
    });
    return { ok: false, error: "unparseable model output" };
  }

  const updated = await storage.updateContentDraft(draftId, {
    title: parsed.title,
    excerpt: parsed.excerpt,
    body: parsed.body_md,
    status: "draft",
    metadata: { ...meta, generation_status: "completed" },
  });

  return { ok: true, draft: updated };
}
