/**
 * Layer admin-edited overrides on top of the code-default QuoteQuick
 * template + trade catalogues.
 *
 * Source of truth:
 *   - Templates: `shared/templatePresets.ts` → `TEMPLATE_PRESETS`
 *   - Trades:    `client/src/data/trades.ts` → `TRADES`
 *
 * Overrides:
 *   - `quotequick_template_overrides` — sparse jsonb patches keyed by template id.
 *     Rows may also represent admin-created templates (no code default exists);
 *     those carry `is_user_created: true` inside their overrides blob and the
 *     entire `TemplateConfig` is stored there.
 *   - `quotequick_trade_overrides` — sparse jsonb patches: `{ label?, categoryId?, defaultIcon? }`.
 *
 * `defaultIcon` is currently a property of `TemplateConfig` (PR #391). For
 * back-compat we keep it on the template, but the trade override path takes
 * precedence at runtime: when joining a calculator's `tradeId` against the
 * trade list at display time, a `trade_overrides.defaultIcon` value (when set)
 * supersedes the template's `defaultIcon`. `getEffectiveTemplate` does NOT
 * resolve the trade-side icon — consumers join templates ↔ trades themselves.
 *
 * Soft-archive: rows with `archived: true` are hidden from non-archived
 * listings and `getEffective*` calls return null. Existing calculator
 * instances referencing an archived template/trade are unaffected — they
 * continue to render from `calculator_settings.advanced`.
 *
 * Mirrors the pattern in `server/lib/applyTemplateOverrides.ts`.
 */

import { db } from "../db";
import {
  quotequickTemplateOverrides,
  quotequickTradeOverrides,
  type QuoteQuickTemplateOverride,
  type QuoteQuickTradeOverride,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { TEMPLATE_PRESETS, type TemplateConfig } from "@shared/templatePresets";
// Relative import — `TRADES` + `CATEGORIES` live in `client/src/data/trades.ts`
// per the wave spec ("keep `client/src/data/trades.ts` as source-of-truth").
// The module is pure data with no React imports, so it's safe to import from
// the server bundle (tsconfig includes both `client/src` and `server`).
import { TRADES, CATEGORIES, type Trade, type Category } from "../../client/src/data/trades";

/* ─── Row shape ─── */

export interface TemplateOverrideRow {
  templateId: string;
  overrides: Record<string, unknown>;
  archived: boolean;
  archivedAt: Date | null;
  updatedAt: Date;
  updatedBy: number | null;
}

export interface TradeOverrideRow {
  tradeId: string;
  overrides: Record<string, unknown>;
  archived: boolean;
  archivedAt: Date | null;
  updatedAt: Date;
  updatedBy: number | null;
}

function toTemplateRow(row: QuoteQuickTemplateOverride): TemplateOverrideRow {
  return {
    templateId: row.template_id,
    overrides: row.overrides ?? {},
    archived: row.archived,
    archivedAt: row.archived_at ?? null,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? null,
  };
}

function toTradeRow(row: QuoteQuickTradeOverride): TradeOverrideRow {
  return {
    tradeId: row.trade_id,
    overrides: row.overrides ?? {},
    archived: row.archived,
    archivedAt: row.archived_at ?? null,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? null,
  };
}

/* ─── Sparse-merge helper ─── */

/**
 * Merge a sparse override blob onto a base object. Arrays + nested objects
 * are replaced wholesale when present in `overrides`. `null`/`undefined`
 * values in overrides are skipped (use a DELETE to clear an override row).
 *
 * For templates this means: if admin overrides `fields`, the full new array
 * replaces the code default — admin UI must send the complete array when
 * editing field-level content (v1 simplicity). Same for `calculations`.
 */
export function applyOverrides<T extends object>(
  base: T,
  overrides: Record<string, unknown> | null | undefined,
): T {
  if (!overrides) return base;
  const merged: Record<string, unknown> = { ...(base as unknown as Record<string, unknown>) };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined || v === null) continue;
    // Skip internal metadata keys — they're carried on the override row, not on the merged config.
    if (k === "is_user_created") continue;
    merged[k] = v;
  }
  return merged as unknown as T;
}

