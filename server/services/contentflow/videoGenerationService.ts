/**
 * ContentFlow Sprint 18 -- AI video generation service.
 *
 * Generates short AI videos from text prompts using Luma AI (Dream Machine)
 * with Runway ML as fallback. Videos are optionally uploaded to R2 for
 * permanent storage (same pattern as imageGenerationService.ts).
 *
 * Gated by:
 *   1. VIDEO_GENERATION_ENABLED=true env var (global kill switch)
 *      Default is OFF. The current pipeline generates a 3–5 minute talking-head
 *      script but only produces a 5-second B-roll clip via Luma/Runway, so the
 *      output does not match the script. Until that mismatch is resolved we
 *      keep this disabled; marketing copy and the customer-facing UI also hide
 *      the video feature while this flag is false.
 *   2. client_service.metadata.video_generation_enabled (per-client toggle)
 *
 * Video generation failure must NEVER block the article/social pipeline.
 * Every code path is wrapped in try/catch and returns null on failure.
 */

import crypto from "crypto";
import { createLogger } from "../../lib/logger";
import type { BrandProfile } from "./brandProfile";

const log = createLogger("VideoGen");

/* ─── Config ──────────────────────────────────────────────────────── */

const LUMA_API_BASE = "https://api.lumalabs.ai/dream-machine/v1";
const RUNWAY_API_BASE = "https://api.dev.runwayml.com/v1";
const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const REQUEST_TIMEOUT_MS = 30_000;

/* ─── Types ───────────────────────────────────────────────────────── */

export interface GenerateVideoResult {
  videoUrl: string;
  durationSeconds: number;
  provider: "luma" | "runway";
}

export interface GenerateVideoOpts {
  prompt: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  duration?: number; // seconds, default 5
  brandProfile?: BrandProfile;
}

/* ─── Gate check ──────────────────────────────────────────────────── */

export function isVideoGenerationEnabled(): boolean {
  // Default OFF — script/output alignment is unresolved (3-5 min script vs
  // 5-second B-roll). Must be opted in explicitly with VIDEO_GENERATION_ENABLED=true.
  const raw = process.env.VIDEO_GENERATION_ENABLED;
  if (raw === undefined || raw === null || raw === "") return false;
  return raw.toLowerCase() === "true";
}

/* ─── R2 upload (reuse pattern from imageGenerationService) ───────── */

function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL &&
    process.env.R2_ENDPOINT
  );
}

async function uploadVideoToR2(sourceUrl: string, clientId: number): Promise<string | null> {
  if (!isR2Configured()) return null;

  try {
    const sourceRes = await fetch(sourceUrl);
    if (!sourceRes.ok) {
      log.warn(`R2 video source fetch failed: ${sourceRes.status}`);
      return null;
    }
    const buffer = Buffer.from(await sourceRes.arrayBuffer());

    const accessKey = process.env.R2_ACCESS_KEY_ID!;
    const secretKey = process.env.R2_SECRET_ACCESS_KEY!;
    const bucket = process.env.R2_BUCKET_NAME!;
    const endpoint = process.env.R2_ENDPOINT!.replace(/\/+$/, "");
    const region = "auto";
    const host = new URL(endpoint).host;
    const date = new Date();
    const amzDate = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const dateStamp = amzDate.slice(0, 8);

    const key = `videos/${clientId}/${crypto.randomBytes(8).toString("hex")}.mp4`;
    const payloadHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const canonicalUri = `/${bucket}/${key}`;
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash("sha256").update(canonicalRequest).digest("hex")}`;

    const kDate = crypto.createHmac("sha256", `AWS4${secretKey}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac("sha256", kDate).update(region).digest();
    const kService = crypto.createHmac("sha256", kRegion).update("s3").digest();
    const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest();
    const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const putRes = await fetch(`${endpoint}/${bucket}/${key}`, {
      method: "PUT",
      headers: {
        Authorization: authorization,
        "x-amz-date": amzDate,
        "x-amz-content-sha256": payloadHash,
        "Content-Type": "video/mp4",
        "Content-Length": String(buffer.length),
      },
      body: buffer,
    });
    if (!putRes.ok) {
      const body = await putRes.text().catch(() => "");
      log.warn(`R2 video upload failed: ${putRes.status} ${body.slice(0, 200)}`);
      return null;
    }

    const publicBase = process.env.R2_PUBLIC_URL!.replace(/\/+$/, "");
    return `${publicBase}/${key}`;
  } catch (err: any) {
    log.warn(`R2 video upload error: ${err?.message || err}`);
    return null;
  }
}

/* ─── Luma AI (Dream Machine) ─────────────────────────────────────── */

interface LumaGeneration {
  id: string;
  state: "queued" | "dreaming" | "completed" | "failed";
  failure_reason?: string;
  assets?: {
    video?: string;
  };
}

