/**
 * ContentFlow Phase 2 — video render worker (design §1/§3/§4).
 *
 * processVideoRenderTick() drives the resumable scene state machine on a
 * short cron tick (every 2 min, see scheduler.ts). NO request or job ever spans
 * a multi-minute render: provider operation refs are persisted in
 * video_scenes between ticks (WP1 storage layer), so a Replit restart
 * mid-render costs nothing but one tick of latency.
 *
 * Tick order (design §1):
 *   1. recoverStaleScenes  — crashed-worker claims / lost submits re-plan
 *   2. pollInFlight        — short (≤15s, provider-enforced) poll of every
 *                            'rendering' scene; done → R2 → rendered + cost
 *   3. submitNew           — claim planned scenes up to
 *                            min(VIDEO_RENDER_BATCH, per-provider inflight
 *                            headroom) and submit; op ref persisted
 *   4. advanceProjects     — all-rendered → stitching; any terminal scene
 *                            failure → needs_attention (NEVER auto-stitch
 *                            an incomplete set — design risk #5)
 *   5. stitchTick          — ONE project per tick: scene assets (+ optional
 *                            TTS narration) → stitcher → final R2 asset →
 *                            ready + draft media_plan + video quota
 *
 * Flag: CONTENTFLOW_VIDEO_PIPELINE_ENABLED === "true" — checked FIRST,
 * inert default. The legacy VIDEO_GENERATION_ENABLED flag is deliberately
 * NOT read (it gates the old 3-5min video_script text path).
 *
 * Gate: checkContentflowGate() (kill switch + monthly spend cap) once per
 * tick. A gate-blocked tick SKIPS submitNew + stitchTick (no new spend)
 * but STILL runs recovery + pollInFlight — money already committed to
 * in-flight renders must be collected, not orphaned.
 *
 * ── Dependency injection / lazy binding (READ THIS BEFORE EDITING) ──────
 * This worker merges BEFORE WP3 (providers) and WP5 (stitcher + TTS),
 * whose modules do not exist on this branch. It therefore:
 *
 *   1. Defines minimal local TypeScript interfaces (VideoRenderProviderDep,
 *      VideoProviderRegistryDep, VideoStitcherDep, TtsServiceDep) that
 *      MATCH the design §1.2/§1.3/§1.4 signatures verbatim — the same
 *      signatures WP3/WP5 implemented.
 *   2. Accepts real implementations via the `deps` parameter (tests inject
 *      fakes for everything).
 *   3. Defaults to LAZY, try/catch-guarded dynamic imports of
 *      'server/services/contentflow/videoProviders/index' and
 *      'server/services/contentflow/videoStitcher/index' (+ ttsService)
 *      through a non-literal specifier, so:
 *        - tsc on THIS branch compiles (no static reference to the
 *          missing dirs),
 *        - at runtime pre-merge the import rejects → tryImport returns
 *          null → submitNew/stitchTick no-op with a debug log,
 *        - once WP3/WP5 merge, the same dynamic import resolves the real
 *          modules and the worker binds them automatically — no code
 *          change required.
 *      NOTE for the bundled production build (esbuild → dist/index.cjs):
 *      non-literal dynamic imports are left as runtime requires. If the
 *      bundler can't resolve them post-merge, swap tryImport calls for
 *      static literal imports in the same commit that enables the flag —
 *      the interfaces are already aligned so it is a 3-line change.
 *
 * Storage: WP1's server/storage/contentflowVideo.ts is on this branch and
 * is bound statically. The handful of worker-only queries WP1 doesn't
 * expose (list rendering scenes, inflight counts, project terminal-state
 * writes) live at the bottom of this file with `cfw:` markers.
 *
 * COST INVARIANT: per-scene render cost goes through
 * storage.addProjectCost(projectId, "scenes", µ$) which dual-writes the
 * project ledger AND the linked draft (monthly cap gate). Never write
 * video cost any other way.
 */

import { createLogger } from "../lib/logger";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { uploadToR2 } from "../lib/r2Upload";
import * as videoStorage from "../storage/contentflowVideo";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const log = createLogger("ContentFlowVideoRenderWorker");

/* ─── Tunables (env-overridable, design §3) ───────────────────────────── */

/** Max scenes claimed for submission per tick. */
const DEFAULT_RENDER_BATCH = 3;
/** Max concurrently-rendering scenes per provider. */
const DEFAULT_MAX_INFLIGHT_PER_PROVIDER = 4;
/** Max in-flight scenes polled per tick (each poll is a short call). */
const POLL_LIMIT_PER_TICK = 20;
/** Runtime cost ceiling multiplier over the route's estimate (design §4.5). */
const COST_CEILING_MULTIPLIER = 1.5;
/** locked_by stamp for claims taken by this worker. */
const LOCKED_BY = "videoRenderWorker";

