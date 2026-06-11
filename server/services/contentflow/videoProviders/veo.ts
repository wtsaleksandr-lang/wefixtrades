/**
 * ContentFlow Phase 2 — Veo 3.1 render provider (Vertex AI LRO, split
 * submit/poll). Design §1.2.
 *
 * Auth + endpoint construction lifted from videoOrchestrator.ts
 * callGoogleVeo (ADC via GOOGLE_APPLICATION_CREDENTIALS_JSON +
 * google-auth-library lazy import), but SPLIT so the operation name is
 * persisted between worker ticks instead of being awaited in-process:
 *
 *   submit() → POST {model}:predictLongRunning   → operation name (ref)
 *   poll()   → POST {model}:fetchPredictOperation {operationName}
 *
 * NOTE: polling Vertex Veo LROs uses the Veo-specific
 * :fetchPredictOperation POST — NOT generic GET operations.get (research
 * addendum, us-central1 confirmed; SDK v1beta1 has a routing bug → REST v1).
 *
 * Env:
 *   GOOGLE_IMAGEN_PROJECT_ID (preferred) / GOOGLE_VEO_PROJECT_ID (fallback)
 *   GOOGLE_APPLICATION_CREDENTIALS_JSON (or ambient ADC)
 *   VEO_MODEL_ID            default "veo-3.1-generate-preview"
 *   VEO_RESOLUTION          "720p" (default) | "1080p" (only honored at 8s)
 *   GOOGLE_VIDEO_GCS_BUCKET optional — when set, storageUri is passed and
 *                           the rendered clip lands in GCS (Gemini-API-side
 *                           outputs are deleted after 2 days); when unset
 *                           we parse the inline base64 bytes instead.
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

const logger = createLogger("VeoProvider");

const VEO_DEFAULT_MODEL_ID = "veo-3.1-generate-preview"; // GA "-001" id unverified — keep env-overridable
const VEO_LOCATION = "us-central1"; // research-confirmed region for Veo LROs

/** Quality tier $0.40/s → micro-USD per second (env-overridable per clip). */
export const VEO_DEFAULT_COST_MICRO_USD_PER_SEC = 400_000;

/* ─── Env lookups (all lazy — read at call time, never at module load) ─ */

/**
 * Project id lookup replicates the imagen4 branch's pattern:
 * GOOGLE_IMAGEN_PROJECT_ID first, GOOGLE_VEO_PROJECT_ID as fallback.
 */
function veoProjectId(): string | null {
  const id =
    process.env.GOOGLE_IMAGEN_PROJECT_ID?.trim() ||
    process.env.GOOGLE_VEO_PROJECT_ID?.trim();
  return id || null;
}

function veoModelId(): string {
  return process.env.VEO_MODEL_ID?.trim() || VEO_DEFAULT_MODEL_ID;
}

function veoModelBase(projectId: string): string {
  return (
    `https://${VEO_LOCATION}-aiplatform.googleapis.com/v1/projects/${projectId}` +
    `/locations/${VEO_LOCATION}/publishers/google/models/${veoModelId()}`
  );
}

/* ─── Parameter shaping ────────────────────────────────────────────── */

/** Veo accepts exactly 4 | 6 | 8 seconds. Round UP so narration still fits. */
export function clampVeoDurationSec(durationSec: number): 4 | 6 | 8 {
  if (!Number.isFinite(durationSec) || durationSec <= 4) return 4;
  if (durationSec <= 6) return 6;
  return 8;
}

/** 720p default; 1080p only honored when the clip is the full 8s (API rule). */
export function veoResolution(clampedDurationSec: number): "720p" | "1080p" {
  const want = process.env.VEO_RESOLUTION?.trim();
  return want === "1080p" && clampedDurationSec === 8 ? "1080p" : "720p";
}

/**
 * Veo voices narration natively when the dialogue is embedded in the
 * prompt (research addendum: native dialogue/SFX via generateAudio).
 */
export function buildVeoPrompt(prompt: string, narration?: string | null): string {
  const line = narration?.trim();
  if (!line) return prompt;
  return `${prompt}\n\nA professional narrator voice-over says: "${line}"`;
}

function veoStorageUri(requestId: string): string | null {
  const bucket = process.env.GOOGLE_VIDEO_GCS_BUCKET?.trim();
  if (!bucket) return null;
  const clean = bucket.replace(/^gs:\/\//, "").replace(/\/+$/, "");
  return `gs://${clean}/contentflow/veo/${requestId}/`;
}

/* ─── Auth (lifted from videoOrchestrator.callGoogleVeo) ───────────── */

async function defaultGetAccessToken(): Promise<string | null> {
  /* Lazy-import google-auth-library so we don't pay the cost when Veo
   * isn't configured. Transitive dep via other Google SDKs. */
  let GoogleAuth: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    GoogleAuth = require("google-auth-library").GoogleAuth;
  } catch (err) {
    logger.warn(`google-auth-library not installed: ${describeFetchError(err)}`);
    return null;
  }
  try {
    const credJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    const auth = credJson
      ? new GoogleAuth({
          credentials: JSON.parse(credJson),
          scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        })
      : new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const client = await auth.getClient();
    const tokenResp = await client.getAccessToken();
    const token = typeof tokenResp === "string" ? tokenResp : tokenResp?.token;
    return token || null;
  } catch (err) {
    logger.warn(`failed to acquire Vertex access token: ${describeFetchError(err)}`);
    return null;
  }
}

export interface VeoProviderDeps {
  /** Test seam — defaults to real ADC token acquisition. */
  getAccessToken?: () => Promise<string | null>;
}

