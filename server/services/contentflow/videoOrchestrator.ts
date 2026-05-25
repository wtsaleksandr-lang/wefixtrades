/**
 * ContentFlow — multi-provider video orchestrator (v2).
 *
 * Mirrors the pattern of imageOrchestrator.ts (PR #786): rotate across
 * free-tier first, paid as fallback, never throw. Returns ok:false on
 * total failure so the caller can keep the publish pipeline alive.
 *
 * Provider rotation (FREE → PAID):
 *   1. huggingface_cogvideo  — Hugging Face Inference API CogVideoX-5B
 *                               (free tier, slow ~60s render)
 *   2. replicate_wan          — Replicate Wan 2.1 i2v-720p
 *                               (free signup credits, ~30s, ~20 free generations)
 *   3. replicate_svd          — Replicate Stable Video Diffusion
 *                               (free signup credits, 4-second 1024x576 clips)
 *   4. google_veo             — Vertex AI Veo (GCP free tier credits, best quality)
 *   5. replicate_hunyuan      — Replicate HunyuanVideo (cinematic, more credits)
 *   6. replicate_zeroscope    — Replicate ZeroScope v2 XL (cheap text-to-video fallback)
 *
 * Feature flag: CONTENTFLOW_VIDEO_ORCHESTRATOR_ENABLED (default true).
 * Global kill switch: VIDEO_GENERATION_ENABLED (must be "true" to run).
 *
 * Most providers return URLs (Replicate, Veo) — we forward those rather
 * than buffering to keep memory low. HF returns raw bytes; we buffer
 * those. The caller decides whether to persist to R2 or stream directly.
 *
 * NEVER throws — every provider call is wrapped in try/catch and any
 * non-2xx response is logged + skipped to the next provider.
 */

import { createLogger } from "../../lib/logger";

const logger = createLogger("VideoOrchestrator");

/* ─── Types ────────────────────────────────────────────────────────── */

export type VideoProviderId =
  | "huggingface_cogvideo"
  | "replicate_wan"
  | "replicate_svd"
  | "google_veo"
  | "replicate_hunyuan"
  | "replicate_zeroscope";

export interface VideoProvider {
  id: VideoProviderId;
  name: string;
  /** Approximate free generations per month at zero-cost rotation tier. */
  freeTierMonthlyLimit: number;
  /** USD per video at marginal cost (post-free-tier). */
  costPerVideo: number;
  durationSeconds: number;
  resolution: string; // "720p" | "1080p" | "576p"
  enabled: boolean;
  envVarRequired?: string;
}

export interface VideoGenOpts {
  /** Customer tier — informational only; gating happens in the route. */
  customerTier?: "free" | "creator" | "studio" | "agency" | string | null;
  /** Force a specific provider (debug / admin override). */
  forceProvider?: VideoProviderId;
  /** Per-call timeout for one provider attempt. */
  timeoutMs?: number;
  /** Optional image URL for image-to-video providers (SVD, Wan i2v). */
  imageUrl?: string;
}

export interface VideoOrchestratorSuccess {
  ok: true;
  /** Some providers stream video bytes; others return a hosted URL. One is set. */
  videoBuffer?: Buffer;
  videoUrl?: string;
  providerUsed: string;
  durationSec: number;
  cost: number;
  resolution: string;
  fallback_chain: string[];
}

export interface VideoOrchestratorFailure {
  ok: false;
  reason: string;
  fallback_chain: string[];
}

/* ─── Registry ─────────────────────────────────────────────────────── */

/**
 * Free-tier-first rotation. Order MATTERS — single-candidate walk goes
 * top-to-bottom. Cost numbers are rough marginal estimates that should
 * update from telemetry over time.
 */
export const VIDEO_PROVIDERS: readonly VideoProvider[] = [
  {
    id: "huggingface_cogvideo",
    name: "Hugging Face CogVideoX-5B",
    freeTierMonthlyLimit: 100,
    costPerVideo: 0,
    durationSeconds: 6,
    resolution: "720p",
    enabled: true,
    envVarRequired: "HUGGINGFACE_API_KEY",
  },
  {
    id: "replicate_wan",
    name: "Replicate Wan 2.1 i2v-720p",
    freeTierMonthlyLimit: 20,
    costPerVideo: 0.10,
    durationSeconds: 5,
    resolution: "720p",
    enabled: true,
    envVarRequired: "REPLICATE_API_TOKEN",
  },
  {
    id: "replicate_svd",
    name: "Replicate Stable Video Diffusion",
    freeTierMonthlyLimit: 30,
    costPerVideo: 0.05,
    durationSeconds: 4,
    resolution: "576p",
    enabled: true,
    envVarRequired: "REPLICATE_API_TOKEN",
  },
  {
    id: "google_veo",
    name: "Google Vertex AI Veo",
    freeTierMonthlyLimit: 10,
    costPerVideo: 0.50,
    durationSeconds: 8,
    resolution: "1080p",
    enabled: true,
    envVarRequired: "GOOGLE_VEO_PROJECT_ID",
  },
  {
    id: "replicate_hunyuan",
    name: "Replicate HunyuanVideo",
    freeTierMonthlyLimit: 5,
    costPerVideo: 0.30,
    durationSeconds: 5,
    resolution: "720p",
    enabled: true,
    envVarRequired: "REPLICATE_API_TOKEN",
  },
  {
    id: "replicate_zeroscope",
    name: "Replicate ZeroScope v2 XL",
    freeTierMonthlyLimit: 40,
    costPerVideo: 0.04,
    durationSeconds: 3,
    resolution: "576p",
    enabled: true,
    envVarRequired: "REPLICATE_API_TOKEN",
  },
] as const;