async function generateWithLuma(opts: GenerateVideoOpts): Promise<GenerateVideoResult | null> {
  const apiKey = process.env.LUMA_API_KEY;
  if (!apiKey) return null;

  const t0 = Date.now();

  try {
    // Step 1: Create generation
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const createRes = await fetch(`${LUMA_API_BASE}/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt: opts.prompt,
        aspect_ratio: opts.aspectRatio || "16:9",
        loop: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!createRes.ok) {
      const errBody = await createRes.text().catch(() => "");
      log.error(`Luma create failed: HTTP ${createRes.status} ${errBody.slice(0, 300)}`);
      return null;
    }

    const generation = (await createRes.json()) as LumaGeneration;
    log.info(`Luma generation created: id=${generation.id} state=${generation.state}`);

    // Step 2: Poll for completion
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let current = generation;

    while (Date.now() < deadline) {
      if (current.state === "completed") break;
      if (current.state === "failed") {
        log.error(`Luma generation failed: id=${current.id} reason=${current.failure_reason}`);
        return null;
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const pollController = new AbortController();
      const pollTimeout = setTimeout(() => pollController.abort(), REQUEST_TIMEOUT_MS);
      const pollRes = await fetch(`${LUMA_API_BASE}/generations/${current.id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: pollController.signal,
      });
      clearTimeout(pollTimeout);

      if (!pollRes.ok) {
        log.warn(`Luma poll failed: HTTP ${pollRes.status}`);
        continue;
      }
      current = (await pollRes.json()) as LumaGeneration;
    }

    if (current.state !== "completed" || !current.assets?.video) {
      log.error(`Luma generation timed out or no video: id=${current.id} state=${current.state}`);
      return null;
    }

    const durationMs = Date.now() - t0;
    log.info(`Luma video ready: id=${current.id} duration_ms=${durationMs}`);

    return {
      videoUrl: current.assets.video,
      durationSeconds: opts.duration || 5,
      provider: "luma",
    };
  } catch (err: any) {
    log.error(`Luma generation error: ${err?.message || err}`);
    return null;
  }
}

/* ─── Runway ML (fallback) ────────────────────────────────────────── */

interface RunwayTask {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  failure?: string;
  output?: string[];
}

async function generateWithRunway(opts: GenerateVideoOpts): Promise<GenerateVideoResult | null> {
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) return null;

  const t0 = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const createRes = await fetch(`${RUNWAY_API_BASE}/text_to_video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Runway-Version": "2024-11-06",
      },
      body: JSON.stringify({
        promptText: opts.prompt,
        model: "gen3a_turbo",
        duration: opts.duration || 5,
        ratio: opts.aspectRatio === "9:16" ? "768:1344"
             : opts.aspectRatio === "1:1" ? "1024:1024"
             : "1280:768",
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!createRes.ok) {
      const errBody = await createRes.text().catch(() => "");
      log.error(`Runway create failed: HTTP ${createRes.status} ${errBody.slice(0, 300)}`);
      return null;
    }

    const task = (await createRes.json()) as RunwayTask;
    log.info(`Runway task created: id=${task.id} status=${task.status}`);

    // Poll for completion
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let current = task;

    while (Date.now() < deadline) {
      if (current.status === "SUCCEEDED") break;
      if (current.status === "FAILED") {
        log.error(`Runway task failed: id=${current.id} reason=${current.failure}`);
        return null;
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const pollController = new AbortController();
      const pollTimeout = setTimeout(() => pollController.abort(), REQUEST_TIMEOUT_MS);
      const pollRes = await fetch(`${RUNWAY_API_BASE}/tasks/${current.id}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-Runway-Version": "2024-11-06",
        },
        signal: pollController.signal,
      });
      clearTimeout(pollTimeout);

      if (!pollRes.ok) {
        log.warn(`Runway poll failed: HTTP ${pollRes.status}`);
        continue;
      }
      current = (await pollRes.json()) as RunwayTask;
    }

    if (current.status !== "SUCCEEDED" || !current.output?.length) {
      log.error(`Runway task timed out or no output: id=${current.id} status=${current.status}`);
      return null;
    }

    const durationMs = Date.now() - t0;
    log.info(`Runway video ready: id=${current.id} duration_ms=${durationMs}`);

    return {
      videoUrl: current.output[0],
      durationSeconds: opts.duration || 5,
      provider: "runway",
    };
  } catch (err: any) {
    log.error(`Runway generation error: ${err?.message || err}`);
    return null;
  }
}

/* ─── Public entry point ──────────────────────────────────────────── */

/**
 * Generate a short AI video from a text prompt.
 * Tries Luma AI first, falls back to Runway ML.
 * Returns null on any failure -- NEVER throws.
 *
 * If R2 is configured, uploads the video for permanent storage.
 * Otherwise returns the provider's ephemeral URL.
 */
export async function generateVideo(
  opts: GenerateVideoOpts,
  clientId?: number,
): Promise<GenerateVideoResult | null> {
  if (!isVideoGenerationEnabled()) {
    log.debug("Video generation disabled (VIDEO_GENERATION_ENABLED != true)");
    return null;
  }

  const t0 = Date.now();
  log.info(`Starting video generation: prompt="${opts.prompt.slice(0, 80)}..." aspect=${opts.aspectRatio || "16:9"}`);

  try {
    // Try Luma first
    let result = await generateWithLuma(opts);

    // Fallback to Runway
    if (!result) {
      log.info("Luma unavailable or failed, trying Runway fallback");
      result = await generateWithRunway(opts);
    }

    if (!result) {
      log.warn(`Video generation failed: no provider succeeded (duration_ms=${Date.now() - t0})`);
      return null;
    }

    // Best-effort R2 upload for permanent storage
    if (clientId) {
      const r2Url = await uploadVideoToR2(result.videoUrl, clientId);
      if (r2Url) {
        log.info(`Video uploaded to R2: ${r2Url.slice(0, 80)}`);
        result.videoUrl = r2Url;
      }
    }

    log.info(`Video generation complete: provider=${result.provider} duration_ms=${Date.now() - t0}`);
    return result;
  } catch (err: any) {
    log.error(`Video generation unhandled error: ${err?.message || err}`);
    return null;
  }
}
