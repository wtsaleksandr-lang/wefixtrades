/**
 * ContentFlow — multi-model image orchestrator.
 *
 * Goal: produce images that pass AI-image detectors at higher rates than
 * single-model output, while using $0 free tiers for the bulk of
 * generation. Rotates across 6 providers (5 free-tier + 1 paid fallback),
 * runs a detector pre-check, and for paying tiers generates two candidates
 * in parallel and keeps the one with the lower AI-detection score.
 *
 * Provider rotation (FREE → PAID):
 *   1. Pollinations.ai          — completely free, no auth
 *   2. Hugging Face FLUX.1-schnell — free tier, env HUGGINGFACE_API_KEY
 *   3. Stability AI (SD3)       — 10 free credits/mo, env STABILITY_API_KEY
 *   4. Together AI FLUX schnell — free tier, env TOGETHER_API_KEY
 *   5. Replicate SDXL           — free signup credits, env REPLICATE_API_TOKEN
 *   6. DALL-E 3 (OpenAI)        — paid fallback only, env OPENAI_API_KEY
 *   7. Google Imagen 4          — premium photoreal (Vertex AI / ADC auth);
 *                                 photoreal #2 (on-image TEXT specialist),
 *                                 $0.04-0.06/img
 *   8. FLUX.2 pro (fal.ai)      — photoreal PRIMARY; leads
 *                                 PHOTOREAL_PROVIDER_ORDER, env FAL_KEY,
 *                                 $0.03 first MP + $0.015/extra MP (≤4MP)
 *
 * Detector pre-check: stubbed via callDetector(). Sightengine wiring is
 * scaffolded but disabled until SIGHTENGINE_USER + SIGHTENGINE_SECRET are
 * present; until then the stub returns 0.5 so logic still flows. Score is
 * 0..1 where higher = MORE likely to be flagged AI. The orchestrator
 * keeps the candidate with the LOWER score.
 *
 * Post-processing: never skipped here — the caller in
 * imageGenerationService still owns the postProcessAIImage() step. This
 * module returns raw provider bytes; post-process happens once on the
 * winning candidate.
 *
 * Feature flag: CONTENTFLOW_IMAGE_ORCHESTRATOR_ENABLED (default true).
 * When false, callers should bypass and use the legacy imageRotator path.
 *
 * NEVER throws. On total failure, returns ok:false so the caller can fall
 * back to the legacy rotator and the publish pipeline keeps moving.
 */

import { createLogger } from "../../lib/logger";

const logger = createLogger("ImageOrchestrator");

/* ─── Types ────────────────────────────────────────────────────────── */

export type ImageProviderId =
  | "pollinations"
  | "huggingface_flux"
  | "stability"
  | "together_flux"
  | "replicate_sdxl"
  | "dalle"
  | "imagen4"
  | "gemini_flash_image"
  | "flux2_pro";

export interface ImageProvider {
  id: ImageProviderId;
  name: string;
  costPerImage: number;    // USD; 0 for free tier
  qualityScore: number;    // 0-100, updated over time
  detectorPassScore: number; // historical avg ai-detector pass rate (0-100, higher = more likely to pass as human)
  enabled: boolean;
  envVarRequired?: string;
  /** Provider is available when ANY of these env vars is present (used by
   *  providers with aliased config, e.g. imagen4's project-id envs). */
  envVarAnyOf?: readonly string[];
}

export interface ImageGenOpts {
  size?: "1024x1024" | "1024x1536" | "1536x1024";
  /**
   * Explicit pixel dimensions. When set, OVERRIDES `size`. Lets the
   * portal request aspect ratios beyond the fixed three (e.g. 16:9 or
   * 9:16 social formats) on providers that accept arbitrary width/height.
   * Callers should pre-validate against provider limits; the orchestrator
   * clamps to a sane range as a backstop. Falls back to `size`/1024² when
   * unset, so existing behaviour is unchanged.
   */
  dimensions?: { width: number; height: number };
  /** Customer tier — drives single-vs-multi-candidate. */
  customerTier?: "free" | "creator" | "studio" | "agency" | string | null;
  /** Force a specific provider (debug / admin override). */
  forceProvider?: ImageProviderId;
  /** Skip detector pre-check (debug). */
  skipDetector?: boolean;
  /** Per-call timeout for one provider attempt. */
  timeoutMs?: number;
  /**
   * "Realistic mode". When true, the orchestrator walks
   * PHOTOREAL_PROVIDER_ORDER first (highest-photorealism providers),
   * before falling back to the normal cost-optimised rotation. The
   * prompt-side photoreal augmentation is applied by the CALLER (see
   * buildPhotorealPrompt in imageGenerationService / contentflow route);
   * this flag only governs PROVIDER selection here.
   */
  photoreal?: boolean;
}

export interface OrchestratorResult {
  ok: true;
  imageBuffer: Buffer;
  providerUsed: string;
  detectorScore?: number;     // 0..1, lower = better (less AI-flagged)
  cost: number;               // USD
  candidates_tried: number;
  fallback_chain: string[];   // providers attempted in order
}

export interface OrchestratorFailure {
  ok: false;
  reason: string;
  fallback_chain: string[];
}

/* ─── Registry ─────────────────────────────────────────────────────── */

/**
 * Provider rotation list. Order MATTERS — single-candidate mode walks
 * this list top-to-bottom. Free providers first so the bulk of customer
 * volume runs at $0. quality / detectorPassScore are seeded with rough
 * estimates and should be updated from telemetry over time.
 */
