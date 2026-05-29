/**
 * ContentFlow — multi-channel article repurposer (Sprint 13).
 *
 * Takes one approved RankFlow article draft and generates a fan-out
 * of derived child drafts:
 *   - 3 × Facebook captions (kind='social_post', target_platform='facebook')
 *   - 3 × Instagram captions (kind='social_post', target_platform='instagram')
 *   - 1 × GBP local-post summary (kind='google_post', target_platform='google_business')
 *   - 1 × Email/newsletter summary (kind='email_post', target_platform='email')
 *
 * All children:
 *   - Live in content_drafts (no schema migration)
 *   - Are linked to the parent via metadata.parent_draft_id
 *   - Get their own media_plan.prompt so Sprint 11/12 image generation
 *     fires when the orchestrator hook isn't available
 *   - Auto-approve + enqueue through the existing publishQueue
 *
 * Idempotency: re-calling repurposeArticle on the same parent is a
 * no-op (returns the existing children). Detected via a single SQL
 * scan for child drafts whose metadata.parent_draft_id === parentId.
 *
 * AI stub: when REPURPOSER_AI_STUB === "1" (NODE_ENV-gated), the
 * Anthropic call is replaced with deterministic stub content so
 * tests don't burn API credits or face flaky model output. Production
 * always calls the real Claude model.
 *
 * Hard rules (per Sprint 13 brief):
 *   - Never overwrite the original article
 *   - Each child is independent (no cross-references that would
 *     cascade-fail on a sibling draft)
 *   - Failure for ONE child must not block siblings (per-child
 *     try/catch around persistence + enqueue)
 */

import { sql } from "drizzle-orm";
import { storage } from "../../storage";
import { db } from "../../db";
import { contentDrafts } from "@shared/schema";
import { generateContentflowText } from "./aiText";
import { noisyCatch } from "../../lib/silentFailureGuard";
import { autoApproveDraft } from "./approvalService";
import { enqueueSocialSyncDraft, enqueueEmailDraft } from "./wordpressQueue";
import { generateForDraft as generateImageForDraft } from "./imageGenerationService";
import { buildCalendarMetadata } from "./calendarMetadata";
import { readBrandProfile, buildBrandLayerText } from "./brandProfile";
import { buildPerformanceFeedback } from "./performanceTracker";
import { detectInfographicContent, generateInfographic } from "./infographicService";
import { generateVideoContent, isVideoScriptsEnabled, generateFullVideo, isVideoGenerationEnabledForClient } from "./videoContentService";
import type { ContentDraft } from "@shared/schema";
import { createLogger } from "../../lib/logger";

const log = createLogger("Repurposer");

/* ─── Public API ─────────────────────────────────────────────────────── */

export interface RepurposeChild {
  draftId: number;
  kind: "social_post" | "google_post" | "email_post";
  target_platform: "facebook" | "instagram" | "google_business" | "email" | "linkedin" | "pinterest";
  variantIndex: number;
}

export interface RepurposeResult {
  ok: boolean;
  parentDraftId: number;
  children: RepurposeChild[];
  reason?: "skipped_kind" | "skipped_status" | "ai_failed" | "already_repurposed" | "parent_not_found";
  message?: string;
}

/* ─── AI prompt + parsing ───────────────────────────────────────────── */

interface Derivations {
  fb_captions: string[];   // 3
  ig_captions: string[];   // 3
  gbp_summary: string;     // 1
  email_subject: string;   // 1
  email_body: string;      // 1
  linkedin_post: string;   // 1 (professional tone)
  pinterest_title: string; // 1
  pinterest_description: string; // 1 (visual description + SEO hashtags)
  /* Per-derivation image prompts; reused by Sprint 11/12 image-gen. */
  fb_image_prompts: string[];   // 3
  ig_image_prompts: string[];   // 3
  gbp_image_prompt: string;     // 1
  pinterest_image_prompt: string; // 1
}

