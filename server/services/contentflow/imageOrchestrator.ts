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
  | "dalle";

export interface ImageProvider {
  id: ImageProviderId;
  name: string;
  costPerImage: number;    // USD; 0 for free tier
  qualityScore: number;    // 0-100, updated over time
  detectorPassScore: number; // historical avg ai-detector pass rate (0-100, higher = more likely to pass as human)
  enabled: boolean;
  envVarRequired?: string;
}

export interface ImageGenOpts {
  size?: "1024x1024" | "1024x1536" | "1536x1024";
  /** Customer tier — drives single-vs-multi-candidate. */
  customerTier?: "free" | "creator" | "studio" | "agency" | string | null;
  /** Force a specific provider (debug / admin override). */
  forceProvider?: ImageProviderId;
  /** Skip detector pre-check (debug). */
  skipDetector?: boolean;
  /** Per-call timeout for one provider attempt. */
  timeoutMs?: number;
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
  return true;
}

function isMultiCandidateTier(tier: string | null | undefined): boolean {
  if (!tier) return false;
  const t = String(tier).toLowerCase();
  return t === "studio" || t === "agency";
}

function parseDims(size: ImageGenOpts["size"]): { width: number; height: number } {
  switch (size) {
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
}

async function callPollinations(prompt: string, opts: ImageGenOpts): Promise<ProviderResult> {
  try {
    const { width, height } = parseDims(opts.size);
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
    const { width, height } = parseDims(opts.size);
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
    const { width, height } = parseDims(opts.size);
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
    const { width, height } = parseDims(opts.size);
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
  return IMAGE_PROVIDERS.filter(isProviderAvailable);
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

    const winners: Array<{ provider: ImageProvider; buffer: Buffer; score: number }> = [];
    if (ra.ok && ra.buffer) {
      const score = opts.skipDetector ? 0.5 : await callDetector(ra.buffer);
      winners.push({ provider: pa, buffer: ra.buffer, score });
    } else {
      logger.warn(`multi candidate A failed: ${ra.error}`);
    }
    if (rb.ok && rb.buffer) {
      const score = opts.skipDetector ? 0.5 : await callDetector(rb.buffer);
      winners.push({ provider: pb, buffer: rb.buffer, score });
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
        cost: best.provider.costPerImage,
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
      cost: provider.costPerImage,
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