export const IMAGE_PROVIDERS: readonly ImageProvider[] = [
  {
    id: "pollinations",
    name: "Pollinations.ai (FLUX)",
    costPerImage: 0,
    qualityScore: 70,
    detectorPassScore: 65,
    enabled: true,
    // No env needed — fully open endpoint
  },
  {
    id: "huggingface_flux",
    name: "Hugging Face FLUX.1-schnell",
    costPerImage: 0,
    qualityScore: 78,
    detectorPassScore: 60,
    enabled: true,
    envVarRequired: "HUGGINGFACE_API_KEY",
  },
  {
    id: "stability",
    name: "Stability AI SD3",
    costPerImage: 0,         // free tier credits
    qualityScore: 80,
    detectorPassScore: 62,
    enabled: true,
    envVarRequired: "STABILITY_API_KEY",
  },
  {
    id: "together_flux",
    name: "Together AI FLUX schnell",
    costPerImage: 0,
    qualityScore: 76,
    detectorPassScore: 63,
    enabled: true,
    envVarRequired: "TOGETHER_API_KEY",
  },
  {
    id: "replicate_sdxl",
    name: "Replicate SDXL",
    costPerImage: 0,         // free signup credits
    qualityScore: 75,
    detectorPassScore: 58,
    enabled: true,
    envVarRequired: "REPLICATE_API_TOKEN",
  },
  {
    id: "dalle",
    name: "OpenAI DALL-E 3",
    costPerImage: 0.04,      // paid fallback
    qualityScore: 88,
    detectorPassScore: 45,   // most "AI-looking" of the bunch
    enabled: true,
    envVarRequired: "OPENAI_API_KEY",
  },

  /* ─────────────────────────────────────────────────────────────────
   * PHOTOREAL PROVIDERS — premium photoreal models plug in HERE.
   *
   * Imagen 4 and FLUX.2 pro (below) are wired. To add the NEXT one:
   *   1. Append an ImageProvider entry below (LAST — premium providers
   *      absorb normal-rotation fallthrough only; free tiers stay first).
   *   2. Add the id to the ImageProviderId union above.
   *   3. Implement a call<Provider>() function and wire it into
   *      callProvider()'s switch (see ~callProvider, "PHOTOREAL DISPATCH"
   *      marker).
   *   4. Slot the id into PHOTOREAL_PROVIDER_ORDER below so realistic
   *      mode prefers it.
   * Nothing else changes — the gate/cost/persist pipeline is provider-
   * agnostic.
   * ───────────────────────────────────────────────────────────────── */
  {
    id: "imagen4",
    name: "Google Imagen 4 (Vertex AI)",
    /* $0.04/img standard (imagen-4.0-generate-001). Photoreal requests use
     * Ultra (imagen-4.0-ultra-generate-001) at $0.06/img — callImagen4
     * reports the actual per-call cost via ProviderResult.costUsd, which
     * overrides this registry figure. NOTE: every Imagen output carries a
     * non-optional SynthID watermark (invisible, Google-detectable). */
    costPerImage: 0.04,
    qualityScore: 92,        // standout: on-image TEXT rendering
    detectorPassScore: 55,
    enabled: true,
    /* Vertex AI auth = ADC / service-account JSON, NOT an API key. The
     * provider is considered available when a project id is configured;
     * credential acquisition degrades gracefully inside callImagen4. */
    envVarAnyOf: ["GOOGLE_IMAGEN_PROJECT_ID", "GOOGLE_VEO_PROJECT_ID"],
  },
  {
    id: "gemini_flash_image",
    name: "Google Gemini 2.5 Flash Image",
    /* Gemini 2.5 Flash Image ("nano-banana") via the Generative Language
     * REST API — a simple API KEY (GEMINI_API_KEY), NOT Vertex ADC, so it is
     * the most reliably-configured Google photoreal path (no service-account
     * JSON to provision). ~$0.039/img. Outputs carry an invisible SynthID
     * watermark like Imagen. Strong photoreal + image-edit model; here it is
     * wired for text→image generation as a resilient backup that cannot be
     * locked by a prepaid balance (unlike fal). */
    costPerImage: 0.039,
    qualityScore: 91,
    detectorPassScore: 58,
    enabled: true,
    envVarRequired: "GEMINI_API_KEY",
  },
  {
    id: "flux2_pro",
    name: "FLUX.2 pro (fal.ai)",
    /* fal.ai bills by output megapixels: $0.03 for the first MP +
     * $0.015/extra MP (native up to 4MP). This registry figure is the
     * 1MP base; callFlux2Pro reports the actual per-call cost via
     * ProviderResult.costUsd (computed from output megapixels), which
     * overrides this figure — same convention as imagen4. */
    costPerImage: 0.03,
    qualityScore: 94,        // photoreal PRIMARY — above imagen4 (92)
    detectorPassScore: 60,   // seed estimate; update from telemetry
    enabled: true,
    envVarRequired: "FAL_KEY",
  },
] as const;

/**
 * Realistic-mode provider preference. When ImageGenOpts.photoreal is set,
 * the orchestrator tries these ids (in order, if available) BEFORE the
 * normal cost-optimised rotation.
 *
 * FLUX.2 pro (fal.ai) leads — it is the photoreal PRIMARY. Imagen 4 stays
 * second as the on-image-TEXT specialist (its standout capability) and the
 * fallthrough when FAL_KEY is absent or fal errors. To promote a future
 * provider, drop its id at the FRONT of this list — realistic-mode default
 * changes by config, no further code change required.
 */
