/**
 * ContentFlow — image generation service (Sprint 11).
 *
 * Generates a single hero image for a SocialSync FB/IG post using
 * OpenAI's gpt-image-1 model. The post's `media_plan.prompt` (already
 * produced by SocialSync contentGenerator at draft time) plus the
 * client's brand layer become the final image prompt.
 *
 * HARD REQUIREMENT (Sprint 11 brief): image-generation failure must
 * NEVER block the publishing pipeline. Every code path here is
 * try/catch wrapped — on any failure we log and return without an
 * image URL. FB drafts then publish text-only; IG drafts fail their
 * own validation gate cleanly without taking down other drafts.
 *
 * Storage: optional Cloudflare R2 upload via PUT with SigV4 (S3-
 * compatible). When R2 env vars are unset OR upload fails, we fall
 * back to the OpenAI-returned URL (valid ~1 hour) which is enough
 * for the queue worker to publish the post within the next tick.
 *
 * Test mode: IMAGE_API_BASE_OVERRIDE (NODE_ENV-gated) routes the
 * gpt-image-1 call to /api/__dev/image-mock. R2 upload is skipped
 * automatically when R2_BUCKET_NAME is unset.
 */

import crypto from "crypto";
import { storage } from "../../storage";
import { checkContentflowGate } from "./contentflowGate";
import { aiGateAllowed, recordAiSpend } from "../aiSystemGate";
import { generateImage as generateImageViaRotator } from "../ai/imageRotator";
import type { ContentDraft } from "@shared/schema";
import { readBrandProfile } from "./brandProfile";
import { createLogger } from "../../lib/logger";
import { noisyCatch } from "../../lib/silentFailureGuard";
import { postProcessAIImage, isPostProcessEnabled } from "./imagePostProcess";
import {
  applyStylePreset,
  defaultPresetForIndustry,
  isImageStylePresetId,
  type ImageStylePresetId,
} from "./imageStylePresets";
import { generateImageViaOrchestrator } from "./imageOrchestrator";
import { writeAudit } from "../../lib/auditLog";

const logger = createLogger("ImageGen");

/* ─── Config ───────────────────────────────────────────────────────── */

const OPENAI_API_BASE_DEFAULT = "https://api.openai.com/v1";
function getOpenAiApiBase(): string {
  if (process.env.NODE_ENV !== "production" && process.env.IMAGE_API_BASE_OVERRIDE) {
    return process.env.IMAGE_API_BASE_OVERRIDE;
  }
  return OPENAI_API_BASE_DEFAULT;
}

const IMAGE_MODEL = process.env.IMAGE_MODEL || "gpt-image-1";
const IMAGE_QUALITY = (process.env.IMAGE_QUALITY || "medium") as "low" | "medium" | "high";
const IMAGE_SIZE = (process.env.IMAGE_SIZE || "1024x1024") as "1024x1024" | "1024x1536" | "1536x1024";
const REQUEST_TIMEOUT_MS = 30_000;

/* ─── Types ────────────────────────────────────────────────────────── */

export interface ImageBrand {
  primary_color?: string;       // hex like "#2563EB"
  secondary_color?: string;
  style_keywords?: string[];    // e.g. ["clean", "modern"]
  location_cue?: string;        // e.g. "suburban Phoenix"
  avoid?: string[];             // e.g. ["bathroom emergencies"]
  /* Sprint 16: extra fields from content_brand. */
  service_focus?: string[];
  visual_style?: string;
}

export interface GenerateForDraftResult {
  ok: boolean;
  reason?: "skipped_kind" | "skipped_platform" | "skipped_already_has_image" | "no_prompt"
         | "api_failed" | "moderation_blocked" | "upload_failed" | "config_missing" | "paused";
  image_url?: string;           // either R2 URL OR OpenAI ephemeral URL (fallback)
  provider?: "openai" | "openai+r2";
  duration_ms?: number;
  prompt_used?: string;         // for audit / spec verification
  message?: string;
}

/* ─── Prompt assembly (3 layers per Sprint 11 discovery) ─────────── */

