/**
 * ContentFlow — reference replication + realistic-mode helpers.
 *
 * Three provider-agnostic capabilities live here, all feeding the EXISTING
 * image-generation pipeline (orchestrator → R2 persist → cost tracking →
 * draft). Nothing here generates an image itself; it produces a *prompt*
 * (and selects providers via flags) that the normal generate path consumes.
 *
 *   1. buildPhotorealPrompt()   — realistic-mode prompt augmentation
 *      (camera/lens/lighting descriptors + "raw photo" + negative-prompt
 *      for illustration artifacts). Pair with ImageGenOpts.photoreal which
 *      selects the photoreal-capable provider in the orchestrator.
 *
 *   2. resolveReferenceImage()  — turn a customer-supplied reference (an
 *      uploaded image, a direct image URL, or a web-page URL) into raw
 *      image bytes + media type. Reuses the existing dependency-free
 *      fetch/extract helpers (extractWebsiteSignals' og:image regex), so no
 *      new screenshot dependency is added.
 *
 *   3. describeReferenceImage() — pass the reference image to the project's
 *      VISION model via aiService.chat({ userImageBlocks }) and return a
 *      structured style description (subject, layout, palette, lighting,
 *      composition, style). aiService.chat() DOES support multimodal input
 *      (ChatOptions.userImageBlocks → Anthropic image blocks). The vision
 *      call is fronted by the VisionDescriber interface so it can be mocked
 *      in tests and swapped for another provider later.
 *
 * The orchestrating route (portal/contentflow.ts /generate) then feeds the
 * description + the customer's brand profile + any extra instructions into
 * the SAME generateImageViaOrchestrator → R2 → cost → draft pipeline used
 * by template and free-prompt generation.
 *
 * MODERATION: the repo has no shared text/image moderation service today
 * (only the hard-rules SYSTEM_PROMPT inside imageGenerationService). A
 * lightweight length/empty guard + a clearly-marked TODO hook lives in
 * moderatePromptText() below. Do NOT invent a moderation vendor here — wire
 * a real provider when one is chosen.
 */

import { createLogger } from "../../lib/logger";
import {
  captureUrlForReplication,
  isUrlScreenshotEnabled,
} from "./urlScreenshotCapture";

const logger = createLogger("ContentFlow:RefReplication");

/* ─── Realistic-mode prompt augmentation ───────────────────────────── */

/**
 * Photoreal augmentation appended to a base prompt when realistic mode is
 * on. Camera/lens/lighting descriptors + "raw photo" style push diffusion
 * models toward photography; the negative-prompt fragment steers away from
 * illustration / CGI artifacts. Kept as a single tested string so the look
 * is consistent across drafts (mirrors imageStylePresets' suffix approach).
 *
 * The image providers wired today do not all take a separate negative
 * prompt field, so we inline a "avoid:" clause that FLUX/SD3/DALL-E honour
 * reasonably well in the positive prompt. When a future provider exposes a
 * true negative-prompt param, split PHOTOREAL_NEGATIVE out into it.
 */
export const PHOTOREAL_POSITIVE_SUFFIX =
  "raw photo, photorealistic, shot on a full-frame DSLR with a 50mm f/1.8 prime lens, " +
  "natural soft window lighting, true-to-life color, fine skin and material texture, " +
  "shallow depth of field, sharp focus, high dynamic range, realistic shadows";

export const PHOTOREAL_NEGATIVE =
  "avoid: illustration, drawing, painting, cartoon, anime, 3d render, CGI, " +
  "digital art, plastic look, oversaturated, airbrushed, smooth waxy skin, " +
  "render artifacts, watermark, text";

/**
 * Augment a base prompt for realistic mode. Idempotent — won't double-append
 * if the suffix is already present (retry-safe, mirrors applyStylePreset).
 */
export function buildPhotorealPrompt(basePrompt: string): string {
  const base = (basePrompt || "").trim();
  if (base.includes(PHOTOREAL_POSITIVE_SUFFIX)) return base;
  return `${base}, ${PHOTOREAL_POSITIVE_SUFFIX}. ${PHOTOREAL_NEGATIVE}`;
}

/* ─── Lightweight prompt moderation (length/empty + TODO hook) ──────── */

export interface ModerationResult {
  ok: boolean;
  reason?: string;
}

/** Max free-form prompt length — matches the route's existing 8000 cap. */
export const MAX_PROMPT_CHARS = 8_000;

