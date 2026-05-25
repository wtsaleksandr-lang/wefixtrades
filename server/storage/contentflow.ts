/**
 * ContentFlow storage helpers extracted from server/storage.ts.
 *
 * Pure functions over `db` — no `this`, no cross-method calls. The
 * DatabaseStorage class re-exports these through thin wrappers so the
 * public API stays byte-identical.
 *
 * Tables touched: content_drafts, content_approvals, content_assets,
 * contentflow_settings, socialsync_posts (cascade delete only).
 *
 * Powers the ContentFlow product (multi-channel AI content drafting +
 * approval + atomic claim queue for WordPress, GBP review replies,
 * Facebook, Instagram, GBP posts, email, LinkedIn, Pinterest, YouTube).
 */

import { db } from "../db";
import {
  contentDrafts, contentApprovals, contentAssets, contentflowSettings,
  socialsyncPosts,
  type ContentDraft, type InsertContentDraft,
  type ContentApproval, type InsertContentApproval,
  type ContentAsset, type InsertContentAsset,
  type ContentflowSettings,
} from "@shared/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";

/**
 * Sprint 8-18: every ContentFlow queue platform. claimNextJob /
 * recoverStaleClaims look up the per-platform config from
 * CONTENT_JOB_PLATFORMS, so adding a new channel = adding one
 * entry to the map (no new SQL).
 */
export type ContentJobPlatform =
  | "wordpress"
  | "gbp"
  | "facebook"
  | "instagram"
  | "gbp_post"
  | "email"
  | "linkedin"
  | "pinterest"
  | "youtube";

type ContentJobPlatformConfig = {
  /** metadata jsonb key carrying this channel's queue lifecycle */
  metadataKey: string;
  /** which content_drafts column scopes the queue (rankflow/reputationshield use
   * `surface`; social channels use `target_platform`) */
  filterColumn: "surface" | "target_platform";
  filterValue: string;
  /** allowed `kind` values for this channel */
  kinds: string[];
  /** metadata field that signals a successful publish — eligibility
   * excludes rows already carrying it. WP=post_id, GBP review reply=posted_at,
   * social default=remote_post_id, email=message_id, youtube=youtube_url. */
  successField: string;
};

export const CONTENT_JOB_PLATFORMS: Record<ContentJobPlatform, ContentJobPlatformConfig> = {
  wordpress: {
    metadataKey: "wordpress",
    filterColumn: "surface",
    filterValue: "rankflow",
    kinds: ["article"],
    successField: "post_id",
  },
  gbp: {
    metadataKey: "gbp",
    filterColumn: "surface",
    filterValue: "reputationshield",
    kinds: ["review_reply"],
    successField: "posted_at",
  },
  facebook: {
    metadataKey: "facebook",
    filterColumn: "target_platform",
    filterValue: "facebook",
    kinds: ["social_post", "carousel_post"],
    successField: "remote_post_id",
  },
  instagram: {
    metadataKey: "instagram",
    filterColumn: "target_platform",
    filterValue: "instagram",
    kinds: ["social_post", "carousel_post"],
    successField: "remote_post_id",
  },
  gbp_post: {
    metadataKey: "gbp_post",
    filterColumn: "target_platform",
    filterValue: "google_business",
    kinds: ["google_post", "social_post"],
    successField: "remote_post_id",
  },
  email: {
    metadataKey: "email",
    filterColumn: "target_platform",
    filterValue: "email",
    kinds: ["email_post"],
    successField: "message_id",
  },
  linkedin: {
    metadataKey: "linkedin",
    filterColumn: "target_platform",
    filterValue: "linkedin",
    kinds: ["social_post", "carousel_post"],
    successField: "remote_post_id",
  },
  pinterest: {
    metadataKey: "pinterest",
    filterColumn: "target_platform",
    filterValue: "pinterest",
    kinds: ["social_post", "carousel_post"],
    successField: "remote_post_id",
  },
  youtube: {
    metadataKey: "youtube",
    filterColumn: "target_platform",
    filterValue: "youtube",
    kinds: ["video"],
    successField: "youtube_url",
  },
};

