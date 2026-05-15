/**
 * Image generation rotator — OpenAI → Replicate (Flux) → Ideogram.
 *
 * Today's default order:
 *   1. OpenAI gpt-image-1.5 (replaces deprecated gpt-image-1 as of
 *      2026-05-12). OPENAI_API_KEY required.
 *   2. Replicate Flux Pro / Flux Schnell.
 *      REPLICATE_API_TOKEN required (currently NOT set in Doppler —
 *      provision an account at replicate.com to enable).
 *   3. Ideogram Turbo v3.
 *      IDEOGRAM_API_KEY required (currently NOT set — provision
 *      at ideogram.ai/api).
 *
 * Output is normalized to { url, provider, model } regardless of which
 * upstream returned. URL is the upstream's transient URL — the caller
 * (typically imageGenerationService) is responsible for downloading +
 * persisting to R2 like it does today.
 */

import { rotate, resolveProviderOrder, type ProviderImpl } from "./rotator";

export interface ImageInput {
  prompt: string;
  size?: "1024x1024" | "1792x1024" | "1024x1792";
  /** "high" → premium quality, slower. "medium" → balanced. */
  quality?: "high" | "medium" | "low";
}

export interface ImageOutput {
  url: string;
  model: string;
}

/* ─── OpenAI (gpt-image-1.5) ────────────────────────────────────────── */

const openaiImageProvider: ProviderImpl<ImageInput, ImageOutput> = {
  name: "openai-image",
  ready: () => !!(process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY),
  invoke: async (input) => {
    const key = process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY!;
    const model = process.env.IMAGE_MODEL ?? "gpt-image-1.5";
    const apiBase = process.env.IMAGE_API_BASE_OVERRIDE ?? "https://api.openai.com";
    const res = await fetch(`${apiBase}/v1/images/generations`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: input.prompt,
        size: input.size ?? "1024x1024",
        quality: input.quality ?? "medium",
        n: 1,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      const err: any = new Error(`OpenAI image ${res.status}: ${errBody.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    const json: any = await res.json();
    const url = json.data?.[0]?.url ?? json.data?.[0]?.b64_json;
    if (!url) {
      throw new Error("OpenAI image response missing url/b64_json");
    }
    return { url, model };
  },
};

/* ─── Replicate (Flux Pro / Schnell) ────────────────────────────────── */

const replicateProvider: ProviderImpl<ImageInput, ImageOutput> = {
  name: "replicate",
  ready: () => !!process.env.REPLICATE_API_TOKEN,
  invoke: async (input) => {
    const token = process.env.REPLICATE_API_TOKEN!;
    const model = input.quality === "low"
      ? "black-forest-labs/flux-schnell"
      : "black-forest-labs/flux-pro";
    // Create prediction
    const createRes = await fetch("https://api.replicate.com/v1/models/" + model + "/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${token}`,
        "Content-Type": "application/json",
        "Prefer": "wait", // sync mode — wait for completion up to 60s
      },
      body: JSON.stringify({
        input: {
          prompt: input.prompt,
          aspect_ratio: input.size === "1792x1024" ? "16:9" : input.size === "1024x1792" ? "9:16" : "1:1",
        },
      }),
    });
    if (!createRes.ok) {
      const errBody = await createRes.text();
      const err: any = new Error(`Replicate ${createRes.status}: ${errBody.slice(0, 200)}`);
      err.status = createRes.status;
      throw err;
    }
    const json: any = await createRes.json();
    if (json.status === "failed") {
      throw new Error(`Replicate prediction failed: ${json.error ?? "unknown"}`);
    }
    // Flux returns output as a single URL or array of URLs
    const output = json.output;
    const url = Array.isArray(output) ? output[0] : output;
    if (typeof url !== "string") {
      throw new Error(`Replicate response missing URL (status=${json.status})`);
    }
    return { url, model };
  },
};

/* ─── Ideogram ──────────────────────────────────────────────────────── */

const ideogramProvider: ProviderImpl<ImageInput, ImageOutput> = {
  name: "ideogram",
  ready: () => !!process.env.IDEOGRAM_API_KEY,
  invoke: async (input) => {
    const key = process.env.IDEOGRAM_API_KEY!;
    const renderingSpeed = input.quality === "low" ? "TURBO" : input.quality === "high" ? "QUALITY" : "DEFAULT";
    const aspectRatio = input.size === "1792x1024" ? "ASPECT_16_9"
      : input.size === "1024x1792" ? "ASPECT_9_16"
      : "ASPECT_1_1";
    const res = await fetch("https://api.ideogram.ai/v1/ideogram-v3/generate", {
      method: "POST",
      headers: { "Api-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: input.prompt,
        rendering_speed: renderingSpeed,
        aspect_ratio: aspectRatio,
        num_images: 1,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      const err: any = new Error(`Ideogram ${res.status}: ${errBody.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    const json: any = await res.json();
    const url = json.data?.[0]?.url;
    if (!url) {
      throw new Error("Ideogram response missing URL");
    }
    return { url, model: `ideogram-v3-${renderingSpeed.toLowerCase()}` };
  },
};

/* ─── Public entry point ────────────────────────────────────────────── */

const DEFAULT_ORDER = [openaiImageProvider, replicateProvider, ideogramProvider];

export async function generateImage(input: ImageInput) {
  const providers = resolveProviderOrder("AI_IMAGE_PROVIDERS", DEFAULT_ORDER);
  return rotate(input, providers, "image");
}
