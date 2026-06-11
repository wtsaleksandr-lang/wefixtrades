/**
 * ContentFlow Phase 2 — stitcher selection ladder (WP5).
 *
 * STITCHER_PROVIDER env:
 *   - "auto" (default): probe local ffmpeg → fall back to the managed API
 *     if configured → otherwise unavailable.
 *   - "ffmpeg":  force the local ffmpeg stitcher (unavailable if no binary).
 *   - "managed": force the hosted stitcher (unavailable if env absent).
 *
 * When nothing is available, callers receive the stable error constant
 * STITCHER_UNAVAILABLE ("stitcher_unavailable") — the worker marks the
 * project needs_attention and raises an admin notice (design §1.4 / §7.2).
 *
 * singleSceneBypass: 1-scene projects skip stitching entirely — the lone
 * rendered scene IS the final video (the worker copies/uploads it as the
 * final asset). Saves an entire re-encode and removes the ffmpeg dependency
 * for the most common short-video case.
 */

import { ffmpegStitcher } from "./ffmpegStitcher";
import { managedStitcher } from "./managedStitcher";
import type { StitchSceneInput, VideoStitcher } from "./types";

export * from "./types";
export { createFfmpegStitcher, ffmpegStitcher } from "./ffmpegStitcher";
export {
  createManagedStitcher,
  managedStitcher,
  type ManagedPollResult,
  type ManagedSubmitResult,
} from "./managedStitcher";

/** Stable error code surfaced when no stitcher backend is usable. */
export const STITCHER_UNAVAILABLE = "stitcher_unavailable";

export type StitcherProviderSetting = "auto" | "ffmpeg" | "managed";

export type StitcherSelection =
  | { ok: true; stitcher: VideoStitcher }
  | { ok: false; error: typeof STITCHER_UNAVAILABLE };

function parseProviderSetting(raw: string | undefined): StitcherProviderSetting {
  const v = (raw ?? "auto").trim().toLowerCase();
  if (v === "ffmpeg" || v === "managed") return v;
  return "auto";
}

/**
 * Pure selection ladder — injectable candidates so tests can exercise the
 * fallback logic without a real ffmpeg binary or network.
 */
export async function selectStitcher(params: {
  provider?: StitcherProviderSetting;
  ffmpeg?: VideoStitcher;
  managed?: VideoStitcher;
}): Promise<StitcherSelection> {
  const provider = params.provider ?? "auto";
  const ffmpeg = params.ffmpeg ?? ffmpegStitcher;
  const managed = params.managed ?? managedStitcher;

  const candidates: VideoStitcher[] =
    provider === "ffmpeg"
      ? [ffmpeg]
      : provider === "managed"
        ? [managed]
        : [ffmpeg, managed];

  for (const candidate of candidates) {
    if (await candidate.isAvailable()) {
      return { ok: true, stitcher: candidate };
    }
  }
  return { ok: false, error: STITCHER_UNAVAILABLE };
}

/**
 * Resolve the active stitcher per STITCHER_PROVIDER. Availability probes are
 * cached inside each implementation, so this is cheap to call every worker
 * tick.
 */
export async function getStitcher(): Promise<StitcherSelection> {
  return selectStitcher({
    provider: parseProviderSetting(process.env.STITCHER_PROVIDER),
  });
}

/**
 * 1-scene fast path: when a project has exactly one rendered scene there is
 * nothing to concatenate — return that scene so the caller can use its file
 * (or URL) directly as the final video. Returns null when a real stitch is
 * required (0 or 2+ scenes).
 */
export function singleSceneBypass(
  scenes: StitchSceneInput[],
): StitchSceneInput | null {
  if (scenes.length === 1) return scenes[0];
  return null;
}