/* ═══════════════════════════════════════════════════════════════════
   Templates
   ═══════════════════════════════════════════════════════════════════ */

export async function getTemplateOverride(templateId: string): Promise<TemplateOverrideRow | null> {
  const [row] = await db
    .select()
    .from(quotequickTemplateOverrides)
    .where(eq(quotequickTemplateOverrides.template_id, templateId))
    .limit(1);
  return row ? toTemplateRow(row) : null;
}

export async function listTemplateOverrides(): Promise<TemplateOverrideRow[]> {
  const rows = await db.select().from(quotequickTemplateOverrides);
  return rows.map(toTemplateRow);
}

export async function upsertTemplateOverride(
  templateId: string,
  overrides: Record<string, unknown>,
  updatedBy: number | null,
): Promise<TemplateOverrideRow> {
  const [row] = await db
    .insert(quotequickTemplateOverrides)
    .values({
      template_id: templateId,
      overrides,
      updated_by: updatedBy,
    })
    .onConflictDoUpdate({
      target: quotequickTemplateOverrides.template_id,
      set: { overrides, updated_by: updatedBy, updated_at: new Date() },
    })
    .returning();
  return toTemplateRow(row);
}

export async function deleteTemplateOverride(templateId: string): Promise<boolean> {
  const result = await db
    .delete(quotequickTemplateOverrides)
    .where(eq(quotequickTemplateOverrides.template_id, templateId))
    .returning({ id: quotequickTemplateOverrides.template_id });
  return result.length > 0;
}

export async function setTemplateArchived(
  templateId: string,
  archived: boolean,
  updatedBy: number | null,
): Promise<TemplateOverrideRow | null> {
  // Ensure a row exists first — archive flag lives on the override row.
  const existing = await getTemplateOverride(templateId);
  const overrides = existing?.overrides ?? {};
  const [row] = await db
    .insert(quotequickTemplateOverrides)
    .values({
      template_id: templateId,
      overrides,
      archived,
      archived_at: archived ? new Date() : null,
      updated_by: updatedBy,
    })
    .onConflictDoUpdate({
      target: quotequickTemplateOverrides.template_id,
      set: {
        archived,
        archived_at: archived ? new Date() : null,
        updated_by: updatedBy,
        updated_at: new Date(),
      },
    })
    .returning();
  return row ? toTemplateRow(row) : null;
}

/* ─── Effective lookups (template merged with override) ─── */

function findCodeTemplate(templateId: string): TemplateConfig | null {
  return TEMPLATE_PRESETS.find((t) => t.id === templateId) ?? null;
}

/**
 * Return the code-default template merged with its override row, or null if
 * the template doesn't exist OR is archived. Pure read — does not touch the
 * DB more than once.
 */
export async function getEffectiveTemplate(templateId: string): Promise<TemplateConfig | null> {
  const override = await getTemplateOverride(templateId);
  const codeDefault = findCodeTemplate(templateId);
  if (override?.archived) return null;
  if (!codeDefault && override) {
    // Admin-created template — full config lives in `overrides`.
    if (override.overrides?.is_user_created) {
      return applyOverrides<TemplateConfig>({} as TemplateConfig, override.overrides);
    }
    return null;
  }
  if (!codeDefault) return null;
  return applyOverrides(codeDefault, override?.overrides ?? null);
}

/**
 * Return all non-archived merged templates. Combines the code-default
 * catalogue with admin-created templates.
 */
export async function getEffectiveTemplates(): Promise<TemplateConfig[]> {
  const overrides = await listTemplateOverrides();
  const byId = new Map(overrides.map((o) => [o.templateId, o]));
  const result: TemplateConfig[] = [];

  // Code-default templates first, in catalogue order.
  for (const t of TEMPLATE_PRESETS) {
    const ov = byId.get(t.id);
    if (ov?.archived) continue;
    result.push(applyOverrides(t, ov?.overrides ?? null));
    byId.delete(t.id);
  }

  // Admin-created templates (no code default) — anything left in the map.
  for (const ov of byId.values()) {
    if (ov.archived) continue;
    if (!ov.overrides?.is_user_created) continue;
    result.push(applyOverrides<TemplateConfig>({} as TemplateConfig, ov.overrides));
  }

  return result;
}

