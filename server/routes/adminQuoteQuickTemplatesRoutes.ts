/**
 * Admin routes for the QuoteQuick template editor (Wave W-AI-2).
 *
 * All endpoints gated by `requireAdmin`. Mirrors the pattern in
 * `adminTradelineTemplatesRoutes.ts`. Phase 1 of a 3-phase admin build —
 * the UI shell lands in Phase 2; AI-driven catalogue tooling lands in
 * Phase 3 (W-AI-3).
 *
 * Endpoints (mounted under /api/admin/quotequick/):
 *   GET    /api/admin/quotequick/templates                  — list all (incl. archived) with merged values
 *   GET    /api/admin/quotequick/templates/:id              — one template (codeDefault + overrides + merged)
 *   POST   /api/admin/quotequick/templates                  — create a NEW admin-authored template (no code default)
 *   PATCH  /api/admin/quotequick/templates/:id              — upsert override jsonb (partial TemplateConfig fields)
 *   DELETE /api/admin/quotequick/templates/:id/overrides    — clear override (reset to code default)
 *   POST   /api/admin/quotequick/templates/:id/archive      — soft-delete (archived = true)
 *   POST   /api/admin/quotequick/templates/:id/unarchive    — restore (archived = false)
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { requireAdmin } from "../auth";
import { TEMPLATE_PRESETS, type TemplateConfig } from "@shared/templatePresets";
import {
  applyOverrides,
  deleteTemplateOverride,
  getTemplateOverride,
  listTemplateOverrides,
  setTemplateArchived,
  upsertTemplateOverride,
} from "../lib/applyQuoteQuickOverrides";
import { writeAudit } from "../lib/auditLog";
import { db } from "../db";
import { calculators } from "@shared/schema";
import { sql, desc } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminQuoteQuickTemplates");

function findCodeTemplate(templateId: string): TemplateConfig | null {
  return TEMPLATE_PRESETS.find((t) => t.id === templateId) ?? null;
}

export function registerAdminQuoteQuickTemplatesRoutes(app: Express) {
  /* ─── GET list ─── */
  app.get("/api/admin/quotequick/templates", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const overrides = await listTemplateOverrides();
      const byId = new Map(overrides.map((o) => [o.templateId, o]));
      const out: Array<{
        templateId: string;
        effective: TemplateConfig;
        is_overridden: boolean;
        is_archived: boolean;
        is_user_created: boolean;
        updatedAt: Date | null;
        updatedBy: number | null;
      }> = [];

      // Code-default templates (merged) first.
      for (const t of TEMPLATE_PRESETS) {
        const ov = byId.get(t.id);
        out.push({
          templateId: t.id,
          effective: applyOverrides(t, ov?.overrides ?? null),
          is_overridden: !!ov && Object.keys(ov.overrides ?? {}).length > 0,
          is_archived: ov?.archived ?? false,
          is_user_created: false,
          updatedAt: ov?.updatedAt ?? null,
          updatedBy: ov?.updatedBy ?? null,
        });
        byId.delete(t.id);
      }

      // Admin-created templates — anything left in the map.
      for (const ov of byId.values()) {
        if (!ov.overrides?.is_user_created) continue;
        out.push({
          templateId: ov.templateId,
          effective: applyOverrides<TemplateConfig>({} as TemplateConfig, ov.overrides),
          is_overridden: true,
          is_archived: ov.archived,
          is_user_created: true,
          updatedAt: ov.updatedAt,
          updatedBy: ov.updatedBy,
        });
      }

      return res.json({ templates: out });
    } catch (err) {
      log.error("list failed", { err: (err as Error).message });
      return res.status(500).json({ error: "Failed to load templates" });
    }
  });

  /* ─── GET single ─── */
  app.get(
    "/api/admin/quotequick/templates/:id",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const templateId = String(req.params.id);
        const codeDefault = findCodeTemplate(templateId);
        const overrideRow = await getTemplateOverride(templateId);

        if (!codeDefault && !overrideRow?.overrides?.is_user_created) {
          return res.status(404).json({ error: "Template not found" });
        }

        const overrides = overrideRow?.overrides ?? null;
        const effective = codeDefault
          ? applyOverrides(codeDefault, overrides)
          : applyOverrides<TemplateConfig>({} as TemplateConfig, overrides);

        return res.json({
          templateId,
          codeDefault,
          overrides,
          effective,
          is_archived: overrideRow?.archived ?? false,
          is_user_created: !codeDefault,
          updatedAt: overrideRow?.updatedAt ?? null,
          updatedBy: overrideRow?.updatedBy ?? null,
        });
      } catch (err) {
        log.error("get failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to load template" });
      }
    },
  );

  /* ─── POST create (admin-authored, no code default) ─── */
  const createBody = z.object({
    template: z.record(z.string(), z.unknown()),
    id: z.string().min(1).optional(),
  });
  app.post(
    "/api/admin/quotequick/templates",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const parsed = createBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

        const templateId = parsed.data.id ?? randomUUID();

        if (findCodeTemplate(templateId)) {
          return res.status(409).json({ error: "A code-default template already exists with that id" });
        }
        const existing = await getTemplateOverride(templateId);
        if (existing) {
          return res.status(409).json({ error: "A template with that id already exists" });
        }

        // Stamp the user-created marker so listing can distinguish these from sparse code-default overrides.
        const overrides = { ...parsed.data.template, is_user_created: true, id: templateId };
        const row = await upsertTemplateOverride(templateId, overrides, req.user?.id ?? null);

        // Fire-and-forget audit write — record that this template was admin-created.
        void writeAudit({
          actorId: req.user?.id ?? null,
          action: "create",
          entityType: "quotequick_template",
          entityId: templateId,
          before: null,
          after: row.overrides,
          req,
        });

        return res.status(201).json({
          templateId,
          override: row,
          effective: applyOverrides<TemplateConfig>({} as TemplateConfig, row.overrides),
        });
      } catch (err) {
        log.error("create failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to create template" });
      }
    },
  );

  /* ─── PATCH override (upsert partial fields) ─── */
  const patchBody = z.object({
    overrides: z.record(z.string(), z.unknown()),
  });
  app.patch(
    "/api/admin/quotequick/templates/:id",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const templateId = String(req.params.id);
        const codeDefault = findCodeTemplate(templateId);
        const existing = await getTemplateOverride(templateId);
        const isUserCreated = !codeDefault && existing?.overrides?.is_user_created;

        if (!codeDefault && !isUserCreated) {
          return res.status(404).json({ error: "Template not found" });
        }

        const parsed = patchBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

        // For user-created templates, merge incoming patch on top of existing overrides so a partial PATCH
        // doesn't wipe other fields. For code-default-backed rows, replace the sparse override blob outright
        // (admin sends the full set of fields they want to override).
        const merged = isUserCreated
          ? { ...existing!.overrides, ...parsed.data.overrides, is_user_created: true }
          : parsed.data.overrides;

        const updated = await upsertTemplateOverride(templateId, merged, req.user?.id ?? null);
        const effective = codeDefault
          ? applyOverrides(codeDefault, updated.overrides)
          : applyOverrides<TemplateConfig>({} as TemplateConfig, updated.overrides);

        // Audit: before/after are the merged-override blob (pre vs post). Diff is computed by writeAudit.
        void writeAudit({
          actorId: req.user?.id ?? null,
          action: "update",
          entityType: "quotequick_template",
          entityId: templateId,
          before: existing?.overrides ?? {},
          after: updated.overrides,
          req,
        });

        return res.json({ override: updated, effective });
      } catch (err) {
        log.error("patch failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to save override" });
      }
    },
  );

  /* ─── DELETE override (reset to code default) ─── */
  app.delete(
    "/api/admin/quotequick/templates/:id/overrides",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const templateId = String(req.params.id);
        const codeDefault = findCodeTemplate(templateId);
        if (!codeDefault) {
          // User-created templates can't "reset" — there's no code default. Use archive instead.
          return res.status(404).json({ error: "No code default exists for this template — use /archive instead" });
        }
        const prior = await getTemplateOverride(templateId);
        const existed = await deleteTemplateOverride(templateId);
        if (!existed) {
          return res.status(404).json({ error: "No override exists for this template" });
        }

        void writeAudit({
          actorId: req.user?.id ?? null,
          action: "reset",
          entityType: "quotequick_template",
          entityId: templateId,
          before: prior?.overrides ?? null,
          after: null,
          req,
        });

        return res.json({ ok: true, templateId, effective: codeDefault });
      } catch (err) {
        log.error("delete-override failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to reset override" });
      }
    },
  );

  /* ─── POST archive / unarchive ─── */
  app.post(
    "/api/admin/quotequick/templates/:id/archive",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const templateId = String(req.params.id);
        const codeDefault = findCodeTemplate(templateId);
        const existing = await getTemplateOverride(templateId);
        if (!codeDefault && !existing?.overrides?.is_user_created) {
          return res.status(404).json({ error: "Template not found" });
        }
        const row = await setTemplateArchived(templateId, true, req.user?.id ?? null);

        void writeAudit({
          actorId: req.user?.id ?? null,
          action: "archive",
          entityType: "quotequick_template",
          entityId: templateId,
          before: { archived: false },
          after: { archived: true },
          req,
        });

        return res.json({ ok: true, templateId, archived: true, override: row });
      } catch (err) {
        log.error("archive failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to archive template" });
      }
    },
  );

  app.post(
    "/api/admin/quotequick/templates/:id/unarchive",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const templateId = String(req.params.id);
        const codeDefault = findCodeTemplate(templateId);
        const existing = await getTemplateOverride(templateId);
        if (!codeDefault && !existing?.overrides?.is_user_created) {
          return res.status(404).json({ error: "Template not found" });
        }
        const row = await setTemplateArchived(templateId, false, req.user?.id ?? null);

        void writeAudit({
          actorId: req.user?.id ?? null,
          action: "unarchive",
          entityType: "quotequick_template",
          entityId: templateId,
          before: { archived: true },
          after: { archived: false },
          req,
        });

        return res.json({ ok: true, templateId, archived: false, override: row });
      } catch (err) {
        log.error("unarchive failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to unarchive template" });
      }
    },
  );

  /* ─── GET usage analytics ───
   *
   * Wave W-AI-3c. The `template_id` for a deployed calculator lives at
   * `calculator_settings.ui_template.template_id` (jsonb). We do a single
   * filtered scan + LIMIT 5 sample. `live_count` is the total; `sample` is
   * the 5 most recently created matches for the "View 5 recent" expandable
   * on the template detail page.
   */
  app.get(
    "/api/admin/quotequick/templates/:id/usage",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const templateId = String(req.params.id);
        // Note: calculator_settings is `jsonb` so the `->>` operator returns text.
        const whereClause = sql`${calculators.calculator_settings} -> 'ui_template' ->> 'template_id' = ${templateId}`;

        const countRows = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(calculators)
          .where(whereClause);
        const live_count = Number(countRows[0]?.count ?? 0);

        const sample = await db
          .select({
            id: calculators.id,
            business_name: calculators.business_name,
            created_at: calculators.created_at,
          })
          .from(calculators)
          .where(whereClause)
          .orderBy(desc(calculators.created_at))
          .limit(5);

        return res.json({ live_count, sample });
      } catch (err) {
        log.error("usage failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to load usage analytics" });
      }
    },
  );
}
