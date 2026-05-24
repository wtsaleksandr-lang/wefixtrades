/**
 * Vapi recording mirror cron.
 *
 * Vapi expires call recordings ~30 days after the call. Without a
 * mirror, the admin Ops page's <audio> player 404s for any call older
 * than that, and we lose the recording forever. This cron streams each
 * recording into Replit Object Storage well before the expiry, then
 * stamps the call-log row so the UI can serve the durable copy.
 *
 * Schedule: every 2h at minute :47 UTC (registered in
 * server/jobs/scheduler.ts). Off-minute to dodge the on-the-hour
 * cron pile-up.
 *
 * Per tick:
 *   1. SELECT up to MIRROR_BATCH_LIMIT rows from tradeline_call_log
 *      where recording_url IS NOT NULL AND mirrored_at IS NULL AND
 *      created_at > NOW() - INTERVAL '25 days' (5-day safety margin
 *      before Vapi's 30-day expiry).
 *   2. For each row: fetch the recording bytes from the Vapi URL,
 *      upload to Replit Object Storage at
 *      'vapi-recordings/<client_id>/<call_id>.mp3', then UPDATE the
 *      row with mirrored_object_key + mirrored_at.
 *   3. Per-row failures are isolated — one 404 / 5xx does not halt
 *      the batch. Failed rows simply retry on the next tick.
 *
 * Idempotency: the WHERE clause excludes already-mirrored rows, so
 * re-running mid-batch (or two parallel workers) cannot double-upload.
 * The cron is overlap-guarded in the scheduler.
 *
 * Per-tick cap (MIRROR_BATCH_LIMIT = 100) bounds memory usage —
 * recordings can be many MB each, and we load the full buffer into
 * RAM before uploading. The cap also keeps a single tick from
 * blocking other workers for too long.
 *
 * Not encrypted at rest: unlike phone-bill PDFs (which use
 * uploadEncryptedBuffer because they contain PII), call recordings
 * are already accessible at a relatively-public Vapi URL during the
 * 30-day window, so we mirror them as-is. Replit Object Storage is
 * still encrypted at rest with Google-managed keys via GCS.
 */

import { Client, type RequestError } from "@replit/object-storage";
import { and, eq, isNotNull, isNull, gt, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { tradelineCallLog, clientServices } from "@shared/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("VapiRecordingMirrorCron");

/** Max rows mirrored per tick — bounds memory + tick duration. */
const MIRROR_BATCH_LIMIT = 100;

/** Vapi retains recordings ~30 days. Mirror with 5-day safety margin. */
const MIRROR_WINDOW_DAYS = 25;

/** Per-recording fetch timeout — recordings are typically <5 MB. */
const FETCH_TIMEOUT_MS = 30_000;

/** Object key prefix; the per-row key is `<prefix>/<client_id>/<call_id>.mp3`. */
const OBJECT_KEY_PREFIX = "vapi-recordings";

export interface VapiMirrorTickResult {
  ran: boolean;
  scanned: number;
  mirrored: number;
  failed: number;
  skipped_reason?: string;
}

let cachedClient: Client | null = null;
function getClient(): Client {
  if (!cachedClient) {
    cachedClient = new Client(
      process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID
        ? { bucketId: process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID }
        : undefined,
    );
  }
  return cachedClient;
}

interface MirrorCandidate {
  id: number;
  vapi_call_id: string | null;
  client_service_id: number;
  client_id: number;
  recording_url: string;
}

async function loadCandidates(): Promise<MirrorCandidate[]> {
  const cutoff = new Date(Date.now() - MIRROR_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Join client_services to recover client_id for the object-key path.
  const rows = await db
    .select({
      id: tradelineCallLog.id,
      vapi_call_id: tradelineCallLog.vapi_call_id,
      client_service_id: tradelineCallLog.client_service_id,
      client_id: clientServices.client_id,
      recording_url: tradelineCallLog.recording_url,
    })
    .from(tradelineCallLog)
    .innerJoin(clientServices, eq(tradelineCallLog.client_service_id, clientServices.id))
    .where(
      and(
        isNotNull(tradelineCallLog.recording_url),
        isNull(tradelineCallLog.mirrored_at),
        gt(tradelineCallLog.created_at, cutoff),
      ),
    )
    .orderBy(desc(tradelineCallLog.created_at))
    .limit(MIRROR_BATCH_LIMIT);

  // Drizzle's types allow recording_url to be null; the WHERE filters
  // those out at runtime but the cast keeps TS honest.
  return rows.filter((r): r is MirrorCandidate => r.recording_url !== null);
}

async function fetchRecording(url: string): Promise<{ ok: true; bytes: Buffer } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return { ok: false, error: `fetch ${res.status} ${res.statusText}` };
    }
    const arr = await res.arrayBuffer();
    if (arr.byteLength === 0) {
      return { ok: false, error: "empty body" };
    }
    return { ok: true, bytes: Buffer.from(arr) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    clearTimeout(timeout);
  }
}

