/**
 * ContentFlow Sprint 17 -- video content service.
 *
 * Generates YouTube-ready video SCRIPTS and THUMBNAILS from article
 * drafts. Does NOT perform actual video rendering -- produces:
 *   1. A 3-5 minute speaking script (intro, talking points, CTA, outro)
 *   2. A YouTube thumbnail image via OpenAI image generation
 *
 * Stored as content_drafts with kind="video_script", channel="youtube".
 * Gated by client_service.metadata.video_scripts_enabled -- only
 * fires during repurposing when the flag is set.
 *
 * The script is generated via Claude; the thumbnail via OpenAI image
 * gen (same pipeline as imageGenerationService.ts).
 */

import { sql } from "drizzle-orm";
import { storage } from "../../storage";
import { db } from "../../db";
import { clientServices } from "@shared/schema";
import { readBrandProfile, buildBrandLayerText } from "./brandProfile";
import { chat as aiChat } from "../aiService";
import { autoApproveDraft } from "./approvalService";
import { buildCalendarMetadata } from "./calendarMetadata";
import { createLogger } from "../../lib/logger";
import type { ContentDraft } from "@shared/schema";

const log = createLogger("VideoContent");

/* ---- Types -------------------------------------------------------- */

export interface VideoScriptResult {
  ok: boolean;
  draftId?: number;
  reason?: string;
  message?: string;
}

export interface VideoThumbnailResult {
  ok: boolean;
  draftId?: number;
  reason?: string;
  message?: string;
}

export interface VideoContentResult {
  ok: boolean;
  scriptDraftId?: number;
  thumbnailDraftId?: number;
  reason?: string;
  message?: string;
}

interface ParsedScript {
  title: string;
  intro: string;
  talking_points: string[];
  cta: string;
  outro: string;
  estimated_duration_minutes: number;
}

/* ---- Video script generation -------------------------------------- */

const SCRIPT_SYSTEM_PROMPT = `You are a video script writer for trades-business YouTube channels (plumbers, electricians, roofers, HVAC, etc.).

Write a YouTube video script that covers 3-5 minutes of speaking content. The script should be conversational and engaging, suitable for a tradesperson speaking directly to camera.

Output STRICT JSON matching this schema:
{
  "title": "YouTube video title (50-70 chars, includes primary keyword)",
  "intro": "Opening 15-30 seconds: hook the viewer, introduce the topic",
  "talking_points": ["Point 1 (30-60 seconds of content)", "Point 2 ...", "Point 3 ...", "Point 4 (optional)"],
  "cta": "Call to action (15-20 seconds): what the viewer should do next",
  "outro": "Sign-off (10-15 seconds): subscribe reminder, next video tease",
  "estimated_duration_minutes": 4
}

Rules:
- Write naturally, as if the person is speaking -- not reading a formal essay.
- Include specific tips and advice from the source article.
- Each talking point should be 2-4 sentences of speaking content.
- Do NOT fabricate testimonials, prices, guarantees, or certifications.
- Do NOT include camera directions or technical instructions.
- The tone should match the brand profile if provided.
- Output ONLY the JSON object. No markdown fences, no preamble.`;

function buildScriptUserPrompt(
  article: ContentDraft,
  tradeType: string | null,
  brandLayer?: string,
): string {
  const meta = (article.metadata || {}) as Record<string, any>;
  const lines: string[] = [];
  lines.push(`Source article title: ${article.title || "Untitled"}`);
  if (tradeType) lines.push(`Trade: ${tradeType}`);
  if (meta.primary_keyword) lines.push(`Primary keyword: ${meta.primary_keyword}`);
  if (meta.location) lines.push(`Location: ${meta.location}`);
  if (brandLayer) lines.push(`\nBrand profile: ${brandLayer}`);
  lines.push("");
  lines.push("Article body:");
  lines.push((article.body || "").slice(0, 5000));
  lines.push("");
  lines.push("Generate a 3-5 minute YouTube video script from this article. Output JSON only.");
  return lines.join("\n");
}

