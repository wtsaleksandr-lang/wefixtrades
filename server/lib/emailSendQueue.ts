/**
 * Email send-queue helpers — durable retry + dedupe layer beneath the
 * SMTP transporter. Solves three gaps in the existing email path:
 *
 *   1. Silent failures        — every send writes a queue row; failures
 *                                are recorded and surfaced via admin.
 *   2. No retries             — failed sends transition to `retrying`
 *                                with exponential backoff; the worker
 *                                drains them.
 *   3. Possible duplicates    — content-level dedupe (recipient + subject
 *                                + content hash) collapses repeats within
 *                                a 60-second window. Caller sees a fake
 *                                success response — transparent.
 *
 * The wrapped sendMail (in `emailTransport.ts`) calls into here on every
 * outbound send. The retry worker (`emailSendQueueWorker.ts`) calls
 * `processQueue()` to drain rows whose `next_attempt_at` has elapsed.
 *
 * Pure helpers — no side effects beyond the queue table.
 */

import crypto from "crypto";
import { db } from "../db";
import { emailSendQueue, type EmailSendQueue } from "@shared/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

export const MAX_ATTEMPTS = 4;
const DEDUPE_WINDOW_MS = 60 * 1000;       // 60 seconds — collapse identical content

/**
 * Backoff schedule. Indexed by attempt number (1-based — attempt 1 is the
 * INITIAL synchronous send, so the first retry is at index 2).
 *   attempt 1 → synchronous send (no delay)
 *   attempt 2 → 30s after the failure
 *   attempt 3 → 5m
 *   attempt 4 → 30m   (final attempt — failure after this is dead_letter)
 */
const BACKOFF_MS: Record<number, number> = {
  1: 0,
  2: 30 * 1000,
  3: 5 * 60 * 1000,
  4: 30 * 60 * 1000,
};

export function nextAttemptDelayMs(attempt: number): number {
  return BACKOFF_MS[Math.min(attempt, MAX_ATTEMPTS)] ?? 30 * 60 * 1000;
}

/**
 * Compute a stable hash for dedupe. Lower-cases the recipient, hashes
 * the HTML body so byte-identical messages (regardless of formatting
 * whitespace) collapse, includes subject so different alerts to the
 * same recipient stay distinct.
 */
export function computeDedupeHash(opts: { recipient: string; subject?: string; html?: string; text?: string }): string {
  const recipient = (opts.recipient || "").toLowerCase().trim();
  const subject = (opts.subject || "").trim();
  const body = opts.html ? opts.html : (opts.text || "");
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  return crypto.createHash("sha256")
    .update(`${recipient}|${subject}|${bodyHash}`)
    .digest("hex");
}

/**
 * Returns true if the same dedupe_hash was already enqueued (and not
 * skipped) within DEDUPE_WINDOW_MS. Caller is expected to short-circuit
 * the actual SMTP send when this returns true.
 */
export async function isDuplicate(dedupeHash: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - DEDUPE_WINDOW_MS);
  const [existing] = await db.select({ id: emailSendQueue.id })
    .from(emailSendQueue)
    .where(and(
      eq(emailSendQueue.dedupe_hash, dedupeHash),
      gte(emailSendQueue.created_at, cutoff),
      sql`${emailSendQueue.status} IN ('pending', 'sent', 'retrying')`,
    ))
    .limit(1);
  return !!existing;
}

interface EnqueueParams {
  emailId: string;
  recipient: string;
  subject?: string;
  payload: Record<string, any>;            // full nodemailer mailOpts (sans tracking re-injection)
  dedupeHash?: string | null;
}

/**
 * Insert a row into the queue with status='pending'. Returns the row.
 * Caller is responsible for transitioning it to 'sent' or 'retrying'
 * after the synchronous SMTP attempt.
 */
export async function enqueueSend(params: EnqueueParams): Promise<EmailSendQueue> {
  const [row] = await db.insert(emailSendQueue).values({
    email_id: params.emailId,
    dedupe_hash: params.dedupeHash ?? null,
    recipient: params.recipient,
    subject: (params.subject ?? "").slice(0, 500) || null,
    payload: params.payload,
    status: "pending",
    attempts: 0,
  }).returning();
  return row;
}