/* ─── Helpers ──────────────────────────────────────────────────────── */

function isOrchestratorEnabled(): boolean {
  const v = process.env.CONTENTFLOW_VIDEO_ORCHESTRATOR_ENABLED;
  if (v === undefined || v === null || v === "") return true;
  return !/^(false|0|off|no)$/i.test(v.trim());
}

function isGlobalVideoEnabled(): boolean {
  const v = process.env.VIDEO_GENERATION_ENABLED;
  if (!v) return false;
  return /^(true|1|on|yes)$/i.test(v.trim());
}

function isProviderAvailable(p: VideoProvider): boolean {
  if (!p.enabled) return false;
  if (p.envVarRequired && !process.env[p.envVarRequired]) return false;
  return true;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/* ─── Replicate poll loop (shared by SVD / Wan / Hunyuan / ZeroScope) */

async function pollReplicate(
  key: string,
  predUrl: string,
  deadline: number,
): Promise<{ ok: boolean; output?: any; error?: string; status?: string }> {
  let pred: any = null;
  const initial = await fetchWithTimeout(
    predUrl,
    { method: "GET", headers: { Authorization: `Token ${key}` } },
    10_000,
  ).catch(() => null);
  if (!initial || !initial.ok) return { ok: false, error: "replicate poll initial failed" };
  pred = await initial.json().catch(() => null);

  while (pred && pred.status !== "succeeded" && pred.status !== "failed" && pred.status !== "canceled" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500));
    const r = await fetchWithTimeout(
      predUrl,
      { method: "GET", headers: { Authorization: `Token ${key}` } },
      10_000,
    ).catch(() => null);
    if (!r || !r.ok) break;
    pred = await r.json().catch(() => pred);
  }
  if (pred?.status !== "succeeded") {
    return { ok: false, error: pred?.error || `status=${pred?.status}`, status: pred?.status };
  }
  return { ok: true, output: pred.output, status: pred.status };
}

/* ─── Provider implementations ─────────────────────────────────────── */

interface ProviderResult {
  ok: boolean;
  videoBuffer?: Buffer;
  videoUrl?: string;
  error?: string;
}

async function callHuggingFaceCogVideo(prompt: string, opts: VideoGenOpts): Promise<ProviderResult> {
  try {
    const key = process.env.HUGGINGFACE_API_KEY;
    if (!key) return { ok: false, error: "HUGGINGFACE_API_KEY missing" };
    const res = await fetchWithTimeout(
      "https://api-inference.huggingface.co/models/THUDM/CogVideoX-5b",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Accept: "video/mp4",
        },
        body: JSON.stringify({ inputs: prompt, parameters: { num_frames: 49, fps: 8 } }),
      },
      opts.timeoutMs ?? 180_000,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `huggingface ${res.status}: ${text.slice(0, 200)}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 4096) return { ok: false, error: "huggingface: response too small" };
    return { ok: true, videoBuffer: buf };
  } catch (err: any) {
    return { ok: false, error: `huggingface_cogvideo: ${err?.message || err}` };
  }
}

async function callReplicateGeneric(
  prompt: string,
  opts: VideoGenOpts,
  model: string,
  version: string,
  buildInput: (prompt: string, imageUrl?: string) => Record<string, any>,
  label: string,
): Promise<ProviderResult> {
  try {
    const key = process.env.REPLICATE_API_TOKEN;
    if (!key) return { ok: false, error: "REPLICATE_API_TOKEN missing" };
    const createRes = await fetchWithTimeout(
      "https://api.replicate.com/v1/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${key}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({
          version,
          input: buildInput(prompt, opts.imageUrl),
        }),
      },
      opts.timeoutMs ?? 60_000,
    );
    if (!createRes.ok) {
      const text = await createRes.text().catch(() => "");
      return { ok: false, error: `${label} create ${createRes.status}: ${text.slice(0, 200)}` };
    }
    let pred = await createRes.json().catch(() => null) as any;
    if (!pred?.id) return { ok: false, error: `${label}: no prediction id` };

    /* If Prefer:wait already returned terminal, skip the poll. */
    const deadline = Date.now() + (opts.timeoutMs ?? 240_000);
    if (pred.status !== "succeeded" && pred.status !== "failed" && pred.status !== "canceled") {
      const polled = await pollReplicate(key, pred.urls?.get ?? `https://api.replicate.com/v1/predictions/${pred.id}`, deadline);
      if (!polled.ok) return { ok: false, error: `${label}: ${polled.error}` };
      pred.output = polled.output;
    }

    const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
    if (!out || typeof out !== "string") return { ok: false, error: `${label}: no output url` };
    return { ok: true, videoUrl: out };
  } catch (err: any) {
    return { ok: false, error: `${label}: ${err?.message || err}` };
  }
}