// ─── Drafts ─────────────────────────────────────────────────────────────

export async function createContentDraft(data: InsertContentDraft): Promise<ContentDraft> {
  const [row] = await db.insert(contentDrafts).values(data).returning();
  return row;
}

export async function getContentDraftById(id: number): Promise<ContentDraft | undefined> {
  const [row] = await db.select().from(contentDrafts).where(eq(contentDrafts.id, id)).limit(1);
  return row;
}

export async function getContentDraftBySocialPostId(postId: number): Promise<ContentDraft | undefined> {
  const [row] = await db.select().from(contentDrafts)
    .where(eq(contentDrafts.linked_social_post_id, postId))
    .limit(1);
  return row;
}

export async function getContentDraftByTaskId(taskId: number): Promise<ContentDraft | undefined> {
  const [row] = await db.select().from(contentDrafts)
    .where(eq(contentDrafts.linked_task_id, taskId))
    .limit(1);
  return row;
}

export async function listContentDrafts(opts: {
  client_id?: number;
  status?: string;
  surface?: string;
  kind?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<ContentDraft[]> {
  const { client_id, status, surface, kind, limit = 50, offset = 0 } = opts;
  const conditions = [];
  if (client_id !== undefined) conditions.push(eq(contentDrafts.client_id, client_id));
  if (status) conditions.push(eq(contentDrafts.status, status));
  if (surface) conditions.push(eq(contentDrafts.surface, surface));
  if (kind) conditions.push(eq(contentDrafts.kind, kind));
  const where = conditions.length ? and(...conditions) : undefined;
  return db.select().from(contentDrafts)
    .where(where)
    .orderBy(desc(contentDrafts.created_at))
    .limit(limit)
    .offset(offset);
}

export async function updateContentDraft(id: number, updates: Partial<InsertContentDraft>): Promise<ContentDraft | undefined> {
  const [row] = await db.update(contentDrafts)
    .set({ ...updates, updated_at: new Date() })
    .where(eq(contentDrafts.id, id))
    .returning();
  return row;
}

/* ─── ContentFlow product settings (singleton row, id = 1) ───────── */

let _cfSettingsTableReady = false;

/** Lazily create the contentflow_settings table. The repo has no
 *  migration step in the deploy pipeline, so this mirrors the same
 *  CREATE TABLE IF NOT EXISTS pattern used by unsubscribeStorage —
 *  the table self-creates on whichever database the app connects to. */
async function ensureContentflowSettingsTable(): Promise<void> {
  if (_cfSettingsTableReady) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS contentflow_settings (
      id INTEGER PRIMARY KEY,
      kill_switch BOOLEAN NOT NULL DEFAULT false,
      text_tier VARCHAR(20) NOT NULL DEFAULT 'standard',
      disabled_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
      monthly_spend_cap_usd INTEGER,
      updated_at TIMESTAMP DEFAULT NOW(),
      updated_by INTEGER
    )
  `);
  _cfSettingsTableReady = true;
}

export async function getContentflowSettings(): Promise<ContentflowSettings> {
  await ensureContentflowSettingsTable();
  const [row] = await db.select().from(contentflowSettings)
    .where(eq(contentflowSettings.id, 1)).limit(1);
  if (row) return row;
  // Lazily create the singleton row with column defaults on first read.
  const [created] = await db.insert(contentflowSettings)
    .values({ id: 1 })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  // Race: another caller inserted it first — re-read.
  const [existing] = await db.select().from(contentflowSettings)
    .where(eq(contentflowSettings.id, 1)).limit(1);
  return existing;
}

export async function updateContentflowSettings(
  patch: { kill_switch?: boolean; text_tier?: string; disabled_channels?: string[]; monthly_spend_cap_usd?: number | null },
  updatedBy?: number,
): Promise<ContentflowSettings> {
  await getContentflowSettings(); // ensure the singleton row exists
  const [row] = await db.update(contentflowSettings)
    .set({ ...patch, updated_at: new Date(), updated_by: updatedBy ?? null })
    .where(eq(contentflowSettings.id, 1))
    .returning();
  return row;
}

/** Sum of generation_cost_micro_usd across all drafts created this
 *  calendar month — the basis for the ContentFlow monthly spend cap. */
export async function getContentflowMonthlySpendMicroUsd(): Promise<number> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [row] = await db.select({
    total: sql<string>`COALESCE(SUM(${contentDrafts.generation_cost_micro_usd}), 0)`,
  }).from(contentDrafts)
    .where(gte(contentDrafts.created_at, monthStart));
  return Number(row?.total ?? 0);
}

/** Add to a draft's recorded AI generation cost. Additive — a draft may
 *  accrue text + image cost, and an admin regenerate adds more. */
export async function addDraftGenerationCost(draftId: number, microUsd: number): Promise<void> {
  if (!Number.isFinite(microUsd) || microUsd <= 0) return;
  await db.update(contentDrafts)
    .set({
      generation_cost_micro_usd: sql`COALESCE(${contentDrafts.generation_cost_micro_usd}, 0) + ${Math.round(microUsd)}`,
      updated_at: new Date(),
    })
    .where(eq(contentDrafts.id, draftId));
}

/**
 * Sprint 5: find approved RankFlow article drafts whose
 * metadata.wordpress.queue_status = 'queued' and whose scheduled_for
 * is null OR has elapsed. Ordered by scheduled_for ASC NULLS FIRST so
 * un-scheduled drafts (immediate publish) drain before timed ones.
 *
 * Drafts already containing a wordpress.post_id are excluded as a
 * defence-in-depth against duplicate publishes — the worker also
 * self-checks, but pre-filtering at the SQL layer is cheaper.
 */
export async function findQueuedWordpressDrafts(opts: { limit?: number; now?: Date } = {}): Promise<ContentDraft[]> {
  const { limit = 10, now = new Date() } = opts;
  return db.select().from(contentDrafts)
    .where(and(
      eq(contentDrafts.status, "approved"),
      eq(contentDrafts.kind, "article"),
      eq(contentDrafts.surface, "rankflow"),
      sql`${contentDrafts.metadata}->'wordpress'->>'queue_status' = 'queued'`,
      sql`(${contentDrafts.metadata}->'wordpress'->>'scheduled_for' IS NULL
           OR (${contentDrafts.metadata}->'wordpress'->>'scheduled_for')::timestamptz <= ${now.toISOString()}::timestamptz)`,
      sql`${contentDrafts.metadata}->'wordpress'->>'post_id' IS NULL`,
    ))
    .orderBy(sql`(${contentDrafts.metadata}->'wordpress'->>'scheduled_for')::timestamptz ASC NULLS FIRST`)
    .limit(limit);
}

/**
 * Sprint 8: idempotency lookup for review-reply drafts. One draft
 * per (clientId, externalReviewId). The external id lives in
 * metadata.gbp.external_review_id (no new column).
 */
export async function getReviewReplyDraft(clientId: number, externalReviewId: string): Promise<ContentDraft | undefined> {
  const [row] = await db.select().from(contentDrafts)
    .where(and(
      eq(contentDrafts.client_id, clientId),
      eq(contentDrafts.kind, "review_reply"),
      eq(contentDrafts.surface, "reputationshield"),
      sql`${contentDrafts.metadata}->'gbp'->>'external_review_id' = ${externalReviewId}`,
    ))
    .limit(1);
  return row;
}

/**
 * Sprint 8-18: unified atomic claim across every ContentFlow channel.
 * One config map, one SQL shape — Wordpress / GBP review-reply / 7
 * social channels (facebook, instagram, gbp_post, email, linkedin,
 * pinterest, youtube) all flow through claimNextJob / recoverStaleClaims.
 *
 * Eligibility (per platform):
 *   - status='approved'
 *   - kind matches the platform's allowed kind(s)
 *   - the platform's filter column (surface or target_platform) matches
 *   - metadata.<key>.queue_status='queued'
 *   - scheduled_for IS NULL or elapsed
 *   - the platform's success marker (post_id / posted_at / remote_post_id /
 *     message_id / youtube_url) IS NULL — defence-in-depth, never re-publish
 *   - locked_at IS NULL OR older than the stale threshold (10 min)
 *     so a crashed worker's claim auto-recovers
 *   - calendar.paused != 'true' AND calendar.scheduled_for elapsed (Sprint 14)
 *
 * SKIP LOCKED is per-row so all channels drain concurrently without
 * blocking each other.
 */
export async function claimNextJob(
  platform: ContentJobPlatform,
  workerId: string,
  opts: { now?: Date; staleLockMs?: number } = {},
): Promise<ContentDraft | null> {
  const cfg = CONTENT_JOB_PLATFORMS[platform];
  const now = opts.now ?? new Date();
  const staleMs = opts.staleLockMs ?? 10 * 60_000;
  const staleCutoff = new Date(now.getTime() - staleMs).toISOString();
  const kindList = sql.raw(cfg.kinds.map((k) => `'${k.replace(/'/g, "''")}'`).join(","));
  const filterColumnSql = sql.raw(cfg.filterColumn);
  const result: any = await db.execute(sql`
    UPDATE content_drafts
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          ${cfg.metadataKey}::text,
          COALESCE(metadata->${cfg.metadataKey}::text, '{}'::jsonb) || jsonb_build_object(
            'queue_status', 'publishing',
            'locked_at',    ${now.toISOString()}::text,
            'locked_by',    ${workerId}::text,
            'last_attempt_at', ${now.toISOString()}::text
          )
        ),
        updated_at = NOW()
    WHERE id = (
      SELECT id FROM content_drafts
      WHERE status = 'approved'
        AND kind IN (${kindList})
        AND ${filterColumnSql} = ${cfg.filterValue}
        AND metadata->${cfg.metadataKey}::text->>'queue_status' = 'queued'
        AND (metadata->${cfg.metadataKey}::text->>'scheduled_for' IS NULL
             OR (metadata->${cfg.metadataKey}::text->>'scheduled_for')::timestamptz <= ${now.toISOString()}::timestamptz)
        AND metadata->${cfg.metadataKey}::text->>${cfg.successField} IS NULL
        AND (metadata->${cfg.metadataKey}::text->>'locked_at' IS NULL
             OR (metadata->${cfg.metadataKey}::text->>'locked_at')::timestamptz < ${staleCutoff}::timestamptz)
        /* Sprint 14: calendar gating */
        AND (metadata->'calendar'->>'paused' IS NULL OR metadata->'calendar'->>'paused' != 'true')
        AND (metadata->'calendar'->>'scheduled_for' IS NULL
             OR (metadata->'calendar'->>'scheduled_for')::timestamptz <= ${now.toISOString()}::timestamptz)
      ORDER BY (metadata->${cfg.metadataKey}::text->>'scheduled_for')::timestamptz ASC NULLS FIRST, id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);
  const rows: ContentDraft[] = (result?.rows ?? result) as ContentDraft[];
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * Sprint 8-18: unified stale-claim recovery. Returns `publishing` rows
 * whose `locked_at` is older than the stale threshold back to `queued`
 * so the next tick can re-claim. Bumps attempts (so genuinely-broken
 * jobs still hit the dead-letter ceiling). Idempotent — safe to call
 * every tick.
 */
export async function recoverStaleClaims(
  platform: ContentJobPlatform,
  opts: { now?: Date; staleLockMs?: number } = {},
): Promise<number> {
  const cfg = CONTENT_JOB_PLATFORMS[platform];
  const now = opts.now ?? new Date();
  const staleMs = opts.staleLockMs ?? 10 * 60_000;
  const staleCutoff = new Date(now.getTime() - staleMs).toISOString();
  const kindList = sql.raw(cfg.kinds.map((k) => `'${k.replace(/'/g, "''")}'`).join(","));
  const filterColumnSql = sql.raw(cfg.filterColumn);
  const result: any = await db.execute(sql`
    UPDATE content_drafts
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          ${cfg.metadataKey}::text,
          COALESCE(metadata->${cfg.metadataKey}::text, '{}'::jsonb) || jsonb_build_object(
            'queue_status', 'queued',
            'locked_at',  NULL::text,
            'locked_by',  NULL::text,
            'attempts',   COALESCE((metadata->${cfg.metadataKey}::text->>'attempts')::int, 0) + 1,
            'last_error', 'recovered from stale lock'
          )
        ),
        updated_at = NOW()
    WHERE status = 'approved'
      AND kind IN (${kindList})
      AND ${filterColumnSql} = ${cfg.filterValue}
      AND metadata->${cfg.metadataKey}::text->>'queue_status' = 'publishing'
      AND metadata->${cfg.metadataKey}::text->>'locked_at' IS NOT NULL
      AND (metadata->${cfg.metadataKey}::text->>'locked_at')::timestamptz < ${staleCutoff}::timestamptz
    RETURNING id
  `);
  const rows: any[] = (result?.rows ?? result) as any[];
  return Array.isArray(rows) ? rows.length : 0;
}