const SYSTEM_PROMPT = `You repurpose long-form trades-business articles into short, channel-appropriate posts for marketing automation. Output STRICT JSON ONLY — no markdown, no preamble, no trailing commentary. The schema is fixed; every field must be present.

Rules:
- Tone matches the source article (warm, professional, plain-spoken — never spammy).
- 3 Facebook captions: each 1-3 sentences, distinct angles (one tip-led, one story-led, one CTA-led).
- 3 Instagram captions: each 1-3 sentences with at most 5 relevant hashtags appended on a new line.
- 1 GBP local-post summary: 80-200 characters, plain prose, no hashtags.
- 1 Email subject line: under 70 characters, specific, not clickbait.
- 1 Email body: 100-250 words, plain prose paragraphs separated by blank lines, no markdown.
- 1 LinkedIn post: 2-4 sentences, professional tone suitable for B2B networking, mention expertise and value delivered. No hashtags.
- 1 Pinterest title: under 60 characters, descriptive for search.
- 1 Pinterest description: 1-3 sentences describing a visual scene relevant to the article, with 3-5 SEO hashtags.
- Image prompts describe a clean, professional photo subject for that channel — single sentence each.
- Never invent specific facts, prices, or guarantees not present in the source.
- Never copy the source article verbatim.`;

function buildUserPrompt(
  article: ContentDraft,
  tradeType: string | null,
  brandLayer?: string,
  performanceFeedback?: string,
): string {
  const meta = (article.metadata || {}) as Record<string, any>;
  return `Source article:
Title: ${article.title || "Untitled"}
Excerpt: ${article.excerpt || "(none)"}
${tradeType ? `Trade: ${tradeType}` : ""}
${meta.location ? `Location: ${meta.location}` : ""}
${meta.primary_keyword ? `Primary keyword: ${meta.primary_keyword}` : ""}
${brandLayer ? `\nBrand profile (use to shape tone/style; do NOT invent claims not in the article): ${brandLayer}` : ""}
${performanceFeedback ? `\nUse patterns similar to these recent successful posts (style only, do NOT copy wording): ${performanceFeedback}` : ""}

Body:
${(article.body || "").slice(0, 6000)}

Return JSON of shape:
{
  "fb_captions": ["...","...","..."],
  "ig_captions": ["...","...","..."],
  "gbp_summary": "...",
  "email_subject": "...",
  "email_body": "...",
  "linkedin_post": "...",
  "pinterest_title": "...",
  "pinterest_description": "...",
  "fb_image_prompts": ["...","...","..."],
  "ig_image_prompts": ["...","...","..."],
  "gbp_image_prompt": "...",
  "pinterest_image_prompt": "..."
}`;
}

function tryParseDerivations(raw: string): Derivations | null {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as any;
    if (!Array.isArray(parsed.fb_captions) || parsed.fb_captions.length < 3) return null;
    if (!Array.isArray(parsed.ig_captions) || parsed.ig_captions.length < 3) return null;
    if (typeof parsed.gbp_summary !== "string" || parsed.gbp_summary.length < 5) return null;
    if (typeof parsed.email_subject !== "string" || typeof parsed.email_body !== "string") return null;
    return {
      fb_captions: parsed.fb_captions.slice(0, 3).map(String),
      ig_captions: parsed.ig_captions.slice(0, 3).map(String),
      gbp_summary: String(parsed.gbp_summary),
      email_subject: String(parsed.email_subject).slice(0, 200),
      email_body: String(parsed.email_body),
      linkedin_post: typeof parsed.linkedin_post === "string" ? parsed.linkedin_post : "",
      pinterest_title: typeof parsed.pinterest_title === "string" ? String(parsed.pinterest_title).slice(0, 100) : "",
      pinterest_description: typeof parsed.pinterest_description === "string" ? parsed.pinterest_description : "",
      fb_image_prompts: (Array.isArray(parsed.fb_image_prompts) ? parsed.fb_image_prompts : [])
        .slice(0, 3).map(String).concat(["clean trade photo"]).slice(0, 3),
      ig_image_prompts: (Array.isArray(parsed.ig_image_prompts) ? parsed.ig_image_prompts : [])
        .slice(0, 3).map(String).concat(["clean trade photo"]).slice(0, 3),
      gbp_image_prompt: typeof parsed.gbp_image_prompt === "string" ? parsed.gbp_image_prompt : "clean trade photo",
      pinterest_image_prompt: typeof parsed.pinterest_image_prompt === "string" ? parsed.pinterest_image_prompt : "clean before-and-after trade photo",
    };
  } catch {
    return null;
  }
}

