/**
 * Admin routes for the TradeLine + Concierge template editor.
 *
 * Endpoints (all gated by requireAdmin):
 *   GET    /api/admin/tradeline/templates                       — list both kinds with effective (merged) fields
 *   GET    /api/admin/tradeline/templates/:kind/:templateId     — one template (code default + override + merged)
 *   PATCH  /api/admin/tradeline/templates/:kind/:templateId     — upsert override jsonb
 *   DELETE /api/admin/tradeline/templates/:kind/:templateId     — reset to code default OR delete custom template
 *   POST   /api/admin/tradeline/templates                       — create new (from scratch or from existing)
 *   POST   /api/admin/tradeline/templates/duplicate             — duplicate an existing template
 *
 * Custom templates: stored as override rows with a synthetic template_id
 * (prefix "custom_"). The override blob carries the FULL field set since
 * there is no code default to fall through to.
 */

import type { Express, Request, Response } from "express";
import { randomBytes } from "crypto";
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

function isCustomId(templateId: string): boolean {
  return templateId.startsWith("custom_");
}

function newCustomId(): string {
  return `custom_${randomBytes(6).toString("hex")}`;
}

/** Empty placeholder for custom templates (so the codeDefault slot in
 *  responses is never undefined and applyOverrides can run uniformly). */
function emptyTradelineDefault(templateId: string): TradeTemplate {
  return {
    id: templateId,
    name: "",
    matchPatterns: [],
    systemPromptBase: "",
    defaultTone: "professional",
    callFlowNotes: "",
    fallbackBehavior: "",
    bookingBehavior: "",
    escalationRules: "",
    fallbackServices: [],
  };
}

function emptyConciergeDefault(templateId: string): ConciergeTemplate {
  return {
    id: templateId,
    name: "",
    matchPatterns: [],
    systemPromptBase: "",
    defaultTone: "professional",
    coachingFocus: "",
    industryNorms: "",
    commonChallenges: "",
    toolingHints: "",
    escalationToHuman: "",
  };
}

