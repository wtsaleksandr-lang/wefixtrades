/**
 * Admin audit log reader — Wave W-AI-3c.
 *
 * Read-only endpoints over the `audit_log` table. Used by the cross-cutting
 * Audit Log admin page (`/admin/audit-log`) and the per-entity
 * `<EntityAuditWidget>` on QuoteQuick template + trade detail pages.
 *
 * Endpoints (mounted under /api/admin/):
 *   GET /api/admin/audit-log
 *     Query params:
 *       entity_type  — filter by entity namespace
 *       entity_id    — filter by exact entity id (requires entity_type)
 *       actor_id     — filter by stringified actor id
 *       action       — filter by action verb
 *       limit        — page size (default 50, max 200)
 *       offset       — page offset (default 0)
 *     Returns: { rows: AuditRow[], total: number }
 *       AuditRow includes actor display name when an admin user matches `actor_id`.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "../auth";
import { db } from "../db";
import { auditLog, users } from "@shared/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminAuditLog");

const querySchema = z.object({
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
  actor_id: z.string().optional(),
  action: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export function registerAdminAuditLogRoutes(app: Express) {
  app.get("/api/admin/audit-log", requireAdmin, async (req: Request, res: Response) => {
    try {
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const { entity_type, entity_id, actor_id, action, limit, offset } = parsed.data;

      const conds = [] as ReturnType<typeof eq>[];
      if (entity_type) conds.push(eq(auditLog.entity_type, entity_type));
      if (entity_id) conds.push(eq(auditLog.entity_id, entity_id));
      if (actor_id) conds.push(eq(auditLog.actor_id, actor_id));
      if (action) conds.push(eq(auditLog.action, action));
      const whereClause = conds.length > 0 ? and(...conds) : undefined;

      // Left-join to users on the stringified id so we can surface display names.
      // `users.id` is integer/serial, `auditLog.actor_id` is text — cast on join.
      const baseQuery = db
        .select({
          id: auditLog.id,
          actor_id: auditLog.actor_id,
          actor_type: auditLog.actor_type,
          actor_email: users.email,
          actor_name: users.name,
          action: auditLog.action,
          entity_type: auditLog.entity_type,
          entity_id: auditLog.entity_id,
          before: auditLog.before,
          after: auditLog.after,
          diff: auditLog.diff,
          metadata: auditLog.metadata,
          ip: auditLog.ip,
          user_agent: auditLog.user_agent,
          created_at: auditLog.created_at,
        })
        .from(auditLog)
        .leftJoin(users, sql`${users.id}::text = ${auditLog.actor_id}`)
        .orderBy(desc(auditLog.created_at))
        .limit(limit)
        .offset(offset);

      const rows = whereClause ? await baseQuery.where(whereClause) : await baseQuery;

      const totalRows = whereClause
        ? await db.select({ count: sql<number>`count(*)::int` }).from(auditLog).where(whereClause)
        : await db.select({ count: sql<number>`count(*)::int` }).from(auditLog);
      const total = Number(totalRows[0]?.count ?? 0);

      // Serialise bigint ids as strings so JSON doesn't drop precision on huge tables.
      const serialised = rows.map((r) => ({
        ...r,
        id: String(r.id),
      }));

      return res.json({ rows: serialised, total, limit, offset });
    } catch (err) {
      log.error("list failed", { err: (err as Error).message });
      return res.status(500).json({ error: "Failed to load audit log" });
    }
  });
}