function intEnv(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** The ONLY flag this pipeline reads. Inert unless exactly "true". */
export function videoPipelineEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CONTENTFLOW_VIDEO_PIPELINE_ENABLED === "true";
}

/* ─── Injected-interface contracts (design §1.2 / §1.3 / §1.4) ──────────
   These mirror WP3/WP5's implemented signatures verbatim. Do not widen
   them here — widen the design first. */

export type VideoSubmitResult =
  | { status: "submitted"; operationRef: string }
  | { status: "failed"; error: string; retryable: boolean };

export type VideoPollResult =
  | { status: "running" }
  | { status: "done"; videoUrl?: string; videoBytes?: Buffer; actualCostMicroUsd?: number }
  | { status: "failed"; error: string; retryable: boolean };

export interface VideoRenderProviderDep {
  /** "veo_31" | "kling_30" (string-typed here so new providers bind). */
  id: string;
  isConfigured(): boolean;
  costMicroUsdPerClip(durationSec: number): number;
  submit(req: {
    prompt: string;
    durationSec: number;
    aspectRatio: string;
    narration?: string | null;
    requestId: string;
  }): Promise<VideoSubmitResult>;
  poll(operationRef: string): Promise<VideoPollResult>;
}

export interface VideoProviderRegistryDep {
  getConfiguredProviders(): VideoRenderProviderDep[];
  pickProviderForScene(scene: {
    durationSec: number;
    aspectRatio: string;
    narration?: string | null;
  }): VideoRenderProviderDep | null;
}

export interface VideoStitcherDep {
  id?: string;
  /** ffmpeg -version probe (cached) / managed-API reachability. */
  isAvailable(): Promise<boolean>;
  stitch(
    input: {
      scenes: Array<{ filePath?: string; url?: string; durationSec: number }>;
      narrationAudioPath?: string;
      aspectRatio: string;
    },
    opts: { workDir: string },
  ): Promise<{ ok: true; filePath: string } | { ok: false; error: string }>;
}

export interface TtsServiceDep {
  /** Returns an mp3 Buffer (design §1.3 Path B). */
  synthesize(text: string, voice?: string): Promise<Buffer>;
}

/* ─── Lean structural row types ─────────────────────────────────────────
   Subsets of WP1's VideoScene / VideoProject ($inferSelect) carrying only
   what the worker reads — the real rows are assignable, and test fakes
   stay small. */

export interface WorkerSceneRow {
  id: number;
  project_id: number;
  scene_index: number;
  prompt: string;
  narration: string | null;
  duration_sec: number;
  status: string;
  provider: string | null;
  provider_operation_ref: string | null;
  provider_request_id: string | null;
  video_url: string | null;
  attempts: number;
}

/** Rendering scene joined with its project's client_id (for the R2 key). */
export interface RenderingSceneRow extends WorkerSceneRow {
  client_id: number;
}

export interface WorkerProjectRow {
  id: number;
  client_id: number;
  draft_id: number;
  status: string;
  stitch_status: string;
  aspect_ratio: string;
  narration_enabled: boolean;
  audio_mode: string | null;
  estimated_cost_micro_usd: number | null;
  actual_cost_micro_usd: number;
  video_url: string | null;
}

export interface VideoWorkerStorage {
  recoverStaleVideoClaims(opts?: { now?: Date }): Promise<{
    recovered_scene_claims: number;
    recovered_lost_submits: number;
    recovered_stitch_claims: number;
  }>;
  listRenderingScenes(limit: number): Promise<RenderingSceneRow[]>;
  /** rendering-scene count per provider id — inflight headroom input. */
  countInflightByProvider(): Promise<Record<string, number>>;
  claimPlannedScenes(limit: number, lockedBy: string, opts?: { now?: Date }): Promise<WorkerSceneRow[]>;
  claimStitchableProject(lockedBy: string, opts?: { now?: Date }): Promise<WorkerProjectRow | null>;
  recordSceneProviderRequest(sceneId: number, provider: string, requestId: string): Promise<unknown>;
  markSceneRendering(
    sceneId: number,
    fields: { provider: string; operationRef: string; requestId?: string },
  ): Promise<unknown>;
  markSceneRendered(sceneId: number, fields: { videoUrl: string; costMicroUsd?: number }): Promise<unknown>;
  markSceneFailed(
    sceneId: number,
    fields: { error: string; retryable?: boolean },
    opts?: { now?: Date },
  ): Promise<unknown>;
  advanceProjectIfComplete(projectId: number): Promise<WorkerProjectRow | null>;
  /** THE dual-write cost helper (WP1) — project ledger + draft spend. */
  addProjectCost(
    projectId: number,
    category: "director" | "scenes" | "tts" | "stitch",
    microUsd: number,
  ): Promise<unknown>;
  getProjectWithScenes(
    projectId: number,
  ): Promise<{ project: WorkerProjectRow; scenes: WorkerSceneRow[] } | undefined>;
  markProjectReady(projectId: number, videoUrl: string): Promise<unknown>;
  markProjectNeedsAttention(projectId: number, error: string): Promise<unknown>;
  markProjectStitchFailed(projectId: number, error: string): Promise<unknown>;
}

