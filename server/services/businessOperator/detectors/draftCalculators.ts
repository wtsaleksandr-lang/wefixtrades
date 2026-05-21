/**
 * Detector: draft_calculators.
 *
 * Finds QuoteQuick calculators whose `calculator_settings.publish.status`
 * is 'draft' and were created more than 7 days ago — the owner started
 * setup but never published. Signal: nudge or offer help.
 *
 * Severity: low.
 */

import { and, lt, sql } from "drizzle-orm";
import { db } from "../../../db";
import { calculators } from "@shared/schema";
import type { DetectorSignal } from "../types";

const MAX_SIGNALS = 20;
const STALE_DAYS = 7;

export async function detect(): Promise<DetectorSignal[]> {
  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: calculators.id,
      user_id: calculators.user_id,
      business_name: calculators.business_name,
      slug: calculators.slug,
      owner_email: calculators.owner_email,
      created_at: calculators.created_at,
    })
    .from(calculators)
    .where(
      and(
        sql`(${calculators.calculator_settings}::jsonb -> 'publish' ->> 'status') = 'draft'`,
        lt(calculators.created_at, cutoff),
      ),
    )
    .limit(MAX_SIGNALS);

  return rows.map((r) => {
    const daysOld = r.created_at
      ? Math.round((Date.now() - r.created_at.getTime()) / 86_400_000)
      : null;
    return {
      signal_id: `calculator_${r.id}`,
      detail: {
        calculator_id: r.id,
        user_id: r.user_id,
        business_name: r.business_name,
        slug: r.slug,
        owner_email: r.owner_email,
        days_in_draft: daysOld,
      },
      summary: `Calculator #${r.id} (${r.business_name}) stuck in draft for ${
        daysOld ?? ">7"
      } days.`,
      severity: "low",
    };
  });
}
