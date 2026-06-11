/**
 * ContentFlow Phase 2 — Kling 3.0 render provider via fal.ai queue API.
 * Design §1.2. Split submit/poll on fal's async queue.
 *
 * ENDPOINT FINDING (verified against fal.ai API docs, 2026-06-11):
 * The design pinned `fal-ai/kling-video/v3/standard/image-to-video`, but
 * that endpoint REQUIRES `start_image_url` (it is genuinely
 * image-to-video, not "i2v-named but prompt-only"). fal exposes a
 * text-to-video sibling — `fal-ai/kling-video/v3/standard/text-to-video`
 * — that takes prompt-only with `duration` (3–15s string enum),
 * `aspect_ratio` (16:9|9:16|1:1) and `generate_audio` (DEFAULT TRUE —
 * we explicitly disable it: silent render + TTS at stitch, design §1.3,
 * and the no-audio $0.084/s rate applies instead of $0.126/s).
 *
 * So the default here is the text-to-video endpoint. KLING_FAL_ENDPOINT
 * can override (e.g. pro tier, or i2v once the pipeline produces a
 * first-frame image). If the configured endpoint is image-to-video and
 * the pipeline supplies no image, isConfigured() returns false so the
 * worker falls back to Veo.
 *
 * Queue flow:
 *   submit → POST https://queue.fal.run/{endpoint} (Authorization: Key FAL_KEY)
 *            → { request_id, status_url, response_url }  (all persisted in ref)
 *   poll   → GET status_url → IN_QUEUE | IN_PROGRESS | COMPLETED
 *            COMPLETED → GET response_url → { video: { url } }
 *
 * Env: FAL_KEY (shared with future Flux 2), KLING_FAL_ENDPOINT (optional).
 */

import { createLogger } from "../../../lib/logger";
import {
  type VideoRenderProvider,
  type VideoSubmitRequest,
  type VideoSubmitResult,
  type VideoPollResult,
  costOverrideMicroUsdPerClip,
  isRetryableHttpFailure,
  fetchWithTimeout,
  describeFetchError,
} from "./types";

const logger = createLogger("KlingProvider");

export const KLING_DEFAULT_ENDPOINT =
  "https://queue.fal.run/fal-ai/kling-video/v3/standard/text-to-video";

/** $0.084/s no-audio → micro-USD per second (we always render no-audio). */
export const KLING_DEFAULT_COST_MICRO_USD_PER_SEC = 84_000;
/** $0.126/s with native audio — documented for reference; unused while
 * generate_audio stays disabled (nativeAudio=false, TTS at stitch). */
export const KLING_AUDIO_COST_MICRO_USD_PER_SEC = 126_000;

/* ─── Env lookups (lazy) ───────────────────────────────────────────── */

function klingEndpoint(): string {
  const raw = process.env.KLING_FAL_ENDPOINT?.trim();
  if (!raw) return KLING_DEFAULT_ENDPOINT;
  /* Accept either a full URL or a bare fal model path. */
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "");
  return `https://queue.fal.run/${raw.replace(/^\/+|\/+$/g, "")}`;
}

function falKey(): string | null {
  return process.env.FAL_KEY?.trim() || null;
}

/** fal i2v endpoints require start_image_url — prompt-only cannot run them. */
export function isImageRequiredEndpoint(endpoint: string): boolean {
  return /image-to-video/i.test(endpoint);
}

/** fal Kling v3 duration enum is 3–15 (string). Round to nearest integer. */
export function clampKlingDurationSec(durationSec: number): number {
  if (!Number.isFinite(durationSec)) return 5;
  return Math.min(15, Math.max(3, Math.round(durationSec)));
}

/* ─── Operation ref encoding ───────────────────────────────────────── */

interface KlingOperationRef {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
}

/**
 * operationRef is a JSON blob carrying the fal status/response URLs so a
 * later endpoint-env change can't orphan in-flight requests. A bare
 * request id (legacy/manual) still works — URLs are derived from the
 * model base ({owner}/{model} prefix of the configured endpoint).
 */
function encodeOperationRef(ref: KlingOperationRef): string {
  return JSON.stringify(ref);
}

export function decodeOperationRef(operationRef: string): KlingOperationRef | null {
  const trimmed = operationRef.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<KlingOperationRef>;
      if (parsed.requestId && parsed.statusUrl && parsed.responseUrl) {
        return parsed as KlingOperationRef;
      }
    } catch (err) {
      logger.warn(`kling_30: unparseable operationRef JSON: ${describeFetchError(err)}`);
      return null;
    }
    return null;
  }
  /* Bare request id — derive queue URLs from the model base. fal queue
   * status/result endpoints live under the {owner}/{model} prefix. */
  let path: string;
  try {
    path = new URL(klingEndpoint()).pathname.replace(/^\/+/, "");
  } catch (err) {
    logger.warn(`kling_30: invalid KLING_FAL_ENDPOINT: ${describeFetchError(err)}`);
    return null;
  }
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const base = `https://queue.fal.run/${segments[0]}/${segments[1]}/requests/${trimmed}`;
  return { requestId: trimmed, statusUrl: `${base}/status`, responseUrl: base };
}

/* ─── Provider ─────────────────────────────────────────────────────── */