export interface VideoRenderWorkerDeps {
  env: NodeJS.ProcessEnv;
  storage: VideoWorkerStorage;
  checkGate: () => Promise<{ allowed: boolean; reason?: string }>;
  getProviderRegistry: () => Promise<VideoProviderRegistryDep | null>;
  getStitcher: () => Promise<VideoStitcherDep | null>;
  getTts: () => Promise<TtsServiceDep | null>;
  uploadToR2: (args: {
    key: string;
    contentType: string;
    sourceUrl?: string;
    buffer?: Buffer;
  }) => Promise<{ ok: boolean; url?: string; error?: string }>;
  /** Writes draft.metadata.media_plan for the linked content_drafts row. */
  updateDraftMediaPlan: (draftId: number, mediaPlan: Record<string, unknown>) => Promise<void>;
  incrementVideoQuota: (clientId: number) => Promise<void>;
}

export interface WorkerSummary {
  enabled: boolean;
  /** Scenes claimed for submission this tick. */
  considered: number;
  submitted: number;
  /** In-flight scenes polled this tick. */
  polled: number;
  /** Scenes that reached 'rendered' (asset on R2 + cost recorded). */
  completed: number;
  /** Scene attempts that failed (submit or render failure). */
  failed: number;
  /** Projects that reached 'ready' this tick. */
  stitched: number;
  gate_blocked: boolean;
  /** Submissions skipped by inflight caps or the runtime cost ceiling. */
  capped: number;
}

/* ─── Lazy default bindings ─────────────────────────────────────────────
   Non-literal specifier keeps tsc from resolving modules that only exist
   on the WP3/WP5 branches; try/catch makes the pre-merge runtime a clean
   no-op. See the file header for the full lazy-binding contract. */

async function tryImport(spec: string): Promise<Record<string, any> | null> {
  try {
    return await import(/* @vite-ignore */ spec);
  } catch (err: any) {
    log.debug(`optional module not available: ${spec}`, { error: err?.message });
    return null;
  }
}

async function defaultProviderRegistry(): Promise<VideoProviderRegistryDep | null> {
  // WP3: server/services/contentflow/videoProviders/index.ts
  const mod = await tryImport("../services/contentflow/videoProviders/index");
  if (!mod) return null;
  const src = mod.providerRegistry ?? mod.default ?? mod;
  if (
    typeof src?.getConfiguredProviders === "function" &&
    typeof src?.pickProviderForScene === "function"
  ) {
    return src as VideoProviderRegistryDep;
  }
  log.warn("videoProviders module found but registry exports don't match the design §1.2 interface");
  return null;
}

async function defaultStitcher(): Promise<VideoStitcherDep | null> {
  // WP5: server/services/contentflow/videoStitcher/index.ts
  const mod = await tryImport("../services/contentflow/videoStitcher/index");
  if (!mod) return null;
  const getter = mod.getVideoStitcher ?? mod.getStitcher;
  const src = typeof getter === "function" ? await getter() : (mod.videoStitcher ?? mod.default);
  if (typeof src?.isAvailable === "function" && typeof src?.stitch === "function") {
    return src as VideoStitcherDep;
  }
  log.warn("videoStitcher module found but exports don't match the design §1.4 interface");
  return null;
}

async function defaultTts(): Promise<TtsServiceDep | null> {
  // WP5: server/services/contentflow/ttsService.ts
  const mod = await tryImport("../services/contentflow/ttsService");
  if (!mod) return null;
  const src = mod.ttsService ?? mod.default ?? mod;
  if (typeof src?.synthesize === "function") return src as TtsServiceDep;
  log.warn("ttsService module found but exports don't match the design §1.3 interface");
  return null;
}

/** Gate is imported lazily so the standalone test (which injects a fake
 *  gate) never pulls the storage monolith into its process. */
async function defaultCheckGate(): Promise<{ allowed: boolean; reason?: string }> {
  const { checkContentflowGate } = await import("../services/contentflow/contentflowGate");
  return checkContentflowGate();
}

