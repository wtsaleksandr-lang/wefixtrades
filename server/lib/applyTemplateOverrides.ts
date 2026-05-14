/**
 * Layer admin-edited overrides on top of code-default templates.
 *
 * Templates live as code constants in server/services/tradelineTemplates.ts
 * (TradeTemplate) and server/services/portalConciergeTemplates.ts
 * (ConciergeTemplate). Admins can edit any subset of fields per (kind,
 * template_id); those edits are stored sparsely as a jsonb blob.
 *
 * This helper reads the overrides table and produces an augmented template
 * with admin edits applied. Fields not in the overrides blob fall through
 * to the code defaults.
 */

import { db } from "../db";
import { tradelineTemplateOverrides, type TemplateKind } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export interface TemplateOverrideRow {
  kind: TemplateKind;
  templateId: string;
  overrides: Record<string, unknown>;
  updatedAt: Date;
  updatedBy: number | null;
}

export async function getOverride(kind: TemplateKind, templateId: string): Promise<TemplateOverrideRow | null> {
  const [row] = await db
    .select()
    .from(tradelineTemplateOverrides)
    .where(and(eq(tradelineTemplateOverrides.kind, kind), eq(tradelineTemplateOverrides.template_id, templateId)))
    .limit(1);
  if (!row) return null;
  return {
    kind: row.kind as TemplateKind,
    templateId: row.template_id,
    overrides: row.overrides ?? {},
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? null,
  };
}

export async function listOverrides(kind?: TemplateKind): Promise<TemplateOverrideRow[]> {
  const rows = kind
    ? await db.select().from(tradelineTemplateOverrides).where(eq(tradelineTemplateOverrides.kind, kind))
    : await db.select().from(tradelineTemplateOverrides);
  return rows.map((row) => ({
    kind: row.kind as TemplateKind,
    templateId: row.template_id,
    overrides: row.overrides ?? {},
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? null,
  }));
}

export async function upsertOverride(
  kind: TemplateKind,
  templateId: string,
  overrides: Record<string, unknown>,
  updatedBy: number | null,
): Promise<TemplateOverrideRow> {
  const [row] = await db
    .insert(tradelineTemplateOverrides)
    .values({ kind, template_id: templateId, overrides, updated_by: updatedBy })
    .onConflictDoUpdate({
      target: [tradelineTemplateOverrides.kind, tradelineTemplateOverrides.template_id],
      set: { overrides, updated_by: updatedBy, updated_at: new Date() },
    })
    .returning();
  return {
    kind: row.kind as TemplateKind,
    templateId: row.template_id,
    overrides: row.overrides ?? {},
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? null,
  };
}

export async function deleteOverride(kind: TemplateKind, templateId: string): Promise<void> {
  await db
    .delete(tradelineTemplateOverrides)
    .where(and(eq(tradelineTemplateOverrides.kind, kind), eq(tradelineTemplateOverrides.template_id, templateId)));
}

/**
 * Merge an override blob onto a code-default template object. Non-string
 * fields (matchPatterns array, fallbackServices array) are replaced
 * wholesale if present in overrides; string fields likewise.
 */
export function applyOverrides<T extends object>(template: T, overrides: Record<string, unknown> | null | undefined): T {
  if (!overrides) return template;
  const merged: Record<string, unknown> = { ...(template as unknown as Record<string, unknown>) };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined || v === null) continue;
    merged[k] = v;
  }
  return merged as unknown as T;
}
