/**
 * ContentFlow Phase 2 — local-ffmpeg stitcher (WP5).
 *
 * Design §1.4: download the rendered scene clips SEQUENTIALLY into the
 * work dir via STREAMING file IO (stream pipeline into a write stream —
 * never materializing a whole video clip in memory; clips are tens of MB
 * and Replit containers are small — a static test guards this rule), then
 * normalize + concatenate with the concat demuxer:
 *
 *   ffmpeg -f concat -safe 0 -i list.txt \
 *     -c:v libx264 -preset veryfast -r 30 -pix_fmt yuv420p -c:a aac out.mp4
 *
 * If a narration track is provided, a second ffmpeg pass mixes it over the
 * concatenated video. Ducking approach: simple `volume` + `amix` (native
 * audio attenuated to 25% under the voice-over) — chosen over
 * sidechaincompress for reliability: it has no threshold tuning, behaves
 * identically across ffmpeg builds, and degrades predictably. If the concat
 * output has no native audio stream (silent renders, e.g. Kling no-audio),
 * the mix pass fails fast and we retry mapping the narration as the only
 * audio track.
 *
 * Concurrency: module-level single-flight lock — at most ONE stitch runs at
 * a time process-wide (stitching is CPU/disk heavy; the worker's
 * VIDEO_STITCH_BATCH=1 makes this belt-and-braces). Additional callers
 * queue behind the in-flight run rather than failing.
 *
 * Cleanup: every intermediate (downloaded scenes, list.txt, pre-mix pass)
 * lives in `<workDir>/intermediates` and is removed in a `finally`; only
 * the final mp4 remains in workDir for the caller to upload + delete.
 */

import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rm, writeFile, stat } from "node:fs/promises";
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

const log = createLogger("FfmpegStitcher");

const PROBE_TIMEOUT_MS = 5_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const STITCH_TIMEOUT_MS = 10 * 60_000;

/** Injectable deps so tests can run without a real ffmpeg binary/network. */
export interface FfmpegStitcherDeps {
  spawn: typeof nodeSpawn;
  fetch: typeof globalThis.fetch;
  ffmpegBinary: string;
}

interface SpawnOutcome {
  ok: boolean;
  code: number | null;
  stderrTail: string;
  error?: string;
}

/**
 * Run a child process to completion with a hard timeout. Collects a bounded
 * tail of stderr for error reporting. Never throws.
 */
