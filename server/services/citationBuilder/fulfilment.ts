/**
 * Citation Builder — fulfilment rules.
 *
 * This module is the whole honesty contract of the product, and it is
 * deliberately split into (a) pure decision functions with no I/O, which the
 * CI guard exercises directly, and (b) thin DB wrappers that call them.
 *
 * THE RULE
 * --------
 * A customer may only ever be told something happened because an operator
 * recorded a citation_builder_directory_tasks row saying it happened.
 *
 * Concretely:
 *   - Progress email fires the first time a task row reaches `submitted` or
 *     `live`. Not on purchase, not on "start", not on a timer, not on a cron.
 *   - Completion email fires only from an explicit operator action that is
 *     REFUSED unless every task is terminal and at least one is `live`.
 *   - Both are stamped so they can fire at most once per order.
 *   - The two count columns on the order are recomputed from the task rows
 *     after every write. Nothing accepts them from a request body.
 *
 * WHY THIS IS WRITTEN SO DEFENSIVELY
 * ----------------------------------
 * The same defect has now shipped three times in this codebase: rankflowWorker
 * "completed" AI tasks with a canned sentence, AdFlow reported metrics it
 * never measured, and sitelaunch's issue-ssl flipped ssl_status to 'active'
 * on a setTimeout. Each was a place where a claim to the customer was cheaper
 * to produce than the work behind it. The countermeasure is to make the claim
 * structurally impossible to produce without the work — hence a separate
 * table, derived counters, and a guard that reds if either is bypassed.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  citationBuilderDirectoryTasks,
  citationBuilderSubmissions,
  CITATION_BUILDER_TERMINAL_TASK_STATUSES,
  type CitationBuilderTaskStatus,
} from "@shared/schema";
import { createLogger } from "../../lib/logger";
import { sendCitationBuilderProgressEmail } from "../../lib/citationBuilderProgressEmail";
import { sendCitationBuilderCompletionEmail } from "../../lib/citationBuilderCompletionEmail";
import { getDirectoriesForTier, type CitationBuilderTier } from "@shared/citationBuilder/directories";

const log = createLogger("CitationBuilderFulfilment");

/* ═══════════════════════════════════════════════════════════════════════
   PURE DECISION FUNCTIONS — no DB, no network. The CI guard calls these.
   ═══════════════════════════════════════════════════════════════════════ */

/** The minimum shape the rules need from a task row. */
export interface TaskLike {
  directory_id: string;
  directory_name: string;
  status: CitationBuilderTaskStatus | string;
  listing_url?: string | null;
  note?: string | null;
}

export function isTerminalTaskStatus(status: string): boolean {
  return (CITATION_BUILDER_TERMINAL_TASK_STATUSES as readonly string[]).includes(status);
}

/**
 * Counters derived from the task rows. This is the ONLY function that may
 * produce the two numbers the customer sees.
 *
 * `submitted` deliberately counts `live` as well: a listing that went live
 * was necessarily submitted, and the customer-facing bar would otherwise go
 * backwards as work completes.
 */
export function deriveCounts(tasks: TaskLike[]): {
  total: number;
  submitted: number;
  live: number;
  rejected: number;
  notApplicable: number;
  outstanding: number;
} {
  let submitted = 0;
  let live = 0;
  let rejected = 0;
  let notApplicable = 0;
  let outstanding = 0;
  for (const t of tasks) {
    if (t.status === "live") { live++; submitted++; continue; }
    if (t.status === "submitted") { submitted++; outstanding++; continue; }
    if (t.status === "rejected") { rejected++; continue; }
    if (t.status === "not_applicable") { notApplicable++; continue; }
    outstanding++;
  }
  return { total: tasks.length, submitted, live, rejected, notApplicable, outstanding };
}

/**
 * Validate one operator write BEFORE it is persisted.
 *
 * The evidence requirements are the point: `live` is the only status the
 * customer is ever shown as a listing, so it cannot be recorded without the
 * URL that proves it, and the two negative outcomes cannot be recorded
 * without the operator saying why.
 */
export function validateTaskWrite(input: {
  status: string;
  listing_url?: string | null;
  note?: string | null;
}): { ok: true } | { ok: false; reason: string } {
  const url = (input.listing_url ?? "").trim();
  const note = (input.note ?? "").trim();

  switch (input.status) {
    case "live":
      if (!url) return { ok: false, reason: "A listing URL is required before a directory can be marked live." };
      if (!/^https?:\/\/\S+$/i.test(url)) {
        return { ok: false, reason: "The listing URL must be a full http(s) URL to the live listing." };
      }
      return { ok: true };
    case "rejected":
      if (!note) return { ok: false, reason: "A note explaining the rejection is required." };
      return { ok: true };
    case "not_applicable":
      if (!note) return { ok: false, reason: "A note explaining why this directory does not apply is required." };
      return { ok: true };
    case "submitted":
    case "not_started":
      return { ok: true };
    default:
      return { ok: false, reason: `Unknown task status "${input.status}".` };
  }
}

