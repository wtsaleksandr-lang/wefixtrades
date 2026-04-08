/**
 * SocialSync media pipeline service.
 *
 * Generates and stores publishable images for social media posts.
 *
 * Pipeline:
 *   1. Check if post already has a usable public image URL
 *   2. If not, generate image from media_plan.prompt via OpenAI gpt-image-1
 *   3. Write to public static directory (dist/public/media/socialsync/)
 *   4. Return the public URL for Meta to fetch during publishing
 *
 * Storage approach: Images are written to the app's static public directory
 * and served via express.static(). This is the simplest durable path that
 * produces Meta-reachable URLs without requiring cloud storage setup.
 *
 * Requirements:
 *   - AI_INTEGRATIONS_OPENAI_API_KEY env var (for image generation)
 *   - APP_PUBLIC_URL env var (e.g. https://app.wefixtrades.com) for building full URLs
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { generateImageBuffer } from "../../replit_integrations/image/client";
import { storage } from "../../storage";
import type { SocialSyncPost } from "@shared/schema";

/* ─── Config ─── */

const MEDIA_SUBDIR = "media/socialsync";

function getPublicDir(): string {
  // Same directory that express.static serves from
  return path.resolve(__dirname, "..", "..", "public");
}

function getMediaDir(): string {
  const dir = path.join(getPublicDir(), MEDIA_SUBDIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getPublicBaseUrl(): string {
  const url = process.env.APP_PUBLIC_URL;
  if (!url) {
    throw new Error("APP_PUBLIC_URL environment variable is required for media pipeline (e.g. https://app.wefixtrades.com)");
  }
  return url.replace(/\/$/, ""); // Strip trailing slash
}

/* ─── Types ─── */

export interface MediaResolution {
  resolved: boolean;
  public_url: string | null;
  source: "existing" | "generated" | "none";
  error?: string;
  filename?: string;
}

/* ─── URL Extraction ─── */

function extractExistingImageUrl(post: SocialSyncPost): string | null {
  const mediaPlan = post.media_plan as Record<string, any> | null;
  if (!mediaPlan) return null;

  const url = mediaPlan.image_url || mediaPlan.public_image_url || mediaPlan.url || null;
  if (!url || typeof url !== "string") return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

function extractGenerationPrompt(post: SocialSyncPost): string | null {
  const mediaPlan = post.media_plan as Record<string, any> | null;
  if (!mediaPlan) return null;
  return mediaPlan.prompt || null;
}

/* ─── Image Generation ─── */

function buildImagePrompt(post: SocialSyncPost): string {
  // Use the AI-generated prompt from media_plan if available
  const existingPrompt = extractGenerationPrompt(post);
  if (existingPrompt) {
    // Wrap it to ensure it produces a clean, professional social media image
    return `Create a clean, professional social media image for a trades business post. Style: modern, minimal, suitable for Instagram. No text overlays unless specifically described. ${existingPrompt}`;
  }

  // Fallback: generate a prompt from the post content
  const caption = post.caption || post.post_text;
  const platform = post.platform;
  return `Create a clean, professional social media image for a ${platform} post by a local trades business. The post is about: "${caption.slice(0, 200)}". Style: modern, high-quality, suitable for Instagram. No text overlays. Natural lighting. Professional but approachable.`;
}

/**
 * Generate an image, save to public directory, return the public URL.
 */
async function generateAndStore(post: SocialSyncPost): Promise<MediaResolution> {
  const prompt = buildImagePrompt(post);

  // Generate image buffer
  let buffer: Buffer;
  try {
    buffer = await generateImageBuffer(prompt, "1024x1024");
  } catch (err: any) {
    return {
      resolved: false,
      public_url: null,
      source: "none",
      error: `Image generation failed: ${err.message}`,
    };
  }

  if (!buffer || buffer.length < 100) {
    return {
      resolved: false,
      public_url: null,
      source: "none",
      error: "Image generation returned empty or invalid data",
    };
  }

  // Write to public directory
  const hash = crypto.createHash("md5").update(buffer).digest("hex").slice(0, 12);
  const filename = `ss-${post.client_id}-${post.id}-${hash}.png`;
  const mediaDir = getMediaDir();
  const filePath = path.join(mediaDir, filename);

  try {
    fs.writeFileSync(filePath, buffer);
  } catch (err: any) {
    return {
      resolved: false,
      public_url: null,
      source: "none",
      error: `Failed to write image file: ${err.message}`,
    };
  }

  const baseUrl = getPublicBaseUrl();
  const publicUrl = `${baseUrl}/${MEDIA_SUBDIR}/${filename}`;

  return {
    resolved: true,
    public_url: publicUrl,
    source: "generated",
    filename,
  };
}

/* ─── Main Resolution ─── */

/**
 * Resolve a publishable public image URL for a post.
 *
 * 1. If post already has a valid image_url → use it
 * 2. If AI generation is available → generate + store
 * 3. Otherwise → fail clearly
 *
 * Updates the post's media_plan with the resolved URL on success.
 */
export async function resolveMediaForPost(
  post: SocialSyncPost,
): Promise<MediaResolution> {
  // Check for existing URL
  const existingUrl = extractExistingImageUrl(post);
  if (existingUrl) {
    return { resolved: true, public_url: existingUrl, source: "existing" };
  }

  // Check if generation is configured
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    return {
      resolved: false,
      public_url: null,
      source: "none",
      error: "No image URL provided and image generation not configured (AI_INTEGRATIONS_OPENAI_API_KEY missing)",
    };
  }

  if (!process.env.APP_PUBLIC_URL) {
    return {
      resolved: false,
      public_url: null,
      source: "none",
      error: "No image URL provided and APP_PUBLIC_URL not configured for media storage",
    };
  }

  // Generate and store
  const result = await generateAndStore(post);

  // On success, update the post's media_plan with the public URL
  if (result.resolved && result.public_url) {
    const currentPlan = (post.media_plan as Record<string, any>) || {};
    await storage.updateSocialSyncPost(post.id, {
      media_plan: {
        ...currentPlan,
        image_url: result.public_url,
        image_source: "generated",
        image_filename: result.filename,
        generated_at: new Date().toISOString(),
      },
    } as any);
  }

  return result;
}

/**
 * Prepare media for a post if needed. Called before publishing.
 * Returns the public image URL or null if unavailable.
 */
export async function ensureMediaReady(
  post: SocialSyncPost,
): Promise<{ imageUrl: string | null; error?: string }> {
  const resolution = await resolveMediaForPost(post);

  if (resolution.resolved && resolution.public_url) {
    return { imageUrl: resolution.public_url };
  }

  return { imageUrl: null, error: resolution.error };
}