function runProcess(
  spawnFn: typeof nodeSpawn,
  binary: string,
  args: string[],
  timeoutMs: number,
): Promise<SpawnOutcome> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawnFn(binary, args, { stdio: ["ignore", "ignore", "pipe"] });
    } catch (err: any) {
      resolve({
        ok: false,
        code: null,
        stderrTail: "",
        error: err?.message || "spawn failed",
      });
      return;
    }

    let stderrTail = "";
    let settled = false;
    const settle = (outcome: SpawnOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch (killErr: any) {
        log.warn("failed to kill timed-out process", {
          binary,
          error: killErr?.message,
        });
      }
      settle({
        ok: false,
        code: null,
        stderrTail,
        error: `timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.stderr?.on("data", (chunk: unknown) => {
      stderrTail = (stderrTail + String(chunk)).slice(-2_000);
    });
    child.on("error", (err) => {
      settle({ ok: false, code: null, stderrTail, error: err.message });
    });
    child.on("close", (code) => {
      settle({
        ok: code === 0,
        code,
        stderrTail,
        error: code === 0 ? undefined : `exit code ${code}`,
      });
    });
  });
}

/** Escape a path for the concat demuxer list format (`file '<path>'`). */
function concatListEscape(p: string): string {
  return p.replace(/'/g, "'\\''");
}

/**
 * Stream a remote clip straight to disk. Hard rule (static-guarded by
 * stitcher.test.ts): the response body is piped to a write stream — the
 * clip is never accumulated into a single in-memory byte blob.
 */
async function downloadToFile(
  fetchFn: typeof globalThis.fetch,
  url: string,
  destPath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) {
      return { ok: false, error: `download failed: HTTP ${res.status}` };
    }
    if (!res.body) {
      return { ok: false, error: "download failed: empty response body" };
    }
    // Web ReadableStream → Node stream → disk, chunk by chunk.
    const nodeStream = Readable.fromWeb(
      res.body as unknown as import("node:stream/web").ReadableStream,
    );
    await pipeline(nodeStream, createWriteStream(destPath));
    const s = await stat(destPath);
    if (s.size === 0) {
      return { ok: false, error: "download failed: zero-byte file" };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: `download failed: ${err?.message || err}` };
  } finally {
    clearTimeout(timer);
  }
}

/* ── Module-level single-flight lock ───────────────────────────────────────
 * At most one stitch runs at a time in this process. Later callers chain
 * behind the current run (serialized, not rejected). */
let stitchChain: Promise<unknown> = Promise.resolve();

/* Cached ffmpeg probe result — one probe per process per stitcher instance
 * set; the default instance therefore probes once per boot. */

export function createFfmpegStitcher(
  overrides: Partial<FfmpegStitcherDeps> = {},
): VideoStitcher {
  const deps: FfmpegStitcherDeps = {
    spawn: overrides.spawn ?? nodeSpawn,
    fetch: overrides.fetch ?? globalThis.fetch,
    ffmpegBinary: overrides.ffmpegBinary ?? "ffmpeg",
  };

  let probeCache: Promise<boolean> | null = null;

  async function probe(): Promise<boolean> {
    const outcome = await runProcess(
      deps.spawn,
      deps.ffmpegBinary,
      ["-version"],
      PROBE_TIMEOUT_MS,
    );
    if (!outcome.ok) {
      log.info("ffmpeg probe negative", { error: outcome.error });
    }
    return outcome.ok;
  }

  async function stitchInner(
    req: StitchRequest,
    opts: StitchOptions,
  ): Promise<StitchResult> {
    if (!req.scenes.length) {
      return { ok: false, error: "stitch called with zero scenes" };
    }

    const intermediatesDir = join(opts.workDir, "intermediates");
    const finalPath = join(opts.workDir, "final.mp4");

    try {
      await mkdir(intermediatesDir, { recursive: true });

      // 1. Resolve every scene to a local file — downloads are SEQUENTIAL
      //    (one clip in flight at a time; bounded disk + network pressure).
      const localPaths: string[] = [];
      for (let i = 0; i < req.scenes.length; i++) {
        const scene = req.scenes[i];
        if (scene.filePath) {
          localPaths.push(scene.filePath);
          continue;
        }
        if (!scene.url) {
          return {
            ok: false,
            error: `scene ${i} has neither filePath nor url`,
          };
        }
        const dest = join(intermediatesDir, `scene-${i}.mp4`);
        const dl = await downloadToFile(deps.fetch, scene.url, dest);
        if (!dl.ok) {
          return {
            ok: false,
            error: `scene ${i} ${dl.error}`,
            retryable: true,
          };
        }
        localPaths.push(dest);
      }

      // 2. Concat list for the demuxer.
      const listPath = join(intermediatesDir, "list.txt");
      const listBody = localPaths
        .map((p) => `file '${concatListEscape(p)}'`)
        .join("\n");
      await writeFile(listPath, listBody + "\n", "utf8");

      // 3. Normalize + concat in one re-encode pass (design §1.4 verbatim).
      const concatOut = req.narrationAudioPath
        ? join(intermediatesDir, "concat.mp4")
        : finalPath;
      const concatArgs = [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", listPath,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-r", "30",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        concatOut,
      ];
      const concat = await runProcess(
        deps.spawn,
        deps.ffmpegBinary,
        concatArgs,
        STITCH_TIMEOUT_MS,
      );
      if (!concat.ok) {
        return {
          ok: false,
          error: `ffmpeg concat failed: ${concat.error}; stderr: ${concat.stderrTail.slice(-400)}`,
        };
      }

      // 4. Optional narration mix — duck native audio under the voice-over.
      if (req.narrationAudioPath) {
        const duckArgs = [
          "-y",
          "-i", concatOut,
          "-i", req.narrationAudioPath,
          "-filter_complex",
          // Native bed at 25% volume, narration on top; stop at video end.
          "[0:a]volume=0.25[bg];[bg][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]",
          "-map", "0:v",
          "-map", "[aout]",
          "-c:v", "copy",
          "-c:a", "aac",
          "-shortest",
          finalPath,
        ];
        const mix = await runProcess(
          deps.spawn,
          deps.ffmpegBinary,
          duckArgs,
          STITCH_TIMEOUT_MS,
        );
        if (!mix.ok) {
          // Likely cause: concat output has no native audio stream (silent
          // providers). Retry with narration as the sole audio track.
          log.info("duck-mix pass failed; retrying narration-only audio map", {
            error: mix.error,
          });
          const soloArgs = [
            "-y",
            "-i", concatOut,
            "-i", req.narrationAudioPath,
            "-map", "0:v",
            "-map", "1:a",
            "-c:v", "copy",
            "-c:a", "aac",
            "-shortest",
            finalPath,
          ];
          const solo = await runProcess(
            deps.spawn,
            deps.ffmpegBinary,
            soloArgs,
            STITCH_TIMEOUT_MS,
          );
          if (!solo.ok) {
            return {
              ok: false,
              error: `ffmpeg narration mix failed: ${solo.error}; stderr: ${solo.stderrTail.slice(-400)}`,
            };
          }
        }
      }

      let finalSize = 0;
      try {
        finalSize = (await stat(finalPath)).size;
      } catch (statErr: any) {
        log.warn("final output missing after stitch", {
          path: finalPath,
          error: statErr?.message,
        });
      }
      if (finalSize === 0) {
        return { ok: false, error: "stitch produced no output file" };
      }
      return { ok: true, filePath: finalPath };
    } catch (err: any) {
      return { ok: false, error: `stitch failed: ${err?.message || err}` };
    } finally {
      // Remove every intermediate; the final mp4 (written to workDir root)
      // survives for the caller to upload, then delete with the workDir.
      await rm(intermediatesDir, { recursive: true, force: true }).catch(
        (cleanupErr: any) => {
          log.warn("intermediates cleanup failed", {
            dir: intermediatesDir,
            error: cleanupErr?.message,
          });
        },
      );
    }
  }

  return {
    id: "ffmpeg",

    isAvailable(): Promise<boolean> {
      if (!probeCache) {
        probeCache = probe().catch((err: any) => {
          log.warn("ffmpeg probe threw", { error: err?.message });
          return false;
        });
      }
      return probeCache;
    },

    stitch(req: StitchRequest, opts: StitchOptions): Promise<StitchResult> {
      // Single-flight: serialize behind whatever stitch is currently running.
      const run = stitchChain.then(
        () => stitchInner(req, opts),
        () => stitchInner(req, opts),
      );
      stitchChain = run.catch((chainErr: any) => {
        log.warn("stitch chain link rejected", { error: chainErr?.message });
      });
      return run;
    },
  };
}

/** Default instance used by the selection ladder in ./index.ts. */
export const ffmpegStitcher = createFfmpegStitcher();