async function defaultUpdateDraftMediaPlan(
  draftId: number,
  mediaPlan: Record<string, unknown>,
): Promise<void> {
  const { storage } = await import("../storage");
  const draft = await storage.getContentDraftById(draftId);
  const metadata = {
    ...(((draft?.metadata as Record<string, unknown>) ?? {})),
    media_plan: mediaPlan,
  };
  await storage.updateContentDraft(draftId, { metadata } as any);
}

async function defaultIncrementVideoQuota(clientId: number): Promise<void> {
  const { incrementQuota } = await import("../services/contentflow/quotaService");
  await incrementQuota(clientId, "video");
}

function defaultStorage(): VideoWorkerStorage {
  return {
    recoverStaleVideoClaims: (opts) => videoStorage.recoverStaleVideoClaims(opts),
    listRenderingScenes: listRenderingScenesDb,
    countInflightByProvider: countInflightByProviderDb,
    claimPlannedScenes: (limit, lockedBy, opts) => videoStorage.claimPlannedScenes(limit, lockedBy, opts),
    claimStitchableProject: (lockedBy, opts) => videoStorage.claimStitchableProject(lockedBy, opts),
    recordSceneProviderRequest: (sceneId, provider, requestId) =>
      videoStorage.recordSceneProviderRequest(sceneId, provider, requestId),
    markSceneRendering: (sceneId, fields) => videoStorage.markSceneRendering(sceneId, fields),
    markSceneRendered: (sceneId, fields) => videoStorage.markSceneRendered(sceneId, fields),
    markSceneFailed: (sceneId, fields, opts) => videoStorage.markSceneFailed(sceneId, fields, opts),
    advanceProjectIfComplete: (projectId) => videoStorage.advanceProjectIfComplete(projectId),
    addProjectCost: (projectId, category, microUsd) =>
      videoStorage.addProjectCost(projectId, category, microUsd),
    getProjectWithScenes: (projectId) => videoStorage.getProjectWithScenes(projectId),
    markProjectReady: markProjectReadyDb,
    markProjectNeedsAttention: markProjectNeedsAttentionDb,
    markProjectStitchFailed: markProjectStitchFailedDb,
  };
}

function resolveDeps(overrides: Partial<VideoRenderWorkerDeps> = {}): VideoRenderWorkerDeps {
  return {
    env: overrides.env ?? process.env,
    storage: overrides.storage ?? defaultStorage(),
    checkGate: overrides.checkGate ?? defaultCheckGate,
    getProviderRegistry: overrides.getProviderRegistry ?? defaultProviderRegistry,
    getStitcher: overrides.getStitcher ?? defaultStitcher,
    getTts: overrides.getTts ?? defaultTts,
    uploadToR2: overrides.uploadToR2 ?? uploadToR2,
    updateDraftMediaPlan: overrides.updateDraftMediaPlan ?? defaultUpdateDraftMediaPlan,
    incrementVideoQuota: overrides.incrementVideoQuota ?? defaultIncrementVideoQuota,
  };
}

/* ─── R2 keys (design §1.5) ─────────────────────────────────────────── */

function sceneR2Key(clientId: number, projectId: number, sceneIndex: number): string {
  return `contentflow/videos/${clientId}/${projectId}/scene-${sceneIndex}.mp4`;
}

function finalR2Key(clientId: number, projectId: number): string {
  return `contentflow/videos/${clientId}/${projectId}.mp4`;
}

/* ─── The tick ─────────────────────────────────────────────────────── */

export async function processVideoRenderTick(
  now: Date = new Date(),
  depOverrides?: Partial<VideoRenderWorkerDeps>,
): Promise<WorkerSummary> {
  const summary: WorkerSummary = {
    enabled: true,
    considered: 0,
    submitted: 0,
    polled: 0,
    completed: 0,
    failed: 0,
    stitched: 0,
    gate_blocked: false,
    capped: 0,
  };

  // Flag FIRST — an unset/false flag must make this a true no-op:
  // no gate read, no storage call, no lazy import.
  const env = depOverrides?.env ?? process.env;
  if (!videoPipelineEnabled(env)) {
    summary.enabled = false;
    return summary;
  }

  const deps = resolveDeps(depOverrides);

  // Gate once per tick. Blocked → no NEW spend (submit/stitch skipped),
  // but recovery + polling still run: in-flight money must be collected.
  const gate = await deps.checkGate();
  if (!gate.allowed) {
    summary.gate_blocked = true;
    log.info("gate blocked — polling in-flight only", { reason: gate.reason });
  }

  /** Projects whose scenes changed state this tick → advanced in step 4. */
  const touchedProjects = new Set<number>();

  // 1. recoverStaleScenes
  const recovered = await deps.storage.recoverStaleVideoClaims({ now });
  if (
    recovered.recovered_scene_claims > 0 ||
    recovered.recovered_lost_submits > 0 ||
    recovered.recovered_stitch_claims > 0
  ) {
    log.warn("recovered stale video claims", { ...recovered });
  }

  // Registry is needed for poll + submit; null pre-WP3-merge (or when no
  // provider env is configured) → poll/submit no-op cleanly.
  const registry = await deps.getProviderRegistry();

  // 2. pollInFlight
  await pollInFlight(deps, registry, now, summary, touchedProjects);

  // 3. submitNew (gate-allowed only)
  if (!summary.gate_blocked) {
    await submitNew(deps, registry, now, summary, touchedProjects);
  }

  // 4. advanceProjects
  for (const projectId of touchedProjects) {
    await deps.storage.advanceProjectIfComplete(projectId);
  }

  // 5. stitchTick (gate-allowed only; ONE project per tick)
  if (!summary.gate_blocked) {
    await stitchTick(deps, now, summary);
  }

  log.info("video render tick complete", { ...summary });
  return summary;
}

