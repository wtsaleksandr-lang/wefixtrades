/**
 * ContentFlow Phase 2 — portal video-pipeline routes (WP6).
 *
 * Mounted under /api/portal/contentflow/*. Auth: requireClient, tenant
 * scoping via withClientIdOrPreview (same session helper as the existing
 * portal contentflow routes — admins preview, customers are isolated).
 *
 * Endpoints (design §5):
 *   POST /api/portal/contentflow/videos
 *        3-source prompt resolution (template | saved custom prompt |
 *        free-form description) → gates IN ORDER: ContentFlow gate →
 *        video quota → NEW per-tier scene/duration caps → cost precheck
 *        (per-video cap + monthly-spend pre-commit) → Director inline →
 *        persist project + draft → 202 {projectId, scenePlan, estimateUsd,
 *        quota}.
 *   GET  /api/portal/contentflow/video-projects
 *        Tenant-scoped project list. NOTE: design §5 names this GET
 *        /videos, but that exact path is already taken by the Sprint-18
 *        drafts list in ./contentflow.ts (consumed by PortalArticles) —
 *        Express dispatches first-registered, so reusing it would shadow
 *        one or the other. The pipeline list therefore lives at
 *        /video-projects; the rest of the surface matches the design.
 *   GET  /api/portal/contentflow/videos/:id
 *        Polling shape (3-5s v1): {status, stitch_status, progressPct,
 *        scenes[{index,status,thumb?,error?}], videoUrl?, costUsd}.
 *   POST /api/portal/contentflow/videos/:id/cancel
 *        planned/rendering → canceled (unsubmitted scenes never submit).
 *   POST /api/portal/contentflow/videos/:id/scenes/:index/retry
 *        From needs_attention; re-checks cost-cap headroom first.
 *
 * Cost-estimate math (route-level PRECHECK only): a small local
 * estimator with conservative defaults (Veo quality $0.40/s) and an env
 * override (VIDEO_COST_OVERRIDES_JSON). This is deliberately duplicated
 * here rather than importing the WP3 provider registry (unmerged at
 * build time) — WP3/WP4's provider registry is the RUNTIME source of
 * truth for actual per-clip cost; this estimator only has to be
 * conservative enough that the precheck never under-blocks.
 *
 * The POST handler's full decision flow lives in
 * processCreateVideoRequest() with injected deps so the standalone test
 * (contentflowVideo.routes.test.ts, `npm run check:contentflow-video-routes`)
 * drives it without express/db.
 */

import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { requireClient } from "../../auth";
import { storage } from "../../storage";
import { withClientIdOrPreview } from "../../middleware/adminPreviewSafe";
import { resolveGeneratePromptSource } from "./contentflow";
import {
  directScenePlan,
  type DirectorResult,
  type ScenePlan,
  type VideoAspectRatio,
  type TierConstraints,
} from "../../services/contentflow/videoDirectorService";
import { readBrandProfile } from "../../services/contentflow/brandProfile";
import { checkContentflowGate } from "../../services/contentflow/contentflowGate";
import { getQuotaState } from "../../services/contentflow/quotaService";
import {
  getVideoSceneCapsForTier,
  isWithinQuota,
  type VideoSceneCaps,
} from "@shared/contentflow/quotas";
import type { VideoProject, VideoScene } from "@shared/schema";
import { writeAudit } from "../../lib/auditLog";
import { createLogger } from "../../lib/logger";

const log = createLogger("PortalContentflowVideo");

/* ═══ Cost estimator (pure, exported for the route test) ════════════ */

/** Conservative per-second render cost default: Veo 3.1 quality $0.40/s.
 *  (Research addenda 2026-06-11 — Fast/Lite/Kling are all cheaper, so a
 *  precheck priced at quality-Veo never under-blocks.) */
export const DEFAULT_SCENE_COST_MICRO_PER_SEC = 400_000;
/** Flat Director (text-call) buffer: $0.02. */
export const DIRECTOR_COST_MICRO = 20_000;
/** TTS buffer (OpenAI ~$0.015/min ≈ 250 micro-USD/s), narration only. */
export const TTS_COST_MICRO_PER_SEC = 250;
/** Managed-stitcher ceiling (Shotstack-class $0.40/min ≈ 6 667/s). */
export const STITCH_COST_MICRO_PER_SEC = 6_667;
/** Default per-video cost cap when neither settings nor env set one:
 *  750 cents = $7.50 (design §4). */
