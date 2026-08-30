/**
 * Citation Builder — the admin fulfilment queue.
 *
 * This is the surface the human operator actually works in. Before it
 * existed, Citation Builder took $79–$299, inserted a submission row at
 * status='pending', and had no route, worker or cron capable of moving it
 * anywhere else — the customer paid and nothing happened.
 *
 *   GET   /api/admin/citation-builder                    queue list (+?status=)
 *   GET   /api/admin/citation-builder/:id                order detail + checklist
 *   POST  /api/admin/citation-builder/:id/start          cut the checklist
 *   PATCH /api/admin/citation-builder/:id                ops notes / awaiting-info
 *   PATCH /api/admin/citation-builder/:id/tasks/:taskId  record one directory
 *   POST  /api/admin/citation-builder/:id/complete       finish + completion report
 *
 * WHAT THIS FILE DELIBERATELY CANNOT DO
 * -------------------------------------
 * There is no route here that sets `directories_submitted_count`,
 * `directories_total`, `completed_at`, `progress_email_sent_at` or
 * `completion_email_sent_at` from a request body, and no route that sets
 * `status` to 'completed'. Those are all consequences of recorded work,
 * computed in server/services/citationBuilder/fulfilment.ts. The PATCH body
 * schema is a closed zod object so an extra field is dropped, not honoured.
 *
 * That restriction is the whole point. An admin form that let an operator
 * type "47" into a progress box would be indistinguishable, from the
 * customer's side, from the canned "[AI-generated] Task completed" that
 * rankflowWorker used to write. The guard
 * `npm run check:citation-builder-fulfilment` fails CI if this file grows a
 * way around it.
 *
 * Mirrors the requireAdmin + list/detail/PATCH + writeAudit conventions in
 * adminAffiliatesRoutes.ts and tradelineChatInstallRoutes.ts. Registered via
 * server/routes/index.ts (registerAdminCitationBuilderRoutes).
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "../auth";
import { db } from "../db";
import {
  citationBuilderDirectoryTasks,
  citationBuilderSubmissions,
  CITATION_BUILDER_SUBMISSION_STATUSES,
  CITATION_BUILDER_TASK_STATUSES,
} from "@shared/schema";
import { users } from "@shared/schemas/db";
import { createLogger } from "../lib/logger";
import { writeAudit } from "../lib/auditLog";
import {
  assertCompletable,
  completeSubmission,
  deriveCounts,
  liveCountsBySubmission,
  loadTasks,
  maybeSendProgressEmail,
  recountSubmission,
  startSubmission,
  validateTaskWrite,
} from "../services/citationBuilder/fulfilment";
import {
  CITATION_BUILDER_TIER_DIRECTORIES,
  getBuilderDirectory,
  type CitationBuilderTier,
} from "@shared/citationBuilder/directories";

const log = createLogger("AdminCitationBuilder");

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

/** Ops-editable fields. Nothing here can assert delivery. */
const submissionPatchBody = z.object({
  notes: z.string().max(5000).optional(),
  /**
   * Only the two states an operator can legitimately choose. 'completed' is
   * absent on purpose — it is reachable only through /complete, which
   * refuses unless every directory has a recorded outcome.
   */
  status: z.enum(["in_progress", "awaiting_info"]).optional(),
}).strict();

const taskPatchBody = z.object({
  status: z.enum(CITATION_BUILDER_TASK_STATUSES),
  listing_url: z.string().max(2000).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
}).strict();

type SubmissionRow = typeof citationBuilderSubmissions.$inferSelect;

/** Business name + contact email for the emails and the operator's screen. */
function businessNameOf(row: SubmissionRow): string {
  const info = (row.business_info ?? {}) as Record<string, unknown>;
  const name = typeof info.name === "string" ? info.name.trim() : "";
  return name || "your business";
}