export const PHOTOREAL_PROVIDER_ORDER: readonly ImageProviderId[] = [
  "flux2_pro",
  "imagen4",
  "gemini_flash_image",
  "stability",
  "dalle",
  "pollinations",
  "together_flux",
  "huggingface_flux",
  "replicate_sdxl",
] as const;

/* ─── Helpers ──────────────────────────────────────────────────────── */

function isOrchestratorEnabled(): boolean {
  const v = process.env.CONTENTFLOW_IMAGE_ORCHESTRATOR_ENABLED;
  if (v === undefined || v === null || v === "") return true;
  return !/^(false|0|off|no)$/i.test(v.trim());
}

function isProviderAvailable(p: ImageProvider): boolean {
  if (!p.enabled) return false;
  if (p.envVarRequired && !process.env[p.envVarRequired]) return false;
  if (p.envVarAnyOf && !p.envVarAnyOf.some((name) => !!process.env[name])) return false;
  return true;
}

function isMultiCandidateTier(tier: string | null | undefined): boolean {
  if (!tier) return false;
  const t = String(tier).toLowerCase();
  return t === "studio" || t === "agency";
}

/** Clamp a requested pixel dimension into a provider-safe range. Most of
 *  the wired providers accept 256..1536; we clamp to that and round to the
 *  nearest multiple of 64 (SDXL/FLUX requirement) to avoid 400s. */
function clampDim(n: number): number {
  const lo = 256, hi = 1536;
  const clamped = Math.max(lo, Math.min(hi, Math.round(n)));
  return Math.round(clamped / 64) * 64;
}

function parseDims(opts: ImageGenOpts): { width: number; height: number } {
  /* Explicit dimensions (arbitrary aspect ratio) win when provided. */
  if (opts.dimensions && opts.dimensions.width > 0 && opts.dimensions.height > 0) {
    return { width: clampDim(opts.dimensions.width), height: clampDim(opts.dimensions.height) };
  }
  switch (opts.size) {
    case "1024x1536": return { width: 1024, height: 1536 };
    case "1536x1024": return { width: 1536, height: 1024 };
    default:          return { width: 1024, height: 1024 };
  }
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

/* ─── Provider implementations ─────────────────────────────────────── */

interface ProviderResult {
  ok: boolean;
  buffer?: Buffer;
  error?: string;
  /** Actual USD cost of THIS call, when it differs per-call from the
   *  registry costPerImage (e.g. imagen4 standard vs ultra). When set, it
   *  overrides the registry figure in the orchestrator's returned cost. */
  costUsd?: number;
}

async function callPollinations(prompt: string, opts: ImageGenOpts): Promise<ProviderResult> {
  try {
    const { width, height } = parseDims(opts);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&width=${width}&height=${height}&nologo=true`;
    const res = await fetchWithTimeout(url, { method: "GET" }, opts.timeoutMs ?? 45_000);
    if (!res.ok) return { ok: false, error: `pollinations ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) return { ok: false, error: "pollinations: response too small" };
    return { ok: true, buffer: buf };
  } catch (err: any) {
    return { ok: false, error: `pollinations: ${err?.message || err}` };
  }
}

async function callHuggingFaceFlux(prompt: string, opts: ImageGenOpts): Promise<ProviderResult> {
  try {
    const key = process.env.HUGGINGFACE_API_KEY;
    if (!key) return { ok: false, error: "HUGGINGFACE_API_KEY missing" };
    const res = await fetchWithTimeout(
      "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Accept: "image/png",
        },
        body: JSON.stringify({ inputs: prompt }),
      },
      opts.timeoutMs ?? 60_000,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `huggingface ${res.status}: ${text.slice(0, 200)}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) return { ok: false, error: "huggingface: response too small" };
    return { ok: true, buffer: buf };
  } catch (err: any) {
    return { ok: false, error: `huggingface: ${err?.message || err}` };
  }
}

async function callStability(prompt: string, opts: ImageGenOpts): Promise<ProviderResult> {
  try {
    const key = process.env.STABILITY_API_KEY;
    if (!key) return { ok: false, error: "STABILITY_API_KEY missing" };
    const { width, height } = parseDims(opts);
    /* SD3 endpoint expects multipart/form-data per official docs. */
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("output_format", "png");
    form.append("aspect_ratio", width === height ? "1:1" : width > height ? "3:2" : "2:3");
    const res = await fetchWithTimeout(
      "https://api.stability.ai/v2beta/stable-image/generate/sd3",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "image/*",
        },
        body: form as any,
      },
      opts.timeoutMs ?? 60_000,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `stability ${res.status}: ${text.slice(0, 200)}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) return { ok: false, error: "stability: response too small" };
    return { ok: true, buffer: buf };
  } catch (err: any) {
    return { ok: false, error: `stability: ${err?.message || err}` };
  }
}

async function callTogetherFlux(prompt: string, opts: ImageGenOpts): Promise<ProviderResult> {
  try {
    const key = process.env.TOGETHER_API_KEY;
    if (!key) return { ok: false, error: "TOGETHER_API_KEY missing" };
    const { width, height } = parseDims(opts);
    const res = await fetchWithTimeout(
      "https://api.together.xyz/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "black-forest-labs/FLUX.1-schnell-Free",
          prompt,
          width,
          height,
          steps: 4,
          n: 1,
          response_format: "b64_json",
        }),
      },
      opts.timeoutMs ?? 60_000,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `together ${res.status}: ${text.slice(0, 200)}` };
    }
    const json = await res.json().catch(() => null) as any;
    const item = json?.data?.[0];
    if (item?.b64_json) {
      return { ok: true, buffer: Buffer.from(item.b64_json, "base64") };
    }
    if (item?.url) {
      const fetched = await fetchWithTimeout(item.url, { method: "GET" }, opts.timeoutMs ?? 30_000);
      if (!fetched.ok) return { ok: false, error: `together fetch url ${fetched.status}` };
      return { ok: true, buffer: Buffer.from(await fetched.arrayBuffer()) };
    }
    return { ok: false, error: "together: no image in response" };
  } catch (err: any) {
    return { ok: false, error: `together: ${err?.message || err}` };
  }
}