export function createKlingProvider(): VideoRenderProvider {
  const configurationGap = (): string | null => {
    if (!falKey()) return "FAL_KEY missing";
    if (isImageRequiredEndpoint(klingEndpoint())) {
      return (
        "KLING_FAL_ENDPOINT is an image-to-video endpoint (start_image_url required) " +
        "and the pipeline supplies no first-frame image — use the text-to-video endpoint"
      );
    }
    return null;
  };

  return {
    id: "kling_30",

    capabilities: {
      /* fal Kling v3 duration enum tops out at 15s (verified); scenes are
       * director-clamped to 4-8s anyway. */
      maxClipSec: 15,
      aspectRatios: ["16:9", "9:16", "1:1"],
      /* Kling v3 has generate_audio (auto SFX/voice), but it is not
       * controllable narration — narration is TTS'd at stitch (§1.3). */
      nativeAudio: false,
      resolution: "720p", // fal tier→resolution mapping unverified (research addendum)
    },

    isConfigured(): boolean {
      return configurationGap() === null;
    },

    configurationGap,

    costMicroUsdPerClip(durationSec: number): number {
      const override = costOverrideMicroUsdPerClip("kling_30");
      if (override !== null) return override;
      return KLING_DEFAULT_COST_MICRO_USD_PER_SEC * clampKlingDurationSec(durationSec);
    },

    async submit(req: VideoSubmitRequest): Promise<VideoSubmitResult> {
      const key = falKey();
      if (!key) return { status: "failed", error: "kling_30 not configured: FAL_KEY missing", retryable: false };
      const endpoint = klingEndpoint();
      const imageRequired = isImageRequiredEndpoint(endpoint);
      const imageUrl = req.imageUrl?.trim() || null;
      if (imageRequired && !imageUrl) {
        return {
          status: "failed",
          error: `kling_30: endpoint ${endpoint} requires a first-frame image (start_image_url) and none was provided`,
          retryable: false,
        };
      }
      try {
        const body: Record<string, unknown> = {
          prompt: req.prompt,
          duration: String(clampKlingDurationSec(req.durationSec)),
          /* fal defaults generate_audio to TRUE and bills $0.126/s —
           * explicitly disable: silent render, narration TTS'd at stitch. */
          generate_audio: false,
        };
        if (imageRequired && imageUrl) {
          body.start_image_url = imageUrl; // i2v derives aspect from the image
        } else {
          body.aspect_ratio = req.aspectRatio;
        }

        const res = await fetchWithTimeout(endpoint, {
          method: "POST",
          headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return {
            status: "failed",
            error: `kling_30 submit ${res.status}: ${text.slice(0, 300)}`,
            retryable: isRetryableHttpFailure(res.status, text),
          };
        }
        const json = (await res.json().catch(() => ({}))) as {
          request_id?: string;
          status_url?: string;
          response_url?: string;
        };
        if (!json?.request_id) {
          return { status: "failed", error: "kling_30 submit: no request_id returned", retryable: false };
        }
        const fallback = decodeOperationRef(json.request_id);
        return {
          status: "submitted",
          operationRef: encodeOperationRef({
            requestId: json.request_id,
            statusUrl: json.status_url || fallback?.statusUrl || "",
            responseUrl: json.response_url || fallback?.responseUrl || "",
          }),
        };
      } catch (err) {
        return { status: "failed", error: `kling_30 submit: ${describeFetchError(err)}`, retryable: true };
      }
    },

    async poll(operationRef: string): Promise<VideoPollResult> {
      const key = falKey();
      if (!key) return { status: "failed", error: "kling_30 not configured: FAL_KEY missing", retryable: false };
      const ref = decodeOperationRef(operationRef);
      if (!ref || !ref.statusUrl || !ref.responseUrl) {
        return { status: "failed", error: "kling_30 poll: unusable operationRef", retryable: false };
      }
      try {
        const statusRes = await fetchWithTimeout(ref.statusUrl, {
          method: "GET",
          headers: { Authorization: `Key ${key}` },
        });
        if (!statusRes.ok) {
          const text = await statusRes.text().catch(() => "");
          return {
            status: "failed",
            error: `kling_30 poll ${statusRes.status}: ${text.slice(0, 300)}`,
            retryable: isRetryableHttpFailure(statusRes.status, text),
          };
        }
        const statusJson = (await statusRes.json().catch(() => ({}))) as { status?: string };
        const queueStatus = (statusJson?.status || "").toUpperCase();
        if (queueStatus === "IN_QUEUE" || queueStatus === "IN_PROGRESS") {
          return { status: "running" };
        }
        if (queueStatus !== "COMPLETED") {
          return {
            status: "failed",
            error: `kling_30: queue status ${queueStatus || "unknown"}`,
            retryable: false,
          };
        }

        const resultRes = await fetchWithTimeout(ref.responseUrl, {
          method: "GET",
          headers: { Authorization: `Key ${key}` },
        });
        if (!resultRes.ok) {
          const text = await resultRes.text().catch(() => "");
          return {
            status: "failed",
            error: `kling_30 result ${resultRes.status}: ${text.slice(0, 300)}`,
            retryable: isRetryableHttpFailure(resultRes.status, text),
          };
        }
        const result = (await resultRes.json().catch(() => ({}))) as {
          video?: { url?: string };
        };
        const videoUrl = result?.video?.url;
        if (typeof videoUrl === "string" && videoUrl) {
          return { status: "done", videoUrl };
        }
        /* Completed with no payload — re-polling a finished request can
         * never produce a video. Permanent. */
        return {
          status: "failed",
          error: "kling_30: request completed but no video payload",
          retryable: false,
        };
      } catch (err) {
        return { status: "failed", error: `kling_30 poll: ${describeFetchError(err)}`, retryable: true };
      }
    },
  };
}

/** Default instance used by the registry. */
export const klingProvider: VideoRenderProvider = createKlingProvider();
