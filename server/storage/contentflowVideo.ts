/**
 * ContentFlow Phase 2 — video pipeline storage helpers.
 *
 * Pure functions over `db` — no `this`, no cross-method calls — mirroring
 * server/storage/contentflow.ts. DatabaseStorage re-exports these through
 * thin wrappers so the public API matches the rest of the storage layer.
 *
 * Tables touched: video_projects, video_scenes, content_drafts (draft
 * linkage + the dual-write cost invariant).
 *
 * Concurrency model (mirrors claimNextJob / recoverStaleClaims in
 * ./contentflow.ts):
 *   - the render worker claims planned scenes with FOR UPDATE SKIP LOCKED
 *     so concurrent ticks / multiple instances never double-submit;
 *   - claims set locked_at/locked_by; a crashed worker's claim auto-recovers
 *     after STALE_LOCK_MS (10 min) with an attempts bump so genuinely-broken
 *     scenes still hit the attempts ceiling;
 *   - provider operation refs are persisted between ticks — no request or
 *     job ever spans a multi-minute render.
 *
 * COST INVARIANT: every stage cost is written twice — to
 * video_projects.actual_cost_micro_usd / cost_breakdown AND to the linked
 * draft's generation_cost_micro_usd via addDraftGenerationCost — so the
 * existing ContentFlow monthly spend cap counts video spend unchanged.
 *
 * Every statement carries a `cfv:<name>` marker comment; the standalone
 * test (contentflowVideo.test.ts) dispatches its injected in-memory db on
 * those markers, so renames here must update the test fake.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { VideoProject, VideoScene } from "@shared/schema";
import { addDraftGenerationCost } from "./contentflow";

/* ─── Injectable db seam (tests pass an in-memory fake) ────────────── */

export type VideoDbExecutor = {
  execute(query: SQL): Promise<unknown>;
};

export type VideoDb = VideoDbExecutor & {
  transaction<T>(fn: (tx: VideoDbExecutor) => Promise<T>): Promise<T>;
};