async function callReplicateSDXL(prompt: string, opts: ImageGenOpts): Promise<ProviderResult> {
  try {
    const key = process.env.REPLICATE_API_TOKEN;
    if (!key) return { ok: false, error: "REPLICATE_API_TOKEN missing" };
    const { width, height } = parseDims(opts);
    /* Replicate is async — create prediction, then poll. SDXL latest
     * version pinned for reproducibility. */
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
          version: "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
          input: { prompt, width, height, num_outputs: 1 },
        }),
      },
      opts.timeoutMs ?? 60_000,
    );
    if (!createRes.ok) {
      const text = await createRes.text().catch(() => "");
      return { ok: false, error: `replicate create ${createRes.status}: ${text.slice(0, 200)}` };
    }
    let pred = await createRes.json().catch(() => null) as any;
    /* Poll until terminal. Prefer:wait header gives us up to ~60s sync;
     * if still processing after that, poll a few times. */
    const deadline = Date.now() + (opts.timeoutMs ?? 60_000);
    while (pred && pred.status !== "succeeded" && pred.status !== "failed" && pred.status !== "canceled" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const pollRes = await fetchWithTimeout(
        pred.urls?.get ?? `https://api.replicate.com/v1/predictions/${pred.id}`,
        { method: "GET", headers: { Authorization: `Token ${key}` } },
        10_000,
      );
      if (!pollRes.ok) break;
      pred = await pollRes.json().catch(() => pred);
    }
    if (pred?.status !== "succeeded") {
      return { ok: false, error: `replicate status=${pred?.status} err=${pred?.error || ""}` };
    }
    const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
    if (!out || typeof out !== "string") return { ok: false, error: "replicate: no output url" };
    const fetched = await fetchWithTimeout(out, { method: "GET" }, opts.timeoutMs ?? 30_000);
    if (!fetched.ok) return { ok: false, error: `replicate fetch ${fetched.status}` };
    return { ok: true, buffer: Buffer.from(await fetched.arrayBuffer()) };
  } catch (err: any) {
    return { ok: false, error: `replicate: ${err?.message || err}` };
  }
}

async function callDalle(prompt: string, opts: ImageGenOpts): Promise<ProviderResult> {
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return { ok: false, error: "OPENAI_API_KEY missing" };
    const size = opts.size === "1024x1536" ? "1024x1792"
               : opts.size === "1536x1024" ? "1792x1024"
               : "1024x1024";
    const res = await fetchWithTimeout(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt,
          n: 1,
          size,
          response_format: "b64_json",
        }),
      },
      opts.timeoutMs ?? 60_000,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `dalle ${res.status}: ${text.slice(0, 200)}` };
    }
    const json = await res.json().catch(() => null) as any;
    const b64 = json?.data?.[0]?.b64_json;
    const url = json?.data?.[0]?.url;
    if (b64) return { ok: true, buffer: Buffer.from(b64, "base64") };
    if (url) {
      const fetched = await fetchWithTimeout(url, { method: "GET" }, opts.timeoutMs ?? 30_000);
      if (!fetched.ok) return { ok: false, error: `dalle fetch ${fetched.status}` };
      return { ok: true, buffer: Buffer.from(await fetched.arrayBuffer()) };
    }
    return { ok: false, error: "dalle: no image in response" };
  } catch (err: any) {
    return { ok: false, error: `dalle: ${err?.message || err}` };
  }
}

/* ─── Google Imagen 4 (Vertex AI) ──────────────────────────────────── */

/** Imagen 4 model IDs + per-image cost, expressed in micro-USD to match the
 *  generation_cost_micro_usd convention used by draft cost tracking
 *  (storage.addDraftGenerationCost). $0.04 = 40,000 µUSD; $0.06 = 60,000. */
const IMAGEN4_MODEL_STANDARD = "imagen-4.0-generate-001";
const IMAGEN4_MODEL_ULTRA = "imagen-4.0-ultra-generate-001";
export const IMAGEN4_COST_MICRO_USD: Readonly<Record<string, number>> = {
  [IMAGEN4_MODEL_STANDARD]: 40_000, // $0.04/img
  [IMAGEN4_MODEL_ULTRA]: 60_000,    // $0.06/img
};

/** Aspect ratios Imagen 4 supports, with their numeric width/height ratio
 *  and the pixel dimensions a "1K" sample produces for that ratio. */
const IMAGEN4_ASPECTS: ReadonlyArray<{ id: string; ratio: number; oneK: { w: number; h: number } }> = [
  { id: "1:1", ratio: 1, oneK: { w: 1024, h: 1024 } },
  { id: "3:4", ratio: 3 / 4, oneK: { w: 896, h: 1280 } },
  { id: "4:3", ratio: 4 / 3, oneK: { w: 1280, h: 896 } },
  { id: "16:9", ratio: 16 / 9, oneK: { w: 1408, h: 768 } },
  { id: "9:16", ratio: 9 / 16, oneK: { w: 768, h: 1408 } },
];

/**
 * Map requested pixel dimensions onto Imagen 4's fixed parameter space:
 * nearest supported aspect ratio (log-scale distance, so 2:1 is as far
 * from 1:1 as 1:2) + 1K/2K sample size ("2K" only when the request
 * exceeds what a 1K sample of that aspect delivers). Exported for unit
 * tests.
 */
