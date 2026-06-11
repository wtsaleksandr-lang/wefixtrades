/**
 * ContentFlow Phase 2 — video provider registry + per-scene selection.
 * Design §1.2 (index.ts): ordered registry [veo_31, kling_30],
 * VIDEO_PROVIDER_ORDER override, graceful env-skip with logged reason,
 * per-provider inflight cap (VIDEO_MAX_INFLIGHT_PER_PROVIDER, default 4).
 */

import { createLogger } from "../../../lib/logger";
import { veoProvider } from "./veo";
import { klingProvider } from "./kling";
import type { VideoAspectRatio, VideoProviderId, VideoRenderProvider } from "./types";

export type {
  VideoAspectRatio,
  VideoProviderCapabilities,
  VideoProviderId,
  VideoPollResult,
  VideoRenderProvider,
  VideoSubmitRequest,
  VideoSubmitResult,
} from "./types";
export { costOverrideMicroUsdPerClip, isRetryableHttpFailure } from "./types";
export { createVeoProvider, veoProvider } from "./veo";
export { createKlingProvider, klingProvider } from "./kling";

const logger = createLogger("VideoProviderRegistry");

/** Preference order: Veo first (native audio, quality), Kling fallback. */
export const DEFAULT_PROVIDER_ORDER: readonly VideoProviderId[] = ["veo_31", "kling_30"];

export const DEFAULT_MAX_INFLIGHT_PER_PROVIDER = 4;

const REGISTRY: Record<VideoProviderId, VideoRenderProvider> = {
  veo_31: veoProvider,
  kling_30: klingProvider,
};

function isVideoProviderId(value: string): value is VideoProviderId {
  return value === "veo_31" || value === "kling_30";
}

export function getProviderById(id: string): VideoRenderProvider | null {
  return isVideoProviderId(id) ? REGISTRY[id] : null;
}

/**
 * Ordered provider ids — VIDEO_PROVIDER_ORDER (comma-separated) overrides
 * the default. Unknown ids are logged + dropped; an override that leaves
 * nothing valid falls back to the default order.
 */
export function getProviderOrder(): VideoProviderId[] {
  const raw = process.env.VIDEO_PROVIDER_ORDER?.trim();
  if (!raw) return [...DEFAULT_PROVIDER_ORDER];
  const seen = new Set<VideoProviderId>();
  const order: VideoProviderId[] = [];
  for (const entry of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (!isVideoProviderId(entry)) {
      logger.warn(`VIDEO_PROVIDER_ORDER contains unknown provider id "${entry}" — ignoring`);
      continue;
    }
    if (seen.has(entry)) continue;
    seen.add(entry);
    order.push(entry);
  }
  if (order.length === 0) {
    logger.warn("VIDEO_PROVIDER_ORDER has no valid provider ids — using default order");
    return [...DEFAULT_PROVIDER_ORDER];
  }
  return order;
}

/**
 * Ordered, configured providers. Unconfigured providers are skipped
 * gracefully with the reason logged (never throws).
 */
export function getConfiguredProviders(): VideoRenderProvider[] {
  const configured: VideoRenderProvider[] = [];
  for (const id of getProviderOrder()) {
    const provider = REGISTRY[id];
    if (!provider.isConfigured()) {
      logger.info(
        `skipping provider ${id}: ${provider.configurationGap?.() ?? "not configured"}`,
      );
      continue;
    }
    configured.push(provider);
  }
  return configured;
}

/** VIDEO_MAX_INFLIGHT_PER_PROVIDER (default 4). */
export function maxInflightPerProvider(): number {
  const raw = process.env.VIDEO_MAX_INFLIGHT_PER_PROVIDER?.trim();
  if (!raw) return DEFAULT_MAX_INFLIGHT_PER_PROVIDER;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    logger.warn(
      `VIDEO_MAX_INFLIGHT_PER_PROVIDER="${raw}" is not a positive number — using default ${DEFAULT_MAX_INFLIGHT_PER_PROVIDER}`,
    );
    return DEFAULT_MAX_INFLIGHT_PER_PROVIDER;
  }
  return Math.floor(n);
}

/** The scene fields that drive provider selection. */
export interface SceneForProviderPick {
  durationSec: number;
  aspectRatio: VideoAspectRatio;
  narration?: string | null;
}

/**
 * Pick the first configured provider (in order) that (a) has inflight
 * headroom under the per-provider cap, and (b) can render the scene
 * (clip length + aspect ratio). Returns null when every provider is
 * capped or incapable — the worker leaves the scene planned and retries
 * next tick.
 */
export function pickProviderForScene(
  scene: SceneForProviderPick,
  inflightCounts: Partial<Record<VideoProviderId, number>>,
  capOverride?: number,
): VideoRenderProvider | null {
  const cap = capOverride ?? maxInflightPerProvider();
  for (const provider of getConfiguredProviders()) {
    const inflight = inflightCounts[provider.id] ?? 0;
    if (inflight >= cap) {
      logger.info(`provider ${provider.id} at inflight cap (${inflight}/${cap}) — trying next`);
      continue;
    }
    if (scene.durationSec > provider.capabilities.maxClipSec) {
      logger.info(
        `provider ${provider.id} max clip ${provider.capabilities.maxClipSec}s < scene ${scene.durationSec}s — trying next`,
      );
      continue;
    }
    if (!provider.capabilities.aspectRatios.includes(scene.aspectRatio)) {
      logger.info(
        `provider ${provider.id} does not support aspect ratio ${scene.aspectRatio} — trying next`,
      );
      continue;
    }
    return provider;
  }
  return null;
}