/* ─── 2. pollInFlight ─────────────────────────────────────────────── */

async function pollInFlight(
  deps: VideoRenderWorkerDeps,
  registry: VideoProviderRegistryDep | null,
  now: Date,
  summary: WorkerSummary,
  touchedProjects: Set<number>,
): Promise<void> {
  const inflight = await deps.storage.listRenderingScenes(POLL_LIMIT_PER_TICK);
  if (inflight.length === 0) return;
  if (!registry) {
    // Scenes are mid-render but the provider module isn't bound (pre-merge
    // or mis-deploy). Don't fail them — their refs stay valid; loud log.
    log.warn("rendering scenes exist but provider registry unavailable — polling deferred", {
      scenes: inflight.length,
    });
    return;
  }
  const providers = registry.getConfiguredProviders();

  for (const scene of inflight) {
    const provider = providers.find((p) => p.id === scene.provider);
    if (!provider || !scene.provider_operation_ref) {
      // Unknown/de-configured provider: leave the scene alone — stale-lock
      // recovery + the project TTL own this case; failing it here would
      // clear a possibly-live operation ref.
      log.warn("cannot poll scene — provider not configured", {
        sceneId: scene.id,
        provider: scene.provider,
      });
      continue;
    }

    summary.polled += 1;
    let result: VideoPollResult;
    try {
      result = await provider.poll(scene.provider_operation_ref);
    } catch (err: any) {
      // A throwing poll is a transient provider/network error, not a render
      // failure — keep the ref, retry next tick.
      log.warn("provider poll threw — will retry next tick", {
        sceneId: scene.id,
        provider: provider.id,
        error: err?.message,
      });
      continue;
    }

    if (result.status === "running") continue;

    touchedProjects.add(scene.project_id);

    if (result.status === "failed") {
      await deps.storage.markSceneFailed(
        scene.id,
        { error: result.error, retryable: result.retryable },
        { now },
      );
      summary.failed += 1;
      continue;
    }

    // done → persist the asset to R2 BEFORE flipping state, so a failed
    // upload retries the (idempotent) poll next tick instead of losing
    // the paid render or double-submitting.
    if (!result.videoBytes && !result.videoUrl) {
      await deps.storage.markSceneFailed(
        scene.id,
        { error: "provider reported done but returned no video payload", retryable: true },
        { now },
      );
      summary.failed += 1;
      continue;
    }
    const upload = await deps.uploadToR2({
      key: sceneR2Key(scene.client_id, scene.project_id, scene.scene_index),
      contentType: "video/mp4",
      ...(result.videoBytes ? { buffer: result.videoBytes } : { sourceUrl: result.videoUrl }),
    });
    if (!upload.ok || !upload.url) {
      log.warn("scene render done but R2 upload failed — will retry next tick", {
        sceneId: scene.id,
        error: upload.error,
      });
      continue;
    }

    const costMicroUsd =
      result.actualCostMicroUsd ?? provider.costMicroUsdPerClip(scene.duration_sec);
    await deps.storage.markSceneRendered(scene.id, { videoUrl: upload.url, costMicroUsd });
    // COST INVARIANT — dual-write via WP1's helper (category "scenes").
    await deps.storage.addProjectCost(scene.project_id, "scenes", costMicroUsd);
    summary.completed += 1;
  }
}

/* ─── 3. submitNew ────────────────────────────────────────────────── */