export function mapDimsToImagen4Params(
  width: number,
  height: number,
): { aspectRatio: string; sampleImageSize: "1K" | "2K" } {
  const ratio = width > 0 && height > 0 ? width / height : 1;
  let best = IMAGEN4_ASPECTS[0];
  let bestDist = Infinity;
  for (const a of IMAGEN4_ASPECTS) {
    const dist = Math.abs(Math.log(ratio) - Math.log(a.ratio));
    if (dist < bestDist) { best = a; bestDist = dist; }
  }
  const sampleImageSize: "1K" | "2K" =
    width > best.oneK.w || height > best.oneK.h ? "2K" : "1K";
  return { aspectRatio: best.id, sampleImageSize };
}

/** Test seam — lets the unit test inject a fake token acquirer so the
 *  request/response mapping can be exercised without live GCP auth. */
export interface Imagen4Deps {
  getAccessToken?: () => Promise<string | null>;
}

/**
 * Google Imagen 4 via the Vertex AI REST predict endpoint.
 *
 * Auth = Application Default Credentials / service-account JSON
 * (GOOGLE_APPLICATION_CREDENTIALS_JSON), NOT an API key — mirrors the
 * callGoogleVeo() pattern in videoOrchestrator.ts. Skips gracefully (clear
 * log, ok:false) when project/creds are absent so the rotation falls
 * through to the next provider.
 *
 * Model: imagen-4.0-generate-001 by default; imagen-4.0-ultra-generate-001
 * when the request is photoreal. NOTE: every Imagen 4 output carries a
 * non-optional SynthID watermark (invisible, Google-detectable) — there is
 * no API switch to disable it. Imagen's standout capability is on-image
 * TEXT rendering.
 */
export async function callImagen4(
  prompt: string,
  opts: ImageGenOpts,
  deps?: Imagen4Deps,
): Promise<ProviderResult> {
  try {
    const projectId = process.env.GOOGLE_IMAGEN_PROJECT_ID || process.env.GOOGLE_VEO_PROJECT_ID;
    if (!projectId) {
      logger.info("imagen4: skipped — GOOGLE_IMAGEN_PROJECT_ID / GOOGLE_VEO_PROJECT_ID not set");
      return { ok: false, error: "imagen4: GOOGLE_IMAGEN_PROJECT_ID / GOOGLE_VEO_PROJECT_ID missing" };
    }
    const region = process.env.GOOGLE_IMAGEN_REGION || "us-central1";

    let token: string | null = null;
    if (deps?.getAccessToken) {
      token = await deps.getAccessToken();
    } else {
      /* Vertex AI auth uses ADC via GOOGLE_APPLICATION_CREDENTIALS_JSON.
       * Lazy-import google-auth-library so we don't pay the cost when
       * imagen4 isn't in the rotation — same pattern as callGoogleVeo(). */
      let GoogleAuth: any;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        GoogleAuth = require("google-auth-library").GoogleAuth;
      } catch {
        logger.info("imagen4: skipped — google-auth-library not installed");
        return { ok: false, error: "imagen4: google-auth-library not installed" };
      }
      const credJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
      const auth = credJson
        ? new GoogleAuth({ credentials: JSON.parse(credJson), scopes: ["https://www.googleapis.com/auth/cloud-platform"] })
        : new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
      try {
        const client = await auth.getClient();
        const tokenResp = await client.getAccessToken();
        token = typeof tokenResp === "string" ? tokenResp : tokenResp?.token ?? null;
      } catch (authErr: any) {
        logger.info(`imagen4: skipped — credentials unavailable (${authErr?.message || authErr})`);
        return { ok: false, error: "imagen4: credentials unavailable" };
      }
    }
    if (!token) {
      logger.info("imagen4: skipped — failed to acquire access token");
      return { ok: false, error: "imagen4: failed to acquire access token" };
    }

    const model = opts.photoreal ? IMAGEN4_MODEL_ULTRA : IMAGEN4_MODEL_STANDARD;
    /* Imagen takes aspectRatio + sampleImageSize, not raw pixels — map from
     * the ORIGINAL requested dimensions (parseDims clamps to 1536 which
     * would distort wide ratios like 1920x1080 → 4:3 instead of 16:9). */
    const { width, height } =
      opts.dimensions && opts.dimensions.width > 0 && opts.dimensions.height > 0
        ? opts.dimensions
        : parseDims(opts);
    const { aspectRatio, sampleImageSize } = mapDimsToImagen4Params(width, height);

    const endpoint =
      `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}` +
      `/locations/${region}/publishers/google/models/${model}:predict`;
    const res = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio, sampleImageSize },
        }),
      },
      opts.timeoutMs ?? 60_000,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `imagen4 ${res.status}: ${text.slice(0, 200)}` };
    }
    const json = await res.json().catch(() => ({})) as any; // body-parse fallback — error surfaces below
    const b64 = json?.predictions?.[0]?.bytesBase64Encoded;
    if (!b64 || typeof b64 !== "string") {
      return { ok: false, error: "imagen4: no image in response" };
    }
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 1024) return { ok: false, error: "imagen4: response too small" };
    return { ok: true, buffer: buf, costUsd: IMAGEN4_COST_MICRO_USD[model] / 1_000_000 };
  } catch (err: any) {
    return { ok: false, error: `imagen4: ${err?.message || err}` };
  }
}

/* ─── FLUX.2 pro (fal.ai) ──────────────────────────────────────────── */