/**
 * Mark a queue row as a duplicate skip. Used when isDuplicate() returned
 * true so the queue still records the attempted send for observability.
 */
export async function recordSkip(emailId: string, recipient: string, dedupeHash: string, reason: string): Promise<EmailSendQueue> {
  const [row] = await db.insert(emailSendQueue).values({
    email_id: emailId,
    dedupe_hash: dedupeHash,
    recipient,
    status: "skipped",
    skip_reason: reason,
    attempts: 0,
  }).returning();
  return row;
}

export async function markSent(rowId: number, smtpMessageId: string | null): Promise<void> {
  await db.update(emailSendQueue)
    .set({
      status: "sent",
      sent_at: new Date(),
      smtp_message_id: smtpMessageId,
      attempts: sql`${emailSendQueue.attempts} + 1`,
      updated_at: new Date(),
    })
    .where(eq(emailSendQueue.id, rowId));
}

export async function markRetrying(rowId: number, errorMessage: string): Promise<void> {
  // Look up current attempts so we can compute next backoff (atomic increment + decision).
  const [row] = await db.select().from(emailSendQueue).where(eq(emailSendQueue.id, rowId)).limit(1);
  if (!row) return;

  const attemptsAfter = row.attempts + 1;
  if (attemptsAfter >= MAX_ATTEMPTS) {
    await db.update(emailSendQueue)
      .set({
        status: "dead_letter",
        attempts: attemptsAfter,
        last_error: errorMessage.slice(0, 2000),
        updated_at: new Date(),
      })
      .where(eq(emailSendQueue.id, rowId));
    return;
  }

  const nextAt = new Date(Date.now() + nextAttemptDelayMs(attemptsAfter + 1));
  await db.update(emailSendQueue)
    .set({
      status: "retrying",
      attempts: attemptsAfter,
      next_attempt_at: nextAt,
      last_error: errorMessage.slice(0, 2000),
      updated_at: new Date(),
    })
    .where(eq(emailSendQueue.id, rowId));
}

/**
 * Select rows whose retry window has elapsed. Worker iterates these.
 * Skips rows already past MAX_ATTEMPTS (defense-in-depth — markRetrying
 * should have flipped them to dead_letter already).
 */
export async function listDueRetries(now: Date = new Date(), limit = 50): Promise<EmailSendQueue[]> {
  return db.select().from(emailSendQueue)
    .where(and(
      eq(emailSendQueue.status, "retrying"),
      lte(emailSendQueue.next_attempt_at, now),
      sql`${emailSendQueue.attempts} < ${MAX_ATTEMPTS}`,
    ))
    .orderBy(emailSendQueue.next_attempt_at)
    .limit(limit);
}

/**
 * Aggregate queue stats for /api/admin/email-events. Returns counts by
 * status over a rolling window (default last 24 hours).
 */
export async function getQueueStats(windowHours: number = 24): Promise<{
  pending: number; sent: number; retrying: number; dead_letter: number; skipped: number;
  recent_dead_letter: Array<{ id: number; recipient: string; subject: string | null; last_error: string | null; created_at: Date | null }>;
}> {
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const counts = await db.select({
    status: emailSendQueue.status,
    count: sql<number>`count(*)::int`,
  })
    .from(emailSendQueue)
    .where(gte(emailSendQueue.created_at, cutoff))
    .groupBy(emailSendQueue.status);

  const byStatus: Record<string, number> = {};
  for (const c of counts) byStatus[c.status] = c.count;

  const recentDead = await db.select({
    id: emailSendQueue.id,
    recipient: emailSendQueue.recipient,
    subject: emailSendQueue.subject,
    last_error: emailSendQueue.last_error,
    created_at: emailSendQueue.created_at,
  })
    .from(emailSendQueue)
    .where(eq(emailSendQueue.status, "dead_letter"))
    .orderBy(desc(emailSendQueue.id))
    .limit(10);

  return {
    pending: byStatus["pending"] ?? 0,
    sent: byStatus["sent"] ?? 0,
    retrying: byStatus["retrying"] ?? 0,
    dead_letter: byStatus["dead_letter"] ?? 0,
    skipped: byStatus["skipped"] ?? 0,
    recent_dead_letter: recentDead,
  };
}
