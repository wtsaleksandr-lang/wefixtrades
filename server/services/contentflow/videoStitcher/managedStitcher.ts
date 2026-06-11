/**
 * ContentFlow Phase 2 — managed (hosted) stitcher (WP5).
 *
 * Design §1.4: Shotstack-class render API (~$0.40/min PAYG) behind two env
 * vars — STITCH_API_BASE + STITCH_API_KEY. When either is absent the
 * stitcher reports unavailable and the selection ladder in ./index.ts skips
 * it. Intentionally THIN: the interface contract (submit scene URLs → get
 * an {operationRef} → poll → download) is what downstream code depends on;
 * exact vendor payload shapes are finalized when a vendor is chosen. The
 * submit/poll split is exported separately so the worker can persist
 * `stitch_operation_ref` on the project and resume polling across restarts
 * (same resumability shape as the scene render providers).
 *
 * Assumed generic API shape (Shotstack-style):
 *   POST {base}/stitch         {scenes:[{url,durationSec}],aspectRatio,narrationUrl?} → {id}
 *   GET  {base}/stitch/{id}    → {status:"queued"|"rendering"|"done"|"failed", url?, error?}
 * Auth: `x-api-key: STITCH_API_KEY` header.
 */

import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createLogger } from "../../../lib/logger";
import type {
  StitchOptions,
  StitchRequest,
  StitchResult,
  VideoStitcher,
} from "./types";

const log = createLogger("ManagedStitcher");

const SUBMIT_TIMEOUT_MS = 15_000;
const POLL_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 5_000;
/** In-process poll budget for the blocking stitch() wrapper. */
const MAX_POLL_MS = 8 * 60_000;

export interface ManagedStitcherDeps {
  fetch: typeof globalThis.fetch;
  env: Record<string, string | undefined>;
  /** Injected for tests so the poll loop doesn't sleep for real. */
  sleep: (ms: number) => Promise<void>;
}

export type ManagedSubmitResult =
  | { ok: true; operationRef: string }
  | { ok: false; error: string; retryable?: boolean };

export type ManagedPollResult =
  | { status: "running" }
  | { status: "done"; videoUrl: string }
  | { status: "failed"; error: string; retryable: boolean };

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readConfig(env: Record<string, string | undefined>): {
  base: string;
  key: string;
} | null {
  const base = env.STITCH_API_BASE?.trim();
  const key = env.STITCH_API_KEY?.trim();
  if (!base || !key) return null;
  return { base: base.replace(/\/+$/, ""), key };
}