const SYSTEM_PROMPT = `Generate a clean, professional photo for a trades-business marketing post.
Photo-realistic, NOT digital art or illustration. Natural lighting.

Hard rules:
- No identifiable human faces (use partial profiles, hands only, or backs of subjects).
- No minors.
- No exposed live electrical elements or hazardous DIY misuse.
- No competitor logos.
- Hands and tools must be rendered accurately.
- Avoid clichéd stock-photo composition.`;

function buildBrandLayer(trade: string | null, brand: ImageBrand): string {
  const parts: string[] = [];
  if (trade) parts.push(`Trade: ${trade}.`);
  if (brand.location_cue) parts.push(`Setting cue: ${brand.location_cue}.`);
  /* Sprint 16: service_focus + visual_style come from content_brand. */
  if (brand.service_focus?.length) parts.push(`Service focus: ${brand.service_focus.join(", ")}.`);
  if (brand.visual_style) parts.push(`Visual style: ${brand.visual_style}.`);
  if (brand.style_keywords?.length) parts.push(`Style: ${brand.style_keywords.join(", ")}.`);
  if (brand.primary_color) {
    const accents: string[] = [brand.primary_color];
    if (brand.secondary_color) accents.push(brand.secondary_color);
    parts.push(`Subtle brand accent colors (use sparingly, e.g. on tools, signage, or clothing): ${accents.join(", ")}.`);
  }
  if (brand.avoid?.length) parts.push(`Avoid: ${brand.avoid.join(", ")}.`);
  return parts.join(" ");
}

function buildFinalPrompt(args: {
  postPrompt: string;
  brand: ImageBrand;
  tradeType: string | null;
}): string {
  const brandLayer = buildBrandLayer(args.tradeType, args.brand);
  return [
    SYSTEM_PROMPT,
    "",
    brandLayer,
    "",
    "Image subject:",
    args.postPrompt.trim(),
  ].filter(Boolean).join("\n");
}

function readClientBrand(client: { metadata?: unknown } | null | undefined): ImageBrand {
  /* Sprint 16: prefer clients.metadata.content_brand (richer schema)
   * over legacy clients.metadata.image_brand. readBrandProfile()
   * already handles the fallback chain + sanitization. */
  const profile = readBrandProfile(client);
  return {
    primary_color: profile.primary_color,
    secondary_color: profile.secondary_color,
    style_keywords: profile.style_keywords,
    location_cue: profile.location_cue,
    avoid: profile.avoid,
    service_focus: profile.service_focus,
    visual_style: profile.visual_style,
  };
}

/* ─── OpenAI image generation (gpt-image-1) ──────────────────────── */

interface OpenAiImageResponse {
  data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
  error?: { message?: string; type?: string; code?: string };
}

/**
 * W-AX-1: route image generation through the rotator (OpenAI → Replicate → Ideogram).
 * The rotator handles auth, fallback, and 401/429/network failures. We
 * preserve the original {ok,url,b64,revised_prompt} return shape so the
 * rest of imageGenerationService is untouched.
 *
 * NOTE: the IMAGE_API_BASE_OVERRIDE dev mock path is still honored by the
 * OpenAI provider inside imageRotator.ts via the same env var.
 */
function isOrchestratorEnabled(): boolean {
  const v = process.env.CONTENTFLOW_IMAGE_ORCHESTRATOR_ENABLED;
  if (v === undefined || v === null || v === "") return true;
  return !/^(false|0|off|no)$/i.test(v.trim());
}