/**
 * Minimal prompt safety/length gate. There is NO shared moderation service
 * in the repo yet (grep: only the SYSTEM_PROMPT hard-rules text). This
 * enforces length/empty and a tiny obviously-prohibited keyword denylist so
 * the free-prompt path isn't wide open, and leaves a clearly-marked hook for
 * a real provider.
 *
 * TODO(moderation): wire a real moderation provider (e.g. an LLM moderation
 * pass via aiService.chat, or a dedicated vendor) here. Do NOT add a vendor
 * speculatively — a separate decision selects it.
 */
export function moderatePromptText(text: unknown): ModerationResult {
  if (typeof text !== "string") return { ok: false, reason: "prompt must be a string" };
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "prompt is empty" };
  if (trimmed.length > MAX_PROMPT_CHARS) {
    return { ok: false, reason: `prompt too long (max ${MAX_PROMPT_CHARS})` };
  }
  /* Tiny obviously-prohibited denylist. Intentionally conservative — the
   * SYSTEM_PROMPT hard-rules + provider-side safety models do the heavy
   * lifting; this only blocks the most clear-cut abuse before we spend a
   * generation. TODO(moderation): replace with a real classifier. */
  const lowered = trimmed.toLowerCase();
  const HARD_BLOCK = ["child sexual", "csam", "child porn"];
  for (const term of HARD_BLOCK) {
    if (lowered.includes(term)) return { ok: false, reason: "prompt violates content policy" };
  }
  return { ok: true };
}

/* ─── Reference image resolution (upload | image URL | web page) ────── */

export type ReferenceMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export interface ResolvedReference {
  ok: boolean;
  bytes?: Buffer;
  mediaType?: ReferenceMediaType;
  /** Where the image came from, for audit/provenance. */
  source?: "upload" | "image_url" | "page_og_image" | "page_screenshot";
  reason?: string;
}

export interface ReferenceInput {
  /** Raw uploaded image bytes (already decoded from base64 by the caller). */
  uploadedBytes?: Buffer;
  uploadedMediaType?: ReferenceMediaType;
  /** A direct image URL OR a web-page URL. */
  url?: string;
}

const FETCH_TIMEOUT_MS = 12_000;
const MAX_REF_BYTES = 6 * 1024 * 1024; // 6 MB — vision models cap well below this
const UA = "Mozilla/5.0 (compatible; WeFixTradesBot/1.0; +https://wefixtrades.com)";

function mediaTypeFromContentType(ct: string | null): ReferenceMediaType | null {
  if (!ct) return null;
  const c = ct.toLowerCase();
  if (c.includes("jpeg") || c.includes("jpg")) return "image/jpeg";
  if (c.includes("png")) return "image/png";
  if (c.includes("gif")) return "image/gif";
  if (c.includes("webp")) return "image/webp";
  return null;
}

function mediaTypeFromUrl(url: string): ReferenceMediaType | null {
  const u = url.split("?")[0].toLowerCase();
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return "image/jpeg";
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".gif")) return "image/gif";
  if (u.endsWith(".webp")) return "image/webp";
  return null;
}

/** Pull the first og:image / twitter:image URL out of an HTML page. Mirrors
 *  the dependency-free regex approach in profilePrefill.extractWebsiteSignals. */
export function extractOgImageUrl(html: string, pageUrl: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image:src["'][^>]*content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m && m[1]) {
      try {
        return new URL(m[1], pageUrl).toString();
      } catch {
        /* malformed — try the next pattern */
      }
    }
  }
  return null;
}