/* ═══════════════════════════════════════════════════════════════════
   Trades
   ═══════════════════════════════════════════════════════════════════ */

export async function getTradeOverride(tradeId: string): Promise<TradeOverrideRow | null> {
  const [row] = await db
    .select()
    .from(quotequickTradeOverrides)
    .where(eq(quotequickTradeOverrides.trade_id, tradeId))
    .limit(1);
  return row ? toTradeRow(row) : null;
}

export async function listTradeOverrides(): Promise<TradeOverrideRow[]> {
  const rows = await db.select().from(quotequickTradeOverrides);
  return rows.map(toTradeRow);
}

export async function upsertTradeOverride(
  tradeId: string,
  overrides: Record<string, unknown>,
  updatedBy: number | null,
): Promise<TradeOverrideRow> {
  const [row] = await db
    .insert(quotequickTradeOverrides)
    .values({
      trade_id: tradeId,
      overrides,
      updated_by: updatedBy,
    })
    .onConflictDoUpdate({
      target: quotequickTradeOverrides.trade_id,
      set: { overrides, updated_by: updatedBy, updated_at: new Date() },
    })
    .returning();
  return toTradeRow(row);
}

export async function deleteTradeOverride(tradeId: string): Promise<boolean> {
  const result = await db
    .delete(quotequickTradeOverrides)
    .where(eq(quotequickTradeOverrides.trade_id, tradeId))
    .returning({ id: quotequickTradeOverrides.trade_id });
  return result.length > 0;
}

export async function setTradeArchived(
  tradeId: string,
  archived: boolean,
  updatedBy: number | null,
): Promise<TradeOverrideRow | null> {
  const existing = await getTradeOverride(tradeId);
  const overrides = existing?.overrides ?? {};
  const [row] = await db
    .insert(quotequickTradeOverrides)
    .values({
      trade_id: tradeId,
      overrides,
      archived,
      archived_at: archived ? new Date() : null,
      updated_by: updatedBy,
    })
    .onConflictDoUpdate({
      target: quotequickTradeOverrides.trade_id,
      set: {
        archived,
        archived_at: archived ? new Date() : null,
        updated_by: updatedBy,
        updated_at: new Date(),
      },
    })
    .returning();
  return row ? toTradeRow(row) : null;
}

/* ─── Effective lookups (trade merged with override) ─── */

/**
 * Extended Trade shape — code Trade plus the optional `defaultIcon` carried
 * via override. Existing `Trade` consumers ignore `defaultIcon` (it's
 * resolved at widget render time).
 */
export interface EffectiveTrade extends Trade {
  defaultIcon?: string;
}

function findCodeTrade(tradeId: string): Trade | null {
  return TRADES.find((t) => t.id === tradeId) ?? null;
}

export async function getEffectiveTrade(tradeId: string): Promise<EffectiveTrade | null> {
  const override = await getTradeOverride(tradeId);
  const codeDefault = findCodeTrade(tradeId);
  if (override?.archived) return null;
  if (!codeDefault && override) {
    // Admin-created trade — full record lives in overrides.
    return applyOverrides<EffectiveTrade>({ id: tradeId } as EffectiveTrade, override.overrides);
  }
  if (!codeDefault) return null;
  return applyOverrides<EffectiveTrade>(codeDefault as EffectiveTrade, override?.overrides ?? null);
}

export async function getEffectiveTrades(): Promise<EffectiveTrade[]> {
  const overrides = await listTradeOverrides();
  const byId = new Map(overrides.map((o) => [o.tradeId, o]));
  const result: EffectiveTrade[] = [];

  for (const t of TRADES) {
    const ov = byId.get(t.id);
    if (ov?.archived) continue;
    result.push(applyOverrides<EffectiveTrade>(t as EffectiveTrade, ov?.overrides ?? null));
    byId.delete(t.id);
  }

  for (const ov of byId.values()) {
    if (ov.archived) continue;
    result.push(applyOverrides<EffectiveTrade>({ id: ov.tradeId } as EffectiveTrade, ov.overrides));
  }

  return result;
}

/* ─── Categories (no override support in v1 — exposed for completeness) ─── */

export function getCategories(): Category[] {
  return [...CATEGORIES];
}
