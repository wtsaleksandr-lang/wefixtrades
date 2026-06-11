/**
 * ContentFlow Phase 2 — video stitcher contract (WP5).
 *
 * Design: plans/contentflow-video-phase2-design.md §1.4. The stitcher takes
 * the per-scene rendered clips (local files or remote URLs), concatenates
 * them into one normalized mp4, optionally mixes a narration track over the
 * native audio, and returns the final file path. Two implementations:
 *
 *   - ffmpegStitcher  — local ffmpeg binary (probed at runtime, cached).
 *   - managedStitcher — Shotstack-class hosted API behind STITCH_API_BASE /
 *                       STITCH_API_KEY (submit + poll, resumable).
 *
 * Selection ladder lives in ./index.ts (STITCHER_PROVIDER=auto|ffmpeg|managed).
 */

/** One rendered scene clip. Exactly one of filePath | url must be set. */
export interface StitchSceneInput {
  /** Absolute path to an already-downloaded clip on local disk. */
  filePath?: string;
  /** Remote URL (R2 / provider-hosted) to stream-download before stitching. */
  url?: string;
  /** Planned duration of the clip in seconds (from the scene plan). */
  durationSec: number;
}

export type StitchAspectRatio = "16:9" | "9:16" | "1:1";

/** Input to a stitch run — scenes in final order plus optional narration. */
export interface StitchRequest {
  /** Scene clips in playback order. Must be non-empty. */
  scenes: StitchSceneInput[];
  /**
   * Optional narration mp3 (already on local disk — e.g. ttsService output
   * written by the worker). When present, the stitcher mixes it over the
   * concatenated video with the native audio ducked underneath.
   */
  narrationAudioPath?: string;
  /** Aspect ratio of the deliverable (scenes are rendered to match). */
  aspectRatio: StitchAspectRatio;
}

export interface StitchOptions {
  /**
   * Directory the stitcher may use for downloads / intermediates and where
   * the final mp4 is written. Caller owns the directory's lifecycle; the
   * stitcher cleans up its own intermediates (downloaded scenes, list files,
   * pre-mix passes) in a `finally`, leaving only the final output file.
   */
  workDir: string;
}

export type StitchResult =
  | { ok: true; filePath: string }
  | { ok: false; error: string; retryable?: boolean };

export interface VideoStitcher {
  /** Stable identifier, recorded on the project for observability. */
  id: "ffmpeg" | "managed";
  /**
   * Cheap availability check. MUST never throw — implementations cache the
   * result (e.g. the ffmpeg `-version` probe) so the worker can call it on
   * every tick.
   */
  isAvailable(): Promise<boolean>;
  /**
   * Concatenate the scene clips (+ optional narration mix) into one mp4.
   * Returns a Result — never throws. On success `filePath` points at the
   * final mp4 inside `opts.workDir`; the caller uploads it to R2 and then
   * removes the workDir.
   */
  stitch(req: StitchRequest, opts: StitchOptions): Promise<StitchResult>;
}
