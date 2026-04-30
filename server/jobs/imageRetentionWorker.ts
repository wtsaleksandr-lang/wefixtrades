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

import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";

const UNPUBLISHED_RETENTION_DAYS = 180;
const PUBLISHED_RETENTION_DAYS = 2 * 365;

export interface RetentionSummary {
  scanned: number;
  archived: number;
  r2_deletes_attempted: number;
  r2_deletes_failed: number;
  errors: string[];
}

function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_ENDPOINT
  );
}

async function deleteFromR2(imageUrl: string): Promise<boolean> {
  if (!isR2Configured()) return false;
  try {
    const publicBase = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
    if (!publicBase || !imageUrl.startsWith(publicBase)) {
      /* Not an R2-hosted URL — likely an OpenAI fallback URL.
       * Nothing to delete. */
      return false;
    }
    const key = imageUrl.slice(publicBase.length + 1);
    const accessKey = process.env.R2_ACCESS_KEY_ID!;
    const secretKey = process.env.R2_SECRET_ACCESS_KEY!;
    const bucket = process.env.R2_BUCKET_NAME!;
    const endpoint = process.env.R2_ENDPOINT!.replace(/\/+$/, "");
    const region = "auto";
    const host = new URL(endpoint).host;
    const date = new Date();
    const amzDate = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const dateStamp = amzDate.slice(0, 8);

    const payloadHash = crypto.createHash("sha256").update("").digest("hex");
    const canonicalUri = `/${bucket}/${key}`;
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = `DELETE\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash("sha256").update(canonicalRequest).digest("hex")}`;

    const kDate = crypto.createHmac("sha256", `AWS4${secretKey}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac("sha256", kDate).update(region).digest();
    const kService = crypto.createHmac("sha256", kRegion).update("s3").digest();
    const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest();
    const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await fetch(`${endpoint}/${bucket}/${key}`, {
      method: "DELETE",
      headers: {
        Authorization: authorization,
        "x-amz-date": amzDate,
        "x-amz-content-sha256": payloadHash,
      },
    });
    /* R2 returns 204 No Content on success, 404 on already-deleted. */
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
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
