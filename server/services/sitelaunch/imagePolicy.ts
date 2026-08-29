/**
 * SiteLaunch — image policy.
 *
 * THE RULE: a generated image may never depict, or be presented as, the
 * customer's people or the customer's completed work.
 *
 * This is not a style preference. A trades website that shows an AI image
 * captioned as "our crew" or placed in a "recent work" gallery is a
 * misrepresentation, and the customer — not us — carries the consequence
 * with their own customers. So the rule is enforced in three independent
 * places, any one of which is sufficient:
 *
 *   1. PROMPT — every generated prompt is built here and carries explicit
 *      subject constraints. Nothing else in SiteLaunch calls the image
 *      orchestrator directly.
 *   2. PROVENANCE — generated images are tagged `abstract`, never
 *      `customer`. The tag is part of the document model, not a comment.
 *   3. RENDERER — `renderGallery()` filters out any non-`customer`
 *      provenance image before emitting the section, so even a
 *      hand-edited document cannot put a generated image in a portfolio.
 *
 * Customer-uploaded photos are always preferred and are the only images
 * that may carry `customer` provenance.
 */

import { generateImageViaOrchestrator } from "../contentflow/imageOrchestrator";
import { saveFile } from "../fileStorage";
import { createLogger } from "../../lib/logger";
import type { SiteImage } from "@shared/sitelaunch/document";

const log = createLogger("SiteLaunch:Images");

/**
 * Subjects a SiteLaunch prompt must never request. Checked as a belt-and-
 * braces assertion on the composed prompt — if a future caller assembles a
 * prompt by hand, generation is refused rather than attempted.
 */
const PROHIBITED_SUBJECTS = [
  "crew",
  "team photo",
  "our team",
  "staff",
  "employees",
  "worker portrait",
  "technician portrait",
  "customer",
  "client",
  "testimonial",
  "completed job",
  "finished job",
  "our work",
  "portfolio",
  "before and after",
  "before/after",
  "job site photo",
  "company van",
  "branded truck",
  "logo on",
  "storefront",
];

export interface PromptCheck {
  allowed: boolean;
  reason?: string;
}

/** Reject a prompt that asks for a subject the policy forbids. */
export function checkImagePrompt(prompt: string): PromptCheck {
  const lower = (prompt || "").toLowerCase();
  for (const subject of PROHIBITED_SUBJECTS) {
    if (lower.includes(subject)) {
      return {
        allowed: false,
        reason: `Prompt requests a prohibited subject ("${subject}"). Generated imagery must never depict the customer's people or their completed work.`,
      };
    }
  }
  return { allowed: true };
}

/**
 * Build the only kind of prompt SiteLaunch is allowed to generate: a
 * neutral material / texture / tool composition with no people and nothing
 * that could read as the customer's own job.
 */
export function buildHeroImagePrompt(tradeType: string | undefined, mood: string): string {
  const trade = (tradeType || "home services").toLowerCase().replace(/[^a-z0-9 -]/g, "");
  const safeMood = (mood || "clean, professional").replace(/[^a-z0-9 ,-]/gi, "");
  return (
    `Abstract architectural photograph for a ${trade} business website background. ` +
    `Materials, textures, tools and geometry only. ${safeMood}. ` +
    `Absolutely no people, no faces, no hands, no vehicles, no signage, no text, no brand marks. ` +
    `Wide composition, soft natural light, shallow depth of field, muted neutral palette.`
  );
}

export interface GeneratedImageResult {
  ok: boolean;
  image?: SiteImage;
  reason?: string;
}

/**
 * Generate one background image and persist it, returning a `SiteImage`
 * tagged `abstract`.
 *
 * Never throws. Every failure path — policy refusal, orchestrator disabled,
 * every provider down, a storage error — returns `{ ok:false, reason }` so a
 * draft generation run degrades to a photo-light layout instead of failing.
 * A photo-light trades site is a perfectly good site; a broken generation
 * run is not.
 */
export async function generateBackgroundImage(
  prompt: string,
  alt: string,
): Promise<GeneratedImageResult> {
  const check = checkImagePrompt(prompt);
  if (!check.allowed) {
    log.warn("image prompt refused by policy", { reason: check.reason });
    return { ok: false, reason: check.reason };
  }

  let orch;
  try {
    orch = await generateImageViaOrchestrator(prompt, { size: "1536x1024" });
  } catch (err: any) {
    log.warn("image orchestrator threw — continuing without a hero image", {
      error: err?.message || String(err),
    });
    return { ok: false, reason: "image_provider_error" };
  }

  if (!orch.ok) {
    log.info("image orchestrator declined — continuing without a hero image", {
      reason: orch.reason,
      chain: orch.fallback_chain.join(" -> "),
    });
    return { ok: false, reason: orch.reason };
  }

  try {
    const url = await saveFile(orch.imageBuffer, "sitelaunch-hero.png", "sitelaunch");
    return {
      ok: true,
      image: {
        url,
        alt: alt.slice(0, 200),
        // NEVER "customer". See the rule at the top of this file.
        provenance: "abstract",
      },
    };
  } catch (err: any) {
    log.warn("generated image could not be stored — continuing without it", {
      error: err?.message || String(err),
    });
    return { ok: false, reason: "storage_error" };
  }
}

/**
 * Normalise customer-supplied photo URLs into `SiteImage`s. These are the
 * only images that may claim `customer` provenance, and they are the only
 * images the renderer will place in a portfolio gallery.
 */
export function customerPhotos(urls: Array<{ url: string; alt?: string }>): SiteImage[] {
  return urls
    .filter((p) => typeof p.url === "string" && p.url.trim().length > 0)
    .slice(0, 24)
    .map((p) => ({
      url: p.url.trim().slice(0, 1000),
      alt: (p.alt || "").slice(0, 200),
      provenance: "customer" as const,
    }));
}