async function submitNew(
  deps: VideoRenderWorkerDeps,
  registry: VideoProviderRegistryDep | null,
  now: Date,
  summary: WorkerSummary,
  touchedProjects: Set<number>,
): Promise<void> {
  if (!registry) {
    log.debug("provider registry unavailable — submitNew skipped");
    return;
  }
  const providers = registry.getConfiguredProviders();
  if (providers.length === 0) {
    log.debug("no configured video providers — submitNew skipped");
    return;
  }

  const maxInflightPerProvider = intEnv(
    deps.env.VIDEO_MAX_INFLIGHT_PER_PROVIDER,
    DEFAULT_MAX_INFLIGHT_PER_PROVIDER,
  );
  const batch = intEnv(deps.env.VIDEO_RENDER_BATCH, DEFAULT_RENDER_BATCH);

  const inflightCounts = await deps.storage.countInflightByProvider();
  const headroomFor = (providerId: string): number =>
    maxInflightPerProvider - (inflightCounts[providerId] ?? 0);
  const totalHeadroom = providers.reduce((sum, p) => sum + Math.max(0, headroomFor(p.id)), 0);

  const claimLimit = Math.min(batch, totalHeadroom);
  if (claimLimit <= 0) {
    summary.capped += 1;
    log.debug("all providers at inflight cap — no claims this tick");
    return;
  }

  const claimed = await deps.storage.claimPlannedScenes(claimLimit, LOCKED_BY, { now });
  summary.considered += claimed.length;
  if (claimed.length === 0) return;

  // Per-project cache: the cost ceiling + aspect ratio need the project row.
  const projectCache = new Map<number, WorkerProjectRow | null>();
  const getProject = async (projectId: number): Promise<WorkerProjectRow | null> => {
    if (!projectCache.has(projectId)) {
      const full = await deps.storage.getProjectWithScenes(projectId);
      projectCache.set(projectId, full?.project ?? null);
    }
    return projectCache.get(projectId) ?? null;
  };

  for (const scene of claimed) {
    touchedProjects.add(scene.project_id);

    // DOUBLE-SPEND GUARD: a scene that already carries an operation ref is
    // mid-render at the provider — submitting again pays twice. The claim
    // query shouldn't hand these out (status='planned' clears the ref via
    // markSceneFailed), but a regressed claim or manual DB edit must not
    // turn into double spend. The worker test's deliberate-failure fixture
    // proves this guard catches exactly that regression class.
    if (scene.provider_operation_ref) {
      log.error("claimed scene already has a provider operation ref — refusing to resubmit", {
        sceneId: scene.id,
        operationRef: scene.provider_operation_ref,
      });
      continue;
    }

    const project = await getProject(scene.project_id);
    if (!project) {
      await deps.storage.markSceneFailed(
        scene.id,
        { error: "parent project not found", retryable: false },
        { now },
      );
      summary.failed += 1;
      continue;
    }

    // Provider selection with per-provider inflight headroom.
    let provider = registry.pickProviderForScene({
      durationSec: scene.duration_sec,
      aspectRatio: project.aspect_ratio,
      narration: scene.narration,
    });
    if (provider && headroomFor(provider.id) <= 0) {
      provider = providers.find((p) => headroomFor(p.id) > 0) ?? null;
    }
    if (!provider) {
      // No headroom anywhere (or registry declined the scene). Backoff-replan;
      // attempts ceiling still bounds a scene no provider will ever take.
      summary.capped += 1;
      await deps.storage.markSceneFailed(
        scene.id,
        { error: "no video provider with inflight headroom", retryable: true },
        { now },
      );
      continue;
    }

    // Runtime cost ceiling (design §4.5): actual + nextSceneCost must stay
    // within estimate × 1.5, else the whole project needs human attention.
    const nextSceneCost = provider.costMicroUsdPerClip(scene.duration_sec);
    const estimate = project.estimated_cost_micro_usd;
    if (estimate != null && project.actual_cost_micro_usd + nextSceneCost > estimate * COST_CEILING_MULTIPLIER) {
      summary.capped += 1;
      const explain =
        `Runtime cost ceiling hit: actual $${(project.actual_cost_micro_usd / 1e6).toFixed(2)}` +
        ` + next scene $${(nextSceneCost / 1e6).toFixed(2)}` +
        ` would exceed estimate $${(estimate / 1e6).toFixed(2)} × ${COST_CEILING_MULTIPLIER}.` +
        ` Rendering paused — review scene failures/retries or raise the estimate.`;
      log.warn("cost ceiling exceeded — pausing project", {
        projectId: scene.project_id,
        sceneId: scene.id,
      });
      await deps.storage.markProjectNeedsAttention(scene.project_id, explain);
      continue;
    }

    // Idempotency: persist (provider, request id) BEFORE submit — if we die
    // mid-submit, stale recovery re-plans the scene and the SAME request id
    // makes the second submit a provider-side no-op (design §2).
    const requestId = scene.provider_request_id ?? randomUUID();
    await deps.storage.recordSceneProviderRequest(scene.id, provider.id, requestId);

    let result: VideoSubmitResult;
    try {
      result = await provider.submit({
        prompt: scene.prompt,
        durationSec: scene.duration_sec,
        aspectRatio: project.aspect_ratio,
        narration: scene.narration,
        requestId,
      });
    } catch (err: any) {
      result = { status: "failed", error: err?.message || String(err), retryable: true };
    }

    if (result.status === "submitted") {
      await deps.storage.markSceneRendering(scene.id, {
        provider: provider.id,
        operationRef: result.operationRef,
        requestId,
      });
      inflightCounts[provider.id] = (inflightCounts[provider.id] ?? 0) + 1;
      summary.submitted += 1;
    } else {
      await deps.storage.markSceneFailed(
        scene.id,
        { error: result.error, retryable: result.retryable },
        { now },
      );
      summary.failed += 1;
    }
  }
}