/**
 * Should the progress email go out as a result of this state?
 *
 * True only when an operator has recorded at least one real submission AND
 * the email has not already been sent. There is no time component, no
 * scheduled variant, and no "nudge after N days" — an order with no recorded
 * work generates no mail, however old it is.
 */
export function shouldSendProgressEmail(args: {
  tasks: TaskLike[];
  progressEmailSentAt: Date | string | null | undefined;
}): boolean {
  if (args.progressEmailSentAt) return false;
  return deriveCounts(args.tasks).submitted > 0;
}

/**
 * Can this order be completed? Returns the refusal reason when it cannot.
 *
 * Two conditions, both about evidence rather than about time:
 *   1. Every assigned directory has a recorded outcome. An order with a task
 *      still sitting at not_started/submitted has unfinished work, and
 *      "your listings are live" would be false.
 *   2. At least one directory actually went live. Completing an order where
 *      every directory was rejected is not a delivery — it is a refund
 *      conversation, and the operator is told so instead of being allowed to
 *      send a completion report for nothing.
 */
export function assertCompletable(tasks: TaskLike[]): { ok: true } | { ok: false; reason: string } {
  if (tasks.length === 0) {
    return { ok: false, reason: "This order has no directory checklist yet — start it first." };
  }
  const outstanding = tasks.filter(t => !isTerminalTaskStatus(String(t.status)));
  if (outstanding.length > 0) {
    const names = outstanding.slice(0, 5).map(t => t.directory_name).join(", ");
    return {
      ok: false,
      reason:
        `${outstanding.length} director${outstanding.length === 1 ? "y" : "ies"} still have no recorded outcome ` +
        `(${names}${outstanding.length > 5 ? ", …" : ""}). Record every one as live, rejected or not applicable first.`,
    };
  }
  const counts = deriveCounts(tasks);
  if (counts.live === 0) {
    return {
      ok: false,
      reason:
        "No directory went live, so there is nothing to report as completed. " +
        "Resolve the rejections or refund the order instead of sending a completion report.",
    };
  }
  return { ok: true };
}

/** The directory names that genuinely went live — the completion email's list. */
export function liveDirectoryNames(tasks: TaskLike[]): string[] {
  return tasks.filter(t => t.status === "live").map(t => t.directory_name);
}

/* ═══════════════════════════════════════════════════════════════════════
   DB WRAPPERS
   ═══════════════════════════════════════════════════════════════════════ */

export async function loadTasks(submissionId: string) {
  return db
    .select()
    .from(citationBuilderDirectoryTasks)
    .where(eq(citationBuilderDirectoryTasks.submission_id, submissionId))
    .orderBy(citationBuilderDirectoryTasks.directory_name);
}

/**
 * Recompute the two mirror columns on the order from its task rows.
 * Called after every task write. This is the only writer of those columns.
 */
export async function recountSubmission(submissionId: string): Promise<{ total: number; submitted: number; live: number }> {
  const tasks = await loadTasks(submissionId);
  const counts = deriveCounts(tasks);
  await db
    .update(citationBuilderSubmissions)
    .set({
      directories_total: counts.total,
      directories_submitted_count: counts.submitted,
    })
    .where(eq(citationBuilderSubmissions.id, submissionId));
  return { total: counts.total, submitted: counts.submitted, live: counts.live };
}

/**
 * Cut the per-directory checklist for an order from the tier registry and
 * move it to in_progress. Idempotent — the unique (submission_id,
 * directory_id) index means re-running adds only genuinely-new directories
 * and never duplicates or resets recorded work.
 *
 * Sends nothing. Assignment is not progress.
 */
export async function startSubmission(submissionId: string, tier: string): Promise<{ assigned: number; total: number }> {
  const directories = getDirectoriesForTier(tier as CitationBuilderTier);
  if (directories.length === 0) {
    throw new Error(`No directories are configured for tier "${tier}"`);
  }

  const existing = await loadTasks(submissionId);
  const have = new Set(existing.map(t => t.directory_id));
  const toInsert = directories.filter(d => !have.has(d.id));

  if (toInsert.length > 0) {
    await db.insert(citationBuilderDirectoryTasks).values(
      toInsert.map(d => ({
        submission_id: submissionId,
        directory_id: d.id,
        directory_name: d.name,
        status: "not_started" as const,
      })),
    ).onConflictDoNothing();
  }

  const now = new Date();
  await db
    .update(citationBuilderSubmissions)
    .set({ status: "in_progress", started_at: sql`COALESCE(${citationBuilderSubmissions.started_at}, ${now})` })
    .where(eq(citationBuilderSubmissions.id, submissionId));

  const counts = await recountSubmission(submissionId);
  return { assigned: toInsert.length, total: counts.total };
}

