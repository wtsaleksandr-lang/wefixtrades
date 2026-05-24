/**
 * ReputationShield "connect Google" re-nudge worker.
 *
 * ReputationShield is dead weight until the customer completes the
 * Google Business Profile OAuth step. The welcome email asks once;
 * this worker follows up for customers who paid but never connected.
 *
 * Cadence (per customer):
 *   - Nudge #1: >= 2 days after kickoff, still not connected
 *   - Nudge #2: >= 3 days after nudge #1, still not connected (final)
 *   - Then stop — the plan stays ready, we don't keep emailing.
 *
 * Connection + nudge state both live in client_services.metadata, so
 * this is self-contained and idempotent: a customer who connects (or
 * who has had MAX_NUDGES) is skipped on every subsequent run.
 */
import { db } from "../db";
import { and, eq, sql } from "drizzle-orm";
import { clients, clientServices } from "@shared/schema";
import { decryptGoogleCredentials } from "../lib/tokenEncryption";
import { sendReputationConnectNudge } from "../lib/reputationConnectNudgeEmail";
import { createLogger } from "../lib/logger";

const log = createLogger("ReputationConnectNudge");

const MIN_DAYS_BEFORE_FIRST = 2;
const MIN_DAYS_BETWEEN = 3;
const MAX_NUDGES = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

interface NudgeState {
  count: number;
  last_at: string | null;
}

interface NudgeSummary {
  considered: number;
  connected_skipped: number;
  capped_skipped: number;
  not_due: number;
  nudges_sent: number;
  errors: number;
}

export async function processReputationConnectNudges(): Promise<NudgeSummary> {
  const summary: NudgeSummary = {
    considered: 0, connected_skipped: 0, capped_skipped: 0,
    not_due: 0, nudges_sent: 0, errors: 0,
  };

  const rows = await db.select({
    clientServiceId: clientServices.id,
    clientId: clientServices.client_id,
    serviceId: clientServices.service_id,
    metadata: clientServices.metadata,
    businessName: clients.business_name,
    contactEmail: clients.contact_email,
    googleCredentials: clients.google_credentials,
  })
    .from(clientServices)
    .innerJoin(clients, eq(clients.id, clientServices.client_id))
    .where(and(
      sql`${clientServices.service_id} LIKE 'reputationshield-%'`,
      eq(clientServices.status, "active"),
      eq(clients.status, "active"),
      sql`${clients.contact_email} IS NOT NULL`,
    ));

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const now = Date.now();

  for (const row of rows) {
    summary.considered++;
    try {
      const meta = (row.metadata ?? {}) as Record<string, any>;
      const kickoffAt = meta.reputationshield_kickoff_at;
      if (!kickoffAt) {
        // Never properly kicked off — not our case to chase.
        summary.not_due++;
        continue;
      }

      // Already connected to Google? Then there's nothing to nudge.
      const creds = row.googleCredentials
        ? (decryptGoogleCredentials(row.googleCredentials as Record<string, unknown>) as any)
        : null;
      if (creds?.refresh_token || creds?.access_token) {
        summary.connected_skipped++;
        continue;
      }

      const nudge: NudgeState = meta.reputationshield_connect_nudges ?? { count: 0, last_at: null };
      if (nudge.count >= MAX_NUDGES) {
        summary.capped_skipped++;
        continue;
      }

      // Timing gate.
      const kickoffMs = new Date(kickoffAt).getTime();
      if (nudge.count === 0) {
        if (now - kickoffMs < MIN_DAYS_BEFORE_FIRST * DAY_MS) {
          summary.not_due++;
          continue;
        }
      } else {
        const lastMs = nudge.last_at ? new Date(nudge.last_at).getTime() : kickoffMs;
        if (now - lastMs < MIN_DAYS_BETWEEN * DAY_MS) {
          summary.not_due++;
          continue;
        }
      }

      if (!row.contactEmail) {
        summary.not_due++;
        continue;
      }

      const nudgeNumber = nudge.count + 1;
      await sendReputationConnectNudge({
        toEmail: row.contactEmail,
        businessName: row.businessName || "your business",
        nudgeNumber,
        connectGoogleUrl: `${baseUrl}/portal/reviews/setup`,
        clientId: row.clientId,
      });

      // Stamp the nudge state (jsonb-merge, same pattern as kickoff).
      const newState: NudgeState = { count: nudgeNumber, last_at: new Date().toISOString() };
      await db.update(clientServices)
        .set({
          metadata: sql`COALESCE(${clientServices.metadata}, '{}'::jsonb) || ${JSON.stringify({ reputationshield_connect_nudges: newState })}::jsonb`,
          updated_at: new Date(),
        })
        .where(eq(clientServices.id, row.clientServiceId));

      summary.nudges_sent++;
    } catch (err: any) {
      summary.errors++;
      log.error("Connect-nudge failed for a client_service", {
        client_service_id: row.clientServiceId,
        error: err.message,
      });
    }
  }

  log.info("ReputationShield connect-nudge run complete", { ...summary });
  return summary;
}