async function callImageApi(
  prompt: string,
  ctx?: { customerTier?: string | null },
): Promise<{ ok: true; url?: string; b64?: string; revised_prompt?: string; provider_used?: string; detector_score?: number; cost?: number } | { ok: false; reason: GenerateForDraftResult["reason"]; message: string }> {
  /* Sprint 22 — multi-model orchestrator path. Tries Pollinations → HF Flux
   * → Stability → Together → Replicate → DALL-E in order, with a detector
   * pre-check that prefers the lower-AI-score candidate for paying tiers.
   * Falls through to the legacy single-provider rotator on total failure. */
  if (isOrchestratorEnabled()) {
    try {
      const orch = await generateImageViaOrchestrator(prompt, {
        size: IMAGE_SIZE,
        customerTier: ctx?.customerTier ?? null,
      });
      if (orch.ok) {
        return {
          ok: true,
          b64: orch.imageBuffer.toString("base64"),
          provider_used: orch.providerUsed,
          detector_score: orch.detectorScore,
          cost: orch.cost,
        };
      }
      logger.warn(`[contentflow][image-gen] orchestrator failed (reason=${orch.reason}, chain=${orch.fallback_chain.join("->")}) — falling back to legacy rotator`);
    } catch (err: any) {
      logger.warn(`[contentflow][image-gen] orchestrator threw: ${err?.message || err} — falling back to legacy rotator`);
    }
  }

  try {
    const outcome = await generateImageViaRotator({
      prompt,
      size: IMAGE_SIZE === "1024x1536" ? "1024x1792" : IMAGE_SIZE === "1536x1024" ? "1792x1024" : "1024x1024",
      quality: IMAGE_QUALITY,
    });

    if (!outcome.ok) {
      /* Detect the rotator's moderation_blocked equivalent — the OpenAI
       * provider in imageRotator throws with a 400 status when the safety
       * model rejects. The rotator records this as a ProviderFailure with
       * reason "other" + the original message preserved. */
      const lastTry = outcome.tried[outcome.tried.length - 1];
      const msg = outcome.tried.map((t) => `${t.provider}:${t.reason}`).join(" | ");
      if (lastTry?.message?.toLowerCase().includes("content policy") ||
          lastTry?.message?.toLowerCase().includes("moderation")) {
        return { ok: false, reason: "moderation_blocked", message: lastTry.message };
      }
      return { ok: false, reason: "api_failed", message: msg || "image rotator: all providers failed" };
    }

    const out = outcome.data;
    /* Rotator normalizes to { url, model }. OpenAI providers may have
     * placed b64_json into the url field (see imageRotator line 61) —
     * we don't try to distinguish here; persistImageOnDraft will handle
     * either as a Buffer-vs-URL upload. */
    return { ok: true, url: out.url };
  } catch (err: any) {
    return { ok: false, reason: "api_failed", message: err?.message || String(err) };
  }
}

/* ─── R2 upload (best-effort; falls back to OpenAI URL) ──────────── */

interface R2UploadResult {
  ok: boolean;
  url?: string;
  error?: string;
}

function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL &&
    process.env.R2_ENDPOINT
  );
}

/**
 * Minimal SigV4 PUT to a Cloudflare R2 bucket. Avoids pulling
 * @aws-sdk/client-s3 (a few MB) for one PUT operation.
 *
 * This is intentionally barebones — production should switch to
 * the SDK if uploads grow more complex. For Sprint 11's "single PUT
 * per image" need, this is sufficient and dependency-free.
 */
