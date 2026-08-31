/**
 * ContentFlow — image retention worker (Sprint 11).
 *
 * Daily sweep that identifies drafts whose generated images have
 * exceeded retention thresholds:
 *   - 180 days for drafts that never published (status != 'published')
 *   - 2 years for published drafts
 *
 * For Sprint 11 ship scope: identifies + reports candidates only.
 * Actual R2 DELETE happens once Cloudflare R2 is wired in prod
 * (per scope decision: "ship retention but don't overengineer"
 * since R2 isn't configured on Replit yet). When R2 env vars are
 * present, the worker does attempt DELETE via SigV4 — best-effort,
 * never blocks.
 *
 * Cleared on the draft regardless of R2 outcome:
 *   metadata.media_plan.image_url
 *   metadata.media_plan.public_image_url
 *   metadata.image_archived_at = now
 *
 * The cron registration lives in scheduler.ts. Idempotent — safe to
 * run multiple times per day.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
// Shared signer — this worker used to carry its own byte-identical copy, so a
// fix to one never reached the other.
import { deleteFromR2 } from "../lib/r2Upload";

const UNPUBLISHED_RETENTION_DAYS = 180;
const PUBLISHED_RETENTION_DAYS = 2 * 365;

export interface RetentionSummary {
  scanned: number;
  archived: number;
  r2_deletes_attempted: number;
  r2_deletes_failed: number;
  errors: string[];
}


export async function processImageRetention(): Promise<RetentionSummary> {
  const summary: RetentionSummary = {
    scanned: 0,
    archived: 0,
    r2_deletes_attempted: 0,
    r2_deletes_failed: 0,
    errors: [],
  };

  /* Find drafts with images past retention. Two windows by status. */
  const result: any = await db.execute(sql`
    SELECT id, status, metadata
    FROM content_drafts
    WHERE metadata->'media_plan'->>'image_url' IS NOT NULL
      AND metadata->>'image_archived_at' IS NULL
      AND (
        (status = 'published' AND created_at < NOW() - (${PUBLISHED_RETENTION_DAYS}::int || ' days')::interval)
        OR
        (status != 'published' AND created_at < NOW() - (${UNPUBLISHED_RETENTION_DAYS}::int || ' days')::interval)
      )
    LIMIT 200
  `);
  const rows: Array<{ id: number; status: string; metadata: any }> = (result?.rows ?? result) as any[];
  summary.scanned = rows.length;

  for (const row of rows) {
    try {
      const meta = (row.metadata || {}) as Record<string, any>;
      const mediaPlan = (meta.media_plan || {}) as Record<string, any>;
      const imageUrl = mediaPlan.image_url as string | undefined;
      if (imageUrl) {
        summary.r2_deletes_attempted++;
        const ok = await deleteFromR2(imageUrl);
        if (!ok) summary.r2_deletes_failed++;
      }
      /* Always clear the URL pointers + stamp the archive marker so
       * we don't re-process this row. */
      const newMediaPlan = { ...mediaPlan };
      delete newMediaPlan.image_url;
      delete newMediaPlan.public_image_url;
      delete newMediaPlan.image_provider;
      delete newMediaPlan.image_revised_prompt;
      await storage.updateContentDraft(row.id, {
        metadata: {
          ...meta,
          media_plan: newMediaPlan,
          image_archived_at: new Date().toISOString(),
        },
      } as any);
      summary.archived++;
    } catch (err: any) {
      summary.errors.push(`draft ${row.id}: ${err?.message || err}`);
    }
  }

  return summary;
}