/** fal.ai synchronous run endpoint for FLUX.2 pro. Images complete well
 *  inside the request window, so the direct run endpoint is standard
 *  (queue.fal.run exists for long jobs but isn't needed here). */
const FLUX2_ENDPOINT = "https://fal.run/fal-ai/flux-2-pro";

/** fal.ai FLUX.2 pro pricing: $0.03 for the first output megapixel +
 *  $0.015 per additional megapixel (native output up to 4MP). MP = 10^6
 *  pixels (SI megapixel, fal's billing unit). */
export const FLUX2_BASE_COST_USD = 0.03;
export const FLUX2_EXTRA_MP_COST_USD = 0.015;
/** Hard output cap — FLUX.2 pro generates natively up to 4MP. */
export const FLUX2_MAX_TOTAL_PIXELS = 4_000_000;

/**
 * Per-call cost from output megapixels: $0.03 covers the first MP, each
 * extra MP adds $0.015 (fractional MP prorated linearly), floor $0.03.
 * Exported for unit tests. NOTE: linear proration of partial MP matches
 * fal's published per-MP pricing; first live call should confirm against
 * the billed amount.
 */
export function computeFlux2CostUsd(width: number, height: number): number {
  const mp = (Math.max(0, width) * Math.max(0, height)) / 1_000_000;
  return Math.max(
    FLUX2_BASE_COST_USD,
    FLUX2_BASE_COST_USD + FLUX2_EXTRA_MP_COST_USD * (mp - 1),
  );
}

/**
 * Map requested pixel dimensions onto fal's `image_size` object. fal
 * accepts custom {width, height} at any aspect ratio, so unlike Imagen we
 * pass pixels through — with two adjustments, documented because fal's
 * validation rules should be confirmed on the first live call:
 *   1. Total pixels clamped to 4MP (FLUX.2 pro's native ceiling) by
 *      scaling down proportionally (aspect ratio preserved).
 *   2. Each side floored to a multiple of 16 (FLUX-family latent-grid
 *      requirement; flooring keeps us under the 4MP cap), minimum 256.
 * Exported for unit tests.
 */
export function mapDimsToFlux2Size(
  width: number,
  height: number,
): { width: number; height: number } {
  let w = width > 0 ? Math.round(width) : 1024;
  let h = height > 0 ? Math.round(height) : 1024;
  if (w * h > FLUX2_MAX_TOTAL_PIXELS) {
    const scale = Math.sqrt(FLUX2_MAX_TOTAL_PIXELS / (w * h));
    w = w * scale;
    h = h * scale;
  }
  w = Math.max(256, Math.floor(w / 16) * 16);
  h = Math.max(256, Math.floor(h / 16) * 16);
  /* Backstop for extreme aspect ratios where the 256 floor pushed the
   * total back over the cap — shrink the larger side to fit. */
  if (w * h > FLUX2_MAX_TOTAL_PIXELS) {
    if (w >= h) w = Math.max(256, Math.floor(FLUX2_MAX_TOTAL_PIXELS / h / 16) * 16);
    else h = Math.max(256, Math.floor(FLUX2_MAX_TOTAL_PIXELS / w / 16) * 16);
  }
  return { width: w, height: h };
}

/**
 * FLUX.2 pro via fal.ai — the photoreal PRIMARY provider.
 *
 * Auth: `Authorization: Key ${FAL_KEY}` header (fal convention, NOT
 * Bearer). Skips gracefully (clear log, ok:false, no network) when
 * FAL_KEY is absent so the rotation falls through — mirrors imagen4.
 * 429 / non-200 surface as ok:false with the status in the error, which
 * the orchestrator treats as standard fallthrough like every provider.
 *
 * FIELD-MAPPING NOTE: no prior fal.ai usage exists in this repo, so the
 * request body ({prompt, image_size:{width,height}, num_images:1}) and
 * response shape (images[{url,width,height}]) follow fal's documented
 * conventions for FLUX-family models. The mapping is isolated to this
 * function — the FIRST LIVE CALL should confirm the exact field names.
 */
export async function callFlux2Pro(prompt: string, opts: ImageGenOpts): Promise<ProviderResult> {
  try {
    const key = process.env.FAL_KEY;
    if (!key) {
      logger.info("flux2_pro: skipped — FAL_KEY not set");
      return { ok: false, error: "flux2_pro: FAL_KEY missing" };
    }
    /* fal accepts arbitrary custom dimensions — map from the ORIGINAL
     * requested dimensions (parseDims clamps to 1536 which would distort
     * large or wide requests), same rationale as callImagen4. */
    const { width, height } =
      opts.dimensions && opts.dimensions.width > 0 && opts.dimensions.height > 0
        ? opts.dimensions
        : parseDims(opts);
    const imageSize = mapDimsToFlux2Size(width, height);

    const res = await fetchWithTimeout(
      FLUX2_ENDPOINT,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          image_size: imageSize,
          num_images: 1,
        }),
      },
      opts.timeoutMs ?? 60_000,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `flux2_pro ${res.status}: ${text.slice(0, 200)}` };
    }
    const json = await res.json().catch(() => ({})) as any; // body-parse fallback — error surfaces below
    const img = json?.images?.[0];
    if (!img?.url || typeof img.url !== "string") {
      return { ok: false, error: "flux2_pro: no image in response" };
    }
    const fetched = await fetchWithTimeout(img.url, { method: "GET" }, opts.timeoutMs ?? 30_000);
    if (!fetched.ok) return { ok: false, error: `flux2_pro fetch ${fetched.status}` };
    const buf = Buffer.from(await fetched.arrayBuffer());
    if (buf.length < 1024) return { ok: false, error: "flux2_pro: response too small" };
    /* Per-call cost from OUTPUT megapixels — prefer the dimensions fal
     * reports on the image; fall back to what we requested. */
    const outW = typeof img.width === "number" && img.width > 0 ? img.width : imageSize.width;
    const outH = typeof img.height === "number" && img.height > 0 ? img.height : imageSize.height;
    return { ok: true, buffer: buf, costUsd: computeFlux2CostUsd(outW, outH) };
  } catch (err: any) {
    return { ok: false, error: `flux2_pro: ${err?.message || err}` };
  }
}

