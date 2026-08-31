/**
 * WebCare content backup — capture, store, verify, restore.
 *
 * WHAT THIS ACTUALLY DOES, AND WHAT IT DOES NOT
 * ---------------------------------------------
 * Our only access to a client's site is the WordPress REST API with an
 * Application Password. That is enough to genuinely capture everything a
 * customer would lose to a bad update or a wiped page — every post, page,
 * category, tag, menu, and the site settings — and it is enough to put any
 * of it back. It is NOT enough to image the server: we cannot read the
 * database wholesale, the theme/plugin PHP files, or the uploads directory
 * binaries. Media is captured as its catalogue (URL, title, alt, MIME) so a
 * restored post still points at the right file, not as the image bytes.
 *
 * So this is a CONTENT backup and the product must call it that. It is a
 * real, restorable artifact — not a status field that flips to "backed up".
 * Every claim in the UI and marketing copy is scoped to that.
 *
 * The archive is JSON → gzip → AES-256-GCM (server/lib/objectStorage.ts) →
 * Replit Object Storage. `sha256` is taken over the PLAINTEXT so a restore
 * proves the bytes it decrypted are the bytes we captured.
 *
 * STORAGE COST: a trades site's content export is ~40–400 KB gzipped. At
 * weekly cadence with 90-day retention that is ~13 snapshots ≈ 0.5–5 MB per
 * client. Replit Object Storage is included in the existing plan, so the
 * marginal cost is effectively $0.00/client/month at this scale (and would
 * be ~$0.0001/client/month at Cloudflare R2's $0.015/GB-month if it ever
 * moves). No new credentials, no new vendor.
 *
 * HONESTY CONTRACT (guarded by webcareDelivery.test.ts + a DB CHECK)
 * ------------------------------------------------------------------
 * A `webcare_backups` row may only reach status='success' when
 * object_name + sha256 + size_bytes are all set, i.e. a restorable artifact
 * genuinely exists. A capture that fails is recorded as 'failed' with the
 * real error. Nothing anywhere may report a site as backed up on the
 * strength of an intent to back it up.
 */

import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { webcareBackups } from "@shared/schema";
import { createLogger } from "../../lib/logger";
import {
  uploadEncryptedBuffer,
  downloadDecrypted,
  deleteObject,
} from "../../lib/objectStorage";
import { wpGetCollection, wpGetOne, wpPostJson } from "../wordpressMaintenance";
import type { WpCredentials } from "../wordpressMaintenance";

const log = createLogger("WebCareBackup");

/** Archive format version — bump when the shape changes incompatibly. */
export const ARCHIVE_VERSION = 2 as const;

/** Default retention. Older successful snapshots are pruned + deleted. */
export const DEFAULT_RETENTION_DAYS = 90;

/** Hard ceiling on captured items per collection, so one enormous site
 *  cannot blow the worker's memory or the object-size budget. Recorded in
 *  the archive as `truncated` so a restore never silently believes it has
 *  everything. */
const MAX_ITEMS_PER_COLLECTION = 2000;

export interface BackupArchive {
  archive_version: number;
  captured_at: string;
  source_url: string;
  /** Collections we could not read, with the reason. Present in the
   *  artifact itself so a restore knows exactly what is missing. */
  omitted: Array<{ collection: string; reason: string }>;
  truncated: string[];
  site: Record<string, unknown> | null;
  posts: unknown[];
  pages: unknown[];
  categories: unknown[];
  tags: unknown[];
  menus: unknown[];
  media_catalogue: unknown[];
}

export interface CaptureResult {
  ok: boolean;
  backupId: number;
  status: "success" | "failed";
  objectName?: string;
  sha256?: string;
  sizeBytes?: number;
  itemCounts?: Record<string, number>;
  error?: string;
}

/* ─── Capture ───────────────────────────────────────────────────────── */

function objectNameFor(clientId: number, backupId: number, capturedAt: string): string {
  const stamp = capturedAt.replace(/[:.]/g, "-");
  return `webcare/backups/${clientId}/${backupId}-${stamp}.json.gz.enc`;
}

/**
 * Capture a content backup for one WebCare site.
 *
 * Always inserts a row FIRST (status='running'), then either completes it
 * to 'success' with the artifact coordinates or to 'failed' with the real
 * error. There is deliberately no code path that returns success without an
 * uploaded, hashed artifact.
 */