function shouldUseAiStub(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.REPURPOSER_AI_STUB === "1";
}

function stubDerivations(article: ContentDraft): Derivations {
  /* Deterministic stub — keyed off article.id so spec assertions can
   * verify per-draft variation without hitting Anthropic. */
  const tag = article.title?.slice(0, 40) || `article-${article.id}`;
  return {
    fb_captions: [
      `Tip: ${tag} — quick takeaway from our latest piece.`,
      `Story: How a recent ${tag} job reminded us why details matter.`,
      `Need help with ${tag}? We're here. DM or call us.`,
    ],
    ig_captions: [
      `Quick tip from the team — ${tag}.\n#trades #localbusiness`,
      `On the truck this week: ${tag}.\n#workinprogress #realwork`,
      `Behind the scenes — ${tag}.\n#bts #trades`,
    ],
    gbp_summary: `${tag} — read our latest write-up. Always happy to help locally.`,
    email_subject: `New from us: ${tag}`,
    email_body: `Hi there,\n\nWe just published a new piece on ${tag}. Inside: practical takeaways from our recent jobs and a quick note on what to watch for.\n\nIf any of this matches what you're dealing with, just reply or call — we'd be glad to help.\n\nThanks,\nThe team`,
    linkedin_post: `Our team recently tackled a project involving ${tag}. The attention to detail and professional approach we bring to every job is what sets us apart. Read our latest insights on best practices and what to expect when working with experienced tradespeople.`,
    pinterest_title: `${tag.slice(0, 50)} — Trade Tips`,
    pinterest_description: `Before and after: professional ${tag} work showcasing quality craftsmanship. See how attention to detail makes the difference.\n#trades #homemaintenance #professional`,
    fb_image_prompts: [
      `A trades professional reviewing notes at a clean job site (${tag} context)`,
      `Over-the-shoulder view of a service truck dashboard (${tag} context)`,
      `Hands holding a modern tool during a finished install (${tag} context)`,
    ],
    ig_image_prompts: [
      `Clean residential exterior detail relevant to ${tag}`,
      `Tools laid out neatly before a job — ${tag}`,
      `Subtle workspace detail showing care and craftsmanship (${tag})`,
    ],
    gbp_image_prompt: `Locally-recognizable trades scene supporting ${tag}`,
    pinterest_image_prompt: `Before and after comparison of ${tag} work — clean, professional result`,
  };
}

async function aiDerivations(
  article: ContentDraft,
  tradeType: string | null,
  brandLayer?: string,
  performanceFeedback?: string,
): Promise<Derivations | null> {
  const userPrompt = buildUserPrompt(article, tradeType, brandLayer, performanceFeedback);
  let raw: string;
  try {
    const gen = await generateContentflowText({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      maxTokens: 2000,
    });
    raw = gen.text;
    // Wave 113 — cost drift on repurposer AI call must be loud.
    noisyCatch(storage.addDraftGenerationCost(article.id, gen.costMicroUsd), {
      op: "contentflow.repurposer.addDraftGenerationCost",
      meta: { parentArticleId: article.id, costMicroUsd: gen.costMicroUsd },
    });
  } catch (err: any) {
    log.error(`[contentflow][repurposer] AI call failed for parent=${article.id}: ${err?.message || err}`);
    return null;
  }
  const parsed = tryParseDerivations(raw);
  if (!parsed) {
    log.error(`[contentflow][repurposer] unparseable model output for parent=${article.id} (len=${raw.length})`);
  }
  return parsed;
}