/* ─── Google Gemini 2.5 Flash Image ────────────────────────────────── */

/** Gemini 2.5 Flash Image ("nano-banana") generation model + flat per-image
 *  cost. Unlike fal/Imagen the price doesn't vary with megapixels, so the
 *  registry figure and the per-call costUsd are the same constant. */
const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
export const GEMINI_IMAGE_COST_USD = 0.039;

/**
 * Google Gemini 2.5 Flash Image via the Generative Language REST API.
 *
 * Auth: a plain API key (`GEMINI_API_KEY`) on the query string — NOT Vertex
 * ADC — which makes it the most reliably-configured Google image path (no
 * service-account JSON to provision, unlike callImagen4). Skips gracefully
 * (clear log, ok:false, NO network) when GEMINI_API_KEY is absent so the
 * rotation falls through — mirrors callFlux2Pro / callImagen4. Non-200 and
 * "no image part" surface as ok:false so the orchestrator treats them as
 * standard fallthrough; never throws.
 *
 * Generates text→image (no input image). The model emits ~1024px output and
 * does not take explicit pixel dimensions, so `opts` size/dimensions are not
 * forwarded; downstream post-processing owns any final resize. The image is
 * returned inline as base64 in candidates[0].content.parts[].inline_data.
 */
export async function callGeminiFlashImage(prompt: string, opts: ImageGenOpts): Promise<ProviderResult> {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      logger.info("gemini_flash_image: skipped — GEMINI_API_KEY not set");
      return { ok: false, error: "gemini_flash_image: GEMINI_API_KEY missing" };
    }
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
      },
      opts.timeoutMs ?? 60_000,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `gemini_flash_image ${res.status}: ${text.slice(0, 200)}` };
    }
    const json = await res.json().catch(() => ({})) as any; // body-parse fallback — error surfaces below
    const parts = json?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = Array.isArray(parts)
      ? parts.find((p: any) => p?.inline_data?.data || p?.inlineData?.data)
      : null;
    const b64 = imgPart?.inline_data?.data ?? imgPart?.inlineData?.data;
    if (!b64 || typeof b64 !== "string") {
      return { ok: false, error: "gemini_flash_image: no image in response" };
    }
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 1024) return { ok: false, error: "gemini_flash_image: response too small" };
    return { ok: true, buffer: buf, costUsd: GEMINI_IMAGE_COST_USD };
  } catch (err: any) {
    return { ok: false, error: `gemini_flash_image: ${err?.message || err}` };
  }
}

/** Dispatch by provider id. */
async function callProvider(
  id: ImageProviderId,
  prompt: string,
  opts: ImageGenOpts,
): Promise<ProviderResult> {
  switch (id) {
    case "pollinations":     return callPollinations(prompt, opts);
    case "huggingface_flux": return callHuggingFaceFlux(prompt, opts);
    case "stability":        return callStability(prompt, opts);
    case "together_flux":    return callTogetherFlux(prompt, opts);
    case "replicate_sdxl":   return callReplicateSDXL(prompt, opts);
    case "dalle":            return callDalle(prompt, opts);
    /* ── PHOTOREAL DISPATCH ──────────────────────────────────────────
     * Premium photoreal providers dispatch here. Keep the
     * ImageProviderId union + IMAGE_PROVIDERS + PHOTOREAL_PROVIDER_ORDER
     * in sync (see registry marker above). */
    case "imagen4":            return callImagen4(prompt, opts);
    case "gemini_flash_image": return callGeminiFlashImage(prompt, opts);
    case "flux2_pro":          return callFlux2Pro(prompt, opts);
  }
}

/* ─── Detector pre-check ──────────────────────────────────────────── */

/**
 * Call an AI-image detector and return a score 0..1 where higher = MORE
 * likely to be flagged as AI. We keep the candidate with the LOWER score.
 *
 * Real integration scaffolded for Sightengine — when SIGHTENGINE_USER +
 * SIGHTENGINE_SECRET are present we POST the image and read the
 * `type.ai_generated` field (0..1). Without those secrets we return 0.5
 * (a neutral pseudo-score) so the orchestrator's logic still flows and
 * the first successful candidate wins by default.
 *
 * NEVER throws.
 */
export async function callDetector(buffer: Buffer): Promise<number> {
  const user = process.env.SIGHTENGINE_USER;
  const secret = process.env.SIGHTENGINE_SECRET;
  if (!user || !secret) {
    /* Stub mode — neutral score. Real wiring lands when Alex pays for
     * Sightengine or we swap in a free open-source detector. */
    return 0.5;
  }
  try {
    const form = new FormData();
    form.append("media", new Blob([new Uint8Array(buffer)]), "image.png");
    form.append("models", "genai");
    form.append("api_user", user);
    form.append("api_secret", secret);
    const res = await fetchWithTimeout(
      "https://api.sightengine.com/1.0/check.json",
      { method: "POST", body: form as any },
      15_000,
    );
    if (!res.ok) return 0.5;
    const json = await res.json().catch(() => null) as any;
    const score = json?.type?.ai_generated;
    if (typeof score === "number" && score >= 0 && score <= 1) return score;
    return 0.5;
  } catch (err: any) {
    logger.warn(`detector_failed: ${err?.message || err}`);
    return 0.5;
  }
}