export function registerAdminTradelineTemplatesRoutes(app: Express) {
  /* ─── GET list (both kinds, with overrides merged) ─── */
  app.get("/api/admin/tradeline/templates", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const overrides = await listOverrides();
      const byKey = new Map<string, Record<string, unknown>>();
      for (const o of overrides) byKey.set(`${o.kind}:${o.templateId}`, o.overrides);

      const codeTradeline = listTradelineTemplates();
      const codeConcierge = listConciergeTemplates();
      const codeIds = {
        tradeline: new Set(codeTradeline.map((t) => t.id)),
        concierge: new Set(codeConcierge.map((t) => t.id)),
      };

      interface ListEntry {
        kind: TemplateKind;
        templateId: string;
        name: string;
        defaultTone: "professional" | "friendly" | "casual";
        hasOverride: boolean;
        isCustom: boolean;
        effective: TradeTemplate | ConciergeTemplate;
      }

      const tradeline: ListEntry[] = codeTradeline.map((t) => ({
        kind: "tradeline" as TemplateKind,
        templateId: t.id,
        name: t.name,
        defaultTone: t.defaultTone,
        hasOverride: byKey.has(`tradeline:${t.id}`),
        isCustom: false,
        effective: applyOverrides(t, byKey.get(`tradeline:${t.id}`) ?? null),
      }));
      const concierge: ListEntry[] = codeConcierge.map((t) => ({
        kind: "concierge" as TemplateKind,
        templateId: t.id,
        name: t.name,
        defaultTone: t.defaultTone,
        hasOverride: byKey.has(`concierge:${t.id}`),
        isCustom: false,
        effective: applyOverrides(t, byKey.get(`concierge:${t.id}`) ?? null),
      }));

      // Surface override-only (custom) templates that have no code default.
      for (const o of overrides) {
        if (codeIds[o.kind as "tradeline" | "concierge"]?.has(o.templateId)) continue;
        if (o.kind === "tradeline") {
          const base = emptyTradelineDefault(o.templateId);
          const merged = applyOverrides(base, o.overrides);
          tradeline.push({
            kind: "tradeline" as TemplateKind,
            templateId: o.templateId,
            name: merged.name || o.templateId,
            defaultTone: merged.defaultTone,
            hasOverride: true,
            isCustom: true,
            effective: merged,
          });
        } else if (o.kind === "concierge") {
          const base = emptyConciergeDefault(o.templateId);
          const merged = applyOverrides(base, o.overrides);
          concierge.push({
            kind: "concierge" as TemplateKind,
            templateId: o.templateId,
            name: merged.name || o.templateId,
            defaultTone: merged.defaultTone,
            hasOverride: true,
            isCustom: true,
            effective: merged,
          });
        }
      }

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

        let codeDefault = findCodeDefault(kind, templateId);
        const overrideRow = await getOverride(kind, templateId);
        const isCustom = !codeDefault && isCustomId(templateId);

        if (!codeDefault) {
          if (!overrideRow) return res.status(404).json({ error: "Template not found" });
          // Custom (override-only) template — synthesize an empty base.
          codeDefault =
            kind === "tradeline"
              ? emptyTradelineDefault(templateId)
              : emptyConciergeDefault(templateId);
        }

        const overrides = overrideRow?.overrides ?? null;

        return res.json({
          kind,
          templateId,
          codeDefault,
          overrides,
          effective: applyOverrides(codeDefault, overrides),
          isCustom,
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

        let codeDefault = findCodeDefault(kind, templateId);
        if (!codeDefault && !isCustomId(templateId)) {
          return res.status(404).json({ error: "Template not found" });
        }
        if (!codeDefault) {
          codeDefault =
            kind === "tradeline"
              ? emptyTradelineDefault(templateId)
              : emptyConciergeDefault(templateId);
        }

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
        if (!codeDefault && !isCustomId(templateId)) {
          return res.status(404).json({ error: "Template not found" });
        }

        await deleteOverride(kind, templateId);
        return res.json({ ok: true, kind, templateId, deletedCustom: !codeDefault });
      } catch (err) {
        log.error("delete failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to reset override" });
      }
    },
  );

  /* ─── POST create (from scratch or from existing) ─── */
  const createBody = z.object({
    kind: z.enum(TEMPLATE_KIND_VALUES),
    name: z.string().min(1).max(120),
    /** Optional source to clone fields from. If absent → blank scaffold. */
    fromTemplateId: z.string().min(1).optional(),
  });
  app.post(
    "/api/admin/tradeline/templates",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const parsed = createBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
        const { kind, name, fromTemplateId } = parsed.data;

        // Seed the new template's field blob.
        let seedFields: Record<string, unknown>;
        if (fromTemplateId) {
          const sourceDefault = findCodeDefault(kind, fromTemplateId);
          const sourceOverrideRow = await getOverride(kind, fromTemplateId);
          if (!sourceDefault && !sourceOverrideRow) {
            return res.status(404).json({ error: "Source template not found" });
          }
          const base =
            sourceDefault ??
            (kind === "tradeline" ? emptyTradelineDefault(fromTemplateId) : emptyConciergeDefault(fromTemplateId));
          seedFields = applyOverrides(base, sourceOverrideRow?.overrides ?? null) as unknown as Record<string, unknown>;
        } else {
          seedFields = (kind === "tradeline"
            ? emptyTradelineDefault("")
            : emptyConciergeDefault("")) as unknown as Record<string, unknown>;
        }

        const newTemplateId = newCustomId();
        // Override blob carries the full field set (no code default to fall through).
        const fullOverride: Record<string, unknown> = { ...seedFields, name, id: newTemplateId };

        const codeDefaultStub =
          kind === "tradeline" ? emptyTradelineDefault(newTemplateId) : emptyConciergeDefault(newTemplateId);
        const saved = await upsertOverride(kind, newTemplateId, fullOverride, req.user?.id ?? null);

        return res.json({
          kind,
          templateId: newTemplateId,
          isCustom: true,
          override: saved,
          effective: applyOverrides(codeDefaultStub, saved.overrides),
        });
      } catch (err) {
        log.error("create failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to create template" });
      }
    },
  );

  /* ─── POST duplicate ─── */
  const duplicateBody = z.object({
    kind: z.enum(TEMPLATE_KIND_VALUES),
    templateId: z.string().min(1),
  });
  app.post(
    "/api/admin/tradeline/templates/duplicate",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const parsed = duplicateBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
        const { kind, templateId } = parsed.data;

        const sourceDefault = findCodeDefault(kind, templateId);
        const sourceOverrideRow = await getOverride(kind, templateId);
        if (!sourceDefault && !sourceOverrideRow) {
          return res.status(404).json({ error: "Source template not found" });
        }
        const base =
          sourceDefault ??
          (kind === "tradeline" ? emptyTradelineDefault(templateId) : emptyConciergeDefault(templateId));
        const seedFields = applyOverrides(base, sourceOverrideRow?.overrides ?? null) as unknown as Record<
          string,
          unknown
        >;

        const newTemplateId = newCustomId();
        const sourceName = String(seedFields.name ?? templateId);
        const fullOverride: Record<string, unknown> = {
          ...seedFields,
          name: `${sourceName} (copy)`,
          id: newTemplateId,
        };
        const codeDefaultStub =
          kind === "tradeline" ? emptyTradelineDefault(newTemplateId) : emptyConciergeDefault(newTemplateId);
        const saved = await upsertOverride(kind, newTemplateId, fullOverride, req.user?.id ?? null);

        return res.json({
          kind,
          templateId: newTemplateId,
          isCustom: true,
          override: saved,
          effective: applyOverrides(codeDefaultStub, saved.overrides),
        });
      } catch (err) {
        log.error("duplicate failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to duplicate template" });
      }
    },
  );
}