// ─── Approvals ──────────────────────────────────────────────────────────

export async function createContentApproval(data: InsertContentApproval): Promise<ContentApproval> {
  const [row] = await db.insert(contentApprovals).values(data).returning();
  return row;
}

export async function listContentApprovals(draftId: number): Promise<ContentApproval[]> {
  return db.select().from(contentApprovals)
    .where(eq(contentApprovals.draft_id, draftId))
    .orderBy(desc(contentApprovals.created_at));
}

// ─── Assets ─────────────────────────────────────────────────────────────

export async function createContentAsset(data: InsertContentAsset): Promise<ContentAsset> {
  const [row] = await db.insert(contentAssets).values(data).returning();
  return row;
}

export async function getContentAssetById(id: number): Promise<ContentAsset | undefined> {
  const [row] = await db.select().from(contentAssets).where(eq(contentAssets.id, id)).limit(1);
  return row;
}

export async function listContentAssets(clientId: number): Promise<ContentAsset[]> {
  return db.select().from(contentAssets)
    .where(eq(contentAssets.client_id, clientId))
    .orderBy(desc(contentAssets.created_at));
}

/**
 * Test/dev only — hard-delete a ContentFlow draft + its approvals and
 * optionally the linked SocialSync post. Intended for Sprint 1
 * verification scripts; never call from product code.
 *
 * Order is explicit: approvals → draft → post. The socialsync_posts
 * FK to content_drafts is ON DELETE SET NULL so the draft can be
 * removed before the post without a constraint violation.
 */
export async function deleteContentDraftCascade(
  draftId: number,
  postId?: number,
): Promise<{ deleted_draft: boolean; deleted_approvals: number; deleted_post: boolean }> {
  const draft = await getContentDraftById(draftId);
  const approvalsBefore = draft ? await listContentApprovals(draftId) : [];

  if (approvalsBefore.length > 0) {
    await db.delete(contentApprovals).where(eq(contentApprovals.draft_id, draftId));
  }

  let deleted_draft = false;
  if (draft) {
    await db.delete(contentDrafts).where(eq(contentDrafts.id, draftId));
    deleted_draft = true;
  }

  const targetPostId = postId ?? draft?.linked_social_post_id ?? null;
  let deleted_post = false;
  if (targetPostId) {
    await db.delete(socialsyncPosts).where(eq(socialsyncPosts.id, targetPostId));
    deleted_post = true;
  }

  return {
    deleted_draft,
    deleted_approvals: approvalsBefore.length,
    deleted_post,
  };
}