/* ─── Idempotency lookup ─────────────────────────────────────────────── */

async function findExistingChildren(parentDraftId: number): Promise<ContentDraft[]> {
  return db.select().from(contentDrafts)
    .where(sql`${contentDrafts.metadata}->>'parent_draft_id' = ${String(parentDraftId)}`);
}

/* ─── Child creation helpers ─────────────────────────────────────────── */

interface CreateChildInput {
  clientId: number;
  parentDraftId: number;
  variantIndex: number;
  body: string;
  title: string | null;
  imagePrompt: string | null;
  kind: "social_post" | "google_post" | "email_post";
  target_platform: "facebook" | "instagram" | "google_business" | "email" | "linkedin" | "pinterest";
  /* Email-only — recipient override for the email adapter. */
  emailSubject?: string;
  emailRecipient?: string | null;
}

/* SocialSync adapters (Sprint 10/12) require draft.linked_social_post_id
 * to resolve the platform connection + media_plan. Email/LinkedIn/Pinterest
 * skip this — they read metadata directly. */
async function createSocialSyncShell(
  clientId: number,
  platform: "facebook" | "instagram" | "google_business" | "linkedin" | "pinterest",
  postText: string,
  imagePrompt: string | null,
): Promise<number> {
  const mediaPlan = imagePrompt ? { type: "image", prompt: imagePrompt } : null;
  const result: any = await db.execute(sql`
    INSERT INTO socialsync_posts
      (client_id, platform, post_text, status, media_plan, hashtags, quality_score, created_by_system, created_at, updated_at)
    VALUES (${clientId}, ${platform}, ${postText}, 'ready', ${mediaPlan ? JSON.stringify(mediaPlan) : null}::jsonb, '[]'::jsonb, 90, true, NOW(), NOW())
    RETURNING id
  `);
  const rows = (result?.rows ?? result) as Array<{ id: number }>;
  return rows[0].id;
}

async function backfillSocialSyncShell(postId: number, draftId: number): Promise<void> {
  await db.execute(sql`UPDATE socialsync_posts SET content_draft_id = ${draftId}, updated_at = NOW() WHERE id = ${postId}`);
}

async function createChildDraft(input: CreateChildInput): Promise<ContentDraft> {
  const meta: Record<string, any> = {
    parent_draft_id: input.parentDraftId,
    parent_kind: "article",
    parent_surface: "rankflow",
    repurposed_at: new Date().toISOString(),
    repurpose_variant: input.variantIndex,
  };
  /* Sprint 11/12 image gen reads media_plan.prompt. */
  if (input.imagePrompt) {
    meta.media_plan = { type: "image", prompt: input.imagePrompt };
  }
  /* Email adapter reads metadata.email.recipient if set. */
  if (input.kind === "email_post") {
    meta.email = {
      recipient: input.emailRecipient ?? null,
    };
  }
  /* Sprint 14: standardized calendar metadata. Repurposer children are
   * always auto-generated + repurposed. scheduled_for is null at creation
   * — the queue picks them up immediately unless an admin schedules
   * them. */
  meta.calendar = buildCalendarMetadata({
    channel: input.target_platform as any,
    scheduled_for: null,
    parent_draft_id: input.parentDraftId,
    auto_generated: true,
    repurposed: true,
  });

  /* For non-email, non-LinkedIn, non-Pinterest children, provision a
   * socialsync_posts shell so the Sprint 10/12 adapters can resolve the
   * platform connection. LinkedIn and Pinterest use their own direct
   * publisher adapters and don't need a socialsync_posts row. */
  const skipShellPlatforms = new Set(["email", "linkedin", "pinterest"]);
  let linkedSocialPostId: number | null = null;
  if (input.kind !== "email_post" && !skipShellPlatforms.has(input.target_platform)) {
    linkedSocialPostId = await createSocialSyncShell(
      input.clientId,
      input.target_platform as "facebook" | "instagram" | "google_business",
      input.body,
      input.imagePrompt,
    );
  }

  const draft = await storage.createContentDraft({
    client_id: input.clientId,
    client_service_id: null,
    kind: input.kind,
    surface: "socialsync",
    title: input.kind === "email_post" ? (input.emailSubject ?? input.title ?? "Update") : (input.title ?? null),
    body: input.body,
    excerpt: input.kind === "email_post" ? null : input.body.slice(0, 200),
    target_platform: input.target_platform,
    target_url: null,
    metadata: meta as any,
    quality_score: null,
    quality_notes: null,
    status: "draft",
    auto_approved: false,
    requires_admin_review: false,
    requires_client_review: false,
    admin_approved_at: null,
    admin_approved_by: null,
    client_approved_at: null,
    rejected_at: null,
    rejection_reason: null,
    linked_social_post_id: linkedSocialPostId,
    linked_task_id: null,
    generation_cost_micro_usd: null,
    created_by: "system",
  } as any);

  if (linkedSocialPostId !== null) {
    await backfillSocialSyncShell(linkedSocialPostId, draft.id);
  }

  return draft;
}