/**
 * Fire the progress email if — and only if — recorded work now justifies it.
 * The stamp is written in the same conditional UPDATE that guards the send,
 * so two concurrent task writes cannot both send.
 */
export async function maybeSendProgressEmail(args: {
  submissionId: string;
  recipientEmail: string | null | undefined;
  businessName: string;
  tier: "starter" | "pro" | "premium";
}): Promise<boolean> {
  const tasks = await loadTasks(args.submissionId);

  const [row] = await db
    .select({ sentAt: citationBuilderSubmissions.progress_email_sent_at })
    .from(citationBuilderSubmissions)
    .where(eq(citationBuilderSubmissions.id, args.submissionId))
    .limit(1);

  if (!shouldSendProgressEmail({ tasks, progressEmailSentAt: row?.sentAt ?? null })) return false;
  if (!args.recipientEmail) {
    log.warn("progress email skipped — no recipient on file", { submission_id: args.submissionId });
    return false;
  }

  // Claim the send first. A no-op result means another writer already did.
  const claimed = await db
    .update(citationBuilderSubmissions)
    .set({ progress_email_sent_at: new Date() })
    .where(and(
      eq(citationBuilderSubmissions.id, args.submissionId),
      sql`${citationBuilderSubmissions.progress_email_sent_at} IS NULL`,
    ))
    .returning({ id: citationBuilderSubmissions.id });
  if (claimed.length === 0) return false;

  const counts = deriveCounts(tasks);
  const sent = await sendCitationBuilderProgressEmail({
    recipientEmail: args.recipientEmail,
    businessName: args.businessName,
    tier: args.tier,
    directoriesSubmittedCount: counts.submitted,
    directoriesTotal: counts.total,
  });
  if (!sent) {
    // Release the claim so a later task write can retry — the customer
    // getting the update late is better than never.
    await db
      .update(citationBuilderSubmissions)
      .set({ progress_email_sent_at: null })
      .where(eq(citationBuilderSubmissions.id, args.submissionId));
  }
  return sent;
}

/**
 * Complete an order. Refuses unless assertCompletable() passes, so the
 * completion email can never describe listings that were not recorded live.
 */
export async function completeSubmission(args: {
  submissionId: string;
  recipientEmail: string | null | undefined;
  businessName: string;
  tier: "starter" | "pro" | "premium";
}): Promise<{ ok: true; live: number; emailed: boolean } | { ok: false; reason: string }> {
  const tasks = await loadTasks(args.submissionId);
  const gate = assertCompletable(tasks);
  if (!gate.ok) return gate;

  const counts = deriveCounts(tasks);

  const claimed = await db
    .update(citationBuilderSubmissions)
    .set({ status: "completed", completed_at: new Date(), completion_email_sent_at: new Date() })
    .where(and(
      eq(citationBuilderSubmissions.id, args.submissionId),
      sql`${citationBuilderSubmissions.completion_email_sent_at} IS NULL`,
    ))
    .returning({ id: citationBuilderSubmissions.id });

  if (claimed.length === 0) {
    // Already completed — keep it idempotent rather than sending twice.
    return { ok: true, live: counts.live, emailed: false };
  }

  let emailed = false;
  if (args.recipientEmail) {
    emailed = await sendCitationBuilderCompletionEmail({
      recipientEmail: args.recipientEmail,
      businessName: args.businessName,
      tier: args.tier,
      directoriesLive: counts.live,
      directoriesTotal: counts.total,
      directoriesRejected: counts.rejected + counts.notApplicable,
      directories: liveDirectoryNames(tasks),
    });
  } else {
    log.warn("completion email skipped — no recipient on file", { submission_id: args.submissionId });
  }
  return { ok: true, live: counts.live, emailed };
}

/** Terminal statuses as a drizzle-ready array (used by admin list aggregates). */
export const TERMINAL_TASK_STATUS_LIST = [...CITATION_BUILDER_TERMINAL_TASK_STATUSES];

/** Count live tasks across a set of orders in one query (no N+1 in the queue list). */
export async function liveCountsBySubmission(submissionIds: string[]): Promise<Map<string, number>> {
  if (submissionIds.length === 0) return new Map();
  const rows = await db
    .select({
      submission_id: citationBuilderDirectoryTasks.submission_id,
      n: sql<number>`count(*)::int`,
    })
    .from(citationBuilderDirectoryTasks)
    .where(and(
      inArray(citationBuilderDirectoryTasks.submission_id, submissionIds),
      eq(citationBuilderDirectoryTasks.status, "live"),
    ))
    .groupBy(citationBuilderDirectoryTasks.submission_id);
  return new Map(rows.map(r => [r.submission_id, Number(r.n)]));
}