async function timedFetch(
  fetchFn: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function createManagedStitcher(
  overrides: Partial<ManagedStitcherDeps> = {},
): VideoStitcher & {
  submitStitch(req: StitchRequest): Promise<ManagedSubmitResult>;
  pollStitch(operationRef: string): Promise<ManagedPollResult>;
} {
  const deps: ManagedStitcherDeps = {
    fetch: overrides.fetch ?? globalThis.fetch,
    env: overrides.env ?? process.env,
    sleep: overrides.sleep ?? defaultSleep,
  };

  /**
   * Submit scene URLs for hosted stitching. Scenes must be URL-addressable
   * (R2 scene assets are — design §1.5 persists scene-{n}.mp4 per scene);
   * local-only file paths cannot be stitched by a hosted service.
   */
  async function submitStitch(req: StitchRequest): Promise<ManagedSubmitResult> {
    const cfg = readConfig(deps.env);
    if (!cfg) {
      return { ok: false, error: "managed stitcher not configured" };
    }
    const sceneUrls = req.scenes.map((s) => s.url).filter(Boolean);
    if (sceneUrls.length !== req.scenes.length) {
      return {
        ok: false,
        error: "managed stitcher requires every scene to have a url",
      };
    }
    try {
      const res = await timedFetch(
        deps.fetch,
        `${cfg.base}/stitch`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": cfg.key,
          },
          body: JSON.stringify({
            scenes: req.scenes.map((s) => ({
              url: s.url,
              durationSec: s.durationSec,
            })),
            aspectRatio: req.aspectRatio,
            // Narration for the managed path must also be URL-addressable;
            // v1 keeps narration on the ffmpeg path (worker decides).
          }),
        },
        SUBMIT_TIMEOUT_MS,
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          ok: false,
          error: `managed stitch submit failed: HTTP ${res.status} ${body.slice(0, 200)}`,
          retryable: res.status === 429 || res.status >= 500,
        };
      }
      const data: any = await res.json();
      const id = data?.id ?? data?.response?.id;
      if (!id || typeof id !== "string") {
        return { ok: false, error: "managed stitch submit returned no id" };
      }
      return { ok: true, operationRef: id };
    } catch (err: any) {
      return {
        ok: false,
        error: `managed stitch submit threw: ${err?.message || err}`,
        retryable: true,
      };
    }
  }

  /** One short poll — safe to call from a worker tick (≤15s budget). */
  async function pollStitch(operationRef: string): Promise<ManagedPollResult> {
    const cfg = readConfig(deps.env);
    if (!cfg) {
      return {
        status: "failed",
        error: "managed stitcher not configured",
        retryable: false,
      };
    }
    try {
      const res = await timedFetch(
        deps.fetch,
        `${cfg.base}/stitch/${encodeURIComponent(operationRef)}`,
        { method: "GET", headers: { "x-api-key": cfg.key } },
        POLL_TIMEOUT_MS,
      );
      if (!res.ok) {
        return {
          status: "failed",
          error: `managed stitch poll failed: HTTP ${res.status}`,
          retryable: res.status === 429 || res.status >= 500,
        };
      }
      const data: any = await res.json();
      const status = data?.status ?? data?.response?.status;
      if (status === "done" || status === "completed") {
        const url = data?.url ?? data?.response?.url;
        if (!url) {
          return {
            status: "failed",
            error: "managed stitch done but returned no url",
            retryable: false,
          };
        }
        return { status: "done", videoUrl: url };
      }
      if (status === "failed" || status === "error") {
        return {
          status: "failed",
          error: String(data?.error ?? "managed stitch failed"),
          retryable: false,
        };
      }
      return { status: "running" };
    } catch (err: any) {
      return {
        status: "failed",
        error: `managed stitch poll threw: ${err?.message || err}`,
        retryable: true,
      };
    }
  }

  return {
    id: "managed",

    submitStitch,
    pollStitch,

    async isAvailable(): Promise<boolean> {
      return readConfig(deps.env) !== null;
    },

    /**
     * Blocking convenience wrapper over submit + poll + download, satisfying
     * the VideoStitcher contract. The worker may instead use submitStitch /
     * pollStitch directly with a persisted stitch_operation_ref for full
     * restart resumability.
     */
    async stitch(req: StitchRequest, opts: StitchOptions): Promise<StitchResult> {
      const submitted = await submitStitch(req);
      if (!submitted.ok) {
        return { ok: false, error: submitted.error, retryable: submitted.retryable };
      }

      const deadline = Date.now() + MAX_POLL_MS;
      let videoUrl: string | null = null;
      while (Date.now() < deadline) {
        const polled = await pollStitch(submitted.operationRef);
        if (polled.status === "done") {
          videoUrl = polled.videoUrl;
          break;
        }
        if (polled.status === "failed") {
          return { ok: false, error: polled.error, retryable: polled.retryable };
        }
        await deps.sleep(POLL_INTERVAL_MS);
      }
      if (!videoUrl) {
        return {
          ok: false,
          error: `managed stitch timed out after ${MAX_POLL_MS}ms`,
          retryable: true,
        };
      }

      // Stream the finished render to disk (same no-buffering rule as the
      // ffmpeg path — final videos can be large).
      try {
        await mkdir(opts.workDir, { recursive: true });
        const finalPath = join(opts.workDir, "final.mp4");
        const res = await deps.fetch(videoUrl);
        if (!res.ok || !res.body) {
          return {
            ok: false,
            error: `managed stitch result download failed: HTTP ${res.status}`,
            retryable: true,
          };
        }
        const nodeStream = Readable.fromWeb(
          res.body as unknown as import("node:stream/web").ReadableStream,
        );
        await pipeline(nodeStream, createWriteStream(finalPath));
        const s = await stat(finalPath);
        if (s.size === 0) {
          return { ok: false, error: "managed stitch result was empty", retryable: true };
        }
        return { ok: true, filePath: finalPath };
      } catch (err: any) {
        log.warn("managed stitch download failed", { error: err?.message });
        return {
          ok: false,
          error: `managed stitch download failed: ${err?.message || err}`,
          retryable: true,
        };
      }
    },
  };
}

/** Default instance used by the selection ladder in ./index.ts. */
export const managedStitcher = createManagedStitcher();