async function loadSubmission(id: string): Promise<{ row: SubmissionRow; email: string | null } | null> {
  const rows = await db
    .select({ sub: citationBuilderSubmissions, email: users.email })
    .from(citationBuilderSubmissions)
    .leftJoin(users, eq(citationBuilderSubmissions.customer_id, users.id))
    .where(eq(citationBuilderSubmissions.id, id))
    .limit(1);
  if (rows.length === 0) return null;
  return { row: rows[0].sub, email: rows[0].email ?? null };
}

export function registerAdminCitationBuilderRoutes(app: Express): void {
  /* ─── GET /api/admin/citation-builder ──────────────────────────────
   * The queue. Oldest-first within status is deliberate: the promise on the
   * pricing page is a turnaround time, so the order that has been waiting
   * longest is the one that needs working next.
   */
  app.get("/api/admin/citation-builder", requireAdmin, async (req: Request, res: Response) => {
    try {
      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status =
        statusRaw && (CITATION_BUILDER_SUBMISSION_STATUSES as readonly string[]).includes(statusRaw)
          ? statusRaw
          : undefined;
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(MAX_PAGE_SIZE, Math.max(10, Number(req.query.limit) || DEFAULT_PAGE_SIZE));
      const offset = (page - 1) * limit;
      const where = status ? eq(citationBuilderSubmissions.status, status) : undefined;

      const [rows, totalRow] = await Promise.all([
        db
          .select({ sub: citationBuilderSubmissions, email: users.email })
          .from(citationBuilderSubmissions)
          .leftJoin(users, eq(citationBuilderSubmissions.customer_id, users.id))
          .where(where)
          .orderBy(desc(citationBuilderSubmissions.created_at))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(citationBuilderSubmissions)
          .where(where),
      ]);

      // One grouped query rather than a per-row count — the queue list must
      // not degrade into an N+1 as orders accumulate.
      const liveByIdx = await liveCountsBySubmission(rows.map(r => r.sub.id));

      const submissions = rows.map(({ sub, email }) => ({
        id: sub.id,
        tier: sub.tier,
        status: sub.status,
        business_info: sub.business_info,
        customer_email: email,
        created_at: sub.created_at,
        started_at: sub.started_at,
        completed_at: sub.completed_at,
        notes: sub.notes,
        directories_total: sub.directories_total,
        directories_submitted_count: sub.directories_submitted_count,
        directories_live_count: liveByIdx.get(sub.id) ?? 0,
        progress_email_sent_at: sub.progress_email_sent_at,
        completion_email_sent_at: sub.completion_email_sent_at,
      }));

      res.json({ submissions, total: Number(totalRow[0]?.total ?? 0), page, limit });
    } catch (err: any) {
      log.error("queue list failed", { error: err?.message });
      res.status(500).json({ error: "Failed to load the Citation Builder queue" });
    }
  });

  /* ─── GET /api/admin/citation-builder/:id ──────────────────────────
   * Order detail: the customer's NAP, the tier, the purchase date, and the
   * per-directory checklist with each directory's submission URL and the
   * operator note explaining what it needs.
   */
  app.get("/api/admin/citation-builder/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id ?? "");
      if (!id) return res.status(400).json({ error: "Missing submission id" });

      const found = await loadSubmission(id);
      if (!found) return res.status(404).json({ error: "Submission not found" });

      const tasks = await loadTasks(id);
      const counts = deriveCounts(tasks);
      const completable = assertCompletable(tasks);

      res.json({
        submission: {
          ...found.row,
          customer_email: found.email,
        },
        tasks: tasks.map(t => {
          const def = getBuilderDirectory(t.directory_id);
          return {
            ...t,
            submit_url: def?.submitUrl ?? null,
            // The operator's brief for this directory: what was verified, what
            // friction to expect, and what to do when the path is gated.
            evidence: def?.evidence ?? null,
            markets: def?.markets ?? [],
            category: def?.category ?? null,
          };
        }),
        counts,
        /** How many directories this tier is meant to have, from the registry. */
        tier_directory_count: CITATION_BUILDER_TIER_DIRECTORIES[found.row.tier as CitationBuilderTier] ?? 0,
        /** Why the Complete button is disabled, when it is. */
        completable: completable.ok,
        completable_reason: completable.ok ? null : completable.reason,
      });
    } catch (err: any) {
      log.error("detail failed", { error: err?.message });
      res.status(500).json({ error: "Failed to load submission" });
    }
  });

  /* ─── POST /api/admin/citation-builder/:id/start ───────────────────
   * Cut the per-directory checklist from the tier registry and move the
   * order to in_progress. Idempotent. Sends NOTHING — being assigned work
   * is not progress, and the customer hears from us when a directory has
   * actually been submitted to.
   */
  app.post("/api/admin/citation-builder/:id/start", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id ?? "");
      const found = await loadSubmission(id);
      if (!found) return res.status(404).json({ error: "Submission not found" });
      if (found.row.status === "completed") {
        return res.status(409).json({ error: "This order is already completed." });
      }

      const result = await startSubmission(id, found.row.tier);

      writeAudit({
        actorId: (req.user as any)?.id ?? null,
        actorType: "admin",
        action: "citation_builder.start",
        entityType: "citation_builder_submission",
        entityId: id,
        metadata: { tier: found.row.tier, assigned: result.assigned, checklist_size: result.total },
        req,
      });

      res.json({ ok: true, assigned: result.assigned, total: result.total });
    } catch (err: any) {
      log.error("start failed", { error: err?.message });
      res.status(500).json({ error: err?.message || "Failed to start submission" });
    }
  });

  /* ─── PATCH /api/admin/citation-builder/:id ────────────────────────
   * Ops notes and the awaiting-info flag. Cannot reach 'completed' and
   * cannot touch any counter.
   */
  app.patch("/api/admin/citation-builder/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id ?? "");
      const parsed = submissionPatchBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      if (Object.keys(parsed.data).length === 0) {
        return res.status(400).json({ error: "Nothing to update" });
      }

      const found = await loadSubmission(id);
      if (!found) return res.status(404).json({ error: "Submission not found" });
      if (found.row.status === "completed") {
        return res.status(409).json({ error: "This order is already completed." });
      }

      const [updated] = await db
        .update(citationBuilderSubmissions)
        .set(parsed.data)
        .where(eq(citationBuilderSubmissions.id, id))
        .returning();

      writeAudit({
        actorId: (req.user as any)?.id ?? null,
        actorType: "admin",
        action: "citation_builder.update",
        entityType: "citation_builder_submission",
        entityId: id,
        before: { status: found.row.status, notes: found.row.notes },
        after: { status: updated.status, notes: updated.notes },
        req,
      });

      res.json({ submission: updated });
    } catch (err: any) {
      log.error("patch failed", { error: err?.message });
      res.status(500).json({ error: "Failed to update submission" });
    }
  });

  /* ─── PATCH /api/admin/citation-builder/:id/tasks/:taskId ──────────
   * Record what happened on ONE directory. This is the only place in the
   * product where progress comes from, and the only trigger for the
   * customer-facing progress email.
   *
   * `live` requires the listing URL; `rejected` and `not_applicable`
   * require a note. Those are enforced in validateTaskWrite() so the rule
   * is testable without a database.
   */
  app.patch("/api/admin/citation-builder/:id/tasks/:taskId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id ?? "");
      const taskId = String(req.params.taskId ?? "");
      const parsed = taskPatchBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
      }

      const found = await loadSubmission(id);
      if (!found) return res.status(404).json({ error: "Submission not found" });
      if (found.row.status === "completed") {
        return res.status(409).json({ error: "This order is already completed — reopen it before editing." });
      }

      const [task] = await db
        .select()
        .from(citationBuilderDirectoryTasks)
        .where(and(
          eq(citationBuilderDirectoryTasks.id, taskId),
          eq(citationBuilderDirectoryTasks.submission_id, id),
        ))
        .limit(1);
      if (!task) return res.status(404).json({ error: "Directory task not found on this order" });

      // Fall back to what is already recorded so an operator marking a
      // previously-noted rejection as live does not have to retype the note.
      const listingUrl = parsed.data.listing_url !== undefined ? parsed.data.listing_url : task.listing_url;
      const note = parsed.data.note !== undefined ? parsed.data.note : task.note;

      const valid = validateTaskWrite({ status: parsed.data.status, listing_url: listingUrl, note });
      if (!valid.ok) return res.status(400).json({ error: valid.reason });

      const now = new Date();
      const [updated] = await db
        .update(citationBuilderDirectoryTasks)
        .set({
          status: parsed.data.status,
          listing_url: listingUrl ?? null,
          note: note ?? null,
          // Stamps are derived from the status being recorded, never sent by
          // the client, and never cleared once earned.
          submitted_at:
            parsed.data.status === "submitted" || parsed.data.status === "live"
              ? task.submitted_at ?? now
              : task.submitted_at,
          live_at: parsed.data.status === "live" ? task.live_at ?? now : task.live_at,
          updated_by: (req.user as any)?.id ?? null,
          updated_at: now,
        })
        .where(eq(citationBuilderDirectoryTasks.id, taskId))
        .returning();

      await recountSubmission(id);

      writeAudit({
        actorId: (req.user as any)?.id ?? null,
        actorType: "admin",
        action: "citation_builder.directory_task",
        entityType: "citation_builder_directory_task",
        entityId: taskId,
        before: { status: task.status, listing_url: task.listing_url, note: task.note },
        after: { status: updated.status, listing_url: updated.listing_url, note: updated.note },
        metadata: { submission_id: id, directory_id: task.directory_id },
        req,
      });

      // Fires only if this write is the first recorded submission on the
      // order. Awaited so a send failure surfaces in the log rather than
      // dangling, but a false result never fails the operator's save.
      const emailed = await maybeSendProgressEmail({
        submissionId: id,
        recipientEmail: found.email,
        businessName: businessNameOf(found.row),
        tier: found.row.tier as "starter" | "pro" | "premium",
      });

      const tasks = await loadTasks(id);
      const completable = assertCompletable(tasks);
      res.json({
        task: updated,
        counts: deriveCounts(tasks),
        progress_email_sent: emailed,
        completable: completable.ok,
        completable_reason: completable.ok ? null : completable.reason,
      });
    } catch (err: any) {
      log.error("task patch failed", { error: err?.message });
      res.status(500).json({ error: "Failed to record directory outcome" });
    }
  });

  /* ─── POST /api/admin/citation-builder/:id/complete ────────────────
   * Finish the order and send the completion report. Refused unless every
   * directory has a recorded outcome and at least one is live — see
   * assertCompletable(). The 409 body carries the reason so the operator is
   * told what is still outstanding rather than just being blocked.
   */
  app.post("/api/admin/citation-builder/:id/complete", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id ?? "");
      const found = await loadSubmission(id);
      if (!found) return res.status(404).json({ error: "Submission not found" });

      const result = await completeSubmission({
        submissionId: id,
        recipientEmail: found.email,
        businessName: businessNameOf(found.row),
        tier: found.row.tier as "starter" | "pro" | "premium",
      });

      if (!result.ok) return res.status(409).json({ error: result.reason });

      writeAudit({
        actorId: (req.user as any)?.id ?? null,
        actorType: "admin",
        action: "citation_builder.complete",
        entityType: "citation_builder_submission",
        entityId: id,
        metadata: { directories_live: result.live, completion_email_sent: result.emailed },
        req,
      });

      res.json({ ok: true, directories_live: result.live, completion_email_sent: result.emailed });
    } catch (err: any) {
      log.error("complete failed", { error: err?.message });
      res.status(500).json({ error: "Failed to complete submission" });
    }
  });

  log.info("Admin Citation Builder fulfilment routes registered");
}
