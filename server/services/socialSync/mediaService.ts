/**
 * SocialSync media pipeline service.
 *
 * Generates and stores publishable images for social media posts.
 *
 * Storage approach: Images are written to a persistent data directory
 * (SOCIALSYNC_MEDIA_DIR or default ./data/socialsync-media/) and served
 * via a dedicated Express route at /socialsync-media/*. This directory
 * lives outside build artifacts and survives deployments.
 *
 * Pipeline:
 *   1. Check if post already has a usable public image URL
 *   2. If not, generate image from media_plan.prompt via OpenAI gpt-image-1
 *   3. Write to persistent media directory
 *   4. Return the public URL for Meta to fetch during publishing
 *
 * Required env vars:
 *   AI_INTEGRATIONS_OPENAI_API_KEY — for image generation
 *   APP_PUBLIC_URL — e.g. https://app.wefixtrades.com (for building full URLs)
 *   SOCIALSYNC_MEDIA_DIR — (optional) persistent directory for media files
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Express } from "express";
import { generateImageBuffer } from "../../replit_integrations/image/client";
import { storage } from "../../storage";
import type { SocialSyncPost } from "@shared/schema";

/* ─── Config ─── */

const DEFAULT_MEDIA_DIR = path.resolve(process.cwd(), "data", "socialsync-media");
const MEDIA_URL_PREFIX = "/socialsync-media";

/** Max age for generated media files before cleanup eligibility (14 days). */
export const MEDIA_MAX_AGE_DAYS = 14;

export function getMediaDir(): string {
  const dir = process.env.SOCIALSYNC_MEDIA_DIR || DEFAULT_MEDIA_DIR;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getPublicBaseUrl(): string {
  const url = process.env.APP_PUBLIC_URL;
  if (!url) {
    throw new Error("APP_PUBLIC_URL environment variable is required for media pipeline");
  }
  return url.replace(/\/$/, "");
}

/**
 * Register the static file serving route for SocialSync media.
 * Call this during app setup (in server/index.ts or routes registration).
 */
export function registerMediaRoute(app: Express): void {
  const express = require("express");
  const mediaDir = getMediaDir();
  app.use(MEDIA_URL_PREFIX, express.static(mediaDir, {
    maxAge: "7d",
    immutable: true,
  }));
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
  const existingPrompt = extractGenerationPrompt(post);
  if (existingPrompt) {
    return `Create a clean, professional social media image for a trades business post. Style: modern, minimal, suitable for Instagram. No text overlays unless specifically described. ${existingPrompt}`;
  }
  const caption = post.caption || post.post_text;
  return `Create a clean, professional social media image for a ${post.platform} post by a local trades business. The post is about: "${caption.slice(0, 200)}". Style: modern, high-quality, suitable for Instagram. No text overlays. Natural lighting. Professional but approachable.`;
}

async function generateAndStore(post: SocialSyncPost): Promise<MediaResolution> {
  const prompt = buildImagePrompt(post);

  let buffer: Buffer;
  try {
    buffer = await generateImageBuffer(prompt, "1024x1024");
  } catch (err: any) {
    return { resolved: false, public_url: null, source: "none", error: `Image generation failed: ${err.message}` };
  }

  if (!buffer || buffer.length < 100) {
    return { resolved: false, public_url: null, source: "none", error: "Image generation returned empty or invalid data" };
  }

  const hash = crypto.createHash("md5").update(buffer).digest("hex").slice(0, 12);
  const filename = `ss-${post.client_id}-${post.id}-${hash}.png`;
  const mediaDir = getMediaDir();
  const filePath = path.join(mediaDir, filename);

  try {
    fs.writeFileSync(filePath, buffer);
  } catch (err: any) {
    return { resolved: false, public_url: null, source: "none", error: `Failed to write image file: ${err.message}` };
  }

  const baseUrl = getPublicBaseUrl();
  const publicUrl = `${baseUrl}${MEDIA_URL_PREFIX}/${filename}`;

  return { resolved: true, public_url: publicUrl, source: "generated", filename };
}

/* ─── Main Resolution ─── */

export async function resolveMediaForPost(post: SocialSyncPost): Promise<MediaResolution> {
  const existingUrl = extractExistingImageUrl(post);
  if (existingUrl) {
    return { resolved: true, public_url: existingUrl, source: "existing" };
  }

  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    return { resolved: false, public_url: null, source: "none", error: "No image URL provided and image generation not configured (AI_INTEGRATIONS_OPENAI_API_KEY missing)" };
  }
  if (!process.env.APP_PUBLIC_URL) {
    return { resolved: false, public_url: null, source: "none", error: "No image URL provided and APP_PUBLIC_URL not configured for media storage" };
  }

  const result = await generateAndStore(post);

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

export async function ensureMediaReady(post: SocialSyncPost): Promise<{ imageUrl: string | null; error?: string }> {
  const resolution = await resolveMediaForPost(post);
  if (resolution.resolved && resolution.public_url) {
    return { imageUrl: resolution.public_url };
  }
  return { imageUrl: null, error: resolution.error };
}

/* ─── Cleanup ─── */

export interface CleanupResult {
  scanned: number;
  deleted: number;
  errors: string[];
  kept_recent: number;
}

/**
 * Clean up orphaned/old media files.
 * Keeps files younger than MEDIA_MAX_AGE_DAYS and files still referenced
 * by non-published posts.
 */
export async function cleanupOldMedia(): Promise<CleanupResult> {
  const result: CleanupResult = { scanned: 0, deleted: 0, errors: [], kept_recent: 0 };
  const mediaDir = getMediaDir();

  let files: string[];
  try {
    files = fs.readdirSync(mediaDir).filter(f => f.startsWith("ss-") && f.endsWith(".png"));
  } catch {
    return result;
  }

  result.scanned = files.length;
  const cutoff = Date.now() - MEDIA_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  // Get all active post media filenames to protect
  const activeFilenames = new Set<string>();
  const enabledProfiles = await storage.listEnabledSocialSyncProfiles();
  for (const profile of enabledProfiles) {
    const posts = await storage.listSocialSyncPosts(profile.client_id, { limit: 100 });
    for (const post of posts) {
      if (["queued", "ready", "draft", "publishing"].includes(post.status)) {
        const plan = post.media_plan as Record<string, any> | null;
        if (plan?.image_filename) {
          activeFilenames.add(plan.image_filename);
        }
      }
    }
  }

  for (const file of files) {
    const filePath = path.join(mediaDir, file);
    try {
      const stat = fs.statSync(filePath);
      const fileAge = stat.mtimeMs;

      // Keep if recently created
      if (fileAge > cutoff) {
        result.kept_recent++;
        continue;
      }

      // Keep if still referenced by an active post
      if (activeFilenames.has(file)) {
        continue;
      }

      // Delete
      fs.unlinkSync(filePath);
      result.deleted++;
    } catch (err: any) {
      result.errors.push(`${file}: ${err.message}`);
    }
  }

  return result;
}
