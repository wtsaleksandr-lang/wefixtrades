/**
 * Admin routes for the QuoteQuick template editor (Wave W-AI-2).
 *
 * All endpoints gated by `requireAdmin`. Mirrors the pattern in
 * `adminTradelineTemplatesRoutes.ts`. Phase 1 of a 3-phase admin build —
 * the UI shell lands in Phase 2; AI-driven catalogue tooling lands in
 * Phase 3 (W-AI-3).
 *
 * Endpoints (mounted under /api/admin/quotequick/):
 *   GET    /api/admin/quotequick/templates                       — list all (incl. archived) with merged values; supports ?trade=<id>
 *   GET    /api/admin/quotequick/templates/:id                   — one template (codeDefault + overrides + merged)
 *   POST   /api/admin/quotequick/templates                       — create a NEW admin-authored template (no code default)
 *   PATCH  /api/admin/quotequick/templates/:id                   — upsert override jsonb (partial TemplateConfig fields)
 *   DELETE /api/admin/quotequick/templates/:id/overrides         — clear override (reset to code default)
 *   DELETE /api/admin/quotequick/templates/:id/overrides/:field  — strip ONE field from the override blob (Wave W-AQ-1)
 *   DELETE /api/admin/quotequick/templates/:id/hard-delete       — permanent delete; only for user-created templates (Wave W-AQ-1)
 *   POST   /api/admin/quotequick/templates/:id/archive           — soft-delete (archived = true)
 *   POST   /api/admin/quotequick/templates/:id/unarchive         — restore (archived = false)
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

/**
 * Strip a single field from an override blob. Supports dotted paths
 * (`header.title` removes the nested key, and prunes the parent object if
 * it becomes empty). The original object is not mutated.
 */
function stripField(
  overrides: Record<string, unknown>,
  field: string,
): Record<string, unknown> {
  const parts = field.split(".");
  // JSON-clone for safe in-place edits on the copy.
  const copy = JSON.parse(JSON.stringify(overrides)) as Record<string, unknown>;
  function recurse(obj: Record<string, unknown>, idx: number): boolean {
    const key = parts[idx];
    if (idx === parts.length - 1) {
      if (key in obj) {
        delete obj[key];
        return true;
      }
      return false;
    }
    const child = obj[key];
    if (!child || typeof child !== "object" || Array.isArray(child)) return false;
    const removed = recurse(child as Record<string, unknown>, idx + 1);
    // Prune empty parent containers so an override of `header.title` doesn't leave `header: {}`.
    if (removed && Object.keys(child as Record<string, unknown>).length === 0) {
      delete obj[key];
    }
    return removed;
  }
  recurse(copy, 0);
  return copy;
}

export function registerAdminQuoteQuickTemplatesRoutes(app: Express) {
  /* ─── GET list ───
   *
   * Wave W-AQ-1: supports `?trade=<id>` to filter templates whose
   * effective `trades[]` contains the given trade id. Applied *after* the
   * merge-with-overrides step so admin-edited trade lists are honoured.
   */
  app.get("/api/admin/quotequick/templates", requireAdmin, async (req: Request, res: Response) => {
    try {
      const tradeFilter = typeof req.query.trade === "string" && req.query.trade.length > 0
        ? req.query.trade
        : null;
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

      const filtered = tradeFilter
        ? out.filter((row) => Array.isArray(row.effective.trades) && row.effective.trades.includes(tradeFilter))
        : out;

      return res.json({ templates: filtered });
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

  /* ─── DELETE per-field override (Wave W-AQ-1) ───
   *
   * Strips ONE field from the override jsonb without touching siblings.
   * Supports dotted paths for nested fields (e.g. `header.title`). If the
   * override blob becomes empty after the strip, the entire row is deleted
   * so the template falls back cleanly to the code default.
   */
  app.delete(
    "/api/admin/quotequick/templates/:id/overrides/:field",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const templateId = String(req.params.id);
        const field = String(req.params.field);
        if (!field) return res.status(400).json({ error: "field required" });

        const existing = await getTemplateOverride(templateId);
        if (!existing || !existing.overrides) {
          return res.status(404).json({ error: "No override exists for this template" });
        }

        const next = stripField(existing.overrides, field);
        if (JSON.stringify(next) === JSON.stringify(existing.overrides)) {
          return res.status(404).json({ error: `Field '${field}' not present on override` });
        }

        const codeDefault = findCodeTemplate(templateId);
        const isUserCreated = !codeDefault && existing.overrides.is_user_created;

        // Determine "meaningful" remaining keys — housekeeping flags don't count.
        const meaningfulKeys = Object.keys(next).filter((k) => k !== "is_user_created" && k !== "id");

        if (meaningfulKeys.length === 0 && !isUserCreated) {
          // Code-default-backed and nothing left to override — wipe the row.
          await deleteTemplateOverride(templateId);

          void writeAudit({
            actorId: req.user?.id ?? null,
            action: "reset",
            entityType: "quotequick_template",
            entityId: templateId,
            before: existing.overrides,
            after: null,
            metadata: { field, reason: "per_field_reset_emptied_row" },
            req,
          });

          return res.json({
            ok: true,
            templateId,
            field,
            cleared: true,
            effective: codeDefault,
          });
        }

        const updated = await upsertTemplateOverride(templateId, next, req.user?.id ?? null);
        const effective = codeDefault
          ? applyOverrides(codeDefault, updated.overrides)
          : applyOverrides<TemplateConfig>({} as TemplateConfig, updated.overrides);

        void writeAudit({
          actorId: req.user?.id ?? null,
          action: "update",
          entityType: "quotequick_template",
          entityId: templateId,
          before: existing.overrides,
          after: updated.overrides,
          metadata: { field, reason: "per_field_reset" },
          req,
        });

        return res.json({ ok: true, templateId, field, cleared: false, override: updated, effective });
      } catch (err) {
        log.error("delete-field failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to reset field" });
      }
    },
  );

  /* ─── DELETE hard-delete (Wave W-AQ-1) ───
   *
   * Permanently removes a template. ONLY allowed for user-created entries
   * (no code-default backing). Code-default templates must be archived
   * (POST /archive) so the catalogue remains intact across deploys.
   */
  app.delete(
    "/api/admin/quotequick/templates/:id/hard-delete",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const templateId = String(req.params.id);
        if (findCodeTemplate(templateId)) {
          return res.status(409).json({
            error: "cannot hard-delete code-default template; archive instead",
          });
        }
        const existing = await getTemplateOverride(templateId);
        if (!existing) {
          return res.status(404).json({ error: "Template not found" });
        }
        if (!existing.overrides?.is_user_created) {
          // Edge case: an override row exists for a template id that no longer has a code
          // default (e.g. a code preset removed in a later deploy). Refuse — admin should
          // explicitly reset/archive first to make the intent clear.
          return res.status(409).json({
            error: "cannot hard-delete code-default template; archive instead",
          });
        }

        const deleted = await deleteTemplateOverride(templateId);
        if (!deleted) {
          return res.status(404).json({ error: "Template not found" });
        }

        void writeAudit({
          actorId: req.user?.id ?? null,
          action: "delete",
          entityType: "quotequick_template",
          entityId: templateId,
          before: existing.overrides,
          after: null,
          metadata: { hard_delete: true },
          req,
        });

        return res.json({ ok: true, templateId, hard_deleted: true });
      } catch (err) {
        log.error("hard-delete failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to delete template" });
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
