/**
 * Wave W-AV-1 — admin endpoints for /admin/ai-activity.
 *
 *   GET  /api/admin/ai-activity                       — paginated list with status filter
 *   POST /api/admin/ai-activity/:id/approve           — approve + execute proposed_action
 *   POST /api/admin/ai-activity/:id/reject            — reject + reset trust ladder
 *   POST /api/admin/ai-activity/playbook/:p/toggle-auto — gated by 3-approval rule
 *   GET  /api/admin/ai-activity/budget                — current month state
 *   POST /api/admin/ai-activity/kill-switch           — toggle env-level pause
 *
 * All writes are audited via writeAudit().
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "../auth";
import { createLogger } from "../lib/logger";
import { db } from "../db";
import {
  adminAiActions,
  adminAiBudget,
  adminAiPlaybookState,
  ADMIN_AI_PLAYBOOKS,
  ADMIN_AI_ACTION_STATUSES,
  ADMIN_AI_AUTO_UNLOCK_APPROVALS,
  type AdminAiPlaybook,
} from "@shared/schema";
import { EXECUTORS } from "../services/businessOperator/executors";
import {
  recordPlaybookApproval,
  recordPlaybookRejection,
  isKillSwitchOn,
} from "../services/businessOperatorAgent";
import { writeAudit } from "../lib/auditLog";

const log = createLogger("AdminAiActivity");

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isPlaybook(value: string): value is AdminAiPlaybook {
  return (ADMIN_AI_PLAYBOOKS as readonly string[]).includes(value);
}

export function registerAdminAiActivityRoutes(app: Express): void {
  /* ─── List ─── */
  app.get("/api/admin/ai-activity", requireAdmin, async (req: Request, res: Response) => {
    try {
      const statusFilter = String(req.query.status ?? "").trim();
      const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
      const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

      const where = statusFilter && (ADMIN_AI_ACTION_STATUSES as readonly string[]).includes(statusFilter)
        ? eq(adminAiActions.status, statusFilter)
        : undefined;

      const baseQuery = db.select().from(adminAiActions);
      const rows = await (where ? baseQuery.where(where) : baseQuery)
        .orderBy(desc(adminAiActions.created_at))
        .limit(limit)
        .offset(offset);

      const playbookRows = await db.select().from(adminAiPlaybookState);

      res.json({
        rows,
        playbooks: playbookRows,
        kill_switch_on: isKillSwitchOn(),
        statuses: ADMIN_AI_ACTION_STATUSES,
        all_playbooks: ADMIN_AI_PLAYBOOKS,
      });
    } catch (err: any) {
      log.error("list failed", { error: err?.message });
      res.status(500).json({ error: "list_failed" });
    }
  });

  /* ─── Approve ─── */
  app.post("/api/admin/ai-activity/:id/approve", requireAdmin, async (req: Request, res: Response) => {
    const id = String(req.params.id);
    try {
      const existing = await db.select().from(adminAiActions).where(eq(adminAiActions.id, id)).limit(1);
      const row = existing[0];
      if (!row) return res.status(404).json({ error: "not_found" });
      if (row.status === "approved" || row.status === "auto_executed") {
        return res.json({ ok: true, alreadyExecuted: true });
      }

      const adminId = (req.user as Express.User).id;
      const playbook = row.playbook as AdminAiPlaybook;
      const executor = EXECUTORS[playbook];
      const result = executor
        ? await executor(row)
        : { ok: false, message: `no executor for playbook ${playbook}` };

      await db
        .update(adminAiActions)
        .set({
          status: "approved",
          reviewed_by: adminId,
          reviewed_at: new Date(),
          executed_at: result.ok ? new Date() : null,
          updated_at: new Date(),
        })
        .where(eq(adminAiActions.id, id));

      await recordPlaybookApproval(playbook);

      writeAudit({
        actorId: adminId,
        action: "approve",
        entityType: "admin_ai_action",
        entityId: id,
        metadata: { playbook, executor_result: result, summary: row.summary },
        req,
      });

      res.json({ ok: true, executor_result: result });
    } catch (err: any) {
      log.error("approve failed", { id, error: err?.message });
      res.status(500).json({ error: "approve_failed", message: String(err?.message ?? err) });
    }
  });

  /* ─── Reject ─── */
  app.post("/api/admin/ai-activity/:id/reject", requireAdmin, async (req: Request, res: Response) => {
    const id = String(req.params.id);
    try {
      const existing = await db.select().from(adminAiActions).where(eq(adminAiActions.id, id)).limit(1);
      const row = existing[0];
      if (!row) return res.status(404).json({ error: "not_found" });

      const adminId = (req.user as Express.User).id;
      await db
        .update(adminAiActions)
        .set({
          status: "rejected",
          reviewed_by: adminId,
          reviewed_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(adminAiActions.id, id));

      await recordPlaybookRejection(row.playbook as AdminAiPlaybook);

      writeAudit({
        actorId: adminId,
        action: "reject",
        entityType: "admin_ai_action",
        entityId: id,
        metadata: { playbook: row.playbook, summary: row.summary },
        req,
      });

      res.json({ ok: true });
    } catch (err: any) {
      log.error("reject failed", { id, error: err?.message });
      res.status(500).json({ error: "reject_failed" });
    }
  });

  /* ─── Toggle per-playbook auto ─── */
  app.post("/api/admin/ai-activity/playbook/:playbook/toggle-auto", requireAdmin, async (req: Request, res: Response) => {
    const playbookRaw = String(req.params.playbook ?? "");
    if (!isPlaybook(playbookRaw)) return res.status(400).json({ error: "invalid_playbook" });
    const playbook = playbookRaw;
    const desired = req.body?.enabled === true;

    try {
      const existing = await db.select().from(adminAiPlaybookState).where(eq(adminAiPlaybookState.playbook, playbook)).limit(1);
      const row = existing[0];
      const approvals = row?.consecutive_approvals ?? 0;
      if (desired && approvals < ADMIN_AI_AUTO_UNLOCK_APPROVALS) {
        return res.status(403).json({
          error: "unlock_required",
          consecutive_approvals: approvals,
          required: ADMIN_AI_AUTO_UNLOCK_APPROVALS,
        });
      }

      if (!row) {
        await db.insert(adminAiPlaybookState).values({ playbook, auto_enabled: desired });
      } else {
        await db
          .update(adminAiPlaybookState)
          .set({ auto_enabled: desired, updated_at: new Date() })
          .where(eq(adminAiPlaybookState.playbook, playbook));
      }

      const adminId = (req.user as Express.User).id;
      writeAudit({
        actorId: adminId,
        action: "update",
        entityType: "admin_ai_playbook",
        entityId: playbook,
        before: { auto_enabled: row?.auto_enabled ?? false },
        after: { auto_enabled: desired },
        req,
      });

      res.json({ ok: true, playbook, auto_enabled: desired });
    } catch (err: any) {
      log.error("toggle-auto failed", { playbook: playbookRaw, error: err?.message });
      res.status(500).json({ error: "toggle_failed" });
    }
  });

  /* ─── Budget ─── */
  app.get("/api/admin/ai-activity/budget", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const month = currentMonth();
      const existing = await db.select().from(adminAiBudget).where(eq(adminAiBudget.month, month)).limit(1);
      let row = existing[0];
      if (!row) {
        const inserted = await db.insert(adminAiBudget).values({ month }).returning();
        row = inserted[0];
      }
      res.json({
        month,
        spent_cents: row.spent_cents ?? 0,
        cap_cents: row.cap_cents ?? 5000,
        alerts_sent: row.alerts_sent ?? [],
      });
    } catch (err: any) {
      log.error("budget read failed", { error: err?.message });
      res.status(500).json({ error: "budget_read_failed" });
    }
  });

  /* ─── Kill switch ─── */
  app.post("/api/admin/ai-activity/kill-switch", requireAdmin, async (req: Request, res: Response) => {
    try {
      const desired = req.body?.enabled === true;
      // env-level: process-local flip. Survives only until next restart unless
      // the deployment env var is updated too. Audit the intent regardless.
      process.env.ADMIN_AI_KILL_SWITCH = desired ? "1" : "0";
      const adminId = (req.user as Express.User).id;
      writeAudit({
        actorId: adminId,
        action: "update",
        entityType: "admin_ai_kill_switch",
        entityId: "global",
        after: { enabled: desired },
        req,
      });
      res.json({ ok: true, enabled: desired });
    } catch (err: any) {
      log.error("kill-switch failed", { error: err?.message });
      res.status(500).json({ error: "kill_switch_failed" });
    }
  });
}