/* ─── Rotation strategy ────────────────────────────────────────────── */

function getRotationOrder(opts: ImageGenOpts): ImageProvider[] {
  if (opts.forceProvider) {
    const forced = IMAGE_PROVIDERS.find((p) => p.id === opts.forceProvider);
    return forced ? [forced] : [];
  }
  const available = IMAGE_PROVIDERS.filter(isProviderAvailable);

  /* Realistic mode: re-order so PHOTOREAL_PROVIDER_ORDER leads, then the
   * remaining available providers (preserving their registry order) as a
   * cost-optimised backstop. This is the hook that makes a future
   * flux2_pro / imagen4_ultra entry the realistic-mode default purely by
   * being listed at the front of PHOTOREAL_PROVIDER_ORDER. */
  if (opts.photoreal) {
    const byId = new Map(available.map((p) => [p.id, p] as const));
    const preferred: ImageProvider[] = [];
    for (const id of PHOTOREAL_PROVIDER_ORDER) {
      const p = byId.get(id);
      if (p) { preferred.push(p); byId.delete(id); }
    }
    /* Append any available providers not named in PHOTOREAL_PROVIDER_ORDER. */
    for (const p of available) {
      if (byId.has(p.id)) preferred.push(p);
    }
    return preferred;
  }

  return available;
}

/* ─── Public entry point ──────────────────────────────────────────── */

/**
 * Generate an image via the orchestrator. NEVER throws — returns
 * ok:false on total failure so the caller can fall back to the legacy
 * rotator and keep the publish pipeline alive.
 */
export async function generateImageViaOrchestrator(
  prompt: string,
  opts: ImageGenOpts = {},
): Promise<OrchestratorResult | OrchestratorFailure> {
  const t0 = Date.now();
  const chain: string[] = [];

  if (!isOrchestratorEnabled()) {
    return { ok: false, reason: "orchestrator_disabled", fallback_chain: [] };
  }
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return { ok: false, reason: "empty_prompt", fallback_chain: [] };
  }

  const rotation = getRotationOrder(opts);
  if (rotation.length === 0) {
    return { ok: false, reason: "no_provider_available", fallback_chain: [] };
  }

  const multi = isMultiCandidateTier(opts.customerTier);

  /* ── Multi-candidate (Studio / Agency) ─────────────────────────────
   * Run the top-2 available providers in parallel, score both, keep
   * the lower-score one. Cost stays $0 when both are free-tier. */
  if (multi && rotation.length >= 2) {
    const [pa, pb] = [rotation[0], rotation[1]];
    chain.push(pa.id, pb.id);
    const [ra, rb] = await Promise.all([
      callProvider(pa.id, prompt, opts),
      callProvider(pb.id, prompt, opts),
    ]);

    const winners: Array<{ provider: ImageProvider; buffer: Buffer; score: number; costUsd: number }> = [];
    if (ra.ok && ra.buffer) {
      const score = opts.skipDetector ? 0.5 : await callDetector(ra.buffer);
      winners.push({ provider: pa, buffer: ra.buffer, score, costUsd: ra.costUsd ?? pa.costPerImage });
    } else {
      logger.warn(`multi candidate A failed: ${ra.error}`);
    }
    if (rb.ok && rb.buffer) {
      const score = opts.skipDetector ? 0.5 : await callDetector(rb.buffer);
      winners.push({ provider: pb, buffer: rb.buffer, score, costUsd: rb.costUsd ?? pb.costPerImage });
    } else {
      logger.warn(`multi candidate B failed: ${rb.error}`);
    }

    if (winners.length > 0) {
      winners.sort((a, b) => a.score - b.score);
      const best = winners[0];
      logger.info(
        `multi success provider=${best.provider.id} score=${best.score.toFixed(3)} ` +
        `candidates=${winners.length} duration_ms=${Date.now() - t0}`,
      );
      return {
        ok: true,
        imageBuffer: best.buffer,
        providerUsed: best.provider.id,
        detectorScore: best.score,
        cost: best.costUsd,
        candidates_tried: winners.length,
        fallback_chain: chain,
      };
    }
    /* Both multi candidates failed — fall through to single-provider
     * walk over the rest of the rotation. */
    logger.warn("multi-candidate both failed, falling through to single-provider rotation");
  }

  /* ── Single-candidate rotation (Free / Creator + multi fallthrough) */
  for (const provider of rotation) {
    if (chain.includes(provider.id)) continue; // already tried in multi
    chain.push(provider.id);
    const result = await callProvider(provider.id, prompt, opts);
    if (!result.ok || !result.buffer) {
      logger.warn(`provider=${provider.id} failed: ${result.error}`);
      continue;
    }
    const score = opts.skipDetector ? 0.5 : await callDetector(result.buffer);
    logger.info(
      `single success provider=${provider.id} score=${score.toFixed(3)} ` +
      `duration_ms=${Date.now() - t0}`,
    );
    return {
      ok: true,
      imageBuffer: result.buffer,
      providerUsed: provider.id,
      detectorScore: score,
      cost: result.costUsd ?? provider.costPerImage,
      candidates_tried: 1,
      fallback_chain: chain,
    };
  }

  return {
    ok: false,
    reason: "all_providers_failed",
    fallback_chain: chain,
  };
}