/* ─── 5. stitchTick ───────────────────────────────────────────────── */

async function stitchTick(
  deps: VideoRenderWorkerDeps,
  now: Date,
  summary: WorkerSummary,
): Promise<void> {
  const claimed = await deps.storage.claimStitchableProject(LOCKED_BY, { now });
  if (!claimed) return;

  const full = await deps.storage.getProjectWithScenes(claimed.id);
  if (!full) {
    await deps.storage.markProjectStitchFailed(claimed.id, "project disappeared mid-stitch");
    return;
  }
  const project = full.project;
  const scenes = [...full.scenes].sort((a, b) => a.scene_index - b.scene_index);

  // NEVER stitch an incomplete set (design risk #5) — advance guards this,
  // but a manual DB edit must not produce a corrupt final asset.
  if (scenes.length === 0 || scenes.some((s) => s.status !== "rendered" || !s.video_url)) {
    await deps.storage.markProjectStitchFailed(
      project.id,
      "stitch claimed with unrendered scenes — refusing to stitch an incomplete set",
    );
    return;
  }

  let workDir: string | null = null;
  try {
    // Path B narration (design §1.3): TTS only when the project explicitly
    // recorded audio_mode='tts' AND the flag is on AND the dep is bound.
    let narrationAudioPath: string | undefined;
    if (project.audio_mode === "tts" && deps.env.VIDEO_TTS_ENABLED === "true") {
      const tts = await deps.getTts();
      const narrationText = scenes
        .map((s) => s.narration?.trim())
        .filter((t): t is string => !!t)
        .join(" ");
      if (tts && narrationText) {
        workDir = workDir ?? (await fs.mkdtemp(path.join(os.tmpdir(), "cfv-stitch-")));
        const audio = await tts.synthesize(narrationText);
        narrationAudioPath = path.join(workDir, "narration.mp3");
        await fs.writeFile(narrationAudioPath, audio);
      } else if (!tts) {
        log.warn("audio_mode=tts but ttsService unavailable — stitching without narration", {
          projectId: project.id,
        });
      }
    }

    const finalKey = finalR2Key(project.client_id, project.id);
    let finalUrl: string;

    if (scenes.length === 1 && !narrationAudioPath) {
      // singleSceneBypass (design §1.4): a 1-scene project with no separate
      // narration track needs no ffmpeg — copy the scene asset to the final
      // key (uploadToR2 fetches sourceUrl server-side).
      const upload = await deps.uploadToR2({
        key: finalKey,
        contentType: "video/mp4",
        sourceUrl: scenes[0].video_url!,
      });
      if (!upload.ok || !upload.url) {
        // Transient (R2/network): leave the claim — stale recovery re-pends
        // the stitch in 10 min. Scene assets are untouched.
        log.warn("single-scene final upload failed — stitch will retry", {
          projectId: project.id,
          error: upload.error,
        });
        return;
      }
      finalUrl = upload.url;
    } else {
      const stitcher = await deps.getStitcher();
      if (!stitcher) {
        // Pre-WP5-merge (module absent): defer, don't fail — stale recovery
        // re-pends. A BOUND stitcher that probes unavailable is a real
        // deploy problem and fails loudly below.
        log.warn("stitcher module unavailable — stitch deferred", { projectId: project.id });
        return;
      }
      if (!(await stitcher.isAvailable())) {
        await deps.storage.markProjectStitchFailed(project.id, "stitcher_unavailable");
        return;
      }
      workDir = workDir ?? (await fs.mkdtemp(path.join(os.tmpdir(), "cfv-stitch-")));
      const result = await stitcher.stitch(
        {
          scenes: scenes.map((s) => ({ url: s.video_url!, durationSec: s.duration_sec })),
          narrationAudioPath,
          aspectRatio: project.aspect_ratio,
        },
        { workDir },
      );
      if (!result.ok) {
        await deps.storage.markProjectStitchFailed(project.id, result.error);
        return;
      }
      // Final asset is 15-60s (tens of MB) — a single buffered PUT through
      // the shared signer is fine; the never-buffer rule applies to the
      // stitcher's per-scene pipeline internals.
      const finalBytes = await fs.readFile(result.filePath);
      const upload = await deps.uploadToR2({
        key: finalKey,
        contentType: "video/mp4",
        buffer: finalBytes,
      });
      if (!upload.ok || !upload.url) {
        log.warn("stitched final upload failed — stitch will retry", {
          projectId: project.id,
          error: upload.error,
        });
        return;
      }
      finalUrl = upload.url;
    }

    await deps.storage.markProjectReady(project.id, finalUrl);

    // Draft media_plan (design §1.5) — YouTube publishing rides the
    // existing CONTENT_JOB_PLATFORMS.youtube path off this metadata.
    const providerMix = [...new Set(scenes.map((s) => s.provider).filter((p): p is string => !!p))];
    await deps.updateDraftMediaPlan(project.draft_id, {
      type: "video",
      video_url: finalUrl,
      duration_seconds: scenes.reduce((sum, s) => sum + s.duration_sec, 0),
      scenes: scenes.length,
      provider_mix: providerMix,
    });

    // Quota increments only at ready (design §4) — a failed project never
    // consumes the customer's monthly video allowance.
    await deps.incrementVideoQuota(project.client_id);
    summary.stitched += 1;
  } finally {
    if (workDir) {
      await fs.rm(workDir, { recursive: true, force: true }).catch((err: any) => {
        log.warn("stitch workDir cleanup failed", { workDir, error: err?.message });
        return false;
      });
    }
  }
}

