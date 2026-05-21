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
import {
  applyOverrides,
  deleteTradeOverride,
  getTradeOverride,
  listTradeOverrides,
  setTradeArchived,
  upsertTradeOverride,
  type EffectiveTrade,
} from "../lib/applyQuoteQuickOverrides";
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
        const existed = await deleteTradeOverride(tradeId);
        if (!existed) {
          return res.status(404).json({ error: "No override exists for this trade" });
        }
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
        return res.json({ ok: true, tradeId, archived: false, override: row });
      } catch (err) {
        log.error("unarchive failed", { err: (err as Error).message });
        return res.status(500).json({ error: "Failed to unarchive trade" });
      }
    },
  );
}
