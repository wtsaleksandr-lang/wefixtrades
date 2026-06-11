/**
 * ContentFlow Phase 2 — video render provider contract (WP3).
 *
 * Design: plans/contentflow-video-phase2-design.md §1.2. Submit/poll are
 * SPLIT so no request or job ever spans a multi-minute render — the worker
 * persists `operationRef` between ticks and polls with short (≤15s) calls.
 *
 * Providers NEVER throw from submit()/poll() — every failure is returned as
 * a typed result with a `retryable` classification:
 *   - 429 / RESOURCE_EXHAUSTED / 5xx / network / timeout → retryable: true
 *   - other 4xx (auth, validation)                       → retryable: false
 */

import { createLogger } from "../../../lib/logger";

const logger = createLogger("VideoProviders");

/* ─── Core types (design §1.2, verbatim) ───────────────────────────── */

export type VideoProviderId = "veo_31" | "kling_30";

export type VideoAspectRatio = "16:9" | "9:16" | "1:1";

export interface VideoProviderCapabilities {
  /** Longest single clip the provider can render, in seconds. */
  maxClipSec: number;
  aspectRatios: readonly VideoAspectRatio[];
  /** True when the provider can voice the narration natively in-render. */
  nativeAudio: boolean;
  /** Default output resolution label (e.g. "720p"). */
  resolution: string;
}

export interface VideoSubmitRequest {
  prompt: string;
  durationSec: number;
  aspectRatio: VideoAspectRatio;
  /** Narration text — embedded into the render when nativeAudio is true. */
  narration?: string | null;
  /** Caller-generated idempotency id (persisted as provider_request_id). */
  requestId: string;
  /**
   * Optional first-frame image for image-to-video endpoints. The v1
   * pipeline does not produce one — providers that REQUIRE an image must
   * report isConfigured()=false so the worker falls back (design §1.2).
   */
  imageUrl?: string | null;
}

export type VideoSubmitResult =
  | { status: "submitted"; operationRef: string }
  | { status: "failed"; error: string; retryable: boolean };

export type VideoPollResult =
  | { status: "running" }
  | {
      status: "done";
      videoUrl?: string;
      videoBytes?: Buffer;
      actualCostMicroUsd?: number;
    }
  | { status: "failed"; error: string; retryable: boolean };

export interface VideoRenderProvider {
  id: VideoProviderId;
  isConfigured(): boolean;
  capabilities: VideoProviderCapabilities;
  /** Estimated cost per clip in micro-USD (env-overridable, see below). */
  costMicroUsdPerClip(durationSec: number): number;
  submit(req: VideoSubmitRequest): Promise<VideoSubmitResult>;
  poll(operationRef: string): Promise<VideoPollResult>;
  /**
   * WP3 extension (optional): human-readable reason isConfigured() is
   * false, so the registry can log WHY a provider was skipped.
   */
  configurationGap?(): string | null;
}

/* ─── Retryability classification ──────────────────────────────────── */

/**
 * Classify an HTTP failure as retryable (transient) or permanent.
 * 429 / RESOURCE_EXHAUSTED / 408 / 5xx → retryable; other 4xx → permanent.
 */
export function isRetryableHttpFailure(status: number, bodyText?: string): boolean {
  if (status === 429 || status === 408) return true;
  if (status >= 500) return true;
  if (bodyText && /RESOURCE_EXHAUSTED/i.test(bodyText)) return true;
  return false;
}

/* ─── Cost overrides ───────────────────────────────────────────────── */

/**
 * VIDEO_COST_OVERRIDES_JSON — optional JSON object mapping provider id →
 * micro-USD per CLIP (flat, not per-second). Example:
 *   VIDEO_COST_OVERRIDES_JSON={"veo_31":3200000,"kling_30":420000}
 * Malformed JSON or non-numeric/negative values are logged and ignored
 * (the provider's built-in per-second default applies).
 */
export function costOverrideMicroUsdPerClip(providerId: VideoProviderId): number | null {
  const raw = process.env.VIDEO_COST_OVERRIDES_JSON;
  if (!raw || !raw.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.warn(
      `VIDEO_COST_OVERRIDES_JSON is not valid JSON — ignoring override (${(err as Error)?.message ?? err})`,
    );
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    logger.warn("VIDEO_COST_OVERRIDES_JSON must be a JSON object keyed by provider id — ignoring");
    return null;
  }
  const value = (parsed as Record<string, unknown>)[providerId];
  if (value === undefined || value === null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    logger.warn(`VIDEO_COST_OVERRIDES_JSON["${providerId}"] is not a non-negative number — ignoring`);
    return null;
  }
  return Math.round(n);
}

/* ─── HTTP helper (≤15s per call — hard pipeline invariant) ────────── */

/** Hard ceiling for any single provider HTTP call (design §3 / risk #3). */
export const PROVIDER_HTTP_TIMEOUT_MS = 15_000;

/**
 * fetch with an AbortController timeout, capped at PROVIDER_HTTP_TIMEOUT_MS.
 * Throws on timeout/network error — callers wrap in try/catch and map to
 * a retryable failure result.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = PROVIDER_HTTP_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const effective = Math.min(Math.max(1, timeoutMs), PROVIDER_HTTP_TIMEOUT_MS);
  const timer = setTimeout(() => ctrl.abort(), effective);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Map a thrown fetch error to a normalized failure message. */
export function describeFetchError(err: unknown): string {
  const e = err as { name?: string; message?: string } | null;
  if (e?.name === "AbortError") return "request timed out";
  return e?.message ? String(e.message) : String(err);
}