/* ─── LinkedIn/Pinterest direct enqueue ──────────────────────────────── */

/**
 * Enqueue a LinkedIn or Pinterest draft by writing queue_status='queued'
 * into metadata[platform]. These platforms don't go through the
 * socialsync_posts flow — they use direct adapters that read metadata
 * and call the platform API directly.
 */
async function enqueueDirectChannelDraft(
  draftId: number,
  platform: "linkedin" | "pinterest",
): Promise<void> {
  const draft = await storage.getContentDraftById(draftId);
  if (!draft) return;
  const meta = (draft.metadata || {}) as Record<string, any>;
  const existing = (meta[platform] || {}) as Record<string, any>;
  if (existing.posted_at || existing.queue_status === "published") return;
  await storage.updateContentDraft(draftId, {
    metadata: {
      ...meta,
      [platform]: {
        ...existing,
        queue_status: "queued",
        scheduled_for: null,
        attempts: 0,
        last_error: null,
        locked_at: null,
        locked_by: null,
      },
    },
  } as any);
}

/* ─── Public entry point ─────────────────────────────────────────────── */

/**
 * Repurpose a RankFlow article draft into 8 channel-specific child
 * drafts (3 FB + 3 IG + 1 GBP + 1 email). Fire-and-forget safe — the
 * adminApproveDraft hook calls this with .catch() and never blocks.
 *
 * Returns RepurposeResult with the children's draft ids. On any
 * non-success case (skipped, AI failure, idempotent re-call), returns
 * a structured marker — NEVER throws.
 */