async function callReplicateSVD(prompt: string, opts: VideoGenOpts): Promise<ProviderResult> {
  /* SVD is image-to-video — requires opts.imageUrl. Falls through if missing. */
  if (!opts.imageUrl) return { ok: false, error: "replicate_svd requires opts.imageUrl (image-to-video)" };
  return callReplicateGeneric(
    prompt, opts,
    "stability-ai/stable-video-diffusion",
    "3f0457e4619daac51203dedb472816fd4af51f3149bb1a0dbf2d7e02f3f15de1",
    (_p, imageUrl) => ({ input_image: imageUrl, video_length: "14_frames_with_svd", sizing_strategy: "maintain_aspect_ratio", frames_per_second: 6 }),
    "replicate_svd",
  );
}

async function callReplicateWan(prompt: string, opts: VideoGenOpts): Promise<ProviderResult> {
  return callReplicateGeneric(
    prompt, opts,
    "wavespeedai/wan-2.1-i2v-720p",
    "0e23f9bef0e0e9b5ce0cf3a3f4c2ab8b2a01dcd5a7be8e0e9e62fb0e0a1d6f97",
    (p, imageUrl) => imageUrl ? { image: imageUrl, prompt: p, num_frames: 81 } : { prompt: p, num_frames: 81 },
    "replicate_wan",
  );
}

async function callReplicateHunyuan(prompt: string, opts: VideoGenOpts): Promise<ProviderResult> {
  return callReplicateGeneric(
    prompt, opts,
    "tencent/hunyuan-video",
    "6c9132a36e4c4d3a0d7f4d3a8b2c0a1f6c9132a36e4c4d3a0d7f4d3a8b2c0a1f",
    (p) => ({ prompt: p, video_length: 129, width: 1280, height: 720 }),
    "replicate_hunyuan",
  );
}

async function callReplicateZeroScope(prompt: string, opts: VideoGenOpts): Promise<ProviderResult> {
  return callReplicateGeneric(
    prompt, opts,
    "cjwbw/zeroscope-v2-xl",
    "9f747673945c62801b13b84701c783929c0ee784e4748ec062204894dda1a351",
    (p) => ({ prompt: p, num_frames: 24, fps: 8, width: 1024, height: 576 }),
    "replicate_zeroscope",
  );
}

