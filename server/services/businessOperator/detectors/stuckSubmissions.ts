/**
 * Detector: stuck_submissions.
 *
 * Finds onboarding submissions that were submitted by the client more than
 * 24h ago and have never been approved (no approved_at). The signal kicks
 * the Business Operator AI to draft a follow-up nudge to the admin team.
 *
 * Severity: medium.
 */

import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "../../../db";
import { onboardingSubmissions } from "@shared/schema";
import type { DetectorSignal } from "../types";

const MAX_SIGNALS = 20;
const STUCK_HOURS = 24;

export async function detect(): Promise<DetectorSignal[]> {
  const cutoff = new Date(Date.now() - STUCK_HOURS * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: onboardingSubmissions.id,
      client_id: onboardingSubmissions.client_id,
      status: onboardingSubmissions.status,
      submitted_at: onboardingSubmissions.submitted_at,
      created_at: onboardingSubmissions.created_at,
    })
    .from(onboardingSubmissions)
    .where(
      and(
        eq(onboardingSubmissions.status, "submitted"),
        isNull(onboardingSubmissions.approved_at),
        lt(onboardingSubmissions.submitted_at, cutoff),
      ),
    )
    .limit(MAX_SIGNALS);

  return rows.map((r) => ({
    signal_id: `submission_${r.id}`,
    detail: {
      submission_id: r.id,
      client_id: r.client_id,
      status: r.status,
      submitted_at: r.submitted_at?.toISOString() ?? null,
      hours_stuck: r.submitted_at
        ? Math.round((Date.now() - r.submitted_at.getTime()) / 36e5)
        : null,
    },
    summary: `Onboarding submission #${r.id} (client ${r.client_id}) submitted ${
      r.submitted_at ? `${Math.round((Date.now() - r.submitted_at.getTime()) / 36e5)}h` : ">24h"
    } ago, not yet approved.`,
    severity: "medium",
  }));
}