/* ─── Worker-only default queries (cfw: markers) ────────────────────────
   WP1's storage layer owns claims/lifecycle; these four reads/terminal
   writes are worker-specific and intentionally live here so WP1's merged
   file stays untouched. Tests inject fakes — these run only in prod. */

function rowsOf<T>(result: unknown): T[] {
  const rows = (result as any)?.rows ?? result;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

async function listRenderingScenesDb(limit: number): Promise<RenderingSceneRow[]> {
  return rowsOf<RenderingSceneRow>(
    await db.execute(sql`
      /*cfw:list_rendering*/
      SELECT s.*, p.client_id
      FROM video_scenes s
      JOIN video_projects p ON p.id = s.project_id
      WHERE s.status = 'rendering'
        AND s.provider_operation_ref IS NOT NULL
        AND p.status = 'rendering'
      ORDER BY s.updated_at ASC
      LIMIT ${limit}
    `),
  );
}

async function countInflightByProviderDb(): Promise<Record<string, number>> {
  const rows = rowsOf<{ provider: string; n: number }>(
    await db.execute(sql`
      /*cfw:inflight_counts*/
      SELECT provider, COUNT(*)::int AS n
      FROM video_scenes
      WHERE status = 'rendering' AND provider IS NOT NULL
      GROUP BY provider
    `),
  );
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.provider] = Number(row.n);
  return counts;
}

async function markProjectReadyDb(projectId: number, videoUrl: string): Promise<void> {
  await db.execute(sql`
    /*cfw:project_ready*/
    UPDATE video_projects
    SET status = 'ready',
        stitch_status = 'done',
        video_url = ${videoUrl},
        error = NULL,
        locked_at = NULL,
        locked_by = NULL,
        updated_at = NOW()
    WHERE id = ${projectId}
  `);
}

async function markProjectNeedsAttentionDb(projectId: number, error: string): Promise<void> {
  await db.execute(sql`
    /*cfw:project_needs_attention*/
    UPDATE video_projects
    SET status = 'needs_attention',
        error = ${error},
        locked_at = NULL,
        locked_by = NULL,
        updated_at = NOW()
    WHERE id = ${projectId}
      AND status IN ('planned', 'rendering', 'stitching')
  `);
}

async function markProjectStitchFailedDb(projectId: number, error: string): Promise<void> {
  await db.execute(sql`
    /*cfw:project_stitch_failed*/
    UPDATE video_projects
    SET status = 'needs_attention',
        stitch_status = 'failed',
        error = ${error},
        locked_at = NULL,
        locked_by = NULL,
        updated_at = NOW()
    WHERE id = ${projectId}
  `);
}