/* ─── Provider ─────────────────────────────────────────────────────── */

export function createVeoProvider(deps: VeoProviderDeps = {}): VideoRenderProvider {
  const getAccessToken = deps.getAccessToken ?? defaultGetAccessToken;

  const configurationGap = (): string | null => {
    if (!veoProjectId()) {
      return "GOOGLE_IMAGEN_PROJECT_ID / GOOGLE_VEO_PROJECT_ID missing";
    }
    return null;
  };

  return {
    id: "veo_31",

    capabilities: {
      maxClipSec: 8,
      aspectRatios: ["16:9", "9:16"],
      nativeAudio: true,
      resolution: "720p",
    },

    isConfigured(): boolean {
      return configurationGap() === null;
    },

    configurationGap,

    costMicroUsdPerClip(durationSec: number): number {
      const override = costOverrideMicroUsdPerClip("veo_31");
      if (override !== null) return override;
      return VEO_DEFAULT_COST_MICRO_USD_PER_SEC * clampVeoDurationSec(durationSec);
    },

    async submit(req: VideoSubmitRequest): Promise<VideoSubmitResult> {
      const gap = configurationGap();
      if (gap) return { status: "failed", error: `veo_31 not configured: ${gap}`, retryable: false };
      if (!this.capabilities.aspectRatios.includes(req.aspectRatio)) {
        return {
          status: "failed",
          error: `veo_31 does not support aspect ratio ${req.aspectRatio}`,
          retryable: false,
        };
      }
      try {
        const token = await getAccessToken();
        if (!token) {
          return { status: "failed", error: "veo_31: failed to acquire access token", retryable: false };
        }
        const projectId = veoProjectId()!;
        const durationSeconds = clampVeoDurationSec(req.durationSec);
        const narration = req.narration?.trim() || null;
        const storageUri = veoStorageUri(req.requestId);
        const parameters: Record<string, unknown> = {
          sampleCount: 1,
          durationSeconds,
          resolution: veoResolution(durationSeconds),
          aspectRatio: req.aspectRatio,
          /* Native dialogue/SFX only when there is narration to voice;
           * silent-render otherwise (music/TTS handled at stitch, §1.3). */
          generateAudio: !!narration,
        };
        if (storageUri) parameters.storageUri = storageUri;

        const res = await fetchWithTimeout(`${veoModelBase(projectId)}:predictLongRunning`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            instances: [{ prompt: buildVeoPrompt(req.prompt, narration) }],
            parameters,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return {
            status: "failed",
            error: `veo_31 submit ${res.status}: ${text.slice(0, 300)}`,
            retryable: isRetryableHttpFailure(res.status, text),
          };
        }
        const json = (await res.json().catch(() => ({}))) as { name?: string };
        const opName = json?.name;
        if (!opName || typeof opName !== "string") {
          return { status: "failed", error: "veo_31 submit: no operation name returned", retryable: false };
        }
        return { status: "submitted", operationRef: opName };
      } catch (err) {
        /* Network failure / timeout — transient by classification. */
        return { status: "failed", error: `veo_31 submit: ${describeFetchError(err)}`, retryable: true };
      }
    },

    async poll(operationRef: string): Promise<VideoPollResult> {
      const gap = configurationGap();
      if (gap) return { status: "failed", error: `veo_31 not configured: ${gap}`, retryable: false };
      try {
        const token = await getAccessToken();
        if (!token) {
          return { status: "failed", error: "veo_31: failed to acquire access token", retryable: false };
        }
        const projectId = veoProjectId()!;
        /* Veo-specific LRO poll: POST :fetchPredictOperation with the
         * operation name in the body — generic GET operations.get 404s. */
        const res = await fetchWithTimeout(`${veoModelBase(projectId)}:fetchPredictOperation`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ operationName: operationRef }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return {
            status: "failed",
            error: `veo_31 poll ${res.status}: ${text.slice(0, 300)}`,
            retryable: isRetryableHttpFailure(res.status, text),
          };
        }
        const op = (await res.json().catch(() => ({}))) as {
          done?: boolean;
          error?: { code?: number; message?: string; status?: string };
          response?: {
            videos?: Array<Record<string, any>>;
            predictions?: Array<Record<string, any>>;
            raiMediaFilteredCount?: number;
          };
        };
        if (op?.done !== true) return { status: "running" };
        if (op.error) {
          const message = op.error.message || op.error.status || "unknown operation error";
          const retryable =
            op.error.code === 429 ||
            /RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|INTERNAL/i.test(
              `${op.error.status ?? ""} ${message}`,
            );
          return { status: "failed", error: `veo_31 operation error: ${message}`, retryable };
        }
        const video = op.response?.videos?.[0] ?? op.response?.predictions?.[0];
        const url = video?.gcsUri ?? video?.uri ?? video?.videoUri;
        const b64 = video?.bytesBase64Encoded;
        if (typeof url === "string" && url) return { status: "done", videoUrl: url };
        if (typeof b64 === "string" && b64) {
          return { status: "done", videoBytes: Buffer.from(b64, "base64") };
        }
        /* Done with no payload (e.g. RAI-filtered output) — retrying the
         * same finished operation can never produce a video. */
        return {
          status: "failed",
          error: "veo_31: operation done but no video payload (possibly safety-filtered)",
          retryable: false,
        };
      } catch (err) {
        return { status: "failed", error: `veo_31 poll: ${describeFetchError(err)}`, retryable: true };
      }
    },
  };
}

/** Default instance used by the registry (real ADC auth). */
export const veoProvider: VideoRenderProvider = createVeoProvider();
