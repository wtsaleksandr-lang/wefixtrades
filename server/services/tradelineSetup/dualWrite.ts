/**
 * Atomic dual-write helper for the tradeline-setup wizard.
 *
 * Writes to BOTH the wizard's journey table (tradeline_phone_setups) AND
 * the canonical runtime config (client_services.metadata.tradelineConfig)
 * inside a single Postgres transaction. Two writes, one BEGIN/COMMIT.
 *
 * The tradelineConfig patch is applied via JSONB deep-merge — never a full
 * replacement — so concurrent writes to other tradelineConfig fields (or
 * other metadata keys) don't get clobbered.
 *
 * Tolerates the case where no tradeline client_services row exists yet
 * (e.g., user is mid-onboarding pre-subscription) — the wizard journey
 * still records its state; the metadata merge becomes a no-op until a
 * tradeline subscription is created.
 */

import { db } from "../../db";
import { tradelinePhoneSetups, clientServices } from "@shared/schema";
import type { TradelinePhoneSetup } from "@shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

const TRADELINE_SERVICE_IDS = [
  "tradeline-starter",
  "tradeline-pro",
  "tradeline-enterprise",
];

type SetupPatch = Partial<Omit<TradelinePhoneSetup, "id" | "client_id" | "created_at">>;

interface DualWriteArgs {
  clientId: number;
  setupPatch: SetupPatch;
  /** Shallow-merged into client_services.metadata.tradelineConfig. */
  tradelineConfigPatch?: Record<string, unknown>;
}

export async function dualWriteSetup(args: DualWriteArgs): Promise<TradelinePhoneSetup> {
  const { clientId, setupPatch, tradelineConfigPatch } = args;

  return await db.transaction(async (tx) => {
    /* ─── 1) Upsert tradeline_phone_setups (unique on client_id) ─── */
    const existing = await tx
      .select()
      .from(tradelinePhoneSetups)
      .where(eq(tradelinePhoneSetups.client_id, clientId))
      .limit(1);

    let row: TradelinePhoneSetup;
    if (existing.length === 0) {
      const [inserted] = await tx
        .insert(tradelinePhoneSetups)
        .values({
          client_id: clientId,
          ...setupPatch,
          updated_at: new Date(),
        })
        .returning();
      row = inserted;
    } else {
      const [updated] = await tx
        .update(tradelinePhoneSetups)
        .set({ ...setupPatch, updated_at: new Date() })
        .where(eq(tradelinePhoneSetups.client_id, clientId))
        .returning();
      row = updated;
    }

    /* ─── 2) JSONB deep-merge into client_services.metadata.tradelineConfig ─── */
    if (tradelineConfigPatch && Object.keys(tradelineConfigPatch).length > 0) {
      const patchJson = JSON.stringify(tradelineConfigPatch);
      await tx
        .update(clientServices)
        .set({
          metadata: sql`jsonb_set(
            COALESCE(${clientServices.metadata}, '{}'::jsonb),
            '{tradelineConfig}',
            COALESCE(${clientServices.metadata}->'tradelineConfig', '{}'::jsonb) || ${patchJson}::jsonb
          )`,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(clientServices.client_id, clientId),
            inArray(clientServices.service_id, TRADELINE_SERVICE_IDS),
          ),
        );
      // If no tradeline service row exists, the UPDATE matches zero rows — fine.
    }

    return row;
  });
}

/** Helper for "started" event timing — current row OR null. */
export async function getSetupRow(clientId: number): Promise<TradelinePhoneSetup | null> {
  const [row] = await db
    .select()
    .from(tradelinePhoneSetups)
    .where(eq(tradelinePhoneSetups.client_id, clientId))
    .limit(1);
  return row ?? null;
}