function tryParseScript(raw: string): ParsedScript | null {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as any;
    if (typeof parsed.title !== "string") return null;
    if (typeof parsed.intro !== "string") return null;
    if (!Array.isArray(parsed.talking_points) || parsed.talking_points.length < 2) return null;
    if (typeof parsed.cta !== "string") return null;
    if (typeof parsed.outro !== "string") return null;
    return {
      title: parsed.title,
      intro: parsed.intro,
      talking_points: parsed.talking_points.map(String),
      cta: parsed.cta,
      outro: parsed.outro,
      estimated_duration_minutes: typeof parsed.estimated_duration_minutes === "number"
        ? parsed.estimated_duration_minutes : 4,
    };
  } catch {
    return null;
  }
}

/**
 * Format a parsed script into readable markdown body for the draft.
 */
function formatScriptBody(script: ParsedScript): string {
  const sections: string[] = [];
  sections.push(`# ${script.title}`);
  sections.push("");
  sections.push(`**Estimated duration:** ${script.estimated_duration_minutes} minutes`);
  sections.push("");
  sections.push("## Intro");
  sections.push(script.intro);
  sections.push("");
  script.talking_points.forEach((point, i) => {
    sections.push(`## Talking Point ${i + 1}`);
    sections.push(point);
    sections.push("");
  });
  sections.push("## Call to Action");
  sections.push(script.cta);
  sections.push("");
  sections.push("## Outro");
  sections.push(script.outro);
  return sections.join("\n");
}

/**
 * Generate a YouTube video script from an article draft.
 * Never throws.
 */
export async function generateVideoScript(
  articleDraftId: number,
): Promise<VideoScriptResult> {
  try {
    const article = await storage.getContentDraftById(articleDraftId);
    if (!article) {
      return { ok: false, reason: "article_not_found" };
    }
    if (!article.body || article.body.length < 100) {
      return { ok: false, reason: "article_too_short", message: "Article body is too short for a video script" };
    }

    const client = await storage.getClientById(article.client_id);
    const tradeType = (client?.trade_type as string | null) ?? null;
    const brand = readBrandProfile(client);
    const brandLayer = buildBrandLayerText(brand, tradeType) || undefined;

    // Generate the script via Claude
    let raw: string;
    try {
      raw = await aiChat({
        system: SCRIPT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildScriptUserPrompt(article, tradeType, brandLayer) }],
        maxTokens: 2000,
      });
    } catch (err: any) {
      log.error(`Video script AI call failed for article=${articleDraftId}: ${err?.message || err}`);
      return { ok: false, reason: "ai_failed", message: err?.message || String(err) };
    }

    const parsed = tryParseScript(raw);
    if (!parsed) {
      log.error(`Video script unparseable for article=${articleDraftId}, raw len=${raw.length}`);
      return { ok: false, reason: "parse_failed", message: "Could not parse AI video script output" };
    }

    const scriptBody = formatScriptBody(parsed);

    // Build thumbnail image prompt
    const colorHint = brand.primary_color
      ? `brand colors: ${brand.primary_color}${brand.secondary_color ? ` and ${brand.secondary_color}` : ""}`
      : "professional colors";

    const thumbnailPrompt = [
      `YouTube thumbnail for "${parsed.title}",`,
      `professional, bold text overlay, ${colorHint},`,
      tradeType ? `${tradeType} industry,` : "",
      "eye-catching, high contrast, clean design, no small text.",
    ].filter(Boolean).join(" ");

    // Create the video script draft
    const meta: Record<string, any> = {
      parent_draft_id: articleDraftId,
      parent_kind: "article",
      parent_surface: "rankflow",
      repurposed_at: new Date().toISOString(),
      video_script: {
        title: parsed.title,
        intro: parsed.intro,
        talking_points: parsed.talking_points,
        cta: parsed.cta,
        outro: parsed.outro,
        estimated_duration_minutes: parsed.estimated_duration_minutes,
      },
      media_plan: { type: "image", prompt: thumbnailPrompt },
      calendar: buildCalendarMetadata({
        channel: "youtube" as any,
        scheduled_for: null,
        parent_draft_id: articleDraftId,
        auto_generated: true,
        repurposed: true,
      }),
    };

    const draft = await storage.createContentDraft({
      client_id: article.client_id,
      client_service_id: null,
      kind: "video_script",
      surface: "socialsync",
      title: parsed.title,
      body: scriptBody,
      excerpt: `Video script (${parsed.estimated_duration_minutes} min) from: ${(article.title || "article").slice(0, 100)}`,
      target_platform: "youtube",
      target_url: null,
      metadata: meta as any,
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
      linked_task_id: null,
      generation_cost_micro_usd: null,
      created_by: "system",
    } as any);

    log.info(`Video script created: draft=${draft.id} parent=${articleDraftId} duration=${parsed.estimated_duration_minutes}min`);

    return { ok: true, draftId: draft.id };
  } catch (err: any) {
    log.error(`Video script generation failed for article=${articleDraftId}: ${err?.message || err}`);
    return { ok: false, reason: "generation_failed", message: err?.message || String(err) };
  }
}

