/**
 * Admin routes for the TradeLine + Concierge template editor.
 *
 * Endpoints (all gated by requireAdmin):
 *   GET    /api/admin/tradeline/templates                       — list both kinds with effective (merged) fields
 *   GET    /api/admin/tradeline/templates/:kind/:templateId     — one template (code default + override + merged)
 *   PATCH  /api/admin/tradeline/templates/:kind/:templateId     — upsert override jsonb
 *   DELETE /api/admin/tradeline/templates/:kind/:templateId     — reset to code default
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAdmin } from "../auth";
import { listTemplates as listTradelineTemplates, type TradeTemplate } from "../services/tradelineTemplates";
import { listConciergeTemplates, type ConciergeTemplate } from "../services/portalConciergeTemplates";
import {
  applyOverrides,
  deleteOverride,
  getOverride,
  listOverrides,
  upsertOverride,
} from "../lib/applyTemplateOverrides";
import { TEMPLATE_KIND_VALUES, type TemplateKind } from "@shared/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminTradelineTemplates");

const kindParam = z.enum(TEMPLATE_KIND_VALUES);

function findCodeDefault(kind: TemplateKind, templateId: string): TradeTemplate | ConciergeTemplate | null {
  if (kind === "tradeline") {
    return listTradelineTemplates().find((t) => t.id === templateId) ?? null;
  }
  return listConciergeTemplates().find((t) => t.id === templateId) ?? null;
}

export function registerAdminTradelineTemplatesRoutes(app: Express) {
  /* ─── GET list (both kinds, with overrides merged) ─── */
  app.get("/api/admin/tradeline/templates", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const overrides = await listOverrides();
      const byKey = new Map<string, Record<string, unknown>>();
      for (const o of overrides) byKey.set(`${o.kind}:${o.templateId}`, o.overrides);

      const tradeline = listTradelineTemplates().map((t) => ({
        kind: "tradeline" as TemplateKind,
        templateId: t.id,
        name: t.name,
        defaultTone: t.defaultTone,
        hasOverride: byKey.has(`tradeline:${t.id}`),
        effective: applyOverrides(t, byKey.get(`tradeline:${t.id}`) ?? null),
      }));
      const concierge = listConciergeTemplates().map((t) => ({
        kind: "concierge" as TemplateKind,
        templateId: t.id,
        name: t.name,
        defaultTone: t.defaultTone,
        hasOverride: byKey.has(`concierge:${t.id}`),
        effective: applyOverrides(t, byKey.get(`concierge:${t.id}`) ?? null),
      }));

      return res.json({ tradeline, concierge });
    } catch (err) {
      log.error("list failed", { err: (err as Error).message });
      return res.status(500).json({ error: "Failed to load templates" });
    }
  });

  /* ─── GET single (default + override + merged) ─── */
  app.get(
    "/api/admin/tradeline/templates/:kind/:templateId",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const kindResult = kindParam.safeParse(req.params.kind);
        if (!kindResult.success) return res.status(400).json({ error: "Invalid kind" });
        const kind = kindResult.data;
        const templateId = String(req.params.templateId);

        const codeDefault = findCodeDefault(kind, templateId);
        if (!codeDefault) return res.status(404).json({ error: "Template not found" });

        const overrideRow = await getOverride(kind, templateId);
        const overrides = overrideRow?.overrides ?? null;

        return res.json({
          kind,
          templateId,
          codeDefault,
          overrides,
          effective: applyOverrides(codeDefault, overrides),
          updatedAt: overrideRow?.updatedAt ?? null,
          updatedBy: overrideRow?.updatedBy ?? null,
        });
      } catch (err) {
        log.error("get failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to load template" });
      }
    },
  );

  /* ─── PATCH override (upsert) ─── */
  const patchBody = z.object({
    overrides: z.record(z.string(), z.unknown()),
  });
  app.patch(
    "/api/admin/tradeline/templates/:kind/:templateId",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const kindResult = kindParam.safeParse(req.params.kind);
        if (!kindResult.success) return res.status(400).json({ error: "Invalid kind" });
        const kind = kindResult.data;
        const templateId = String(req.params.templateId);

        const codeDefault = findCodeDefault(kind, templateId);
        if (!codeDefault) return res.status(404).json({ error: "Template not found" });

        const parsed = patchBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

        const updated = await upsertOverride(kind, templateId, parsed.data.overrides, req.user?.id ?? null);
        return res.json({ override: updated, effective: applyOverrides(codeDefault, updated.overrides) });
      } catch (err) {
        log.error("patch failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to save override" });
      }
    },
  );

  /* ─── DELETE override (reset to default) ─── */
  app.delete(
    "/api/admin/tradeline/templates/:kind/:templateId",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const kindResult = kindParam.safeParse(req.params.kind);
        if (!kindResult.success) return res.status(400).json({ error: "Invalid kind" });
        const kind = kindResult.data;
        const templateId = String(req.params.templateId);

        const codeDefault = findCodeDefault(kind, templateId);
        if (!codeDefault) return res.status(404).json({ error: "Template not found" });

        await deleteOverride(kind, templateId);
        return res.json({ ok: true, kind, templateId });
      } catch (err) {
        log.error("delete failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to reset override" });
      }
    },
  );
}