async function fetchBytesWithTimeout(
  url: string,
  accept: string,
): Promise<{ ok: boolean; buffer?: Buffer; contentType?: string | null; reason?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": UA, accept },
    });
    if (!res.ok) return { ok: false, reason: `fetch ${url} → HTTP ${res.status}` };
    const reader = res.body?.getReader();
    const contentType = res.headers.get("content-type");
    if (!reader) {
      const buf = Buffer.from(await res.arrayBuffer());
      return { ok: true, buffer: buf, contentType };
    }
    let received = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_REF_BYTES) {
        try { await reader.cancel(); } catch { /* noop */ }
        return { ok: false, reason: `reference exceeds ${MAX_REF_BYTES} bytes` };
      }
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return { ok: true, buffer: buf, contentType };
  } catch (err: any) {
    return { ok: false, reason: `fetch error: ${err?.message || err}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve a customer reference into image bytes + media type.
 *
 * Precedence: uploaded bytes > URL. For a URL we first try to fetch it as an
 * image; if the response is HTML (a web page), we extract its og:image and
 * fetch THAT. NEVER throws — returns { ok:false, reason } on any failure so
 * the route maps it to a clean 4xx/5xx.
 */
export async function resolveReferenceImage(input: ReferenceInput): Promise<ResolvedReference> {
  /* 1. Direct upload. */
  if (input.uploadedBytes && input.uploadedBytes.length > 0) {
    if (input.uploadedBytes.length > MAX_REF_BYTES) {
      return { ok: false, reason: `uploaded image exceeds ${MAX_REF_BYTES} bytes` };
    }
    return {
      ok: true,
      bytes: input.uploadedBytes,
      mediaType: input.uploadedMediaType ?? "image/png",
      source: "upload",
    };
  }

  /* 2. URL (image or web page). */
  const url = (input.url || "").trim();
  if (!url) return { ok: false, reason: "no reference provided (uploadedBytes or url required)" };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "reference url is not a valid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "reference url must be http(s)" };
  }

  const fetched = await fetchBytesWithTimeout(url, "image/*,text/html;q=0.9");
  if (!fetched.ok || !fetched.buffer) {
    return { ok: false, reason: fetched.reason || "reference fetch failed" };
  }

  const ct = mediaTypeFromContentType(fetched.contentType ?? null) ?? mediaTypeFromUrl(url);
  /* If it's already an image, use it directly. */
  if (ct) {
    return { ok: true, bytes: fetched.buffer, mediaType: ct, source: "image_url" };
  }

  /* Otherwise it's a web page. PREFERRED PATH (flag-gated): render the live
   * page with headless Chromium and use a real screenshot — far stronger
   * replication signal than og:image (captures actual layout/color/type/
   * composition). captureUrlForReplication() is inert unless
   * CONTENTFLOW_URL_SCREENSHOT_ENABLED is on, NEVER throws, and returns
   * { ok:false } on any failure — so we fall through to the EXACT existing
   * og:image behavior below on flag-off or capture-failure (no regression).
   *
   * We pass the HERO (above-the-fold, viewport-only) screenshot to the vision
   * describe step rather than the full-page image: it carries the brand's
   * dominant layout/color/type while keeping the vision-describe token cost
   * close to the old og:image cost. (Screenshotting itself is free — no API
   * cost. The full-page image is available via captureUrlForReplication if a
   * richer describe is ever wanted, at a higher vision-token cost.) */
  if (isUrlScreenshotEnabled()) {
    const shot = await captureUrlForReplication(url);
    if (shot.ok) {
      return {
        ok: true,
        bytes: shot.hero.buffer,
        mediaType: "image/png",
        source: "page_screenshot",
      };
    }
    logger.warn(`url screenshot unavailable, falling back to og:image: ${shot.reason}`);
  }

  /* Fallback (and default): extract og:image and fetch that. */
  const html = fetched.buffer.toString("utf8");
  const ogUrl = extractOgImageUrl(html, url);
  if (!ogUrl) {
    return { ok: false, reason: "reference URL is a web page with no og:image/twitter:image" };
  }
  const ogFetched = await fetchBytesWithTimeout(ogUrl, "image/*");
  if (!ogFetched.ok || !ogFetched.buffer) {
    return { ok: false, reason: ogFetched.reason || "og:image fetch failed" };
  }
  const ogCt = mediaTypeFromContentType(ogFetched.contentType ?? null) ?? mediaTypeFromUrl(ogUrl) ?? "image/png";
  return { ok: true, bytes: ogFetched.buffer, mediaType: ogCt, source: "page_og_image" };
}

/* ─── Vision describe (multimodal LLM) ─────────────────────────────── */

export interface ReferenceStyleDescription {
  /** One-paragraph natural-language description suitable to feed an image
   *  generator. This is the field the generate path consumes. */
  description: string;
  /** Structured fields, best-effort parsed from the model output. */
  subject?: string;
  layout?: string;
  palette?: string;
  lighting?: string;
  composition?: string;
  style?: string;
}

/**
 * Injectable vision describer so tests can mock the multimodal call without
 * a live API key, and so the vision provider can be swapped later. The
 * default implementation uses aiService.chat() with userImageBlocks.
 */
export interface VisionDescriber {
  describe(image: { bytes: Buffer; mediaType: ReferenceMediaType }): Promise<ReferenceStyleDescription>;
}

const VISION_SYSTEM = `You are an art director analysing a reference image so another image-generation
model can produce a NEW image in the same visual style and layout (NOT a copy of the
subject). Describe ONLY the transferable visual characteristics. Be concrete and concise.

Return STRICT JSON with these keys (all strings):
{
  "subject": "what kind of subject/scene, in general terms",
  "layout": "how elements are arranged in the frame",
  "palette": "dominant colors and overall color treatment",
  "lighting": "light direction, quality, mood",
  "composition": "framing, angle, depth, focal treatment",
  "style": "photographic vs illustrated, era, finish, texture",
  "description": "one tight paragraph an image generator can follow to match this style"
}
Do not include any commentary outside the JSON.`;

/** Default vision describer backed by aiService.chat() multimodal input.
 *  aiService is imported lazily so unit tests that inject a mock describer
 *  don't pull the DB-dependent module graph at import time. */
export const defaultVisionDescriber: VisionDescriber = {
  async describe({ bytes, mediaType }) {
    const { chat: aiChat } = await import("../aiService");
    const raw = await aiChat({
      system: VISION_SYSTEM,
      surface: "contentflow",
      maxTokens: 700,
      messages: [
        {
          role: "user",
          content:
            "Analyse this reference image and return the JSON style description.",
        },
      ],
      userImageBlocks: [{ mediaType, data: bytes }],
    });
    return parseStyleDescription(raw);
  },
};

/** Tolerant JSON parse of the vision model output → ReferenceStyleDescription.
 *  Falls back to using the whole text as `description` if JSON parsing fails,
 *  so a non-JSON-compliant model response still yields a usable prompt. */
export function parseStyleDescription(raw: string): ReferenceStyleDescription {
  const text = (raw || "").trim();
  /* Pull the first {...} block out — models sometimes wrap JSON in prose. */
  const match = /\{[\s\S]*\}/.exec(text);
  if (match) {
    try {
      const j = JSON.parse(match[0]);
      const str = (v: unknown) => (typeof v === "string" ? v.trim() : undefined);
      const description =
        str(j.description) ||
        [str(j.subject), str(j.layout), str(j.palette), str(j.lighting), str(j.composition), str(j.style)]
          .filter(Boolean)
          .join("; ");
      if (description) {
        return {
          description,
          subject: str(j.subject),
          layout: str(j.layout),
          palette: str(j.palette),
          lighting: str(j.lighting),
          composition: str(j.composition),
          style: str(j.style),
        };
      }
    } catch {
      /* fall through to raw-text fallback */
    }
  }
  return { description: text };
}

/**
 * High-level helper: resolve a reference, describe it, and compose the final
 * generate prompt. Returns the prompt + provenance; the CALLER runs it
 * through generateImageViaOrchestrator + R2 + cost + draft (so this stays
 * provider-agnostic and reuses the existing pipeline).
 *
 * `extraInstructions` is the customer's own free-text guidance ("make it
 * winter", "add our van"). `brandLayer` is the already-composed brand prompt
 * fragment (from buildBrandLayer / brand profile) the caller passes in.
 */
export async function describeReferenceAndComposePrompt(args: {
  reference: ReferenceInput;
  brandLayer?: string;
  extraInstructions?: string;
  photoreal?: boolean;
  describer?: VisionDescriber;
}): Promise<
  | { ok: true; prompt: string; styleDescription: ReferenceStyleDescription; source: ResolvedReference["source"] }
  | { ok: false; reason: string }
> {
  const resolved = await resolveReferenceImage(args.reference);
  if (!resolved.ok || !resolved.bytes || !resolved.mediaType) {
    return { ok: false, reason: resolved.reason || "reference could not be resolved" };
  }

  let styleDescription: ReferenceStyleDescription;
  try {
    const describer = args.describer ?? defaultVisionDescriber;
    styleDescription = await describer.describe({ bytes: resolved.bytes, mediaType: resolved.mediaType });
  } catch (err: any) {
    logger.warn(`vision describe failed: ${err?.message || err}`);
    return { ok: false, reason: `vision describe failed: ${err?.message || err}` };
  }

  if (!styleDescription.description?.trim()) {
    return { ok: false, reason: "vision model returned an empty description" };
  }

  /* Compose: style description + brand layer + extra instructions, then
   * (optionally) photoreal augmentation. This is the prompt the existing
   * generate path consumes. */
  const parts = [
    `Create a NEW image in this visual style (do not copy the subject): ${styleDescription.description.trim()}`,
  ];
  if (args.brandLayer?.trim()) parts.push(args.brandLayer.trim());
  if (args.extraInstructions?.trim()) parts.push(`Additional instructions: ${args.extraInstructions.trim()}`);
  let prompt = parts.join("\n\n");
  if (args.photoreal) prompt = buildPhotorealPrompt(prompt);

  return { ok: true, prompt, styleDescription, source: resolved.source };
}