export const DEFAULT_MAX_VIDEO_COST_MICRO_USD = 7_500_000;

/**
 * Parse VIDEO_COST_OVERRIDES_JSON — {"<providerId>": <microUsdPerSec>}.
 * Malformed JSON / non-positive values are ignored (precheck falls back
 * to the conservative default; the WP3 registry re-parses this env at
 * runtime for actual submit-time pricing).
 */
export function parseVideoCostOverrides(json: string | undefined | null): Record<string, number> {
  if (!json || !json.trim()) return {};
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        out[key] = Math.round(value);
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** The per-second rate the precheck uses: the MOST EXPENSIVE configured
 *  provider (we don't know which provider the worker will pick — the
 *  estimate must cover the worst case), or the Veo-quality default. */
export function precheckMicroPerSec(overrides: Record<string, number>): number {
  const rates = Object.values(overrides);
  if (rates.length === 0) return DEFAULT_SCENE_COST_MICRO_PER_SEC;
  return Math.max(...rates);
}

export interface VideoCostEstimate {
  scenesMicroUsd: number;
  directorMicroUsd: number;
  ttsMicroUsd: number;
  stitchMicroUsd: number;
  totalMicroUsd: number;
}

/**
 * Estimate the full pipeline cost for a set of scene durations.
 * Σ(durationSec) × worst-case provider rate + director + tts + stitch.
 */
export function estimateVideoCostMicroUsd(
  sceneDurationsSec: number[],
  opts: { narrationEnabled?: boolean; overrides?: Record<string, number> } = {},
): VideoCostEstimate {
  const totalSec = sceneDurationsSec.reduce((a, b) => a + Math.max(0, b), 0);
  const perSec = precheckMicroPerSec(opts.overrides ?? {});
  const scenesMicroUsd = totalSec * perSec;
  const directorMicroUsd = DIRECTOR_COST_MICRO;
  const ttsMicroUsd = opts.narrationEnabled ? totalSec * TTS_COST_MICRO_PER_SEC : 0;
  /* Single-scene projects skip the stitcher (design §1.4 bypass). */
  const stitchMicroUsd = sceneDurationsSec.length > 1 ? totalSec * STITCH_COST_MICRO_PER_SEC : 0;
  return {
    scenesMicroUsd,
    directorMicroUsd,
    ttsMicroUsd,
    stitchMicroUsd,
    totalMicroUsd: scenesMicroUsd + directorMicroUsd + ttsMicroUsd + stitchMicroUsd,
  };
}

/** settings.max_video_cost_usd (whole USD) ?? env VIDEO_MAX_COST_USD (USD,
 *  fractional ok) ?? $7.50 — in micro-USD. */
export function resolveMaxVideoCostMicroUsd(
  settingsMaxVideoCostUsd: number | null | undefined,
  env: Record<string, string | undefined> = process.env,
): number {
  if (typeof settingsMaxVideoCostUsd === "number" && Number.isFinite(settingsMaxVideoCostUsd) && settingsMaxVideoCostUsd >= 0) {
    return Math.round(settingsMaxVideoCostUsd * 1_000_000);
  }
  const fromEnv = Number.parseFloat(env.VIDEO_MAX_COST_USD ?? "");
  if (Number.isFinite(fromEnv) && fromEnv >= 0) {
    return Math.round(fromEnv * 1_000_000);
  }
  return DEFAULT_MAX_VIDEO_COST_MICRO_USD;
}

export type VideoCostPrecheck =
  | { allowed: true }
  | { allowed: false; code: "video_cost_capped" | "monthly_spend_capped"; message: string };

/**
 * THE dollars gate (design §4 item 4). Blocks when the estimate exceeds
 * the per-video cap, or when monthlySpend + estimate would pre-commit
 * past the admin monthly cap. The route test carries a deliberate-
 * failure fixture proving a regressed version that ignores the estimate
 * turns this red.
 */
export function checkVideoCostPrecheck(input: {
  estimateMicroUsd: number;
  maxVideoCostMicroUsd: number;
  monthlySpendMicroUsd: number;
  monthlyCapUsd: number | null | undefined;
}): VideoCostPrecheck {
  if (input.estimateMicroUsd > input.maxVideoCostMicroUsd) {
    const estUsd = (input.estimateMicroUsd / 1_000_000).toFixed(2);
    const capUsd = (input.maxVideoCostMicroUsd / 1_000_000).toFixed(2);
    return {
      allowed: false,
      code: "video_cost_capped",
      message: `This video is estimated at ≈$${estUsd}, above the per-video limit of $${capUsd}. Fewer or shorter scenes will bring it under.`,
    };
  }
  if (input.monthlyCapUsd != null && Number.isFinite(input.monthlyCapUsd)) {
    const capMicro = input.monthlyCapUsd * 1_000_000;
    if (input.monthlySpendMicroUsd + input.estimateMicroUsd > capMicro) {
      return {
        allowed: false,
        code: "monthly_spend_capped",
        message: "This video would exceed this month's AI spend cap. Try again next month or contact support.",
      };
    }
  }
  return { allowed: true };
}

/* ═══ Tier-cap clamp (pure, exported for the route test) ════════════ */

export interface VideoAdvancedOptions {
  sceneCount?: number;
  durationSec?: number;
  aspectRatio?: string;
  narration?: boolean;
}

/**
 * Clamp the customer's requested scene count / duration into the tier's
 * caps. The result feeds the Director's tierConstraints — the Director
 * additionally re-clamps its own output, so the cap holds even against
 * a misbehaving model. Returns null when the tier has no video at all
 * (maxScenes 0 — Free).
 */
export function clampAdvancedToTier(
  advanced: VideoAdvancedOptions | undefined,
  caps: VideoSceneCaps,
): TierConstraints | null {
  if (caps.maxScenes < 1 || caps.maxTotalSec < 4) return null;
  let maxScenes = caps.maxScenes;
  if (typeof advanced?.sceneCount === "number" && Number.isFinite(advanced.sceneCount)) {
    maxScenes = Math.min(caps.maxScenes, Math.max(1, Math.floor(advanced.sceneCount)));
  }
  let maxTotalSec = caps.maxTotalSec;
  if (typeof advanced?.durationSec === "number" && Number.isFinite(advanced.durationSec)) {
    maxTotalSec = Math.min(caps.maxTotalSec, Math.max(4, Math.floor(advanced.durationSec)));
  }
  return { maxScenes, maxTotalSec };
}

const VALID_VIDEO_ASPECTS = new Set<VideoAspectRatio>(["16:9", "9:16", "1:1"]);

/* ═══ Polling-shape helpers (pure, exported for the route test) ═════ */

/** Coarse 0-100 progress for the polling UI. Render phase spans 10→80. */
export function computeProgressPct(
  projectStatus: string,
  scenes: Array<{ status: string }>,
): number {
  if (projectStatus === "ready") return 100;
  if (projectStatus === "planned") return 5;
  const total = Math.max(1, scenes.length);
  const rendered = scenes.filter((s) => s.status === "rendered").length;
  if (projectStatus === "stitching") return 85;
  if (projectStatus === "rendering" || projectStatus === "needs_attention") {
    return Math.round(10 + 70 * (rendered / total));
  }
  /* failed / canceled — freeze at the rendered fraction. */
  return Math.round(10 + 70 * (rendered / total));
}

function toPollScene(s: VideoScene) {
  return {
    index: s.scene_index,
    status: s.status,
    durationSec: s.duration_sec,
    thumb: s.video_url ?? undefined,
    error: s.status === "failed" ? (s.last_error ?? "Scene failed") : undefined,
  };
}

function toPollShape(project: VideoProject, scenes: VideoScene[]) {
  return {
    id: project.id,
    title: project.title,
    status: project.status,
    stitch_status: project.stitch_status,
    progressPct: computeProgressPct(project.status as string, scenes as Array<{ status: string }>),
    scenes: scenes.map(toPollScene),
    videoUrl: project.video_url ?? undefined,
    aspectRatio: project.aspect_ratio,
    costUsd: Number((((project.actual_cost_micro_usd as number) || 0) / 1_000_000).toFixed(2)),
    estimateUsd:
      project.estimated_cost_micro_usd != null
        ? Number(((project.estimated_cost_micro_usd as number) / 1_000_000).toFixed(2))
        : undefined,
    error: project.error ?? undefined,
    created_at: project.created_at,
  };
}

/* ═══ POST /videos decision flow (deps-injected for the test) ═══════ */

export interface CreateVideoBody {
  description?: unknown;
  rendered?: unknown;
  templateId?: unknown;
  customPromptId?: unknown;
  freeForm?: unknown;
  advanced?: VideoAdvancedOptions;
  idempotencyKey?: unknown;
}

type SourceResolution = Awaited<ReturnType<typeof resolveGeneratePromptSource>>;

export interface CreateVideoDeps {
  clientId: number;
  env?: Record<string, string | undefined>;
  resolveSource: (input: {
    templateId?: unknown;
    customPromptId?: unknown;
    rendered?: unknown;
    freeForm?: unknown;
  }) => Promise<SourceResolution>;
  checkGate: typeof checkContentflowGate;
  getQuota: (clientId: number) => Promise<{
    tier: string;
    limit: { videos: number };
    used: { videos_used: number };
    resetAt: string;
  }>;
  getSettings: () => Promise<{ max_video_cost_usd?: number | null; monthly_spend_cap_usd?: number | null }>;
  getMonthlySpendMicroUsd: () => Promise<number>;
  getClient: (clientId: number) => Promise<{ metadata?: unknown; trade_type?: unknown } | undefined | null>;
  direct: (input: Parameters<typeof directScenePlan>[0]) => Promise<DirectorResult>;
  createDraft: (data: Record<string, unknown>) => Promise<{ id: number }>;
  updateDraft: (id: number, updates: Record<string, unknown>) => Promise<unknown>;
  /** addDraftGenerationCost — books Director spend on the draft so the
   *  existing monthly cap gate counts it (COST INVARIANT). */
  addDraftCost: (draftId: number, microUsd: number) => Promise<void>;
  createProject: (
    input: Parameters<(typeof storage)["createVideoProject"]>[0],
  ) => ReturnType<(typeof storage)["createVideoProject"]>;
  /** Injectable ONLY for the deliberate-failure fixture in the route
   *  test — production always uses checkVideoCostPrecheck. */
  precheck?: typeof checkVideoCostPrecheck;
}

export interface RouteOutcome {
  status: number;
  body: Record<string, unknown>;
}

/** Stable idempotency key: sha256(client|prompt|day|nonce) (design §2). */
export function buildIdempotencyKey(
  clientId: number,
  prompt: string,
  nonce: string,
  now: Date = new Date(),
): string {
  const day = now.toISOString().slice(0, 10);
  return crypto.createHash("sha256").update(`${clientId}|${prompt}|${day}|${nonce}`).digest("hex");
}

/** ~2 minutes of wall-clock render+stitch per scene — UI "~N min" hint. */
export function estimateRenderMinutes(sceneCount: number): number {
  return Math.max(2, sceneCount * 2);
}

/**
 * Full POST /videos decision flow. Gate order is load-bearing (design
 * §4): ContentFlow gate → video quota → tier scene caps → cost precheck
 * → Director → persist. Pure with respect to its deps; never throws for
 * expected failures — returns {status, body}.
 */
export async function processCreateVideoRequest(
  body: CreateVideoBody,
  deps: CreateVideoDeps,
): Promise<RouteOutcome> {
  const env = deps.env ?? process.env;
  const precheck = deps.precheck ?? checkVideoCostPrecheck;

  /* ── 0. Resolve the prompt source (template | custom | free-form). ──
   * `description` is the Video panel's field name; it maps onto the
   * shared resolver's free-form `rendered` contract. */
  const rendered =
    typeof body.description === "string" && body.description.trim().length > 0
      ? body.description
      : body.rendered;
  const resolved = await deps.resolveSource({
    templateId: body.templateId,
    customPromptId: body.customPromptId,
    rendered,
    freeForm: body.freeForm,
  });
  if (!resolved.ok) {
    return { status: resolved.status, body: { error: resolved.error, code: resolved.code } };
  }
  const src = resolved.source;
  if (!src.rendered.trim()) {
    return {
      status: 400,
      body: { error: "A video description is required.", code: "missing_description" },
    };
  }

  /* ── Gate 1: ContentFlow kill switch / monthly cap (existing gate). ── */
  const gate = await deps.checkGate();
  if (!gate.allowed) {
    return {
      status: 503,
      body: { error: gate.reason ?? "ContentFlow is paused.", code: "contentflow_paused" },
    };
  }

  /* ── Gate 2: per-tier monthly VIDEO quota. ── */
  const quota = await deps.getQuota(deps.clientId);
  const quotaCheck = isWithinQuota(
    { images_used: 0, articles_used: 0, videos_used: quota.used.videos_used },
    { images: 0, articles: 0, videos: quota.limit.videos, channels: 0 },
    "video",
  );
  if (!quotaCheck.allowed) {
    const zeroTier = quota.limit.videos === 0;
    return {
      status: 402,
      body: {
        error: quotaCheck.reason ?? "Video quota reached.",
        code: zeroTier ? "tier_too_low" : "quota_exceeded",
        tier: quota.tier,
        upgrade_required: true,
        nextResetAt: quotaCheck.nextResetAt,
      },
    };
  }

  /* ── Gate 3: NEW per-tier scene/duration caps. ── */
  const caps = getVideoSceneCapsForTier(quota.tier);
  const tierConstraints = clampAdvancedToTier(body.advanced, caps);
  if (!tierConstraints) {
    return {
      status: 402,
      body: {
        error: "Video generation isn't included on your current tier. Upgrade to unlock.",
        code: "tier_too_low",
        tier: quota.tier,
        upgrade_required: true,
      },
    };
  }

  const narrationEnabled = body.advanced?.narration !== false;
  const aspectRatio: VideoAspectRatio = VALID_VIDEO_ASPECTS.has(body.advanced?.aspectRatio as VideoAspectRatio)
    ? (body.advanced!.aspectRatio as VideoAspectRatio)
    : "16:9";

  /* ── Gate 4: cost precheck BEFORE any AI spend. Worst case: the tier-
   * clamped duration ceiling at the most expensive provider rate. ── */
  const overrides = parseVideoCostOverrides(env.VIDEO_COST_OVERRIDES_JSON);
  const worstCaseDurations: number[] = [];
  {
    /* maxScenes clips of up to 8s, capped at maxTotalSec total. */
    let remaining = tierConstraints.maxTotalSec;
    for (let i = 0; i < tierConstraints.maxScenes && remaining >= 4; i++) {
      const clip = Math.min(8, remaining);
      worstCaseDurations.push(clip);
      remaining -= clip;
    }
  }
  const worstCase = estimateVideoCostMicroUsd(worstCaseDurations, { narrationEnabled, overrides });
  const settings = await deps.getSettings();
  const maxVideoCostMicroUsd = resolveMaxVideoCostMicroUsd(settings.max_video_cost_usd, env);
  const monthlySpendMicroUsd = await deps.getMonthlySpendMicroUsd();
  const capCheck = precheck({
    estimateMicroUsd: worstCase.totalMicroUsd,
    maxVideoCostMicroUsd,
    monthlySpendMicroUsd,
    monthlyCapUsd: settings.monthly_spend_cap_usd,
  });
  if (!capCheck.allowed) {
    return {
      status: 402,
      body: {
        error: capCheck.message,
        code: capCheck.code,
        tier: quota.tier,
        estimateUsd: Number((worstCase.totalMicroUsd / 1_000_000).toFixed(2)),
      },
    };
  }

  /* ── Draft FIRST so Director spend has a row to book against (the
   * dual-write COST INVARIANT counts video spend via content_drafts). ── */
  const client = await deps.getClient(deps.clientId);
  const brand = readBrandProfile(client ?? null);
  const tradeType = (client?.trade_type as string | null) ?? null;
  const draft = await deps.createDraft({
    client_id: deps.clientId,
    client_service_id: null,
    kind: "video",
    surface: "contentflow_portal",
    title: src.title,
    body: null,
    excerpt: null,
    target_platform: null,
    target_url: null,
    metadata: {
      template_id: src.templateId,
      custom_prompt_id: src.customPromptId,
      rendered_prompt: src.rendered,
      tier_at_generation: quota.tier,
      source: "phase2_video_pipeline",
      generation_status: "planning",
      aspect_ratio: aspectRatio,
      narration_enabled: narrationEnabled,
    },
    quality_score: null,
    quality_notes: null,
    status: "draft",
    auto_approved: false,
    /* First release: every pipeline video is admin-reviewed (risk #6). */
    requires_admin_review: true,
    requires_client_review: false,
    admin_approved_at: null,
    admin_approved_by: null,
    client_approved_at: null,
    rejected_at: null,
    rejection_reason: null,
    linked_social_post_id: null,
    linked_task_id: null,
    generation_cost_micro_usd: null,
    created_by: "system",
  });

  /* ── Director (inline, seconds — cheap text call). ── */
  const result = await deps.direct({
    description: src.rendered,
    brand,
    tradeType,
    tierConstraints,
    aspectRatio,
    narrationEnabled,
  });

  /* Book Director spend EITHER WAY (ok or error) — the call happened. */
  if (result.costMicroUsd > 0) {
    await deps.addDraftCost(draft.id, result.costMicroUsd);
  }

  if (!result.ok) {
    await deps.updateDraft(draft.id, {
      status: "failed",
      metadata: {
        rendered_prompt: src.rendered,
        tier_at_generation: quota.tier,
        source: "phase2_video_pipeline",
        generation_status: "failed",
        generation_errors: [`director:${result.error.code}`],
      },
    });
    if (result.error.code === "gate_blocked") {
      return { status: 503, body: { error: result.error.message, code: "contentflow_paused" } };
    }
    if (result.error.code === "invalid_input" || result.error.code === "validation_impossible") {
      return { status: 400, body: { error: result.error.message, code: result.error.code } };
    }
    return {
      status: 502,
      body: {
        error: "We couldn't plan that video. Try rewording your description.",
        code: result.error.code,
        draftId: draft.id,
      },
    };
  }

  const plan: ScenePlan = result.plan;

  /* ── Final estimate on the ACTUAL plan (≤ worst case by construction;
   * still cross-checked so a Director regression can't sneak past). ── */
  const estimate = estimateVideoCostMicroUsd(plan.scenes.map((s) => s.durationSec), {
    narrationEnabled,
    overrides,
  });
  const finalCheck = precheck({
    estimateMicroUsd: estimate.totalMicroUsd,
    maxVideoCostMicroUsd,
    monthlySpendMicroUsd,
    monthlyCapUsd: settings.monthly_spend_cap_usd,
  });
  if (!finalCheck.allowed) {
    await deps.updateDraft(draft.id, { status: "failed" });
    return {
      status: 402,
      body: { error: finalCheck.message, code: finalCheck.code, tier: quota.tier },
    };
  }

  /* ── Persist project + scenes (idempotent on the key). ── */
  const nonce =
    typeof body.idempotencyKey === "string" && body.idempotencyKey.trim().length > 0
      ? body.idempotencyKey.trim().slice(0, 128)
      : crypto.randomUUID();
  const created = await deps.createProject({
    client_id: deps.clientId,
    draft_id: draft.id,
    idempotency_key: buildIdempotencyKey(deps.clientId, src.rendered, nonce),
    title: plan.title,
    source_prompt: src.rendered,
    prompt_source: {
      kind: src.kind,
      template_id: src.templateId,
      custom_prompt_id: src.customPromptId,
    },
    scene_plan: plan,
    aspect_ratio: aspectRatio,
    narration_enabled: narrationEnabled,
    estimated_cost_micro_usd: estimate.totalMicroUsd,
    scenes: plan.scenes.map((s) => ({
      scene_index: s.index,
      prompt: s.visualPrompt,
      narration: s.narration,
      duration_sec: s.durationSec,
    })),
  });

  const project = created.project;
  const responsePlan = created.created ? plan : ((project.scene_plan as ScenePlan | null) ?? plan);
  const estimateMicro = created.created
    ? estimate.totalMicroUsd
    : ((project.estimated_cost_micro_usd as number | null) ?? estimate.totalMicroUsd);

  return {
    status: 202,
    body: {
      ok: true,
      projectId: project.id,
      created: created.created,
      scenePlan: responsePlan,
      estimateUsd: Number((estimateMicro / 1_000_000).toFixed(2)),
      estimatedMinutes: estimateRenderMinutes(responsePlan.scenes?.length ?? created.scenes.length),
      quota: {
        tier: quota.tier,
        videosUsed: quota.used.videos_used,
        videosLimit: quota.limit.videos,
        resetAt: quota.resetAt,
      },
    },
  };
}

/* ═══ Express wiring ════════════════════════════════════════════════ */

/** Saved custom prompts live on clients.metadata.content_brand
 *  .custom_prompts (same storage the main contentflow routes use; the
 *  reader there is module-private, so this thin copy stays in sync with
 *  that shape). */
async function loadSavedCustomPrompts(clientId: number) {
  const client = await storage.getClientById(clientId);
  const meta = ((client?.metadata as Record<string, any>) || {}) as Record<string, any>;
  const cb = (meta.content_brand && typeof meta.content_brand === "object" ? meta.content_brand : {}) as Record<string, any>;
  const arr = Array.isArray(cb.custom_prompts) ? cb.custom_prompts : [];
  return arr.filter(
    (p: any) =>
      p && typeof p === "object"
        && typeof p.id === "string"
        && typeof p.baseTemplateId === "string"
        && typeof p.rendered === "string",
  );
}

async function withClientId(
  req: Request,
  res: Response,
  previewShape: Record<string, unknown> = {},
  mode: "read" | "write" = "read",
): Promise<number | null> {
  return withClientIdOrPreview(req, res, { previewShape, mode });
}

export function registerPortalContentflowVideoRoutes(app: Express) {
  /**
   * POST /api/portal/contentflow/videos — create a video project.
   * 202 {projectId, scenePlan, estimateUsd, estimatedMinutes, quota}.
   */
  app.post("/api/portal/contentflow/videos", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, { ok: true, persisted: false }, "write");
      if (!clientId) return;

      const outcome = await processCreateVideoRequest((req.body || {}) as CreateVideoBody, {
        clientId,
        resolveSource: (input) =>
          resolveGeneratePromptSource({
            ...input,
            loadCustomPrompts: () => loadSavedCustomPrompts(clientId),
          }),
        checkGate: checkContentflowGate,
        getQuota: getQuotaState,
        getSettings: () => storage.getContentflowSettings(),
        getMonthlySpendMicroUsd: () => storage.getContentflowMonthlySpendMicroUsd(),
        getClient: (id) => storage.getClientById(id),
        direct: directScenePlan,
        createDraft: (data) => storage.createContentDraft(data as any),
        updateDraft: (id, updates) => storage.updateContentDraft(id, updates as any),
        addDraftCost: (draftId, micro) => storage.addDraftGenerationCost(draftId, micro),
        createProject: (input) => storage.createVideoProject(input),
      });

      if (outcome.status === 202) {
        writeAudit({
          actorType: "system",
          actorId: req.user?.id ?? null,
          action: "contentflow.video_project.created",
          entityType: "video_project",
          entityId: String(outcome.body.projectId),
          metadata: {
            client_id: clientId,
            estimate_usd: outcome.body.estimateUsd,
            deduped: outcome.body.created === false,
          },
        });
      }
      res.status(outcome.status).json(outcome.body);
    } catch (err: any) {
      log.error("[portal/videos][post]", err?.message || err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/portal/contentflow/video-projects — tenant-scoped list
   * (see header note: the design's GET /videos path is occupied by the
   * Sprint-18 drafts list). Preview mode → {videos: []}.
   */
  app.get("/api/portal/contentflow/video-projects", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, { videos: [] });
      if (!clientId) return;
      const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit ?? "20"), 10) || 20));
      const projects = await storage.listVideoProjectsForClient(clientId, { limit });
      res.json({
        videos: projects.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          stitch_status: p.stitch_status,
          aspect_ratio: p.aspect_ratio,
          videoUrl: p.video_url ?? undefined,
          costUsd: Number((((p.actual_cost_micro_usd as number) || 0) / 1_000_000).toFixed(2)),
          created_at: p.created_at,
        })),
      });
    } catch (err: any) {
      log.error("[portal/video-projects][get]", err?.message || err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/portal/contentflow/videos/:id — polling shape (3-5s v1).
   */
  app.get("/api/portal/contentflow/videos/:id", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, { video: null });
      if (!clientId) return;
      const projectId = Number.parseInt(String(req.params.id), 10);
      if (!Number.isFinite(projectId)) {
        return res.status(400).json({ error: "invalid project id", code: "invalid_id" });
      }
      const found = await storage.getVideoProjectWithScenes(projectId, { clientId });
      if (!found) return res.status(404).json({ error: "video project not found", code: "not_found" });
      res.json(toPollShape(found.project, found.scenes));
    } catch (err: any) {
      log.error("[portal/videos/:id][get]", err?.message || err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/portal/contentflow/videos/:id/cancel — planned/rendering
   * → canceled. In-flight provider ops expire; unsubmitted scenes never
   * submit (claim query excludes canceled projects).
   */
  app.post("/api/portal/contentflow/videos/:id/cancel", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, { ok: true, persisted: false }, "write");
      if (!clientId) return;
      const projectId = Number.parseInt(String(req.params.id), 10);
      if (!Number.isFinite(projectId)) {
        return res.status(400).json({ error: "invalid project id", code: "invalid_id" });
      }
      const canceled = await storage.cancelVideoProject(projectId, { clientId });
      if (!canceled) {
        const exists = await storage.getVideoProjectWithScenes(projectId, { clientId });
        if (!exists) return res.status(404).json({ error: "video project not found", code: "not_found" });
        return res.status(409).json({
          error: `This video can't be canceled in its current state (${exists.project.status}).`,
          code: "not_cancelable",
          status: exists.project.status,
        });
      }
      writeAudit({
        actorType: "system",
        actorId: req.user?.id ?? null,
        action: "contentflow.video_project.canceled",
        entityType: "video_project",
        entityId: String(projectId),
        metadata: { client_id: clientId },
      });
      res.json({ ok: true, status: canceled.status });
    } catch (err: any) {
      log.error("[portal/videos/:id/cancel][post]", err?.message || err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/portal/contentflow/videos/:id/scenes/:index/retry —
   * user-facing per-scene retry from needs_attention. Re-checks cost-cap
   * headroom (one more worst-case 8s clip) BEFORE re-planning the scene.
   */
  app.post(
    "/api/portal/contentflow/videos/:id/scenes/:index/retry",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientId(req, res, { ok: true, persisted: false }, "write");
        if (!clientId) return;
        const projectId = Number.parseInt(String(req.params.id), 10);
        const sceneIndex = Number.parseInt(String(req.params.index), 10);
        if (!Number.isFinite(projectId) || !Number.isFinite(sceneIndex)) {
          return res.status(400).json({ error: "invalid project/scene id", code: "invalid_id" });
        }

        /* Gate + cap headroom re-check (design §5: retry is new spend). */
        const gate = await checkContentflowGate();
        if (!gate.allowed) {
          return res.status(503).json({ error: gate.reason ?? "ContentFlow is paused.", code: "contentflow_paused" });
        }
        const found = await storage.getVideoProjectWithScenes(projectId, { clientId });
        if (!found) return res.status(404).json({ error: "video project not found", code: "not_found" });
        const scene = found.scenes.find((s) => s.scene_index === sceneIndex);
        const overrides = parseVideoCostOverrides(process.env.VIDEO_COST_OVERRIDES_JSON);
        const retryEstimate = estimateVideoCostMicroUsd([scene?.duration_sec ?? 8], {
          narrationEnabled: false,
          overrides,
        });
        const settings = await storage.getContentflowSettings();
        const headroom = checkVideoCostPrecheck({
          estimateMicroUsd: retryEstimate.scenesMicroUsd,
          maxVideoCostMicroUsd:
            resolveMaxVideoCostMicroUsd(settings.max_video_cost_usd, process.env)
              + Math.max(0, (found.project.estimated_cost_micro_usd as number | null) ?? 0)
              - Math.max(0, (found.project.actual_cost_micro_usd as number) || 0),
          monthlySpendMicroUsd: await storage.getContentflowMonthlySpendMicroUsd(),
          monthlyCapUsd: settings.monthly_spend_cap_usd,
        });
        if (!headroom.allowed) {
          return res.status(402).json({ error: headroom.message, code: headroom.code });
        }

        const reset = await storage.retryVideoScene(projectId, sceneIndex, { clientId });
        if (!reset) {
          return res.status(409).json({
            error: "Only failed scenes of a video awaiting attention can be retried.",
            code: "not_retryable",
          });
        }
        writeAudit({
          actorType: "system",
          actorId: req.user?.id ?? null,
          action: "contentflow.video_scene.retried",
          entityType: "video_project",
          entityId: String(projectId),
          metadata: { client_id: clientId, scene_index: sceneIndex },
        });
        res.json({ ok: true, scene: { index: reset.scene_index, status: reset.status } });
      } catch (err: any) {
        log.error("[portal/videos/:id/scenes/:index/retry][post]", err?.message || err);
        res.status(500).json({ error: err.message });
      }
    },
  );
}
