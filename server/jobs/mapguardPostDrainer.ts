/**
 * MapGuard daily post drainer.
 *
 * Runs once per day. For each mapguard_posts row whose
 *   status = 'scheduled' AND scheduled_for <= now()
 * the drainer:
 *
 *   1. Verifies the client has an active Google Business connection.
 *      No connection → mark 'skipped' with reason; do NOT consume a slot.
 *   2. Calls the standalone content generator (chat() under the hood)
 *      and persists generated body + metadata. Status → 'drafted'.
 *   3. Calls publishToGoogleBusiness(). Success → 'published' with
 *      gbp_post_id. Failure → retry up to MAX_RETRIES, then 'failed'.
 *
 * Per-row error isolation — one client's failure never blocks the others.
 * Daily cadence picks up retryable failures naturally.
 */
import { db } from "../db";
import { and, eq, lte, sql } from "drizzle-orm";
import { mapguardPosts } from "@shared/schemas/mapguardPosts";
import { generateMapguardPost } from "../services/mapguard/mapguardPostGenerator";
import { publishToGoogleBusiness } from "../services/socialSync/googleBusinessPublisher";
import { getGoogleAccessToken } from "../services/socialSync/googleBusinessService";
import { createLogger } from "../lib/logger";

const log = createLogger("MapGuardPostDrainer");

const MAX_RETRIES = 3;
const BATCH_SIZE = 50;

interface DrainSummary {
  [key: string]: number;
  candidates: number;
  published: number;
  skipped_no_connection: number;
  failed: number;
  errored: number;
}

export async function processMapguardPostDrain(now: Date = new Date()): Promise<DrainSummary> {
  const summary: DrainSummary = {
    candidates: 0,
    published: 0,
    skipped_no_connection: 0,
    failed: 0,
    errored: 0,
  };

  const candidates = await db
    .select()
    .from(mapguardPosts)
    .where(and(eq(mapguardPosts.status, "scheduled"), lte(mapguardPosts.scheduled_for, now)))
    .limit(BATCH_SIZE);

  summary.candidates = candidates.length;

  for (const row of candidates) {
    try {
      // 1. Reachability check — no GBP connection = skip with reason.
      const credentials = await getGoogleAccessToken(row.client_id);
      if (!credentials) {
        await db
          .update(mapguardPosts)
          .set({
            status: "skipped",
            last_error: "No active Google Business connection at publish time",
            updated_at: new Date(),
          })
          .where(eq(mapguardPosts.id, row.id));
        summary.skipped_no_connection += 1;
        continue;
      }

      // 2. Generate content (if not already drafted from a prior attempt).
      let content = row.content;
      let generator_metadata = row.generator_metadata;
      let media_url = row.media_url;

      if (!content) {
        const generated = await generateMapguardPost({
          clientId: row.client_id,
          theme: row.theme || "tip",
          quotaPeriod: row.quota_period,
        });
        content = generated.content;
        media_url = generated.media_url;
        generator_metadata = generated.generator_metadata;

        await db
          .update(mapguardPosts)
          .set({
            status: "drafted",
            content,
            media_url,
            generator_metadata,
            drafted_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(mapguardPosts.id, row.id));
      }

      // 3. Publish via GBP. The publisher accepts a SocialSyncPost shape;
      //    we feed it the bare minimum it needs (post_text + media_plan).
      const result = await publishToGoogleBusiness(row.client_id, {
        id: row.id,
        client_id: row.client_id,
        post_text: content,
        media_plan: media_url ? { image_url: media_url } : null,
      } as any);

      if (result.success && result.remote_post_id) {
        await db
          .update(mapguardPosts)
          .set({
            status: "published",
            gbp_post_id: result.remote_post_id,
            published_at: new Date(),
            last_error: null,
            updated_at: new Date(),
          })
          .where(eq(mapguardPosts.id, row.id));
        summary.published += 1;
      } else {
        const nextRetry = (row.retry_count || 0) + 1;
        const exhausted = nextRetry >= MAX_RETRIES || !!result.permanent_failure;
        await db
          .update(mapguardPosts)
          .set({
            status: exhausted ? "failed" : "scheduled",
            retry_count: nextRetry,
            last_error: result.error || "Publish failed (no error returned)",
            updated_at: new Date(),
            // bump scheduled_for by an hour to avoid hot-loop on transient errors
            scheduled_for: exhausted
              ? row.scheduled_for
              : new Date(now.getTime() + 60 * 60 * 1000),
          })
          .where(eq(mapguardPosts.id, row.id));
        if (exhausted) summary.failed += 1;
      }
    } catch (err: any) {
      summary.errored += 1;
      log.error("Drainer failed on row", {
        post_id: row.id,
        client_id: row.client_id,
        error: err.message,
      });
      await db
        .update(mapguardPosts)
        .set({
          last_error: `Drainer crashed: ${err.message}`.slice(0, 1000),
          retry_count: sql`${mapguardPosts.retry_count} + 1`,
          updated_at: new Date(),
        })
        .where(eq(mapguardPosts.id, row.id))
        .catch(() => {});
    }
  }

  log.info("MapGuard post drain complete", summary);
  return summary;
}