export async function repurposeArticle(parentDraftId: number): Promise<RepurposeResult> {
  const t0 = Date.now();
  try {
    const parent = await storage.getContentDraftById(parentDraftId);
    if (!parent) {
      return { ok: false, parentDraftId, children: [], reason: "parent_not_found", message: "draft not found" };
    }
    if (parent.kind !== "article" || parent.surface !== "rankflow") {
      return { ok: false, parentDraftId, children: [], reason: "skipped_kind", message: `kind=${parent.kind} surface=${parent.surface}` };
    }
    if (parent.status !== "approved" && parent.status !== "published") {
      return { ok: false, parentDraftId, children: [], reason: "skipped_status", message: `status=${parent.status}` };
    }

    /* Idempotency. */
    const existing = await findExistingChildren(parentDraftId);
    if (existing.length > 0) {
      const children: RepurposeChild[] = existing.map((d) => ({
        draftId: d.id,
        kind: d.kind as any,
        target_platform: (d.target_platform || "facebook") as any,
        variantIndex: ((d.metadata as any)?.repurpose_variant as number | undefined) ?? 0,
      }));
      return { ok: true, parentDraftId, children, reason: "already_repurposed", message: `${existing.length} child draft(s) already exist` };
    }

    /* Derive content (AI or stub). */
    const client = await storage.getClientById(parent.client_id);
    const tradeType = (client?.trade_type as string | null) ?? null;
    /* Sprint 16: pass content_brand layer into the AI prompt so
     * captions/email/GBP summary pick up tone, location cue, service
     * focus, and avoid-list. The system prompt already forbids inventing
     * facts not in the article — the brand layer is style only. */
    const brand = readBrandProfile(client);
    const brandLayer = buildBrandLayerText(brand, tradeType);
    /* Sprint 17: feedback loop. Pull recent high-performer patterns
     * across the client's social channels (channel=null → any). */
    const performanceFeedback = await buildPerformanceFeedback(parent.client_id, null);
    const derivations = shouldUseAiStub()
      ? stubDerivations(parent)
      : await aiDerivations(parent, tradeType, brandLayer || undefined, performanceFeedback || undefined);
    if (!derivations) {
      return { ok: false, parentDraftId, children: [], reason: "ai_failed", message: "derivation generation failed" };
    }

    /* Create children. Per-child try/catch — one failure does NOT
     * abort siblings (per the Sprint 13 hard rule). */
    const children: RepurposeChild[] = [];

    const fbPlan = derivations.fb_captions.map((body, i) => ({
      kind: "social_post" as const, target_platform: "facebook" as const,
      body, title: null, imagePrompt: derivations.fb_image_prompts[i] ?? null, variantIndex: i + 1,
    }));
    const igPlan = derivations.ig_captions.map((body, i) => ({
      kind: "social_post" as const, target_platform: "instagram" as const,
      body, title: null, imagePrompt: derivations.ig_image_prompts[i] ?? null, variantIndex: i + 1,
    }));
    const gbpPlan = [{
      kind: "google_post" as const, target_platform: "google_business" as const,
      body: derivations.gbp_summary, title: null, imagePrompt: derivations.gbp_image_prompt, variantIndex: 1,
    }];
    const emailPlan = [{
      kind: "email_post" as const, target_platform: "email" as const,
      body: derivations.email_body, title: derivations.email_subject, imagePrompt: null, variantIndex: 1,
      emailSubject: derivations.email_subject,
      emailRecipient: client?.contact_email ?? null,
    }];
    const linkedinPlan = derivations.linkedin_post ? [{
      kind: "social_post" as const, target_platform: "linkedin" as const,
      body: derivations.linkedin_post, title: null, imagePrompt: null, variantIndex: 1,
    }] : [];
    const pinterestPlan = derivations.pinterest_title ? [{
      kind: "social_post" as const, target_platform: "pinterest" as const,
      body: derivations.pinterest_description, title: derivations.pinterest_title,
      imagePrompt: derivations.pinterest_image_prompt, variantIndex: 1,
    }] : [];

    for (const item of [...fbPlan, ...igPlan, ...gbpPlan, ...emailPlan, ...linkedinPlan, ...pinterestPlan]) {
      try {
        const child = await createChildDraft({
          clientId: parent.client_id,
          parentDraftId,
          ...item,
        });

        /* Sprint 11/12: image generation (FB/IG/GBP). Sync-await but
         * never throws. Email children skip image gen entirely. */
        if (item.kind !== "email_post") {
          // Wave 113 — image-gen failures in repurposer were silenced;
          // surface via noisyCatch (the publisher still treats null
          // image_url as a soft fail, behaviour unchanged).
          await noisyCatch(generateImageForDraft(child.id), {
            op: "contentflow.repurposer.generateImageForDraft",
            meta: { childDraftId: child.id, parentDraftId, variantIndex: item.variantIndex },
          });
        }

        /* Auto-approve + enqueue. */
        await autoApproveDraft({
          draftId: child.id,
          notes: `Repurposed from article ${parentDraftId} (variant ${item.variantIndex})`,
        });
        if (item.kind === "email_post") {
          await enqueueEmailDraft(child.id);
        } else if (item.target_platform === "linkedin" || item.target_platform === "pinterest") {
          /* LinkedIn and Pinterest use their own direct adapters —
           * enqueue via metadata channel key matching the platform. */
          await enqueueDirectChannelDraft(child.id, item.target_platform);
        } else {
          await enqueueSocialSyncDraft(child.id);
        }

        children.push({
          draftId: child.id,
          kind: item.kind,
          target_platform: item.target_platform,
          variantIndex: item.variantIndex,
        });
      } catch (err: any) {
        log.error(`[contentflow][repurposer] child create failed (parent=${parentDraftId} platform=${item.target_platform} variant=${item.variantIndex}): ${err?.message || err}`);
        /* Continue — sibling failures must not abort. */
      }
    }

    /* Sprint 17: auto-generate infographic when article contains
     * statistics, numbered lists, or comparison data. Best-effort --
     * failure does not affect the main repurpose result. */
    if (detectInfographicContent(parent.body)) {
      try {
        const igResult = await generateInfographic(parentDraftId, "instagram");
        if (igResult.ok && igResult.draftId) {
          children.push({
            draftId: igResult.draftId,
            kind: "social_post",
            target_platform: "instagram",
            variantIndex: 0,
          });
        }
        // Also generate a Pinterest infographic variant
        const pinResult = await generateInfographic(parentDraftId, "pinterest");
        if (pinResult.ok && pinResult.draftId) {
          children.push({
            draftId: pinResult.draftId,
            kind: "social_post",
            target_platform: "pinterest",
            variantIndex: 0,
          });
        }
      } catch (err: any) {
        log.warn(`[contentflow][repurposer] infographic generation failed for parent=${parentDraftId}: ${err?.message || err}`);
      }
    }

    /* Sprint 17: auto-generate video script + thumbnail when
     * video_scripts_enabled is set on the client's service metadata.
     * Best-effort -- failure does not affect the main repurpose result. */
    try {
      const videoEnabled = await isVideoScriptsEnabled(parent.client_id);
      if (videoEnabled) {
        const videoResult = await generateVideoContent(parentDraftId);
        if (videoResult.ok && videoResult.scriptDraftId) {
          children.push({
            draftId: videoResult.scriptDraftId,
            kind: "social_post" as any,
            target_platform: "pinterest" as any, // closest to "youtube" in the type
            variantIndex: 0,
          });

          /* Sprint 18: after generating the video script, if AI video
           * generation is enabled (globally + per-client), fire-and-forget
           * full video generation. This is async/non-blocking because
           * video generation takes minutes. The callback queues the
           * YouTube upload when done. */
          try {
            const videoGenEnabled = await isVideoGenerationEnabledForClient(parent.client_id);
            if (videoGenEnabled) {
              generateFullVideo(parentDraftId)
                .then((vr) => {
                  if (vr.ok && vr.videoDraftId) {
                    log.info(`[contentflow][repurposer] AI video created: draft=${vr.videoDraftId} parent=${parentDraftId}`);
                  } else {
                    log.debug(`[contentflow][repurposer] AI video skipped/failed for parent=${parentDraftId}: ${vr.reason}`);
                  }
                })
                .catch((e: any) => {
                  log.warn(`[contentflow][repurposer] AI video generation error for parent=${parentDraftId}: ${e?.message || e}`);
                });
            }
          } catch (vgErr: any) {
            log.warn(`[contentflow][repurposer] video generation check failed for parent=${parentDraftId}: ${vgErr?.message || vgErr}`);
          }
        }
      }
    } catch (err: any) {
      log.warn(`[contentflow][repurposer] video content generation failed for parent=${parentDraftId}: ${err?.message || err}`);
    }

    log.info(`[contentflow][repurposer] parent=${parentDraftId} created=${children.length} duration_ms=${Date.now() - t0}`);
    return { ok: true, parentDraftId, children };
  } catch (err: any) {
    /* Outer guard — repurposeArticle must never throw. */
    log.error(`[contentflow][repurposer] parent=${parentDraftId} unhandled:`, err?.message || err);
    return { ok: false, parentDraftId, children: [], reason: "ai_failed", message: err?.message || String(err) };
  }
}
