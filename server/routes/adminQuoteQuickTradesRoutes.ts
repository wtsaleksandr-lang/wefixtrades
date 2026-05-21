/**
 * Admin routes for the QuoteQuick trade editor (Wave W-AI-2).
 *
 * All endpoints gated by `requireAdmin`. Mirrors the template-admin route
 * shape (see `adminQuoteQuickTemplatesRoutes.ts`).
 *
 * Endpoints (mounted under /api/admin/quotequick/):
 *   GET    /api/admin/quotequick/trades                  — list all (incl. archived) with merged values
 *   GET    /api/admin/quotequick/trades/:id              — one trade (codeDefault + overrides + merged)
 *   POST   /api/admin/quotequick/trades                  — create a NEW admin-authored trade
 *   PATCH  /api/admin/quotequick/trades/:id              — upsert override jsonb ({ label?, categoryId?, defaultIcon? })
 *   DELETE /api/admin/quotequick/trades/:id/overrides    — clear override (reset to code default)
 *   POST   /api/admin/quotequick/trades/:id/archive      — soft-delete
 *   POST   /api/admin/quotequick/trades/:id/unarchive    — restore
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { requireAdmin } from "../auth";
// Relative import — see note in `applyQuoteQuickOverrides.ts`.
import { TRADES, type Trade } from "../../client/src/data/trades";
import { TEMPLATE_PRESETS } from "@shared/templatePresets";
import {
  applyOverrides,
  deleteTradeOverride,
  getTradeOverride,
  listTradeOverrides,
  setTradeArchived,
  upsertTradeOverride,
  upsertTemplateOverride,
  listTemplateOverrides,
  type EffectiveTrade,
} from "../lib/applyQuoteQuickOverrides";
import { writeAudit } from "../lib/auditLog";
import { db } from "../db";
import { calculators } from "@shared/schema";
import { sql, desc, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminQuoteQuickTrades");

function findCodeTrade(tradeId: string): Trade | null {
  return TRADES.find((t) => t.id === tradeId) ?? null;
}

const tradePatch = z.object({
  label: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  defaultIcon: z.string().min(1).optional(),
});

export function registerAdminQuoteQuickTradesRoutes(app: Express) {
  /* ─── GET list ─── */
  app.get("/api/admin/quotequick/trades", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const overrides = await listTradeOverrides();
      const byId = new Map(overrides.map((o) => [o.tradeId, o]));
      const out: Array<{
        tradeId: string;
        effective: EffectiveTrade;
        is_overridden: boolean;
        is_archived: boolean;
        is_user_created: boolean;
        updatedAt: Date | null;
        updatedBy: number | null;
      }> = [];

      for (const t of TRADES) {
        const ov = byId.get(t.id);
        out.push({
          tradeId: t.id,
          effective: applyOverrides<EffectiveTrade>(t as EffectiveTrade, ov?.overrides ?? null),
          is_overridden: !!ov && Object.keys(ov.overrides ?? {}).length > 0,
          is_archived: ov?.archived ?? false,
          is_user_created: false,
          updatedAt: ov?.updatedAt ?? null,
          updatedBy: ov?.updatedBy ?? null,
        });
        byId.delete(t.id);
      }

      for (const ov of byId.values()) {
        if (!ov.overrides?.is_user_created) continue;
        out.push({
          tradeId: ov.tradeId,
          effective: applyOverrides<EffectiveTrade>({ id: ov.tradeId } as EffectiveTrade, ov.overrides),
          is_overridden: true,
          is_archived: ov.archived,
          is_user_created: true,
          updatedAt: ov.updatedAt,
          updatedBy: ov.updatedBy,
        });
      }

      return res.json({ trades: out });
    } catch (err) {
      log.error("list failed", { err: (err as Error).message });
      return res.status(500).json({ error: "Failed to load trades" });
    }
  });

  /* ─── GET single ─── */
  app.get(
    "/api/admin/quotequick/trades/:id",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const tradeId = String(req.params.id);
        const codeDefault = findCodeTrade(tradeId);
        const overrideRow = await getTradeOverride(tradeId);

        if (!codeDefault && !overrideRow?.overrides?.is_user_created) {
          return res.status(404).json({ error: "Trade not found" });
        }

        const overrides = overrideRow?.overrides ?? null;
        const effective = codeDefault
          ? applyOverrides<EffectiveTrade>(codeDefault as EffectiveTrade, overrides)
          : applyOverrides<EffectiveTrade>({ id: tradeId } as EffectiveTrade, overrides);

        return res.json({
          tradeId,
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
        return res.status(500).json({ error: "Failed to load trade" });
      }
    },
  );

  /* ─── POST create ─── */
  const createBody = z.object({
    id: z.string().min(1).optional(),
    label: z.string().min(1),
    categoryId: z.string().min(1),
    defaultIcon: z.string().min(1).optional(),
  });
  app.post(
    "/api/admin/quotequick/trades",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const parsed = createBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

        const tradeId = parsed.data.id ?? randomUUID();
        if (findCodeTrade(tradeId)) {
          return res.status(409).json({ error: "A code-default trade already exists with that id" });
        }
        const existing = await getTradeOverride(tradeId);
        if (existing) {
          return res.status(409).json({ error: "A trade with that id already exists" });
        }

        const overrides: Record<string, unknown> = {
          label: parsed.data.label,
          categoryId: parsed.data.categoryId,
          is_user_created: true,
          id: tradeId,
        };
        if (parsed.data.defaultIcon) overrides.defaultIcon = parsed.data.defaultIcon;

        const row = await upsertTradeOverride(tradeId, overrides, req.user?.id ?? null);

        void writeAudit({
          actorId: req.user?.id ?? null,
          action: "create",
          entityType: "quotequick_trade",
          entityId: tradeId,
          before: null,
          after: row.overrides,
          req,
        });

        return res.status(201).json({
          tradeId,
          override: row,
          effective: applyOverrides<EffectiveTrade>({ id: tradeId } as EffectiveTrade, row.overrides),
        });
      } catch (err) {
        log.error("create failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to create trade" });
      }
    },
  );

  /* ─── PATCH override ─── */
  app.patch(
    "/api/admin/quotequick/trades/:id",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const tradeId = String(req.params.id);
        const codeDefault = findCodeTrade(tradeId);
        const existing = await getTradeOverride(tradeId);
        const isUserCreated = !codeDefault && existing?.overrides?.is_user_created;

        if (!codeDefault && !isUserCreated) {
          return res.status(404).json({ error: "Trade not found" });
        }

        const parsed = tradePatch.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

        const patch: Record<string, unknown> = {};
        if (parsed.data.label !== undefined) patch.label = parsed.data.label;
        if (parsed.data.categoryId !== undefined) patch.categoryId = parsed.data.categoryId;
        if (parsed.data.defaultIcon !== undefined) patch.defaultIcon = parsed.data.defaultIcon;

        // Trade overrides are tiny (≤3 fields) — always merge on top of existing so partial PATCH preserves
        // sibling fields. Same behaviour for code-default-backed AND user-created rows.
        const merged = {
          ...(existing?.overrides ?? {}),
          ...patch,
          ...(isUserCreated ? { is_user_created: true } : {}),
        };

        const updated = await upsertTradeOverride(tradeId, merged, req.user?.id ?? null);
        const effective = codeDefault
          ? applyOverrides<EffectiveTrade>(codeDefault as EffectiveTrade, updated.overrides)
          : applyOverrides<EffectiveTrade>({ id: tradeId } as EffectiveTrade, updated.overrides);

        void writeAudit({
          actorId: req.user?.id ?? null,
          action: "update",
          entityType: "quotequick_trade",
          entityId: tradeId,
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

  /* ─── DELETE override ─── */
  app.delete(
    "/api/admin/quotequick/trades/:id/overrides",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const tradeId = String(req.params.id);
        const codeDefault = findCodeTrade(tradeId);
        if (!codeDefault) {
          return res.status(404).json({ error: "No code default exists for this trade — use /archive instead" });
        }
        const prior = await getTradeOverride(tradeId);
        const existed = await deleteTradeOverride(tradeId);
        if (!existed) {
          return res.status(404).json({ error: "No override exists for this trade" });
        }

        void writeAudit({
          actorId: req.user?.id ?? null,
          action: "reset",
          entityType: "quotequick_trade",
          entityId: tradeId,
          before: prior?.overrides ?? null,
          after: null,
          req,
        });

        return res.json({ ok: true, tradeId, effective: codeDefault });
      } catch (err) {
        log.error("delete-override failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to reset override" });
      }
    },
  );

  /* ─── POST archive / unarchive ─── */
  app.post(
    "/api/admin/quotequick/trades/:id/archive",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const tradeId = String(req.params.id);
        const codeDefault = findCodeTrade(tradeId);
        const existing = await getTradeOverride(tradeId);
        if (!codeDefault && !existing?.overrides?.is_user_created) {
          return res.status(404).json({ error: "Trade not found" });
        }
        const row = await setTradeArchived(tradeId, true, req.user?.id ?? null);

        void writeAudit({
          actorId: req.user?.id ?? null,
          action: "archive",
          entityType: "quotequick_trade",
          entityId: tradeId,
          before: { archived: false },
          after: { archived: true },
          req,
        });

        return res.json({ ok: true, tradeId, archived: true, override: row });
      } catch (err) {
        log.error("archive failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to archive trade" });
      }
    },
  );

  app.post(
    "/api/admin/quotequick/trades/:id/unarchive",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const tradeId = String(req.params.id);
        const codeDefault = findCodeTrade(tradeId);
        const existing = await getTradeOverride(tradeId);
        if (!codeDefault && !existing?.overrides?.is_user_created) {
          return res.status(404).json({ error: "Trade not found" });
        }
        const row = await setTradeArchived(tradeId, false, req.user?.id ?? null);

        void writeAudit({
          actorId: req.user?.id ?? null,
          action: "unarchive",
          entityType: "quotequick_trade",
          entityId: tradeId,
          before: { archived: true },
          after: { archived: false },
          req,
        });

        return res.json({ ok: true, tradeId, archived: false, override: row });
      } catch (err) {
        log.error("unarchive failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to unarchive trade" });
      }
    },
  );

  /* ─── GET usage analytics (W-AI-3c) ───
   *
   * For a trade, "usage" = (templates using this trade in their `trades[]`)
   * + (live calculators built from any of those templates). Templates are
   * the union of code-default presets and admin-authored overrides — we
   * scan both. Live calculator count is derived from the
   * `calculator_settings.ui_template.template_id` jsonb path.
   */
  app.get(
    "/api/admin/quotequick/trades/:id/usage",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const tradeId = String(req.params.id);

        // Compute effective templates (code default merged with overrides), and find
        // those whose trades[] array contains this trade id.
        const overrides = await listTemplateOverrides();
        const byId = new Map(overrides.map((o) => [o.templateId, o]));

        const matchingTemplateIds: string[] = [];
        for (const t of TEMPLATE_PRESETS) {
          const ov = byId.get(t.id);
          if (ov?.archived) {
            byId.delete(t.id);
            continue;
          }
          const merged = applyOverrides(t, ov?.overrides ?? null);
          if (Array.isArray(merged.trades) && merged.trades.includes(tradeId)) {
            matchingTemplateIds.push(t.id);
          }
          byId.delete(t.id);
        }
        for (const ov of byId.values()) {
          if (ov.archived) continue;
          if (!ov.overrides?.is_user_created) continue;
          const trades = (ov.overrides as Record<string, unknown>).trades;
          if (Array.isArray(trades) && (trades as string[]).includes(tradeId)) {
            matchingTemplateIds.push(ov.templateId);
          }
        }

        let live_count = 0;
        if (matchingTemplateIds.length > 0) {
          // Use the jsonb path expression as the column-side of an IN check.
          // drizzle's `inArray` accepts a SQL expression as the left side and
          // safely parameterises the right-hand value list.
          const tplIdExpr = sql<string>`(${calculators.calculator_settings} -> 'ui_template' ->> 'template_id')`;
          const countRows = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(calculators)
            .where(inArray(tplIdExpr, matchingTemplateIds));
          live_count = Number(countRows[0]?.count ?? 0);
        }

        return res.json({
          template_count: matchingTemplateIds.length,
          template_ids: matchingTemplateIds,
          live_count,
        });
      } catch (err) {
        log.error("trade-usage failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to load trade usage" });
      }
    },
  );

  /* ─── POST rename trade id (W-AI-3c) ───
   *
   * Renames a trade id. Updates every template override whose `trades[]`
   * contains the old id to use the new id instead. The new id must be free
   * (no code default + no existing override). The old trade is left in
   * place as a soft-archived row pointing at the new id via `metadata`.
   *
   * Writes an audit row for the trade itself and one per touched template.
   */
  const renameBody = z.object({
    new_id: z.string().min(1).regex(/^[a-z0-9_]+$/, "lowercase letters, numbers, underscore"),
    new_label: z.string().min(1).optional(),
  });
  app.post(
    "/api/admin/quotequick/trades/:id/rename",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const fromId = String(req.params.id);
        const parsed = renameBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
        const { new_id: toId, new_label } = parsed.data;
        if (toId === fromId) return res.status(400).json({ error: "new_id must differ from current id" });

        // Source must exist.
        const fromCode = findCodeTrade(fromId);
        const fromOverride = await getTradeOverride(fromId);
        if (!fromCode && !fromOverride?.overrides?.is_user_created) {
          return res.status(404).json({ error: "Trade not found" });
        }

        // Destination must be free.
        if (findCodeTrade(toId)) {
          return res.status(409).json({ error: "A code-default trade already exists with that id" });
        }
        const destExisting = await getTradeOverride(toId);
        if (destExisting) {
          return res.status(409).json({ error: "A trade with that id already exists" });
        }

        // Create the new trade. For code-default-backed renames we carry the original label
        // (or the override's label) plus the categoryId.
        const fromLabel = (fromOverride?.overrides as Record<string, unknown>)?.label as string | undefined;
        const fromCategory = (fromOverride?.overrides as Record<string, unknown>)?.categoryId as string | undefined;
        const fromIcon = (fromOverride?.overrides as Record<string, unknown>)?.defaultIcon as string | undefined;
        const label = new_label ?? fromLabel ?? fromCode?.label ?? toId;
        const categoryId = fromCategory ?? fromCode?.categoryId ?? "general";
        const newOverrides: Record<string, unknown> = {
          id: toId,
          label,
          categoryId,
          is_user_created: true,
        };
        if (fromIcon) newOverrides.defaultIcon = fromIcon;
        await upsertTradeOverride(toId, newOverrides, req.user?.id ?? null);

        // Cascade through all template overrides — replace any occurrence of fromId in `trades[]`.
        const templateOverrides = await listTemplateOverrides();
        const touchedTemplateIds: string[] = [];
        for (const tov of templateOverrides) {
          const trades = (tov.overrides as Record<string, unknown>).trades;
          if (!Array.isArray(trades)) continue;
          const arr = trades as string[];
          if (!arr.includes(fromId)) continue;
          const next = Array.from(new Set(arr.map((id) => (id === fromId ? toId : id))));
          const merged = { ...tov.overrides, trades: next };
          await upsertTemplateOverride(tov.templateId, merged, req.user?.id ?? null);
          touchedTemplateIds.push(tov.templateId);

          void writeAudit({
            actorId: req.user?.id ?? null,
            action: "update",
            entityType: "quotequick_template",
            entityId: tov.templateId,
            before: { trades: arr },
            after: { trades: next },
            metadata: { reason: "trade_rename", from: fromId, to: toId },
            req,
          });
        }

        // For code-default templates referencing fromId, materialize an override that swaps the id.
        for (const t of TEMPLATE_PRESETS) {
          if (!Array.isArray(t.trades) || !t.trades.includes(fromId)) continue;
          // Skip if already touched via the override loop above (covered there).
          if (touchedTemplateIds.includes(t.id)) continue;
          const next = Array.from(new Set(t.trades.map((id) => (id === fromId ? toId : id))));
          await upsertTemplateOverride(t.id, { trades: next }, req.user?.id ?? null);
          touchedTemplateIds.push(t.id);

          void writeAudit({
            actorId: req.user?.id ?? null,
            action: "update",
            entityType: "quotequick_template",
            entityId: t.id,
            before: { trades: t.trades },
            after: { trades: next },
            metadata: { reason: "trade_rename", from: fromId, to: toId },
            req,
          });
        }

        // Archive the old trade (soft) and stamp metadata pointing at the new id.
        await setTradeArchived(fromId, true, req.user?.id ?? null);

        void writeAudit({
          actorId: req.user?.id ?? null,
          action: "rename",
          entityType: "quotequick_trade",
          entityId: fromId,
          before: { id: fromId },
          after: { id: toId, label, categoryId },
          metadata: { touched_template_ids: touchedTemplateIds },
          req,
        });

        return res.json({
          ok: true,
          from_id: fromId,
          to_id: toId,
          touched_template_ids: touchedTemplateIds,
        });
      } catch (err) {
        log.error("rename failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to rename trade" });
      }
    },
  );

  /* ─── POST merge trades (W-AI-3c) ───
   *
   * Soft-archives each `from_ids` and rewrites every template override's
   * `trades[]` array so any of the from ids becomes `into_id` (deduped).
   * The destination must exist (code default or override). Writes audit
   * rows for each touched template + each archived from-trade.
   */
  const mergeBody = z.object({
    from_ids: z.array(z.string().min(1)).min(1),
    into_id: z.string().min(1),
  });
  app.post(
    "/api/admin/quotequick/trades/merge",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const parsed = mergeBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
        const { from_ids, into_id } = parsed.data;
        if (from_ids.includes(into_id)) {
          return res.status(400).json({ error: "into_id cannot appear in from_ids" });
        }

        // Destination must exist.
        const destCode = findCodeTrade(into_id);
        const destOverride = await getTradeOverride(into_id);
        if (!destCode && !destOverride?.overrides?.is_user_created) {
          return res.status(404).json({ error: "into_id trade not found" });
        }
        if (destOverride?.archived) {
          return res.status(400).json({ error: "into_id trade is archived" });
        }

        // Pull all template overrides — cascade across them.
        const templateOverrides = await listTemplateOverrides();
        const fromSet = new Set(from_ids);
        const touchedTemplateIds: string[] = [];

        for (const tov of templateOverrides) {
          const trades = (tov.overrides as Record<string, unknown>).trades;
          if (!Array.isArray(trades)) continue;
          const arr = trades as string[];
          if (!arr.some((id) => fromSet.has(id))) continue;
          const next = Array.from(
            new Set(arr.map((id) => (fromSet.has(id) ? into_id : id))),
          );
          const merged = { ...tov.overrides, trades: next };
          await upsertTemplateOverride(tov.templateId, merged, req.user?.id ?? null);
          touchedTemplateIds.push(tov.templateId);

          void writeAudit({
            actorId: req.user?.id ?? null,
            action: "update",
            entityType: "quotequick_template",
            entityId: tov.templateId,
            before: { trades: arr },
            after: { trades: next },
            metadata: { reason: "trade_merge", from_ids, into_id },
            req,
          });
        }

        // Cover code-default templates that reference any from_id but have no override yet.
        for (const t of TEMPLATE_PRESETS) {
          if (!Array.isArray(t.trades)) continue;
          if (!t.trades.some((id) => fromSet.has(id))) continue;
          if (touchedTemplateIds.includes(t.id)) continue;
          const next = Array.from(
            new Set(t.trades.map((id) => (fromSet.has(id) ? into_id : id))),
          );
          await upsertTemplateOverride(t.id, { trades: next }, req.user?.id ?? null);
          touchedTemplateIds.push(t.id);

          void writeAudit({
            actorId: req.user?.id ?? null,
            action: "update",
            entityType: "quotequick_template",
            entityId: t.id,
            before: { trades: t.trades },
            after: { trades: next },
            metadata: { reason: "trade_merge", from_ids, into_id },
            req,
          });
        }

        // Soft-archive each from_id (must exist).
        const archivedFromIds: string[] = [];
        for (const fromId of from_ids) {
          const fromCode = findCodeTrade(fromId);
          const fromOverride = await getTradeOverride(fromId);
          if (!fromCode && !fromOverride?.overrides?.is_user_created) continue;
          await setTradeArchived(fromId, true, req.user?.id ?? null);
          archivedFromIds.push(fromId);

          void writeAudit({
            actorId: req.user?.id ?? null,
            action: "merge",
            entityType: "quotequick_trade",
            entityId: fromId,
            before: { archived: false },
            after: { archived: true },
            metadata: { merged_into: into_id, touched_template_ids: touchedTemplateIds },
            req,
          });
        }

        return res.json({
          ok: true,
          from_ids: archivedFromIds,
          into_id,
          touched_template_ids: touchedTemplateIds,
        });
      } catch (err) {
        log.error("merge failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to merge trades" });
      }
    },
  );
}