export async function captureBackup(params: {
  clientId: number;
  clientServiceId: number | null;
  credentials: WpCredentials;
  trigger: "manual" | "scheduled";
  retentionDays?: number;
}): Promise<CaptureResult> {
  const { clientId, clientServiceId, credentials, trigger } = params;
  const retentionDays = params.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const capturedAt = new Date().toISOString();

  const [row] = await db
    .insert(webcareBackups)
    .values({
      client_id: clientId,
      client_service_id: clientServiceId,
      status: "running",
      trigger,
      source_url: credentials.cms_url,
      retention_days: retentionDays,
    })
    .returning({ id: webcareBackups.id });

  const backupId = row!.id;

  const fail = async (error: string): Promise<CaptureResult> => {
    await db
      .update(webcareBackups)
      .set({ status: "failed", error: error.slice(0, 2000), completed_at: new Date() })
      .where(eq(webcareBackups.id, backupId));
    log.warn("backup failed", { clientId: String(clientId), backupId: String(backupId), error });
    return { ok: false, backupId, status: "failed", error };
  };

  try {
    const omitted: BackupArchive["omitted"] = [];
    const truncated: string[] = [];

    const collect = async (
      name: string,
      path: string,
    ): Promise<unknown[]> => {
      const res = await wpGetCollection(credentials, path, MAX_ITEMS_PER_COLLECTION);
      if (!res.ok) {
        omitted.push({ collection: name, reason: res.error ?? "unknown error" });
        return [];
      }
      if (res.truncated) truncated.push(name);
      return res.items;
    };

    // `context=edit` returns raw (unrendered) content — that is what a
    // restore needs. It requires the authenticated app-password user to
    // have edit rights, which the maintenance account does.
    const posts = await collect("posts", "/wp/v2/posts?context=edit&status=any");
    const pages = await collect("pages", "/wp/v2/pages?context=edit&status=any");
    const categories = await collect("categories", "/wp/v2/categories");
    const tags = await collect("tags", "/wp/v2/tags");
    // Menus need WP 5.9+; older sites simply record it as omitted.
    const menus = await collect("menus", "/wp/v2/menus?context=edit");
    const mediaCatalogue = await collect("media_catalogue", "/wp/v2/media?context=edit");

    const siteRes = await wpGetOne(credentials, "/");
    const site = siteRes.ok ? (siteRes.data as Record<string, unknown>) : null;
    if (!siteRes.ok) {
      omitted.push({ collection: "site", reason: siteRes.error ?? "unknown error" });
    }

    // A capture that read NOTHING is a failure, not an empty backup. Storing
    // a 200-byte archive of nothing and calling it a successful backup is
    // exactly the facade this module exists to remove.
    const totalItems =
      posts.length + pages.length + categories.length + tags.length +
      menus.length + mediaCatalogue.length;
    if (totalItems === 0 && !site) {
      return await fail(
        `Captured nothing — every collection failed. First error: ${omitted[0]?.reason ?? "unknown"}`,
      );
    }

    const archive: BackupArchive = {
      archive_version: ARCHIVE_VERSION,
      captured_at: capturedAt,
      source_url: credentials.cms_url,
      omitted,
      truncated,
      site,
      posts,
      pages,
      categories,
      tags,
      menus,
      media_catalogue: mediaCatalogue,
    };

    const plaintext = Buffer.from(JSON.stringify(archive), "utf8");
    const gz = gzipSync(plaintext, { level: 9 });
    const sha256 = createHash("sha256").update(gz).digest("hex");
    const objectName = objectNameFor(clientId, backupId, capturedAt);

    const upload = await uploadEncryptedBuffer(objectName, gz);
    if (!upload.ok) {
      return await fail(`Object storage upload failed: ${upload.error}`);
    }

    const itemCounts: Record<string, number> = {
      posts: posts.length,
      pages: pages.length,
      categories: categories.length,
      tags: tags.length,
      menus: menus.length,
      media_catalogue: mediaCatalogue.length,
    };

    await db
      .update(webcareBackups)
      .set({
        status: "success",
        object_name: objectName,
        sha256,
        size_bytes: gz.length,
        item_counts: itemCounts,
        completed_at: new Date(),
      })
      .where(eq(webcareBackups.id, backupId));

    log.info("backup captured", {
      clientId: String(clientId),
      backupId: String(backupId),
      bytes: String(gz.length),
      items: String(totalItems),
    });

    return {
      ok: true,
      backupId,
      status: "success",
      objectName,
      sha256,
      sizeBytes: gz.length,
      itemCounts,
    };
  } catch (err: any) {
    return await fail(err?.message || String(err));
  }
}

/* ─── Read back ─────────────────────────────────────────────────────── */

export interface FetchedArchive {
  ok: true;
  archive: BackupArchive;
  /** The raw gzip bytes, for the "download my backup" path. */
  gzip: Buffer;
}
export interface FetchFailure {
  ok: false;
  error: string;
}

/**
 * Download + decrypt + verify one backup. The sha256 recorded at capture
 * time is re-computed and compared; a mismatch is reported as an error
 * rather than handed to a restore. A backup we cannot verify is not a
 * backup.
 */
