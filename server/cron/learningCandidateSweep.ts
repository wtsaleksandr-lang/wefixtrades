/**
 * Conversation → KB candidate sweep.
 *
 * Schedule: daily at 04:41 UTC (registered from server/jobs/scheduler.ts).
 *
 * Per tick:
 *   1. Read every ai_response_ratings row from the last 24h with
 *      rating = -1 AND comment IS NOT NULL.
 *   2. For each rating, insert a tradeline_learning_candidates row with
 *      kind='conversation' so admins can review + promote into the KB
 *      via the /admin/tradeline/learning queue.
 *   3. Idempotent — skip ratings that already produced a candidate
 *      (matched on source_url = "rating:<rating_id>").
 *
 * Why this exists: the kind='conversation' branch in
 * tradeline_learning_candidates was scaffolded but had no source until
 * we added the message-level feedback widget. PR #669 audit flagged
 * the gap; this cron activates the pipeline.
 *
 * Fail-soft: per-row failures log + count but don't abort the loop.
 * One bad rating shouldn't silence the entire sweep for that day.
 */

import * as Sentry from "@sentry/node";
import { db } from "../db";
import { aiResponseRatings, tradelineLearningCandidates } from "@shared/schema";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("LearningCandidateSweep");

/** Surfaces whose ratings feed the TradeLine niche templates. Other
 *  surfaces (business_operator, etc.) still produce candidates but get
 *  routed to template_kind='concierge' so they don't pollute the trade
 *  KB. Keep this in sync with the surface registry. */
const TRADELINE_SURFACES = new Set<string>([
  "tradeline_voice",
  "quotequick_widget_ai",
]);

function templateKindFor(surface: string): "tradeline" | "concierge" {
  return TRADELINE_SURFACES.has(surface) ? "tradeline" : "concierge";
}

/** Niche resolution v1: surfaces don't carry a niche on the rating row
 *  (admins rate at the response level, not the niche level). The
 *  template editor lets the reviewer re-target on promote, so 'general'
 *  is a safe parking bucket. Later iterations can join the rating's
 *  client_id → client_services.metadata.niche when that path is wired. */
const DEFAULT_NICHE = "general";

export interface SweepResult {
  ratings_checked: number;
  candidates_inserted: number;
  skipped_duplicate: number;
  errors: number;
}

export async function runLearningCandidateSweep(): Promise<SweepResult> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let checked = 0;
  let inserted = 0;
  let dupes = 0;
  let errors = 0;

  let rows: Array<typeof aiResponseRatings.$inferSelect>;
  try {
    rows = await db
      .select()
      .from(aiResponseRatings)
      .where(
        and(
          eq(aiResponseRatings.rating, -1),
          isNotNull(aiResponseRatings.comment),
          gte(aiResponseRatings.rated_at, since),
        ),
      );
  } catch (err: any) {
    log.error("read failed", { error: err?.message });
    Sentry.captureMessage(
      `learning_candidate_sweep: read failed — ${err?.message ?? "unknown"}`,
      "error",
    );
    return { ratings_checked: 0, candidates_inserted: 0, skipped_duplicate: 0, errors: 1 };
  }

  for (const row of rows) {
    checked++;
    const comment = (row.comment ?? "").trim();
    if (!comment) continue;

    const sourceUrl = `rating:${row.id}`;

    try {
      // Idempotency: skip if a candidate already exists for this rating.
      const existing = await db
        .select({ id: tradelineLearningCandidates.id })
        .from(tradelineLearningCandidates)
        .where(eq(tradelineLearningCandidates.source_url, sourceUrl))
        .limit(1);

      if (existing.length > 0) {
        dupes++;
        continue;
      }

      const title =
        `Negative feedback on ${row.surface} — ` +
        comment.slice(0, 80).replace(/\s+/g, " ").trim() +
        (comment.length > 80 ? "…" : "");

      const body =
        `Admin rated this AI response negative on ${new Date(row.rated_at).toISOString()}.\n\n` +
        `Surface: ${row.surface}\n` +
        `Response ID: ${row.response_id}\n` +
        (row.client_id ? `Client ID: ${row.client_id}\n` : "") +
        `\nAdmin comment:\n${comment}`;

      await db.insert(tradelineLearningCandidates).values({
        niche: DEFAULT_NICHE,
        template_kind: templateKindFor(row.surface),
        kind: "conversation",
        source_url: sourceUrl,
        title,
        body,
        status: "pending",
      });
      inserted++;
    } catch (err: any) {
      errors++;
      log.error("candidate insert failed", {
        rating_id: row.id,
        error: err?.message,
      });
      // Don't abort — keep sweeping the rest.
      continue;
    }
  }

  log.info("sweep complete", {
    ratings_checked: checked,
    candidates_inserted: inserted,
    skipped_duplicate: dupes,
    errors,
  });

  // Suppress unused-import false positives if the runtime tree-shakes.
  void sql;

  return {
    ratings_checked: checked,
    candidates_inserted: inserted,
    skipped_duplicate: dupes,
    errors,
  };
}