async function callGoogleVeo(prompt: string, opts: VideoGenOpts): Promise<ProviderResult> {
  try {
    const projectId = process.env.GOOGLE_VEO_PROJECT_ID;
    if (!projectId) return { ok: false, error: "GOOGLE_VEO_PROJECT_ID missing" };
    /* Vertex AI auth uses ADC via GOOGLE_APPLICATION_CREDENTIALS_JSON.
     * Lazy-import google-auth-library so we don't pay the cost when Veo
     * isn't in the rotation. The library is already a transitive dep
     * through other Google SDKs in this project. */
    let GoogleAuth: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      GoogleAuth = require("google-auth-library").GoogleAuth;
    } catch {
      return { ok: false, error: "google_veo: google-auth-library not installed" };
    }
    const credJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    const auth = credJson
      ? new GoogleAuth({ credentials: JSON.parse(credJson), scopes: ["https://www.googleapis.com/auth/cloud-platform"] })
      : new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const client = await auth.getClient();
    const tokenResp = await client.getAccessToken();
    const token = typeof tokenResp === "string" ? tokenResp : tokenResp?.token;
    if (!token) return { ok: false, error: "google_veo: failed to acquire access token" };

    const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/veo-001:predictLongRunning`;
    const createRes = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, durationSeconds: 8 } }),
      },
      opts.timeoutMs ?? 60_000,
    );
    if (!createRes.ok) {
      const text = await createRes.text().catch(() => "");
      return { ok: false, error: `google_veo create ${createRes.status}: ${text.slice(0, 200)}` };
    }
    const opJson = await createRes.json().catch(() => null) as any;
    const opName: string | undefined = opJson?.name;
    if (!opName) return { ok: false, error: "google_veo: no operation name returned" };

    /* Poll the long-running operation. Veo takes 30-90s typically. */
    const deadline = Date.now() + (opts.timeoutMs ?? 240_000);
    const fetchOp = `https://us-central1-aiplatform.googleapis.com/v1/${opName}`;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4_000));
      const opRes = await fetchWithTimeout(
        fetchOp,
        { method: "GET", headers: { Authorization: `Bearer ${token}` } },
        15_000,
      ).catch(() => null);
      if (!opRes || !opRes.ok) continue;
      const op = await opRes.json().catch(() => null) as any;
      if (op?.done === true) {
        if (op.error) return { ok: false, error: `google_veo op error: ${op.error?.message || "unknown"}` };
        const video = op.response?.videos?.[0] ?? op.response?.predictions?.[0];
        const url = video?.uri ?? video?.gcsUri ?? video?.videoUri;
        const b64 = video?.bytesBase64Encoded;
        if (url) return { ok: true, videoUrl: url };
        if (b64) return { ok: true, videoBuffer: Buffer.from(b64, "base64") };
        return { ok: false, error: "google_veo: operation done but no video payload" };
      }
    }
    return { ok: false, error: "google_veo: operation timed out" };
  } catch (err: any) {
    return { ok: false, error: `google_veo: ${err?.message || err}` };
  }
}

async function callProvider(id: VideoProviderId, prompt: string, opts: VideoGenOpts): Promise<ProviderResult> {
  switch (id) {
    case "huggingface_cogvideo": return callHuggingFaceCogVideo(prompt, opts);
    case "replicate_wan":        return callReplicateWan(prompt, opts);
    case "replicate_svd":        return callReplicateSVD(prompt, opts);
    case "google_veo":           return callGoogleVeo(prompt, opts);
    case "replicate_hunyuan":    return callReplicateHunyuan(prompt, opts);
    case "replicate_zeroscope":  return callReplicateZeroScope(prompt, opts);
  }
}

/* ─── Rotation strategy ────────────────────────────────────────────── */

function getRotationOrder(opts: VideoGenOpts): VideoProvider[] {
  if (opts.forceProvider) {
    const forced = VIDEO_PROVIDERS.find((p) => p.id === opts.forceProvider);
    return forced ? [forced] : [];
  }
  /* SVD requires an image. Drop it from rotation when no imageUrl. */
  return VIDEO_PROVIDERS.filter((p) => isProviderAvailable(p) && (p.id !== "replicate_svd" || !!opts.imageUrl));
}

/* ─── Public entry point ──────────────────────────────────────────── */

/**
 * Generate a video via the orchestrator. NEVER throws — returns
 * ok:false on total failure so the caller can keep moving.
 */
export async function generateVideoViaOrchestrator(
  prompt: string,
  opts: VideoGenOpts = {},
): Promise<VideoOrchestratorSuccess | VideoOrchestratorFailure> {
  const t0 = Date.now();
  const chain: string[] = [];

  if (!isOrchestratorEnabled()) {
    return { ok: false, reason: "orchestrator_disabled", fallback_chain: [] };
  }
  if (!isGlobalVideoEnabled()) {
    return { ok: false, reason: "video_generation_disabled_globally", fallback_chain: [] };
  }
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return { ok: false, reason: "empty_prompt", fallback_chain: [] };
  }

  const rotation = getRotationOrder(opts);
  if (rotation.length === 0) {
    return { ok: false, reason: "no_provider_available", fallback_chain: [] };
  }

  for (const provider of rotation) {
    chain.push(provider.id);
    const result = await callProvider(provider.id, prompt, opts);
    if (!result.ok || (!result.videoBuffer && !result.videoUrl)) {
      logger.warn(`provider=${provider.id} failed: ${result.error}`);
      continue;
    }
    logger.info(
      `success provider=${provider.id} duration_ms=${Date.now() - t0} ` +
      `payload=${result.videoBuffer ? `buffer:${result.videoBuffer.length}` : `url`}`,
    );
    return {
      ok: true,
      videoBuffer: result.videoBuffer,
      videoUrl: result.videoUrl,
      providerUsed: provider.id,
      durationSec: provider.durationSeconds,
      cost: provider.costPerVideo,
      resolution: provider.resolution,
      fallback_chain: chain,
    };
  }

  return { ok: false, reason: "all_providers_failed", fallback_chain: chain };
}