export async function fetchBackupArchive(
  backupId: number,
  clientId: number,
): Promise<FetchedArchive | FetchFailure> {
  const [row] = await db
    .select()
    .from(webcareBackups)
    .where(and(eq(webcareBackups.id, backupId), eq(webcareBackups.client_id, clientId)))
    .limit(1);

  if (!row) return { ok: false, error: "Backup not found." };
  if (row.status !== "success" || !row.object_name || !row.sha256) {
    return { ok: false, error: "That backup did not complete, so there is nothing to restore from." };
  }

  const dl = await downloadDecrypted(row.object_name);
  if (!dl.ok) {
    return {
      ok: false,
      error: dl.notFound
        ? "The stored archive is missing from object storage."
        : `Could not read the archive: ${dl.error}`,
    };
  }

  const actual = createHash("sha256").update(dl.data).digest("hex");
  if (actual !== row.sha256) {
    log.error("backup checksum mismatch", {
      backupId: String(backupId),
      expected: row.sha256,
      actual,
    });
    return { ok: false, error: "Archive failed its integrity check — refusing to restore from it." };
  }

  try {
    const archive = JSON.parse(gunzipSync(dl.data).toString("utf8")) as BackupArchive;
    return { ok: true, archive, gzip: dl.data };
  } catch (err: any) {
    return { ok: false, error: `Archive could not be decoded: ${err?.message || err}` };
  }
}

/* ─── Restore ───────────────────────────────────────────────────────── */

export interface RestoreResult {
  ok: boolean;
  message: string;
  restoredId?: number;
  error?: string;
}

/**
 * Restore ONE post or page from a verified backup back into the live site.
 *
 * Single-item restore is deliberate. A blind "restore everything" over the
 * REST API cannot roll itself back, cannot recreate deleted attachments, and
 * would happily overwrite three weeks of good edits to fix one bad page. A
 * button that does that is more dangerous than no button. Customers who need
 * a wholesale rollback download the archive (below) and we do it with them.
 *
 * The restored revision goes back as a normal WP update, so WordPress's own
 * revision history keeps the pre-restore state.
 */
export async function restoreItem(params: {
  clientId: number;
  backupId: number;
  credentials: WpCredentials;
  itemType: "post" | "page";
  itemId: number;
}): Promise<RestoreResult> {
  const { clientId, backupId, credentials, itemType, itemId } = params;

  const fetched = await fetchBackupArchive(backupId, clientId);
  if (!fetched.ok) return { ok: false, message: fetched.error, error: fetched.error };

  const collection = itemType === "post" ? fetched.archive.posts : fetched.archive.pages;
  const item = (collection as Array<Record<string, any>>).find((i) => Number(i?.id) === itemId);
  if (!item) {
    return {
      ok: false,
      message: `That ${itemType} is not in this backup.`,
      error: "not_in_archive",
    };
  }

  // `context=edit` stores content/title/excerpt as { raw, rendered }.
  const raw = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && typeof (v as any).raw === "string") return (v as any).raw;
    if (v && typeof v === "object" && typeof (v as any).rendered === "string") return (v as any).rendered;
    return "";
  };

  const body: Record<string, unknown> = {
    title: raw(item.title),
    content: raw(item.content),
    excerpt: raw(item.excerpt),
  };
  if (typeof item.status === "string") body.status = item.status;

  const path = itemType === "post" ? `/wp/v2/posts/${itemId}` : `/wp/v2/pages/${itemId}`;
  const res = await wpPostJson(credentials, path, body);
  if (!res.ok) {
    return {
      ok: false,
      message: `Restore failed: ${res.error}`,
      error: res.error,
    };
  }

  log.info("item restored", {
    clientId: String(clientId),
    backupId: String(backupId),
    itemType,
    itemId: String(itemId),
  });

  return {
    ok: true,
    message: `Restored ${itemType} "${raw(item.title) || itemId}" from the ${fetched.archive.captured_at.slice(0, 10)} backup.`,
    restoredId: itemId,
  };
}

/* ─── Retention ─────────────────────────────────────────────────────── */

/**
 * Delete successful backups past their retention window, removing the
 * stored object first so we never leave an orphaned encrypted blob paying
 * rent. A row whose object delete fails is left in place to be retried on
 * the next sweep rather than losing the pointer to it.
 */
export async function pruneExpiredBackups(): Promise<{ deleted: number; failed: number }> {
  const expired = await db
    .select({
      id: webcareBackups.id,
      object_name: webcareBackups.object_name,
    })
    .from(webcareBackups)
    .where(
      and(
        eq(webcareBackups.status, "success"),
        sql`${webcareBackups.started_at} < now() - (${webcareBackups.retention_days} || ' days')::interval`,
      ),
    )
    .limit(500);

  let deleted = 0;
  let failed = 0;
  for (const b of expired) {
    if (b.object_name) {
      const ok = await deleteObject(b.object_name);
      if (!ok) {
        failed += 1;
        continue;
      }
    }
    await db.delete(webcareBackups).where(eq(webcareBackups.id, b.id));
    deleted += 1;
  }
  return { deleted, failed };
}

/** Most recent backups for one client, newest first. */
export async function listBackups(clientId: number, limit = 60) {
  return db
    .select()
    .from(webcareBackups)
    .where(eq(webcareBackups.client_id, clientId))
    .orderBy(desc(webcareBackups.started_at))
    .limit(limit);
}
