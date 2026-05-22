/**
 * Wave BA-7 — admin override endpoints for shared-files retention.
 *
 * Mounted in server/routes/index.ts. Lets an admin pin a single
 * customer-shared file so the daily `shared_files_retention_sweep`
 * skips it. Removing the override puts the file back in the sweep
 * pool — it will soft-delete on the next nightly tick if it's already
 * older than the 180-day window.
 *
 * Endpoints:
 *   POST   /api/admin/files/:file_table/:file_id/retain
 *     Body: { retained_until?: string (ISO timestamp), reason: string }
 *     Upserts the override. retained_until omitted/null = indefinite pin.
 *
 *   DELETE /api/admin/files/:file_table/:file_id/retain
 *     Drops the override.
 *
 * The admin Files UI ships in BA-7b. This wave is API only — exists so
 * the sweep is safe to enable without manual SQL pinning.
 *
 * Auth: requireAdmin. file_table is whitelisted against the same
 * COVERED_TABLES set the sweep worker uses (call site whitelist below)
 * to prevent pinning into a non-covered table.
 */

import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "../auth";
import { db } from "../db";
import { retentionOverrides } from "@shared/schema";
import { writeAudit } from "../lib/auditLog";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminFileRetention");

/** Mirror of COVERED_TABLES in sharedFilesRetentionSweepWorker.ts. */
const COVERED_TABLE_NAMES = new Set<string>(["voicemails", "assistant_messages"]);

const paramsSchema = z.object({
  file_table: z.string().min(1).max(64),
  file_id: z.string().min(1).max(64),
});

const bodySchema = z.object({
  retained_until: z
    .string()
    .datetime({ offset: true })
    .optional()
    .nullable(),
  reason: z.string().min(1).max(2000),
});

export function registerAdminFileRetentionRoutes(app: Express) {
  app.post(
    "/api/admin/files/:file_table/:file_id/retain",
    requireAdmin,
    async (req: Request, res: Response) => {
      const params = paramsSchema.safeParse(req.params);
      if (!params.success) return res.status(400).json({ error: params.error.message });
      const body = bodySchema.safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: body.error.message });

      const { file_table, file_id } = params.data;
      if (!COVERED_TABLE_NAMES.has(file_table)) {
        return res.status(400).json({ error: `Unsupported file_table: ${file_table}` });
      }

      const retainedUntil = body.data.retained_until ? new Date(body.data.retained_until) : null;
      const adminId = req.user?.id ?? null;

      try {
        const existing = await db
          .select()
          .from(retentionOverrides)
          .where(
            and(
              eq(retentionOverrides.file_table, file_table),
              eq(retentionOverrides.file_id, file_id),
            ),
          )
          .limit(1);

        const beforeRow = existing[0] ?? null;

        // Upsert via the (file_table, file_id) unique index.
        const upserted = await db
          .insert(retentionOverrides)
          .values({
            file_table,
            file_id,
            retained_until: retainedUntil,
            reason: body.data.reason,
            created_by_admin_id: adminId,
          })
          .onConflictDoUpdate({
            target: [retentionOverrides.file_table, retentionOverrides.file_id],
            set: {
              retained_until: retainedUntil,
              reason: body.data.reason,
              created_by_admin_id: adminId,
              updated_at: new Date(),
            },
          })
          .returning();

        const afterRow = upserted[0] ?? null;

        writeAudit({
          actorId: adminId ? String(adminId) : null,
          actorType: "admin",
          action: "admin_pinned_file_retention",
          entityType: "retention_override",
          entityId: `${file_table}:${file_id}`,
          before: beforeRow,
          after: afterRow,
          metadata: {
            file_table,
            file_id,
            retained_until: retainedUntil?.toISOString() ?? null,
            reason: body.data.reason,
          },
          req,
        });

        return res.json({ override: afterRow });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.error("Upsert failed", { err: message, file_table, file_id });
        return res.status(500).json({ error: "Failed to upsert retention override" });
      }
    },
  );

  app.delete(
    "/api/admin/files/:file_table/:file_id/retain",
    requireAdmin,
    async (req: Request, res: Response) => {
      const params = paramsSchema.safeParse(req.params);
      if (!params.success) return res.status(400).json({ error: params.error.message });

      const { file_table, file_id } = params.data;
      if (!COVERED_TABLE_NAMES.has(file_table)) {
        return res.status(400).json({ error: `Unsupported file_table: ${file_table}` });
      }

      const adminId = req.user?.id ?? null;

      try {
        const existing = await db
          .select()
          .from(retentionOverrides)
          .where(
            and(
              eq(retentionOverrides.file_table, file_table),
              eq(retentionOverrides.file_id, file_id),
            ),
          )
          .limit(1);

        if (existing.length === 0) {
          return res.status(404).json({ error: "Override not found" });
        }

        await db
          .delete(retentionOverrides)
          .where(
            and(
              eq(retentionOverrides.file_table, file_table),
              eq(retentionOverrides.file_id, file_id),
            ),
          );

        writeAudit({
          actorId: adminId ? String(adminId) : null,
          actorType: "admin",
          action: "admin_pinned_file_retention",
          entityType: "retention_override",
          entityId: `${file_table}:${file_id}`,
          before: existing[0],
          after: null,
          metadata: {
            file_table,
            file_id,
            removed: true,
          },
          req,
        });

        return res.json({ ok: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.error("Delete failed", { err: message, file_table, file_id });
        return res.status(500).json({ error: "Failed to delete retention override" });
      }
    },
  );
}