async function uploadToR2(args: { key: string; contentType: string; sourceUrl?: string; buffer?: Buffer }): Promise<R2UploadResult> {
  if (!isR2Configured()) {
    return { ok: false, error: "R2 not configured" };
  }
  try {
    /* Source bytes: a direct Buffer (b64_json image responses) or
     * fetched from a CDN URL (DALL-E-style url responses). */
    let buffer: Buffer;
    if (args.buffer) {
      buffer = args.buffer;
    } else if (args.sourceUrl) {
      const sourceRes = await fetch(args.sourceUrl);
      if (!sourceRes.ok) {
        return { ok: false, error: `source fetch ${sourceRes.status}` };
      }
      buffer = Buffer.from(await sourceRes.arrayBuffer());
    } else {
      return { ok: false, error: "no source (need sourceUrl or buffer)" };
    }

    /* SigV4 signed PUT to R2. R2 uses the same signing as S3. */
    const accessKey = process.env.R2_ACCESS_KEY_ID!;
    const secretKey = process.env.R2_SECRET_ACCESS_KEY!;
    const bucket = process.env.R2_BUCKET_NAME!;
    const endpoint = process.env.R2_ENDPOINT!.replace(/\/+$/, "");
    const region = "auto";
    const host = new URL(endpoint).host;
    const date = new Date();
    const amzDate = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const dateStamp = amzDate.slice(0, 8);

    const payloadHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const canonicalUri = `/${bucket}/${args.key}`;
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

    const putRes = await fetch(`${endpoint}/${bucket}/${args.key}`, {
      method: "PUT",
      headers: {
        Authorization: authorization,
        "x-amz-date": amzDate,
        "x-amz-content-sha256": payloadHash,
        "Content-Type": args.contentType,
        "Content-Length": String(buffer.length),
      },
      body: buffer,
    });
    if (!putRes.ok) {
      const body = await putRes.text().catch(() => "");
      return { ok: false, error: `R2 PUT ${putRes.status}: ${body.slice(0, 200)}` };
    }
    const publicBase = process.env.R2_PUBLIC_URL!.replace(/\/+$/, "");
    return { ok: true, url: `${publicBase}/${args.key}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/* ─── Public entry point ─────────────────────────────────────────── */

/**
 * Generate (and persist) an image for a SocialSync content_draft.
 * Idempotent — skips when the draft already has an image_url.
 *
 * Scope (Sprint 11): kind='social_post' AND target_platform IN
 * {'facebook','instagram'}. GBP posts and other kinds short-circuit
 * with a 'skipped_*' reason.
 *
 * NEVER throws. The orchestrator must continue regardless of return
 * value — text-only publish remains the safety net.
 *
 * Sprint 19 — image-style preset resolution:
 *   opts.imageStylePreset  → caller override (per-draft picker)
 *   client brand profile   → customer default (PortalContentPreferences)
 *   industry default       → defaultPresetForIndustry(trade_type)
 *   hard fallback          → "photoreal"
 * The chosen preset's promptSuffix is appended to the final 3-layer
 * prompt before the gpt-image-1 call.
 */
export async function generateForDraft(
  draftId: number,
  opts?: { skipPostProcess?: boolean; imageStylePreset?: ImageStylePresetId | null },
): Promise<GenerateForDraftResult> {
  const t0 = Date.now();
  const log = (msg: string) => logger.info(`[contentflow][image-gen] draft=${draftId} ${msg} duration_ms=${Date.now() - t0}`);

  try {
    const draft = await storage.getContentDraftById(draftId);
    if (!draft) return { ok: false, reason: "skipped_kind", message: "draft not found" };

    /* Sprint 11 accepted kind ∈ {social_post, carousel_post}.
     * Sprint 12 adds google_post (GBP local posts get an image too). */
    if (draft.kind !== "social_post" && draft.kind !== "carousel_post" && draft.kind !== "google_post") {
      log("skipped_kind");
      return { ok: false, reason: "skipped_kind", message: `kind=${draft.kind}` };
    }
    /* Sprint 11 accepted facebook / instagram. Sprint 12 adds
     * google_business so GBP local posts can carry a Sprint-11-
     * generated image via the publisher's media field. */
    const allowedPlatforms = new Set(["facebook", "instagram", "google_business"]);
    if (!allowedPlatforms.has(draft.target_platform || "")) {
      log(`skipped_platform=${draft.target_platform}`);
      return { ok: false, reason: "skipped_platform", message: `platform=${draft.target_platform}` };
    }

    /* Idempotency. media_plan.image_url already populated → no-op. */
    const meta = (draft.metadata || {}) as Record<string, any>;
    const mediaPlan = (meta.media_plan || {}) as Record<string, any>;
    if (mediaPlan.image_url) {
      log("skipped_already_has_image");
      return { ok: false, reason: "skipped_already_has_image", message: "draft already has image_url" };
    }

    const postPrompt = (mediaPlan.prompt as string | undefined)?.trim();
    if (!postPrompt) {
      log("no_prompt");
      return { ok: false, reason: "no_prompt", message: "media_plan.prompt missing" };
    }

    /* Load client brand layer. */
    const client = await storage.getClientById(draft.client_id);
    const brand = readClientBrand(client);
    const tradeType = (client?.trade_type as string | null) ?? null;

    /* Resolve image style preset (Sprint 19). Precedence:
     *   1. opts.imageStylePreset (caller override per draft)
     *   2. client brand profile default (PortalContentPreferences)
     *   3. industry default (defaultPresetForIndustry)
     *   4. "photoreal" (the function above already returns this fallback) */
    const fullBrand = readBrandProfile(client);
    const customerDefault = isImageStylePresetId(fullBrand.image_style_preset)
      ? fullBrand.image_style_preset
      : null;
    const callerOverride = isImageStylePresetId(opts?.imageStylePreset)
      ? (opts!.imageStylePreset as ImageStylePresetId)
      : null;
    const industryDefault = defaultPresetForIndustry(tradeType);
    const resolvedPreset: ImageStylePresetId =
      callerOverride ?? customerDefault ?? industryDefault;
    const fellBackToDefault = !callerOverride && !customerDefault;

    const promptBeforeStyle = buildFinalPrompt({ postPrompt, brand, tradeType });
    const finalPrompt = applyStylePreset(promptBeforeStyle, resolvedPreset);

    /* Fire-and-forget audit so admins can see which preset shaped each
     * draft's image. Not awaited — never block generation on audit. */
    writeAudit({
      actorType: "system",
      action: "contentflow.image.style_preset_applied",
      entityType: "content_draft",
      entityId: String(draftId),
      metadata: {
        preset_id: resolvedPreset,
        fallback_to_default: fellBackToDefault,
        source: callerOverride
          ? "caller_override"
          : customerDefault
            ? "customer_default"
            : "industry_default",
        trade_type: tradeType,
        client_id: draft.client_id,
      },
    });

    /* Product-level gate — kill switch + monthly spend cap. */
    const gate = await checkContentflowGate();
    if (!gate.allowed) {
      log(`paused: ${gate.reason}`);
      return { ok: false, reason: "paused", message: gate.reason, prompt_used: finalPrompt };
    }

    /* W-AX-1: system-level gate — surface-scoped kill switch + budget. */
    const sysGate = await aiGateAllowed("contentflow");
    if (!sysGate.allowed) {
      log(`sys_gate_paused: ${sysGate.reason}`);
      return { ok: false, reason: "paused", message: sysGate.reason, prompt_used: finalPrompt };
    }

    /* Call image API. Pass customer tier so the orchestrator can choose
     * single-candidate (Free/Creator) vs. multi-candidate (Studio/Agency).
     * Tier lives on the client's metadata.subscription_tier when present;
     * otherwise we leave it null and the orchestrator defaults to single. */
    const clientMeta = (client?.metadata || {}) as Record<string, any>;
    const customerTier: string | null =
      (typeof clientMeta.subscription_tier === "string" && clientMeta.subscription_tier) ||
      (typeof clientMeta.plan_tier === "string" && clientMeta.plan_tier) ||
      (typeof clientMeta.tier === "string" && clientMeta.tier) ||
      null;
    const apiResult = await callImageApi(finalPrompt, { customerTier });
    if (!apiResult.ok) {
      log(`api_failed reason=${apiResult.reason} msg=${apiResult.message}`);
      /* Persist failure marker so admin can see why no image.
         Wave 111 — was silent .catch(() => {}); if THIS write itself
         fails, the admin loses the "why" diagnostic — surface it. */
      await noisyCatch(
        persistImageMeta(draftId, {
          image_generation_status: "failed",
          image_generation_error: apiResult.message?.slice(0, 500),
          image_generation_at: new Date().toISOString(),
        }),
        {
          op: "contentflow.imageGen.persistFailureMeta",
          meta: { draftId, reason: apiResult.reason },
        },
      );
      return { ok: false, reason: apiResult.reason, message: apiResult.message, prompt_used: finalPrompt };
    }

    /* Best-effort R2 upload. Fall back to OpenAI URL.
     * When R2 upload fails and we fall back to the ephemeral OpenAI URL
     * (~1h TTL), schedule a background re-upload so the image persists
     * beyond the publish window. */
    /* gpt-image-1.x returns base64; DALL-E-style returns a CDN url.
     * Decode b64 to a Buffer and upload that directly — never persist
     * a multi-MB data URI to the DB as a fallback. */
    let imageBuffer = apiResult.b64 ? Buffer.from(apiResult.b64, "base64") : null;
    let finalUrl = apiResult.url;
    let provider: "openai" | "openai+r2" = "openai";

    /* AI-image anti-detection post-processing.
     * Runs SERVER-SIDE before R2 upload, so the bytes customers see are
     * already processed. Opt-out via opts.skipPostProcess OR feature flag
     * CONTENTFLOW_IMAGE_POSTPROCESS_ENABLED=false. Wrapped in try/catch so
     * any post-process failure NEVER breaks the publish pipeline — same
     * Sprint-11 hard rule that governs the whole image flow.
     *
     * Only runs when R2 is configured — we need somewhere to host the
     * new bytes. Without R2 we'd fall back to the provider's ephemeral
     * URL anyway, so post-processing would be discarded. */
    if (!opts?.skipPostProcess && isPostProcessEnabled() && isR2Configured()) {
      try {
        const sourceForPP: Buffer | string | null =
          imageBuffer ?? (apiResult.url ?? null);
        if (sourceForPP) {
          const processed = await postProcessAIImage(sourceForPP, {
            draftId,
            clientId: draft.client_id,
          });
          imageBuffer = processed;
          /* Once we own the post-processed bytes, force R2 upload of our
           * buffer (not the provider URL), otherwise R2 would store the
           * un-processed CDN image. finalUrl will be overwritten by the
           * R2 upload result below. */
          finalUrl = undefined;
        }
      } catch (ppErr: any) {
        logger.warn(`[contentflow][image-gen] draft=${draftId} post-process threw: ${ppErr?.message || ppErr} — using untouched image`);
      }
    }

    if (isR2Configured()) {
      const key = `${draft.client_id}/${draftId}/${crypto.randomBytes(6).toString("hex")}.png`;
      const upload = await uploadToR2(
        imageBuffer
          ? { key, buffer: imageBuffer, contentType: "image/png" }
          : { key, sourceUrl: apiResult.url!, contentType: "image/png" },
      );
      if (upload.ok && upload.url) {
        finalUrl = upload.url;
        provider = "openai+r2";
      } else {
        logger.warn(`[contentflow][image-gen] draft=${draftId} R2 upload failed (${upload.error}) — falling back to provider URL`);
        // Fire-and-forget background re-upload (only meaningful for url responses).
        // Wave 111 — was silent .catch(() => {}); re-upload failure
        // means the ephemeral OpenAI URL expires (~1h TTL) and the
        // hosted image dies silently. noisyCatch surfaces it.
        if (apiResult.url) {
          noisyCatch(scheduleR2Reupload(draftId, apiResult.url, key), {
            op: "contentflow.imageGen.scheduleR2Reupload",
            meta: { draftId, key },
          });
        }
        /* If post-process consumed the provider URL (finalUrl=undefined)
         * but R2 then failed, restore the original ephemeral URL so the
         * publish flow has SOMETHING to use — un-processed beats no image. */
        if (!finalUrl && apiResult.url) finalUrl = apiResult.url;
      }
    }

    /* b64 response + R2 failed = no hostable URL. Fail cleanly instead
     * of persisting a giant data URI or crashing on finalUrl.slice(). */
    if (!finalUrl) {
      log(`r2_failed_no_fallback`);
      // Wave 111 — same noisyCatch wrap; admin loses the "why" if this
      // write fails silently.
      await noisyCatch(
        persistImageMeta(draftId, {
          image_generation_status: "failed",
          image_generation_error: "R2 upload failed; gpt-image returned no hostable URL",
          image_generation_at: new Date().toISOString(),
        }),
        {
          op: "contentflow.imageGen.persistR2FailureMeta",
          meta: { draftId },
        },
      );
      return { ok: false, reason: "api_failed", message: "R2 upload failed and provider returned no hostable URL", prompt_used: finalPrompt };
    }

    /* Persist on draft.metadata.media_plan + audit fields. */
    await persistImageOnDraft(draftId, {
      imageUrl: finalUrl,
      revisedPrompt: apiResult.revised_prompt,
      provider,
      promptHash: crypto.createHash("sha256").update(finalPrompt).digest("hex").slice(0, 16),
      stylePreset: resolvedPreset,
    });

    /* Record estimated image-gen cost toward the monthly spend cap.
     * gpt-image-1.5 @ medium 1024² ≈ $0.04 → 40,000 micro-USD. */
    storage.addDraftGenerationCost(draftId, 40_000).catch(() => {});
    /* W-AX-1: also record toward the system-wide gate ($0.04 = 4 cents). */
    recordAiSpend("contentflow", 4).catch(() => {});

    log(`success provider=${provider} url=${finalUrl.slice(0, 80)}`);
    return {
      ok: true,
      image_url: finalUrl,
      provider,
      duration_ms: Date.now() - t0,
      prompt_used: finalPrompt,
    };
  } catch (err: any) {
    /* Defence-in-depth: NEVER let an unexpected throw bubble up to
     * the orchestrator. The publish pipeline must continue. */
    logger.error(`[contentflow][image-gen] draft=${draftId} unhandled:`, err?.message || err);
    return { ok: false, reason: "api_failed", message: err?.message || String(err) };
  }
}

/* ─── Background R2 re-upload (ephemeral URL recovery) ─────────── */

/**
 * After a publish attempt succeeds with an ephemeral OpenAI URL, this
 * function retries the R2 upload in the background. If it succeeds,
 * the draft's image URL is updated to the permanent R2 URL.
 *
 * Retry schedule: 3 attempts with 10s, 30s, 60s delays.
 * The ephemeral URL lives ~1h, so all 3 attempts fit comfortably.
 */
async function scheduleR2Reupload(draftId: number, ephemeralUrl: string, r2Key: string): Promise<void> {
  const delays = [10_000, 30_000, 60_000];

  for (let i = 0; i < delays.length; i++) {
    await new Promise((resolve) => setTimeout(resolve, delays[i]));

    try {
      const upload = await uploadToR2({ key: r2Key, sourceUrl: ephemeralUrl, contentType: "image/png" });
      if (upload.ok && upload.url) {
        // Update the draft's image URL to the permanent R2 URL
        const fresh = await storage.getContentDraftById(draftId);
        if (fresh) {
          const meta = (fresh.metadata || {}) as Record<string, any>;
          const mediaPlan = (meta.media_plan || {}) as Record<string, any>;
          await storage.updateContentDraft(draftId, {
            metadata: {
              ...meta,
              media_plan: {
                ...mediaPlan,
                image_url: upload.url,
                public_image_url: upload.url,
                image_provider: "openai+r2",
              },
            },
          } as any);
        }
        logger.info(`[contentflow][image-gen] draft=${draftId} R2 re-upload succeeded on attempt ${i + 1}`);
        return;
      }
      logger.warn(`[contentflow][image-gen] draft=${draftId} R2 re-upload attempt ${i + 1} failed: ${upload.error}`);
    } catch (err: any) {
      logger.warn(`[contentflow][image-gen] draft=${draftId} R2 re-upload attempt ${i + 1} error: ${err.message}`);
    }
  }

  logger.warn(`[contentflow][image-gen] draft=${draftId} R2 re-upload exhausted all attempts — image remains on ephemeral URL`);
}

/* ─── Persistence helpers (race-protected merge) ─────────────────── */

async function persistImageOnDraft(
  draftId: number,
  args: {
    imageUrl: string;
    revisedPrompt?: string;
    provider: string;
    promptHash: string;
    stylePreset?: ImageStylePresetId;
  },
): Promise<void> {
  const fresh = await storage.getContentDraftById(draftId);
  if (!fresh) return;
  const meta = (fresh.metadata || {}) as Record<string, any>;
  const mediaPlan = (meta.media_plan || {}) as Record<string, any>;
  await storage.updateContentDraft(draftId, {
    metadata: {
      ...meta,
      media_plan: {
        ...mediaPlan,
        image_url: args.imageUrl,
        public_image_url: args.imageUrl,
        image_provider: args.provider,
        image_prompt_hash: args.promptHash,
        image_revised_prompt: args.revisedPrompt ?? null,
        image_style_preset: args.stylePreset ?? null,
      },
      image_generation_status: "succeeded",
      image_generation_at: new Date().toISOString(),
    },
  } as any);
}

async function persistImageMeta(
  draftId: number,
  patch: Record<string, any>,
): Promise<void> {
  const fresh = await storage.getContentDraftById(draftId);
  if (!fresh) return;
  const meta = (fresh.metadata || {}) as Record<string, any>;
  await storage.updateContentDraft(draftId, {
    metadata: { ...meta, ...patch },
  } as any);
}