/** drizzle's execute returns a pg QueryResult ({ rows }) — normalize. */
function rowsOf<T>(result: unknown): T[] {
  const rows = (result as any)?.rows ?? result;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

/* ─── Tunables ─────────────────────────────────────────────────────── */

/** A claim older than this is considered abandoned (crashed worker). */
export const VIDEO_STALE_LOCK_MS = 10 * 60_000;
/** Per-scene render attempts ceiling — beyond it the scene is failed. */
export const VIDEO_SCENE_ATTEMPTS_CEILING = 3;
/** Retry backoff base: 60s, 120s, 240s (base * 2^attempts). */
export const VIDEO_RETRY_BACKOFF_BASE_SEC = 60;

const COST_CATEGORIES = ["director", "scenes", "tts", "stitch"] as const;
export type VideoCostCategory = (typeof COST_CATEGORIES)[number];

/* ─── Create ───────────────────────────────────────────────────────── */

export type CreateVideoSceneInput = {
  scene_index: number;
  prompt: string;
  narration?: string | null;
  duration_sec: number;
};

export type CreateVideoProjectInput = {
  client_id: number;
  draft_id: number;
  /** sha256(client|prompt|day|nonce) — dedupes UI double-submit. */
  idempotency_key: string;
  title?: string | null;
  source_prompt: string;
  prompt_source?: unknown;
  scene_plan?: unknown;
  aspect_ratio?: string;
  narration_enabled?: boolean;
  audio_mode?: string | null;
  estimated_cost_micro_usd?: number | null;
  scenes: CreateVideoSceneInput[];
};

export type VideoProjectWithScenes = {
  project: VideoProject;
  scenes: VideoScene[];
};

/**
 * Persist a Director plan: project row + one row per scene + the draft
 * back-link (content_drafts.metadata.video_project_id).
 *
 * Idempotent: a conflict on idempotency_key returns the EXISTING project
 * (with its scenes) and `created: false` — the route surfaces it to the
 * double-submitting UI instead of erroring or double-charging.
 */
export async function createVideoProject(
  input: CreateVideoProjectInput,
  dbc: VideoDb = db,
): Promise<VideoProjectWithScenes & { created: boolean }> {
  return dbc.transaction(async (tx) => {
    const inserted = rowsOf<VideoProject>(await tx.execute(sql`
      /*cfv:insert_project*/
      INSERT INTO video_projects (
        client_id, draft_id, idempotency_key, title, source_prompt,
        prompt_source, scene_plan, aspect_ratio, narration_enabled,
        audio_mode, estimated_cost_micro_usd
      ) VALUES (
        ${input.client_id}, ${input.draft_id}, ${input.idempotency_key},
        ${input.title ?? null}, ${input.source_prompt},
        ${input.prompt_source === undefined ? null : JSON.stringify(input.prompt_source)}::jsonb,
        ${input.scene_plan === undefined ? null : JSON.stringify(input.scene_plan)}::jsonb,
        ${input.aspect_ratio ?? "16:9"}, ${input.narration_enabled ?? true},
        ${input.audio_mode ?? null}, ${input.estimated_cost_micro_usd ?? null}
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING *
    `));

    if (inserted.length === 0) {
      // UI double-submit — return the existing project untouched.
      const existing = rowsOf<VideoProject>(await tx.execute(sql`
        /*cfv:select_project_by_key*/
        SELECT * FROM video_projects WHERE idempotency_key = ${input.idempotency_key} LIMIT 1
      `));
      if (existing.length === 0) {
        // Unique-violation without a visible row only happens on a torn
        // concurrent insert; surface it rather than invent state.
        throw new Error("createVideoProject: idempotency conflict but no existing project found");
      }
      const scenes = rowsOf<VideoScene>(await tx.execute(sql`
        /*cfv:select_scenes*/
        SELECT * FROM video_scenes WHERE project_id = ${existing[0].id} ORDER BY scene_index ASC
      `));
      return { project: existing[0], scenes, created: false };
    }

    const project = inserted[0];
    const scenes: VideoScene[] = [];
    for (const s of input.scenes) {
      const rows = rowsOf<VideoScene>(await tx.execute(sql`
        /*cfv:insert_scene*/
        INSERT INTO video_scenes (project_id, scene_index, prompt, narration, duration_sec)
        VALUES (${project.id}, ${s.scene_index}, ${s.prompt}, ${s.narration ?? null}, ${s.duration_sec})
        ON CONFLICT (project_id, scene_index) DO NOTHING
        RETURNING *
      `));
      if (rows.length > 0) scenes.push(rows[0]);
    }

    // Draft back-link — metadata.video_project_id (no new draft column).
    await tx.execute(sql`
      /*cfv:link_draft*/
      UPDATE content_drafts
      SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ video_project_id: project.id })}::jsonb,
          updated_at = NOW()
      WHERE id = ${input.draft_id}
    `);

    return { project, scenes, created: true };
  });
}

/* ─── Worker claims ────────────────────────────────────────────────── */

/**
 * Atomically claim up to `limit` planned scenes for submission.
 *
 * Eligibility:
 *   - scene status = 'planned'
 *   - parent project still in flight ('planned' | 'rendering') — scenes of
 *     canceled/failed/needs_attention projects are never submitted
 *   - next_attempt_at is NULL or elapsed (retry backoff)
 *   - locked_at IS NULL or older than the stale threshold (crashed-worker
 *     claims auto-recover)
 *
 * FOR UPDATE ... SKIP LOCKED is per-row so concurrent workers never block
 * or double-claim. Claimed scenes keep status 'planned' but carry
 * locked_at/locked_by; the worker then persists the provider request id
 * (recordSceneProviderRequest), submits, and flips to 'rendering' via
 * markSceneRendering. Parent projects are advanced planned → rendering.
 */
export async function claimPlannedScenes(
  limit: number,
  lockedBy: string,
  opts: { now?: Date; staleLockMs?: number } = {},
  dbc: VideoDb = db,
): Promise<VideoScene[]> {
  const now = opts.now ?? new Date();
  const staleMs = opts.staleLockMs ?? VIDEO_STALE_LOCK_MS;
  const nowIso = now.toISOString();
  const staleCutoff = new Date(now.getTime() - staleMs).toISOString();
  const claimed = rowsOf<VideoScene>(await dbc.execute(sql`
    /*cfv:claim_scenes*/
    UPDATE video_scenes
    SET locked_at = ${nowIso}::timestamptz,
        locked_by = ${lockedBy},
        updated_at = NOW()
    WHERE id IN (
      SELECT s.id FROM video_scenes s
      JOIN video_projects p ON p.id = s.project_id
      WHERE s.status = 'planned'
        AND p.status IN ('planned', 'rendering')
        AND (s.next_attempt_at IS NULL OR s.next_attempt_at <= ${nowIso}::timestamptz)
        AND (s.locked_at IS NULL OR s.locked_at < ${staleCutoff}::timestamptz)
      ORDER BY s.project_id ASC, s.scene_index ASC
      LIMIT ${limit}
      FOR UPDATE OF s SKIP LOCKED
    )
    RETURNING *
  `));

  const projectIds = [...new Set(claimed.map((s) => s.project_id))];
  if (projectIds.length > 0) {
    await dbc.execute(sql`
      /*cfv:projects_rendering*/
      UPDATE video_projects
      SET status = 'rendering', updated_at = NOW()
      WHERE status = 'planned'
        AND id IN (${sql.join(projectIds.map((id) => sql`${id}`), sql`, `)})
    `);
  }
  return claimed;
}

/**
 * Atomically claim ONE project ready to stitch (status='stitching',
 * stitch_status='pending', all scenes already rendered — enforced when the
 * project was advanced). Same SKIP LOCKED + stale-lock shape as scenes.
 */
export async function claimStitchableProject(
  lockedBy: string,
  opts: { now?: Date; staleLockMs?: number } = {},
  dbc: VideoDb = db,
): Promise<VideoProject | null> {
  const now = opts.now ?? new Date();
  const staleMs = opts.staleLockMs ?? VIDEO_STALE_LOCK_MS;
  const nowIso = now.toISOString();
  const staleCutoff = new Date(now.getTime() - staleMs).toISOString();
  const rows = rowsOf<VideoProject>(await dbc.execute(sql`
    /*cfv:claim_stitch*/
    UPDATE video_projects
    SET stitch_status = 'stitching',
        locked_at = ${nowIso}::timestamptz,
        locked_by = ${lockedBy},
        updated_at = NOW()
    WHERE id = (
      SELECT id FROM video_projects
      WHERE status = 'stitching'
        AND stitch_status = 'pending'
        AND (locked_at IS NULL OR locked_at < ${staleCutoff}::timestamptz)
      ORDER BY id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `));
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Stale-claim recovery — first call of every worker tick. Idempotent.
 *
 *   1. planned scenes whose claim went stale (worker died between claim and
 *      submit) → lock cleared, attempts bumped (broken scenes still hit the
 *      ceiling via markSceneFailed on their next real failure);
 *   2. 'rendering' scenes with NO provider_operation_ref older than the
 *      threshold = lost submit → back to 'planned' for re-submission
 *      (provider_request_id makes the re-submit idempotent provider-side);
 *   3. projects stuck mid-stitch (stitch_status='stitching', stale lock)
 *      → stitch_status back to 'pending'.
 */
export async function recoverStaleVideoClaims(
  opts: { now?: Date; staleLockMs?: number } = {},
  dbc: VideoDb = db,
): Promise<{ recovered_scene_claims: number; recovered_lost_submits: number; recovered_stitch_claims: number }> {
  const now = opts.now ?? new Date();
  const staleMs = opts.staleLockMs ?? VIDEO_STALE_LOCK_MS;
  const staleCutoff = new Date(now.getTime() - staleMs).toISOString();

  const sceneClaims = rowsOf(await dbc.execute(sql`
    /*cfv:recover_scene_locks*/
    UPDATE video_scenes
    SET locked_at = NULL,
        locked_by = NULL,
        attempts = attempts + 1,
        last_error = 'recovered from stale claim',
        updated_at = NOW()
    WHERE status = 'planned'
      AND locked_at IS NOT NULL
      AND locked_at < ${staleCutoff}::timestamptz
    RETURNING id
  `));

  const lostSubmits = rowsOf(await dbc.execute(sql`
    /*cfv:recover_lost_submits*/
    UPDATE video_scenes
    SET status = 'planned',
        locked_at = NULL,
        locked_by = NULL,
        attempts = attempts + 1,
        last_error = 'submit lost (rendering with no operation ref)',
        updated_at = NOW()
    WHERE status = 'rendering'
      AND provider_operation_ref IS NULL
      AND COALESCE(locked_at, updated_at) < ${staleCutoff}::timestamptz
    RETURNING id
  `));

  const stitchClaims = rowsOf(await dbc.execute(sql`
    /*cfv:recover_stitch_locks*/
    UPDATE video_projects
    SET stitch_status = 'pending',
        locked_at = NULL,
        locked_by = NULL,
        updated_at = NOW()
    WHERE stitch_status = 'stitching'
      AND locked_at IS NOT NULL
      AND locked_at < ${staleCutoff}::timestamptz
    RETURNING id
  `));

  return {
    recovered_scene_claims: sceneClaims.length,
    recovered_lost_submits: lostSubmits.length,
    recovered_stitch_claims: stitchClaims.length,
  };
}

/* ─── Scene lifecycle ──────────────────────────────────────────────── */

/**
 * Persist the provider + idempotency request id BEFORE calling
 * provider.submit() — if the process dies mid-submit, the stale-claim
 * recovery re-plans the scene and the same request id makes the second
 * submit a no-op provider-side (design §2 idempotency rule).
 */
export async function recordSceneProviderRequest(
  sceneId: number,
  provider: string,
  requestId: string,
  dbc: VideoDb = db,
): Promise<VideoScene | undefined> {
  const rows = rowsOf<VideoScene>(await dbc.execute(sql`
    /*cfv:record_request*/
    UPDATE video_scenes
    SET provider = ${provider},
        provider_request_id = ${requestId},
        updated_at = NOW()
    WHERE id = ${sceneId}
    RETURNING *
  `));
  return rows[0];
}

/** Submit succeeded — persist the operation ref and release the claim
 *  (the poll path owns the scene from here; no lock needed). */
export async function markSceneRendering(
  sceneId: number,
  fields: { provider: string; operationRef: string; requestId?: string },
  dbc: VideoDb = db,
): Promise<VideoScene | undefined> {
  const rows = rowsOf<VideoScene>(await dbc.execute(sql`
    /*cfv:scene_rendering*/
    UPDATE video_scenes
    SET status = 'rendering',
        provider = ${fields.provider},
        provider_operation_ref = ${fields.operationRef},
        provider_request_id = COALESCE(${fields.requestId ?? null}, provider_request_id),
        locked_at = NULL,
        locked_by = NULL,
        last_error = NULL,
        updated_at = NOW()
    WHERE id = ${sceneId}
    RETURNING *
  `));
  return rows[0];
}

/** Render finished and the asset is on R2. cost_micro_usd is additive —
 *  a retried scene accrues every paid attempt. NOTE: per-scene cost must
 *  ALSO go through addProjectCost (dual-write invariant). */
export async function markSceneRendered(
  sceneId: number,
  fields: { videoUrl: string; costMicroUsd?: number },
  dbc: VideoDb = db,
): Promise<VideoScene | undefined> {
  const cost = Math.max(0, Math.round(fields.costMicroUsd ?? 0));
  const rows = rowsOf<VideoScene>(await dbc.execute(sql`
    /*cfv:scene_rendered*/
    UPDATE video_scenes
    SET status = 'rendered',
        video_url = ${fields.videoUrl},
        cost_micro_usd = cost_micro_usd + ${cost},
        rendered_at = NOW(),
        locked_at = NULL,
        locked_by = NULL,
        last_error = NULL,
        updated_at = NOW()
    WHERE id = ${sceneId}
    RETURNING *
  `));
  return rows[0];
}

/**
 * Render attempt failed. attempts++ always; while retryable and under the
 * ceiling the scene goes back to 'planned' with exponential backoff
 * (next_attempt_at = now + base * 2^prevAttempts: 60s, 120s, 240s);
 * otherwise it's terminally 'failed' (advanceProjectIfComplete will move
 * the project to needs_attention). The operation ref is cleared so the
 * poll path never re-reads a dead operation.
 */
export async function markSceneFailed(
  sceneId: number,
  fields: { error: string; retryable?: boolean },
  opts: { now?: Date; attemptsCeiling?: number; backoffBaseSec?: number } = {},
  dbc: VideoDb = db,
): Promise<VideoScene | undefined> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const retryable = fields.retryable ?? true;
  const ceiling = opts.attemptsCeiling ?? VIDEO_SCENE_ATTEMPTS_CEILING;
  const backoffBaseSec = opts.backoffBaseSec ?? VIDEO_RETRY_BACKOFF_BASE_SEC;
  const rows = rowsOf<VideoScene>(await dbc.execute(sql`
    /*cfv:scene_failed*/
    UPDATE video_scenes
    SET attempts = attempts + 1,
        last_error = ${fields.error},
        provider_operation_ref = NULL,
        locked_at = NULL,
        locked_by = NULL,
        next_attempt_at = CASE
          WHEN ${retryable}::boolean AND attempts + 1 < ${ceiling}::int
          THEN ${nowIso}::timestamptz + make_interval(secs => ${backoffBaseSec}::int * POWER(2, attempts))
          ELSE NULL
        END,
        status = CASE
          WHEN ${retryable}::boolean AND attempts + 1 < ${ceiling}::int THEN 'planned'
          ELSE 'failed'
        END,
        updated_at = NOW()
    WHERE id = ${sceneId}
    RETURNING *
  `));
  return rows[0];
}

/* ─── Project lifecycle ────────────────────────────────────────────── */

/**
 * Advance a project's status from its scenes' states:
 *   - every scene rendered (and ≥1 scene exists) → 'stitching' /
 *     stitch_status 'pending' (the stitch tick claims it);
 *   - any terminally-failed scene → 'needs_attention' (user-facing
 *     per-scene retry; NEVER auto-stitch an incomplete set — design risk #5).
 * Guards on the current status in the WHERE clause so concurrent calls
 * are harmless. Returns the updated project, or null if nothing changed.
 */
export async function advanceProjectIfComplete(
  projectId: number,
  dbc: VideoDb = db,
): Promise<VideoProject | null> {
  const stitching = rowsOf<VideoProject>(await dbc.execute(sql`
    /*cfv:advance_to_stitching*/
    UPDATE video_projects p
    SET status = 'stitching', stitch_status = 'pending', updated_at = NOW()
    WHERE p.id = ${projectId}
      AND p.status = 'rendering'
      AND EXISTS (SELECT 1 FROM video_scenes s WHERE s.project_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM video_scenes s WHERE s.project_id = p.id AND s.status != 'rendered')
    RETURNING *
  `));
  if (stitching.length > 0) return stitching[0];

  const attention = rowsOf<VideoProject>(await dbc.execute(sql`
    /*cfv:advance_to_needs_attention*/
    UPDATE video_projects p
    SET status = 'needs_attention', updated_at = NOW()
    WHERE p.id = ${projectId}
      AND p.status IN ('planned', 'rendering')
      AND EXISTS (SELECT 1 FROM video_scenes s WHERE s.project_id = p.id AND s.status = 'failed')
    RETURNING *
  `));
  return attention.length > 0 ? attention[0] : null;
}

/**
 * THE dual-write cost helper (design §2 COST INVARIANT). Adds a stage cost
 * to BOTH:
 *   1. video_projects.actual_cost_micro_usd + cost_breakdown[category]
 *   2. the linked draft's generation_cost_micro_usd via
 *      addDraftGenerationCost — the existing monthly spend cap gate reads
 *      drafts, so video spend counts there unchanged.
 *
 * Never write video cost anywhere else — going around this helper breaks
 * the monthly cap. `deps.addDraftCost` is injectable for tests only.
 */
export async function addProjectCost(
  projectId: number,
  category: VideoCostCategory,
  microUsd: number,
  deps: { addDraftCost?: (draftId: number, microUsd: number) => Promise<void> } = {},
  dbc: VideoDb = db,
): Promise<VideoProject | undefined> {
  if (!Number.isFinite(microUsd) || microUsd <= 0) return undefined;
  const amount = Math.round(microUsd);
  const rows = rowsOf<VideoProject>(await dbc.execute(sql`
    /*cfv:add_project_cost*/
    UPDATE video_projects
    SET actual_cost_micro_usd = actual_cost_micro_usd + ${amount},
        cost_breakdown = COALESCE(cost_breakdown, '{}'::jsonb) || jsonb_build_object(
          ${category}::text,
          COALESCE((cost_breakdown->>${category})::int, 0) + ${amount}
        ),
        updated_at = NOW()
    WHERE id = ${projectId}
    RETURNING *
  `));
  const project = rows[0];
  if (project) {
    const addDraftCost = deps.addDraftCost ?? addDraftGenerationCost;
    await addDraftCost(project.draft_id, amount);
  }
  return project;
}

/**
 * User/admin cancel. Only in-flight states cancel (design §5: planned /
 * rendering → canceled); in-flight provider ops simply expire, and the
 * claim query excludes scenes of canceled projects so unsubmitted scenes
 * never submit. clientId scopes the update for tenant routes.
 */
export async function cancelVideoProject(
  projectId: number,
  opts: { clientId?: number } = {},
  dbc: VideoDb = db,
): Promise<VideoProject | null> {
  const clientGuard = opts.clientId !== undefined ? sql` AND client_id = ${opts.clientId}` : sql``;
  const rows = rowsOf<VideoProject>(await dbc.execute(sql`
    /*cfv:cancel_project*/
    UPDATE video_projects
    SET status = 'canceled',
        locked_at = NULL,
        locked_by = NULL,
        updated_at = NOW()
    WHERE id = ${projectId}
      AND status IN ('planned', 'rendering')${clientGuard}
    RETURNING *
  `));
  return rows.length > 0 ? rows[0] : null;
}

/**
 * User-facing per-scene retry from needs_attention (design §5). Resets the
 * failed scene to a fresh 'planned' cycle (attempts back to 0 — a human
 * asked for another go) and puts the project back in 'rendering'. The
 * route re-checks cost-cap headroom BEFORE calling this. clientId scopes
 * for tenant routes. Returns the reset scene, or null if the (project,
 * scene, status) combination didn't match.
 */
export async function retryScene(
  projectId: number,
  sceneIndex: number,
  opts: { clientId?: number } = {},
  dbc: VideoDb = db,
): Promise<VideoScene | null> {
  const clientGuard = opts.clientId !== undefined ? sql` AND p.client_id = ${opts.clientId}` : sql``;
  return dbc.transaction(async (tx) => {
    const scenes = rowsOf<VideoScene>(await tx.execute(sql`
      /*cfv:retry_scene*/
      UPDATE video_scenes s
      SET status = 'planned',
          attempts = 0,
          next_attempt_at = NULL,
          last_error = NULL,
          provider_operation_ref = NULL,
          provider_request_id = NULL,
          locked_at = NULL,
          locked_by = NULL,
          updated_at = NOW()
      WHERE s.project_id = ${projectId}
        AND s.scene_index = ${sceneIndex}
        AND s.status = 'failed'
        AND EXISTS (
          SELECT 1 FROM video_projects p
          WHERE p.id = s.project_id AND p.status = 'needs_attention'${clientGuard}
        )
      RETURNING *
    `));
    if (scenes.length === 0) return null;
    await tx.execute(sql`
      /*cfv:retry_project*/
      UPDATE video_projects
      SET status = 'rendering', error = NULL, updated_at = NOW()
      WHERE id = ${projectId} AND status = 'needs_attention'
    `);
    return scenes[0];
  });
}

/* ─── Reads ────────────────────────────────────────────────────────── */

export async function listProjectsForClient(
  clientId: number,
  opts: { limit?: number; offset?: number } = {},
  dbc: VideoDb = db,
): Promise<VideoProject[]> {
  const { limit = 20, offset = 0 } = opts;
  return rowsOf<VideoProject>(await dbc.execute(sql`
    /*cfv:list_projects*/
    SELECT * FROM video_projects
    WHERE client_id = ${clientId}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit} OFFSET ${offset}
  `));
}

/** Project + ordered scenes; clientId (when given) scopes for tenant
 *  routes — a wrong tenant gets undefined, not someone else's project. */
export async function getProjectWithScenes(
  projectId: number,
  opts: { clientId?: number } = {},
  dbc: VideoDb = db,
): Promise<VideoProjectWithScenes | undefined> {
  const clientGuard = opts.clientId !== undefined ? sql` AND client_id = ${opts.clientId}` : sql``;
  const projects = rowsOf<VideoProject>(await dbc.execute(sql`
    /*cfv:get_project*/
    SELECT * FROM video_projects WHERE id = ${projectId}${clientGuard} LIMIT 1
  `));
  if (projects.length === 0) return undefined;
  const scenes = rowsOf<VideoScene>(await dbc.execute(sql`
    /*cfv:get_scenes*/
    SELECT * FROM video_scenes WHERE project_id = ${projectId} ORDER BY scene_index ASC
  `));
  return { project: projects[0], scenes };
}

export type AdminVideoQueueProject = VideoProject & {
  scene_count: number;
  rendered_count: number;
  failed_count: number;
  providers: string[];
};

/**
 * Admin queue view (all tenants): per-status counts + recent projects with
 * scene roll-ups + the provider mix actually used.
 */
export async function getAdminVideoQueue(
  opts: { limit?: number } = {},
  dbc: VideoDb = db,
): Promise<{ counts: Record<string, number>; projects: AdminVideoQueueProject[] }> {
  const { limit = 50 } = opts;
  const countRows = rowsOf<{ status: string; count: number }>(await dbc.execute(sql`
    /*cfv:admin_counts*/
    SELECT status, COUNT(*)::int AS count FROM video_projects GROUP BY status
  `));
  const counts: Record<string, number> = {};
  for (const row of countRows) counts[row.status] = Number(row.count);

  const projects = rowsOf<AdminVideoQueueProject>(await dbc.execute(sql`
    /*cfv:admin_queue*/
    SELECT p.*,
      (SELECT COUNT(*)::int FROM video_scenes s WHERE s.project_id = p.id) AS scene_count,
      (SELECT COUNT(*)::int FROM video_scenes s WHERE s.project_id = p.id AND s.status = 'rendered') AS rendered_count,
      (SELECT COUNT(*)::int FROM video_scenes s WHERE s.project_id = p.id AND s.status = 'failed') AS failed_count,
      COALESCE((SELECT array_agg(DISTINCT s.provider) FROM video_scenes s
                WHERE s.project_id = p.id AND s.provider IS NOT NULL), '{}') AS providers
    FROM video_projects p
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT ${limit}
  `));
  return { counts, projects };
}
