/**
 * ContentFlow Sprint 17 -- infographic generation service.
 *
 * For article drafts that contain statistics, numbered lists, or
 * comparison data, generates an infographic-style image via OpenAI
 * image generation. The infographic is stored as a content_draft
 * child with kind="social_post" and target_platform="instagram" or
 * "pinterest" (channels where infographics perform best).
 *
 * Design decisions:
 *   - Uses the existing OpenAI image generation pipeline (same as
 *     imageGenerationService.ts) but with infographic-specific prompts
 *   - Incorporates the client's brand colors into the prompt
 *   - Does NOT render actual charts in code -- relies on the AI image
 *     model to produce a clean infographic layout
 *   - Failure never blocks the pipeline (same pattern as imageGen)
 */

import { storage } from "../../storage";
import { readBrandProfile } from "./brandProfile";
import { generateForDraft as generateImageForDraft } from "./imageGenerationService";
import { autoApproveDraft } from "./approvalService";
import { buildCalendarMetadata } from "./calendarMetadata";
import { createLogger } from "../../lib/logger";
import type { ContentDraft } from "@shared/schema";

const log = createLogger("Infographic");

/* ---- Types -------------------------------------------------------- */

export interface InfographicResult {
  ok: boolean;
  draftId?: number;
  reason?: string;
  message?: string;
}

/* ---- Detection: does this article warrant an infographic? --------- */

/**
 * Simple heuristic: scan the article body for patterns that indicate
 * statistics, numbered lists, or comparison data that would look good
 * as an infographic.
 *
 * Returns the extracted data points as a string summary for the prompt,
 * or null if no infographic-worthy content is detected.
 */
export function detectInfographicContent(body: string | null | undefined): string | null {
  if (!body || body.length < 100) return null;

  const signals: string[] = [];

  // Detect numbered lists (at least 3 items)
  const numberedListPattern = /(?:^|\n)\s*\d+[.)]\s+.+/g;
  const numberedMatches = body.match(numberedListPattern);
  if (numberedMatches && numberedMatches.length >= 3) {
    const items = numberedMatches.slice(0, 8).map(m => m.trim());
    signals.push(`Numbered steps: ${items.join("; ")}`);
  }

  // Detect statistics / percentages
  const statPattern = /\d+(?:\.\d+)?%|\d+\s*(?:out of|in)\s*\d+|\d+(?:x|X)\s+(?:more|less|faster|better)/g;
  const statMatches = body.match(statPattern);
  if (statMatches && statMatches.length >= 2) {
    signals.push(`Statistics found: ${statMatches.slice(0, 6).join(", ")}`);
  }

  // Detect comparison keywords
  const comparisonPattern = /\b(?:vs\.?|versus|compared to|comparison|before and after|pros and cons|advantages|disadvantages)\b/gi;
  const compMatches = body.match(comparisonPattern);
  if (compMatches && compMatches.length >= 1) {
    signals.push("Contains comparison/contrast content");
  }

  // Detect bullet-list items (markdown)
  const bulletPattern = /(?:^|\n)\s*[-*]\s+.+/g;
  const bulletMatches = body.match(bulletPattern);
  if (bulletMatches && bulletMatches.length >= 4) {
    const items = bulletMatches.slice(0, 8).map(m => m.trim());
    signals.push(`Key points: ${items.join("; ")}`);
  }

  if (signals.length === 0) return null;

  return signals.join(". ");
}

/* ---- Infographic draft creation ----------------------------------- */

/**
 * Generate an infographic variant for an article. Creates a child
 * content_draft with an image generation prompt tailored for
 * infographic-style output.
 *
 * Called by the repurposer when an article contains infographic-worthy
 * content. Never throws.
 */
export async function generateInfographic(
  parentDraftId: number,
  targetPlatform: "instagram" | "pinterest" = "instagram",
): Promise<InfographicResult> {
  try {
    const parent = await storage.getContentDraftById(parentDraftId);
    if (!parent) {
      return { ok: false, reason: "parent_not_found" };
    }

    const dataPoints = detectInfographicContent(parent.body);
    if (!dataPoints) {
      return { ok: false, reason: "no_infographic_content", message: "Article does not contain infographic-worthy content" };
    }

    // Load client brand for color/style injection
    const client = await storage.getClientById(parent.client_id);
    const brand = readBrandProfile(client);
    const tradeType = (client?.trade_type as string | null) ?? null;

    // Build the infographic-specific image prompt
    const colorHint = brand.primary_color
      ? `Use brand colors: ${brand.primary_color}${brand.secondary_color ? ` and ${brand.secondary_color}` : ""}.`
      : "Use clean, professional colors.";

    const imagePrompt = [
      `Create a clean, professional infographic for a trades business showing:`,
      dataPoints,
      colorHint,
      brand.visual_style ? `Visual style: ${brand.visual_style}.` : "",
      tradeType ? `Industry: ${tradeType}.` : "",
      "Layout: vertical, minimal text, bold headings, icon-driven, white background.",
      "Modern flat design. No photographs. No faces.",
    ].filter(Boolean).join(" ");

    // Build caption text for the social post
    const captionLines: string[] = [];
    captionLines.push(parent.title || "Key Insights");
    captionLines.push("");
    captionLines.push("Check out this quick visual breakdown from our latest article.");
    if (targetPlatform === "instagram") {
      captionLines.push("");
      captionLines.push("#infographic #tradestips #localbusiness");
    }

    // Create the child draft
    const meta: Record<string, any> = {
      parent_draft_id: parentDraftId,
      parent_kind: "article",
      parent_surface: "rankflow",
      repurposed_at: new Date().toISOString(),
      repurpose_variant: 0,
      infographic: true,
      media_plan: { type: "image", prompt: imagePrompt },
      calendar: buildCalendarMetadata({
        channel: targetPlatform as any,
        scheduled_for: null,
        parent_draft_id: parentDraftId,
        auto_generated: true,
        repurposed: true,
      }),
    };

    const draft = await storage.createContentDraft({
      client_id: parent.client_id,
      client_service_id: null,
      kind: "social_post",
      surface: "socialsync",
      title: `Infographic: ${(parent.title || "Key Insights").slice(0, 80)}`,
      body: captionLines.join("\n"),
      excerpt: `Infographic from: ${(parent.title || "article").slice(0, 120)}`,
      target_platform: targetPlatform,
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
      linked_social_post_id: null,
      linked_task_id: null,
      generation_cost_micro_usd: null,
      created_by: "system",
    } as any);

    // Generate the image (never throws)
    await generateImageForDraft(draft.id).catch(() => {});

    // Auto-approve
    await autoApproveDraft({
      draftId: draft.id,
      notes: `Infographic generated from article ${parentDraftId}`,
    });

    log.info(`Infographic draft created: draft=${draft.id} parent=${parentDraftId} platform=${targetPlatform}`);

    return { ok: true, draftId: draft.id };
  } catch (err: any) {
    log.error(`Infographic generation failed for parent=${parentDraftId}: ${err?.message || err}`);
    return { ok: false, reason: "generation_failed", message: err?.message || String(err) };
  }
}
