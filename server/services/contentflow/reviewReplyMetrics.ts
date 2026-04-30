/**
 * ContentFlow — review-reply reporting (Sprint 9).
 *
 * Read-only metrics for the admin reputation dashboard. Pure SQL — no
 * caching layer, no schema migration. Sprint 9 ships JSON only;
 * dashboard UI is deferred per scope.
 */

import { sql } from "drizzle-orm";
import { db } from "../../db";

export interface ReviewReplyMetrics {
  drafted: number;
  approved: number;
  published: number;
  pending: number;
  failed: number;
  avg_response_time_hours: number | null;
}

/**
 * Compute review-reply pipeline metrics for one client (or every
 * client if `clientId` is null).
 *
 *   drafted    — total content_drafts of kind='review_reply'
 *   pending    — status='draft' (awaiting admin/client approval)
 *   approved   — status='approved' (in queue or unpublished)
 *   published  — metadata.gbp.posted_at IS NOT NULL
 *   failed     — metadata.gbp.queue_status='failed' (dead-lettered)
 *   avg_response_time_hours — mean(posted_at - review.review_time)
 *                              over published replies, in hours.
 */
export async function getReviewReplyMetrics(clientId: number | null): Promise<ReviewReplyMetrics> {
  const clientFilter = clientId === null
    ? sql``
    : sql`AND cd.client_id = ${clientId}`;

  const aggregate: any = await db.execute(sql`
    SELECT
      COUNT(*)::int AS drafted,
      COUNT(*) FILTER (WHERE cd.status = 'draft')::int AS pending,
      COUNT(*) FILTER (WHERE cd.status = 'approved')::int AS approved,
      COUNT(*) FILTER (WHERE cd.metadata->'gbp'->>'posted_at' IS NOT NULL)::int AS published,
      COUNT(*) FILTER (WHERE cd.metadata->'gbp'->>'queue_status' = 'failed')::int AS failed
    FROM content_drafts cd
    WHERE cd.kind = 'review_reply'
      AND cd.surface = 'reputationshield'
      ${clientFilter}
  `);
  const row = (aggregate?.rows ?? aggregate)?.[0] ?? {};

  const responseTimeQuery: any = await db.execute(sql`
    SELECT AVG(EXTRACT(EPOCH FROM (
        (cd.metadata->'gbp'->>'posted_at')::timestamptz - r.review_time
      )) / 3600.0)::float AS avg_hours
    FROM content_drafts cd
    JOIN reviews r ON r.id = (cd.metadata->'gbp'->>'review_id')::int
    WHERE cd.kind = 'review_reply'
      AND cd.surface = 'reputationshield'
      AND cd.metadata->'gbp'->>'posted_at' IS NOT NULL
      AND r.review_time IS NOT NULL
      ${clientFilter}
  `);
  const rtRow = (responseTimeQuery?.rows ?? responseTimeQuery)?.[0] ?? {};
  const avgHoursRaw = rtRow.avg_hours;
  const avg_response_time_hours =
    typeof avgHoursRaw === "number" && Number.isFinite(avgHoursRaw)
      ? Math.round(avgHoursRaw * 100) / 100
      : null;

  return {
    drafted: row.drafted ?? 0,
    approved: row.approved ?? 0,
    published: row.published ?? 0,
    pending: row.pending ?? 0,
    failed: row.failed ?? 0,
    avg_response_time_hours,
  };
}