/**
 * Generate a YouTube thumbnail for an existing video script draft.
 * Uses the media_plan.prompt already stored on the draft.
 * Never throws.
 */
export async function generateVideoThumbnail(
  scriptDraftId: number,
): Promise<VideoThumbnailResult> {
  try {
    const draft = await storage.getContentDraftById(scriptDraftId);
    if (!draft) {
      return { ok: false, reason: "draft_not_found" };
    }

    const meta = (draft.metadata || {}) as Record<string, any>;
    const mediaPlan = (meta.media_plan || {}) as Record<string, any>;

    if (!mediaPlan.prompt) {
      return { ok: false, reason: "no_prompt", message: "No thumbnail prompt on draft" };
    }

    // Use the existing image generation pipeline (handles OpenAI API + R2 upload).
    // imageGen may skip video_script kind -- that is expected. The thumbnail
    // prompt is stored for manual generation or future pipeline support.
    const { generateForDraft } = await import("./imageGenerationService");
    const result = await generateForDraft(scriptDraftId);

    if (result.ok) {
      log.info(`Video thumbnail generated: draft=${scriptDraftId} url=${result.image_url?.slice(0, 80)}`);
      return { ok: true, draftId: scriptDraftId };
    }

    log.debug(`Video thumbnail skipped by imageGen: draft=${scriptDraftId} reason=${result.reason}`);
    return { ok: false, reason: result.reason || "skipped", message: result.message };
  } catch (err: any) {
    log.error(`Video thumbnail failed for draft=${scriptDraftId}: ${err?.message || err}`);
    return { ok: false, reason: "generation_failed", message: err?.message || String(err) };
  }
}

/**
 * Full video content pipeline: generate script + thumbnail from an article.
 * Called by the repurposer when video_scripts_enabled is set.
 * Never throws.
 */
export async function generateVideoContent(
  articleDraftId: number,
): Promise<VideoContentResult> {
  try {
    const scriptResult = await generateVideoScript(articleDraftId);
    if (!scriptResult.ok || !scriptResult.draftId) {
      return {
        ok: false,
        reason: scriptResult.reason,
        message: scriptResult.message,
      };
    }

    // Attempt thumbnail generation (best-effort)
    const thumbResult = await generateVideoThumbnail(scriptResult.draftId);

    log.info(`Video content pipeline complete: article=${articleDraftId} script=${scriptResult.draftId} thumb=${thumbResult.ok}`);

    return {
      ok: true,
      scriptDraftId: scriptResult.draftId,
      thumbnailDraftId: thumbResult.ok ? thumbResult.draftId : undefined,
    };
  } catch (err: any) {
    log.error(`Video content pipeline failed for article=${articleDraftId}: ${err?.message || err}`);
    return { ok: false, reason: "pipeline_failed", message: err?.message || String(err) };
  }
}

/**
 * Check whether video script generation is enabled for a given client.
 * Reads client_service.metadata.video_scripts_enabled across all of
 * the client's active services.
 */
export async function isVideoScriptsEnabled(clientId: number): Promise<boolean> {
  try {
    const result: any = await db.execute(sql`
      SELECT id FROM client_services
      WHERE client_id = ${clientId}
        AND status NOT IN ('cancelled')
        AND metadata->>'video_scripts_enabled' = 'true'
      LIMIT 1
    `);
    const rows = (result?.rows ?? result) as any[];
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}