function objectKeyFor(clientId: number, callId: number): string {
  return `${OBJECT_KEY_PREFIX}/${clientId}/${callId}.mp3`;
}

function requestErrorMessage(err: RequestError | Error | string): string {
  if (typeof err === "string") return err;
  if ("message" in err) return err.message;
  return String(err);
}

async function mirrorOne(c: MirrorCandidate): Promise<{ ok: true; key: string; bytes: number } | { ok: false; error: string }> {
  const fetched = await fetchRecording(c.recording_url);
  if (!fetched.ok) return { ok: false, error: `fetch failed: ${fetched.error}` };

  const key = objectKeyFor(c.client_id, c.id);
  // compress:false — MP3/audio is already compressed; gzip is wasted CPU.
  const uploaded = await getClient().uploadFromBytes(key, fetched.bytes, { compress: false });
  if (!uploaded.ok) {
    return { ok: false, error: `upload failed: ${requestErrorMessage(uploaded.error)}` };
  }

  await db
    .update(tradelineCallLog)
    .set({
      mirrored_object_key: key,
      mirrored_at: sql`NOW()`,
    })
    .where(eq(tradelineCallLog.id, c.id));

  return { ok: true, key, bytes: fetched.bytes.length };
}

export async function runVapiRecordingMirrorTick(): Promise<VapiMirrorTickResult> {
  let candidates: MirrorCandidate[];
  try {
    candidates = await loadCandidates();
  } catch (err) {
    log.error("loadCandidates failed", { error: (err as Error).message });
    throw err;
  }

  if (candidates.length === 0) {
    log.info("nothing to mirror");
    return { ran: true, scanned: 0, mirrored: 0, failed: 0, skipped_reason: "no_candidates" };
  }

  log.info("scanning candidates", { count: candidates.length });

  let mirrored = 0;
  let failed = 0;
  let totalBytes = 0;
  for (const c of candidates) {
    try {
      const result = await mirrorOne(c);
      if (result.ok) {
        mirrored++;
        totalBytes += result.bytes;
        log.info("mirrored", {
          call_id: c.id,
          vapi_call_id: c.vapi_call_id,
          key: result.key,
          bytes: result.bytes,
        });
      } else {
        failed++;
        log.warn("mirror failed", {
          call_id: c.id,
          vapi_call_id: c.vapi_call_id,
          error: result.error,
        });
      }
    } catch (err) {
      failed++;
      log.error("mirror threw", {
        call_id: c.id,
        vapi_call_id: c.vapi_call_id,
        error: (err as Error).message,
      });
    }
  }

  log.info("tick complete", {
    scanned: candidates.length,
    mirrored,
    failed,
    total_bytes: totalBytes,
  });

  return { ran: true, scanned: candidates.length, mirrored, failed };
}
